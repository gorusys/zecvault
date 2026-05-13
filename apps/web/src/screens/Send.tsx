import { useEffect, useRef, useState, useCallback } from "react";
import { useSettings, useVaultStore, useWalletStore } from "@/stores";
import type { TxRecord } from "@/stores";
import { fmtZec, zecToZat } from "@/lib/zec";
import { classifySendRecipient, normalizeRecipientInput, parsePaymentUri, surfaceKindFromRecipient } from "@/lib/zcash-address";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Icon } from "@/components/Icon";
import { toast } from "@/stores/toast";
import { useWallet } from "@/hooks/useWallet";
import type { TransferPreviewResult } from "@/hooks/useWallet";

type SendStep = "form" | "previewing" | "review" | "shielding" | "broadcasting" | "success";

export function Send() {
  const expertAddressMode = useSettings((s) => s.expertAddressMode);
  const { spendableZat, pendingZat, zecUsdPrice } = useWalletStore();
  const setBalances = useWalletStore((s) => s.setBalances);
  const setNativeTxHistory = useWalletStore((s) => s.setNativeTxHistory);
  const vaults = useVaultStore((s) => s.vaults);
  const walletApi = useWallet();

  const [step, setStep] = useState<SendStep>("form");
  const [addr, setAddr] = useState("");
  const [amt, setAmt] = useState("");
  const [memo, setMemo] = useState("");
  const [publicSendConfirmed, setPublicSendConfirmed] = useState(false);
  const [preview, setPreview] = useState<TransferPreviewResult | null>(null);
  const [txid, setTxid] = useState("");
  const [shieldTxid, setShieldTxid] = useState("");
  const [retryCountdown, setRetryCountdown] = useState(0);
  const abortRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const normalizedAddr = normalizeRecipientInput(addr);
  const kind = classifySendRecipient(normalizedAddr);
  const trimmedAmount = amt.trim();
  const amountLooksValid = /^\d+(\.\d{0,8})?$/.test(trimmedAmount);
  const amountZat = amountLooksValid && trimmedAmount.length > 0 ? Number(zecToZat(trimmedAmount)) : 0;
  const amountTooHigh = amountZat > Number(spendableZat);
  const amountInvalid = !trimmedAmount || !amountLooksValid || amountZat <= 0 || !Number.isFinite(amountZat);
  const feeEstZat = preview?.feeZat ?? 5_000; // fallback until preview runs
  const totalWithFeeZat = amountZat + feeEstZat;
  const amountPlusFeeTooHigh = totalWithFeeZat > Number(spendableZat);
  const txExplorerUrl = txid ? `https://cipherscan.app/tx/${txid}` : "";

  const surface = normalizedAddr ? surfaceKindFromRecipient(normalizedAddr) : null;
  const expertLabel = normalizedAddr && expertAddressMode && surface && surface !== "unknown"
    ? (surface === "unified" ? { text: "Unified address (UA)", className: "pill-info" as const }
      : surface === "sapling" ? { text: "Sapling (zs / ztestsapling)", className: "pill-success" as const }
        : { text: "Transparent (t1 / t3 / tm / t2)", className: "pill-warning" as const })
    : null;

  const simpleLabel = normalizedAddr && !expertAddressMode && kind !== "invalid"
    ? { text: kind === "private" ? "Private (shielded)" : "Public (transparent)", className: kind === "private" ? "pill-success" as const : "pill-warning" as const }
    : null;

  useEffect(() => { setPublicSendConfirmed(false); }, [addr]);

  // Reset to form when address or amount changes during review
  useEffect(() => {
    if (step === "review") setStep("form");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addr, amt, memo]);

  /** Handle address input — auto-fills amount and memo when a zcash: payment URI is pasted. */
  function handleAddrInput(raw: string) {
    const parsed = parsePaymentUri(raw);
    if (parsed) {
      setAddr(parsed.address);
      if (parsed.amount) setAmt(parsed.amount);
      if (parsed.memo) setMemo(parsed.memo);
    } else {
      setAddr(raw);
    }
  }

  function validateForm(): string | null {
    if (!addr || !amt) return "Fill in address and amount.";
    if (amountInvalid) return "Enter a positive amount with up to 8 decimal places.";
    if (kind === "invalid") return "Invalid Zcash address for this network (UA, Sapling, or transparent).";
    if (amountTooHigh) return `Amount exceeds spendable balance (${fmtZec(spendableZat)} ZEC).`;
    if (amountPlusFeeTooHigh) return `Amount + estimated fee (${fmtZec(totalWithFeeZat)} ZEC) exceeds spendable balance.`;
    if (kind === "public" && !publicSendConfirmed) return "Confirm the public send checkbox.";
    return null;
  }

  async function handlePreview() {
    const err = validateForm();
    if (err) { toast({ type: "warning", title: "Cannot send", description: err }); return; }
    abortRef.current = false;
    setStep("previewing");
    try {
      const memoOut = kind === "private" ? (memo.trim() || undefined) : undefined;
      const result = await walletApi.previewSend(normalizedAddr, amountZat, memoOut);
      if (abortRef.current) return;
      if (!result.ok) {
        if (result.needsShielding) {
          // Let review step render the shield-funds CTA
          setPreview(result);
          setStep("review");
        } else {
          setStep("form");
          toast({ type: "danger", title: "Preview failed", description: result.error ?? "Could not compute fee." });
        }
        return;
      }
      setPreview(result);
      setStep("review");
    } catch (error) {
      if (abortRef.current) return;
      setStep("form");
      toast({ type: "danger", title: "Preview failed", description: errorToMessage(error) });
    }
  }

  async function handleBroadcast() {
    if (!preview) return;
    abortRef.current = false;
    setStep("broadcasting");
    try {
      const memoOut = kind === "private" ? (memo.trim() || undefined) : undefined;
      const broadcastedTxid = await walletApi.sendZec(normalizedAddr, amountZat, memoOut);
      if (abortRef.current) return;
      setTxid(broadcastedTxid);
      setStep("success");
      // Immediately refresh balance + tx history so UI updates without waiting for next poll
      void refreshAfterSend(broadcastedTxid);
    } catch (error) {
      if (abortRef.current) return;
      setStep("review");
      toast({ type: "danger", title: "Broadcast failed", description: errorToMessage(error) });
    }
  }

  async function refreshAfterSend(sentTxid: string) {
    try {
      const bal = await walletApi.getBalance();
      const poolTotal = bal.orchardZat + bal.saplingZat + bal.transparentZat;
      const chainSpendable = typeof bal.spendableZat === "number"
        ? bal.spendableZat
        : Math.max(0, poolTotal - bal.pendingZat);
      const walletState = useWalletStore.getState();
      const activeKey = walletState.activeWalletFingerprint || walletState.walletFingerprint;
      const lockedInVaults = vaults
        .filter((v) => (v.walletFingerprint || activeKey) === activeKey)
        .reduce((acc, v) => acc + Math.max(0, v.currentBalanceZat), 0);
      const spendable = Math.max(0, chainSpendable - lockedInVaults);
      const total = Math.max(
        typeof bal.totalZat === "number" ? bal.totalZat : poolTotal,
        chainSpendable + bal.pendingZat,
        poolTotal,
      );
      setBalances({
        totalZat: total,
        spendableZat: spendable,
        pendingZat: bal.pendingZat,
        orchardZat: bal.orchardZat,
        saplingZat: bal.saplingZat,
        transparentZat: bal.transparentZat,
      });
    } catch { /* non-critical */ }
    try {
      const walletState = useWalletStore.getState();
      const walletKey = walletState.activeWalletFingerprint || walletState.walletFingerprint;
      if (!walletKey) return;
      const txs = await walletApi.getTransactions(200);
      const nativeTxs: TxRecord[] = txs.map((tx) => ({
        id: `native:${tx.txid}`,
        type: tx.isIncoming ? "received" : "sent",
        amountZat: tx.valueZat,
        walletFingerprint: walletKey,
        memo: tx.memo,
        blockHeight: tx.blockHeight,
        feeZat: tx.feeZat ?? 0,
        toAddress: tx.toAddress,
        fromAddress: tx.fromAddress,
        timestamp: tx.timestamp > 1_000_000_000_000 ? tx.timestamp : tx.timestamp * 1000,
        pools: tx.pools,
        isShielding: tx.isShielding,
      }));
      // If tx not yet in DB (just broadcast), prepend an optimistic entry
      const alreadyPresent = nativeTxs.some((t) => t.id === `native:${sentTxid}`);
      if (!alreadyPresent) {
        nativeTxs.unshift({
          id: `native:${sentTxid}`,
          type: "sent",
          amountZat,
          walletFingerprint: walletKey,
          memo: kind === "private" ? (memo.trim() || undefined) : undefined,
          blockHeight: 0,
          feeZat: preview?.feeZat ?? 0,
          toAddress: normalizedAddr,
          timestamp: Date.now(),
        });
      }
      setNativeTxHistory(nativeTxs);
    } catch { /* non-critical */ }
  }

  const startRetryCountdown = useCallback((onComplete: () => void) => {
    if (retryTimerRef.current) clearInterval(retryTimerRef.current);
    setRetryCountdown(75);
    retryTimerRef.current = setInterval(() => {
      setRetryCountdown((prev) => {
        if (prev <= 1) {
          if (retryTimerRef.current) clearInterval(retryTimerRef.current);
          retryTimerRef.current = null;
          onComplete();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  async function handleShield() {
    abortRef.current = false;
    setStep("shielding");
    try {
      const shieldedTxid = await walletApi.shieldFunds();
      if (abortRef.current) return;
      setShieldTxid(shieldedTxid);
      void refreshAfterSend(shieldedTxid);
      // After 1 block (~75 s) automatically retry the preview so the user can send immediately.
      startRetryCountdown(() => {
        if (!abortRef.current) void handlePreview();
      });
    } catch (error) {
      if (abortRef.current) return;
      setStep("review");
      toast({ type: "danger", title: "Shielding failed", description: errorToMessage(error) });
    }
  }

  function handleReset() {
    abortRef.current = true;
    if (retryTimerRef.current) { clearInterval(retryTimerRef.current); retryTimerRef.current = null; }
    setStep("form");
    setAddr(""); setAmt(""); setMemo("");
    setPublicSendConfirmed(false);
    setPreview(null);
    setTxid("");
    setShieldTxid("");
    setRetryCountdown(0);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (step === "success") {
    return (
      <div className="fade-in">
        <h1 className="t-h1" style={{ marginBottom: 24 }}>Send ZEC</h1>
        <div className="card card-pad" style={{ padding: 28, maxWidth: 640 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, paddingBlock: 12 }}>
            <div style={{
              width: 56, height: 56, borderRadius: "50%",
              background: "var(--success-bg)", display: "grid", placeItems: "center",
            }}>
              <Icon name="check" size={28} />
            </div>
            <div style={{ textAlign: "center" }}>
              <h2 className="t-h2" style={{ color: "var(--success-text)" }}>Transaction broadcast!</h2>
              <p className="t-caption text-gray-500" style={{ marginTop: 6 }}>
                Your transaction was submitted to the Zcash network.
              </p>
            </div>
          </div>

          <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
            <div className="hstack between">
              <span className="t-caption text-gray-600">Amount sent</span>
              <span className="t-mono">{fmtZec(amountZat)} ZEC</span>
            </div>
            {preview && (
              <div className="hstack between">
                <span className="t-caption text-gray-600">Network fee</span>
                <span className="t-mono">{fmtZec(preview.feeZat)} ZEC</span>
              </div>
            )}
            <div className="hstack between">
              <span className="t-caption text-gray-600">Type</span>
              <span className={`pill ${kind === "public" ? "pill-warning" : "pill-success"}`}>
                {kind === "public" ? "Public (transparent)" : "Private (shielded)"}
              </span>
            </div>
            <div className="t-caption text-gray-600" style={{ marginTop: 4 }}>
              Recipient
              <div className="t-mono" style={{ color: "var(--gray-900)", marginTop: 4, wordBreak: "break-all" }}>
                {normalizedAddr}
              </div>
            </div>
            <div className="t-caption text-gray-600" style={{ marginTop: 4 }}>
              Transaction ID
              <div className="t-mono" style={{ marginTop: 4, wordBreak: "break-all", fontSize: "0.78em" }}>{txid}</div>
            </div>
          </div>

          <div className="hstack gap-8" style={{ marginTop: 20, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button
              className="btn btn-ghost"
              onClick={() => {
                void navigator.clipboard?.writeText(txid);
                toast({ type: "success", title: "TxID copied" });
              }}
            >
              Copy TxID
            </button>
            <button className="btn btn-secondary" onClick={() => void openExternalLink(txExplorerUrl)}>
              Open in CipherScan
            </button>
            <button className="btn btn-primary" onClick={handleReset}>
              Send another
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fade-in">
      <h1 className="t-h1" style={{ marginBottom: 24 }}>Send ZEC</h1>

      {/* Step indicator */}
      <div className="hstack gap-8" style={{ marginBottom: 20, alignItems: "center" }}>
        {(["form", "review"] as const).map((s, i) => {
          const active = (s === "form" && (step === "form" || step === "previewing"))
            || (s === "review" && (step === "review" || step === "shielding" || step === "broadcasting"));
          return (
            <div key={s} className="hstack gap-8" style={{ alignItems: "center" }}>
              <div style={{
                width: 22, height: 22, borderRadius: "50%", fontSize: "0.72em", fontWeight: 600,
                display: "grid", placeItems: "center",
                background: active ? "var(--coral)" : "var(--gray-100)",
                color: active ? "#fff" : "var(--gray-500)",
              }}>
                {i + 1}
              </div>
              <span className="t-caption" style={{ fontWeight: active ? 600 : 400, color: "var(--gray-700)" }}>
                {s === "form" ? "Details" : "Review & Confirm"}
              </span>
              {i === 0 && <span className="t-caption text-gray-300">→</span>}
            </div>
          );
        })}
      </div>

      <div className="card card-pad" style={{ padding: 28 }}>
        {/* ── Step: form ────────────────────────────────────── */}
        {(step === "form" || step === "previewing") && (
          <>
            <label className="label">Recipient address</label>
            <div className="hstack gap-8" style={{ alignItems: "center" }}>
              <input
                className="input mono"
                style={{ flex: 1 }}
                value={addr}
                onChange={(e) => handleAddrInput(e.target.value)}
                onBlur={() => {
                  const n = normalizeRecipientInput(addr);
                  if (n !== addr) setAddr(n);
                }}
                placeholder={expertAddressMode ? "u1… / utest… / zs1… / ztestsapling… / t1… / t3…" : "Paste the recipient's Zcash address"}
                disabled={step === "previewing"}
              />
              <button
                className="btn btn-ghost"
                style={{ flexShrink: 0, height: 38, padding: "0 10px" }}
                title="Paste from clipboard"
                disabled={step === "previewing"}
                onClick={async () => {
                  try {
                    const text = await navigator.clipboard.readText();
                    if (text) handleAddrInput(text.trim());
                  } catch { /* permission denied */ }
                }}
              >
                <Icon name="copy" size={15} />
              </button>
            </div>
            {expertLabel && <span className={`pill ${expertLabel.className}`} style={{ marginTop: 8 }}>{expertLabel.text}</span>}
            {simpleLabel && <span className={`pill ${simpleLabel.className}`} style={{ marginTop: 8 }}>{simpleLabel.text}</span>}
            {normalizedAddr && kind === "invalid" && (
              <div className="t-caption" style={{ marginTop: 6, color: "var(--danger-strong)" }}>
                Not a valid Zcash address for this wallet network.
              </div>
            )}

            {kind === "public" && normalizedAddr && (
              <div style={{ marginTop: 14, padding: 14, background: "var(--gray-25)", border: "1px solid var(--gray-100)", borderRadius: "var(--r-md)" }}>
                <div className="t-body-med" style={{ marginBottom: 8 }}>Public address</div>
                <p className="t-caption text-gray-600" style={{ marginBottom: 10 }}>
                  This payment will be visible on the public blockchain. Only continue if you intend to send publicly.
                </p>
                <label className="hstack gap-8" style={{ alignItems: "flex-start", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={publicSendConfirmed}
                    onChange={(e) => setPublicSendConfirmed(e.target.checked)}
                    style={{ marginTop: 3 }}
                    disabled={step === "previewing"}
                  />
                  <span className="t-caption" style={{ color: "var(--gray-800)" }}>
                    I understand this is a public address and want to send anyway.
                  </span>
                </label>
              </div>
            )}

            <div style={{ marginTop: 20 }}>
              <label className="label">Amount</label>
              <div className="hstack gap-8">
                <input
                  className="input mono"
                  type="number"
                  value={amt}
                  onChange={(e) => setAmt(e.target.value)}
                  placeholder="0.00000000"
                  disabled={step === "previewing"}
                />
                <span className="text-coral" style={{ fontWeight: 600 }}>ZEC</span>
              </div>
              <div className="hstack between" style={{ marginTop: 6 }}>
                <span className="t-caption text-gray-400">
                  ≈ ${(parseFloat(amt || "0") * zecUsdPrice).toFixed(2)} USD
                </span>
                <button
                  className="t-caption text-coral"
                  disabled={step === "previewing"}
                  onClick={async () => {
                    if (normalizedAddr && kind !== "invalid") {
                      // Use the real send-max API for fee-accurate maximum
                      try {
                        const result = await walletApi.previewSendMax(normalizedAddr, memo.trim() || undefined);
                        if (result.ok && result.amountZat > 0) {
                          setAmt((result.amountZat / 1e8).toFixed(8).replace(/\.?0+$/, ""));
                          return;
                        }
                      } catch { /* fall through to estimate */ }
                    }
                    // Fallback estimate when no address is entered yet
                    const fee = preview?.feeZat ?? feeEstZat;
                    const maxZat = Math.max(0, Number(spendableZat) - fee);
                    setAmt((maxZat / 1e8).toFixed(8).replace(/\.?0+$/, ""));
                  }}
                >
                  Max ({fmtZec(spendableZat)})
                </button>
              </div>
              {!amountInvalid && amountTooHigh && (
                <div className="t-caption" style={{ marginTop: 4, color: "var(--danger-strong)" }}>
                  Amount exceeds spendable balance.
                </div>
              )}
              {!amountInvalid && !amountTooHigh && amountPlusFeeTooHigh && (
                <div className="t-caption" style={{ marginTop: 4, color: "var(--danger-strong)" }}>
                  Amount + estimated fee exceeds spendable balance.
                </div>
              )}
              {trimmedAmount.length > 0 && !amountLooksValid && (
                <div className="t-caption" style={{ marginTop: 4, color: "var(--danger-strong)" }}>
                  Use a valid number with up to 8 decimal places.
                </div>
              )}
              {pendingZat > 0 && (
                <div className="t-caption text-gray-400" style={{ marginTop: 4 }}>
                  Pending funds excluded from Max: {fmtZec(pendingZat)} ZEC
                </div>
              )}
            </div>

            {(kind !== "public" || !addr.trim()) && (
              <>
                <label className="label" style={{ marginTop: 20 }}>
                  {kind === "private" && addr.trim() ? "Note to recipient (optional)" : "Memo (optional)"}
                </label>
                <textarea
                  className="input"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value.slice(0, 500))}
                  maxLength={500}
                  disabled={step === "previewing"}
                />
                <div className="t-caption text-gray-400" style={{ textAlign: "right" }}>{memo.length}/500</div>
                {kind === "private" && normalizedAddr && (
                  <p className="t-caption text-gray-400" style={{ marginTop: 4 }}>
                    Memo is encrypted — only the recipient can read it.
                  </p>
                )}
              </>
            )}
            {kind === "public" && addr.trim() && (
              <p className="t-caption text-gray-400" style={{ marginTop: 20 }}>
                Memos apply to private (shielded) payments only.
              </p>
            )}

            <div style={{ marginTop: 16, padding: 12, background: "var(--gray-25)", borderRadius: "var(--r-md)" }} className="hstack between">
              <span className="t-caption text-gray-600">Estimated network fee</span>
              <span className="t-mono">~{fmtZec(feeEstZat)} ZEC (ZIP-317)</span>
            </div>

            <button
              className="btn btn-primary btn-lg btn-block"
              style={{ marginTop: 20 }}
              onClick={() => void handlePreview()}
              disabled={
                step === "previewing" ||
                !addr || !amt || kind === "invalid" ||
                amountInvalid || amountTooHigh || amountPlusFeeTooHigh ||
                (kind === "public" && !publicSendConfirmed)
              }
            >
              {step === "previewing"
                ? <><span className="spinner" style={{ width: 16, height: 16, marginRight: 8 }} />Calculating fee…</>
                : <>Review Send <Icon name="arrow-up-right" size={16} /></>}
            </button>
          </>
        )}

        {/* ── Step: needs-shielding / shielding ────────────── */}
        {(step === "review" || step === "shielding") && preview?.needsShielding && (
          <>
            {step === "shielding" && shieldTxid ? (
              /* Shield broadcast success */
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, paddingBlock: 16 }}>
                <div style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--success-bg)", display: "grid", placeItems: "center" }}>
                  <Icon name="check" size={26} />
                </div>
                <div style={{ textAlign: "center" }}>
                  <h2 className="t-h2" style={{ color: "var(--success-text)" }}>Shielding broadcast!</h2>
                  <p className="t-caption text-gray-500" style={{ marginTop: 6 }}>
                    Your transparent funds are moving to the private Orchard pool.
                    {retryCountdown > 0
                      ? <> Retrying send in <strong>{retryCountdown}s</strong>…</>
                      : <> Preparing send…</>}
                  </p>
                </div>
                <div className="t-caption text-gray-400" style={{ wordBreak: "break-all", textAlign: "center" }}>
                  TxID: <span className="t-mono">{shieldTxid}</span>
                </div>
                <div className="hstack gap-8" style={{ marginTop: 4 }}>
                  <button className="btn btn-ghost" onClick={handleReset}>Cancel</button>
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      if (retryTimerRef.current) { clearInterval(retryTimerRef.current); retryTimerRef.current = null; }
                      setRetryCountdown(0);
                      void handlePreview();
                    }}
                  >
                    {retryCountdown > 0 ? `Retry send (${retryCountdown}s)` : "Retry send"}
                  </button>
                </div>
              </div>
            ) : (
              /* Prompt to shield */
              <>
                <div style={{ marginBottom: 16 }}>
                  <div className="t-body-med" style={{ marginBottom: 4 }}>Transparent funds need shielding</div>
                  <p className="t-caption text-gray-500">
                    {preview.error}
                  </p>
                </div>

                <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
                  <div className="hstack between" style={{ padding: "10px 12px", background: "var(--gray-25)", borderRadius: "var(--r-sm)" }}>
                    <span className="t-caption text-gray-600">Recipient</span>
                    <span className="t-mono" style={{ wordBreak: "break-all", maxWidth: "60%", textAlign: "right" }}>{normalizedAddr}</span>
                  </div>
                  <div className="hstack between" style={{ padding: "10px 12px", background: "var(--gray-25)", borderRadius: "var(--r-sm)" }}>
                    <span className="t-caption text-gray-600">Amount</span>
                    <span className="t-mono">{fmtZec(preview.amountZat)} ZEC</span>
                  </div>
                </div>

                <div style={{ padding: 14, borderRadius: "var(--r-md)", background: "var(--warning-bg)", border: "1px solid var(--gray-200)", marginBottom: 20 }}>
                  <div className="t-body-med" style={{ color: "var(--warning-text)", marginBottom: 4 }}>What happens next?</div>
                  <ol className="t-caption text-gray-700" style={{ paddingLeft: 16, lineHeight: 1.7 }}>
                    <li>ZecVault broadcasts a shielding transaction (transparent → Orchard).</li>
                    <li>Wait ~1 block (~75 seconds) for it to confirm.</li>
                    <li>Return here and send — your balance will be fully spendable.</li>
                  </ol>
                </div>

                <div className="hstack gap-10" style={{ justifyContent: "flex-end" }}>
                  <button className="btn btn-ghost" disabled={step === "shielding"} onClick={() => setStep("form")}>
                    Back
                  </button>
                  <button
                    className="btn btn-primary"
                    disabled={step === "shielding"}
                    onClick={() => void handleShield()}
                  >
                    {step === "shielding"
                      ? <><span className="spinner" style={{ width: 16, height: 16, marginRight: 8 }} />Shielding…</>
                      : "Shield transparent funds"}
                  </button>
                </div>
                {step === "shielding" && (
                  <p className="t-caption text-gray-400" style={{ marginTop: 10, textAlign: "center" }}>
                    Syncing and building shielding proof… this may take 30–90 seconds.
                  </p>
                )}
              </>
            )}
          </>
        )}

        {/* ── Step: review / broadcasting ───────────────────── */}
        {(step === "review" || step === "broadcasting") && preview && !preview.needsShielding && (
          <>
            <div style={{ marginBottom: 16 }}>
              <div className="t-body-med" style={{ marginBottom: 4 }}>Review your transaction</div>
              <p className="t-caption text-gray-500">
                Please verify all details. Once broadcast, a Zcash transaction cannot be reversed.
              </p>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <div className="t-caption text-gray-600">
                Recipient
                <div className="t-mono" style={{ color: "var(--gray-900)", marginTop: 4, wordBreak: "break-all" }}>
                  {normalizedAddr}
                </div>
              </div>

              <div className="hstack between" style={{ padding: "10px 12px", background: "var(--gray-25)", borderRadius: "var(--r-sm)" }}>
                <span className="t-caption text-gray-600">Type</span>
                <span className={`pill ${kind === "public" ? "pill-warning" : "pill-success"}`}>
                  {kind === "public" ? "Public (transparent)" : "Private (shielded)"}
                </span>
              </div>

              <div className="hstack between" style={{ padding: "10px 12px", background: "var(--gray-25)", borderRadius: "var(--r-sm)" }}>
                <span className="t-caption text-gray-600">Amount</span>
                <div style={{ textAlign: "right" }}>
                  <div className="t-mono">{fmtZec(preview.amountZat)} ZEC</div>
                  <div className="t-caption text-gray-400">≈ ${(preview.amountZat / 1e8 * zecUsdPrice).toFixed(2)} USD</div>
                </div>
              </div>

              <div className="hstack between" style={{ padding: "10px 12px", background: "var(--gray-25)", borderRadius: "var(--r-sm)" }}>
                <div>
                  <div className="t-caption text-gray-600">Network fee (ZIP-317)</div>
                  <div className="t-caption text-gray-400" style={{ marginTop: 2 }}>Computed from your wallet notes</div>
                </div>
                <span className="t-mono">{fmtZec(preview.feeZat)} ZEC</span>
              </div>

              <div className="hstack between" style={{ padding: "10px 12px", background: "var(--gray-100)", borderRadius: "var(--r-sm)", border: "1px solid var(--gray-200)" }}>
                <span className="t-caption" style={{ fontWeight: 600 }}>Total debit from wallet</span>
                <span className="t-mono" style={{ fontWeight: 700 }}>{fmtZec(preview.totalDebitZat)} ZEC</span>
              </div>

              <div className="hstack between" style={{ padding: "10px 12px", background: "var(--gray-25)", borderRadius: "var(--r-sm)" }}>
                <span className="t-caption text-gray-600">Spendable after</span>
                <span className="t-mono">{fmtZec(Math.max(0, Number(spendableZat) - preview.totalDebitZat))} ZEC</span>
              </div>

              {memo.trim() && kind === "private" && (
                <div style={{ padding: "10px 12px", background: "var(--gray-25)", borderRadius: "var(--r-sm)" }}>
                  <div className="t-caption text-gray-600" style={{ marginBottom: 4 }}>Encrypted memo</div>
                  <div className="t-body" style={{ whiteSpace: "pre-wrap" }}>{memo.trim()}</div>
                </div>
              )}
            </div>

            {kind === "public" && (
              <div style={{ marginTop: 12, padding: 12, borderRadius: "var(--r-md)", background: "var(--warning-bg)", border: "1px solid var(--gray-200)" }}>
                <span className="t-caption" style={{ color: "var(--warning-text)" }}>
                  This is a transparent send — the recipient address, amount, and sender will be visible on the public blockchain.
                </span>
              </div>
            )}

            <div className="hstack gap-10" style={{ marginTop: 20, justifyContent: "flex-end" }}>
              <button className="btn btn-ghost" disabled={step === "broadcasting"} onClick={() => setStep("form")}>
                Back
              </button>
              <button
                className="btn btn-primary"
                disabled={step === "broadcasting"}
                onClick={() => void handleBroadcast()}
              >
                {step === "broadcasting"
                  ? <><span className="spinner" style={{ width: 16, height: 16, marginRight: 8 }} />Broadcasting…</>
                  : "Confirm & Broadcast"}
              </button>
            </div>

            {step === "broadcasting" && (
              <p className="t-caption text-gray-400" style={{ marginTop: 10, textAlign: "center" }}>
                Syncing wallet and building transaction proof… this may take 30–90 seconds.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function errorToMessage(error: unknown): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "object" && error !== null) {
    const rec = error as Record<string, unknown>;
    const msg = rec.message;
    if (typeof msg === "string" && msg.trim()) return msg;
    const cause = rec.cause;
    if (typeof cause === "string" && cause.trim()) return cause;
    try {
      const json = JSON.stringify(error);
      if (json && json !== "{}") return json;
    } catch { /* ignored */ }
  }
  return "Could not broadcast transaction.";
}

async function openExternalLink(url: string) {
  try {
    await openUrl(url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
