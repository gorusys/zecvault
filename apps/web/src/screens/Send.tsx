import { useEffect, useState } from "react";
import { useSettings, useWalletStore } from "@/stores";
import { fmtZec, zecToZat } from "@/lib/zec";
import { classifySendRecipient, normalizeRecipientInput, surfaceKindFromRecipient } from "@/lib/zcash-address";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Icon } from "@/components/Icon";
import { toast } from "@/stores/toast";
import { useWallet } from "@/hooks/useWallet";

export function Send() {
  const expertAddressMode = useSettings((s) => s.expertAddressMode);
  const { spendableZat, pendingZat, zecUsdPrice } = useWalletStore();
  const [addr, setAddr] = useState("");
  const [amt, setAmt] = useState("");
  const [memo, setMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [publicSendConfirmed, setPublicSendConfirmed] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [broadcastTxid, setBroadcastTxid] = useState("");
  const walletApi = useWallet();

  const normalizedAddr = normalizeRecipientInput(addr);
  const kind = classifySendRecipient(normalizedAddr);
  const max = Number(spendableZat) / 1e8;
  const trimmedAmount = amt.trim();
  const amountLooksValid = /^\d+(\.\d{0,8})?$/.test(trimmedAmount);
  const amountZat = amountLooksValid && trimmedAmount.length > 0 ? Number(zecToZat(trimmedAmount)) : 0;
  const amountTooHigh = amountZat > Number(spendableZat);
  const amountInvalid = !trimmedAmount || !amountLooksValid || amountZat <= 0 || !Number.isFinite(amountZat);
  const feeZat = 10_000;
  const totalWithFeeZat = amountZat + feeZat;
  const amountPlusFeeTooHigh = totalWithFeeZat > Number(spendableZat);
  const txExplorerUrl = broadcastTxid ? `https://cipherscan.app/tx/${broadcastTxid}` : "";

  useEffect(() => {
    setPublicSendConfirmed(false);
  }, [addr]);

  useEffect(() => {
    setShowConfirmModal(false);
  }, [addr, amt, memo]);

  const surface = normalizedAddr ? surfaceKindFromRecipient(normalizedAddr) : null;
  const expertLabel = normalizedAddr && expertAddressMode && surface && surface !== "unknown"
    ? (surface === "unified" ? { text: "Unified address (UA)", className: "pill-info" as const }
      : surface === "sapling" ? { text: "Sapling (zs / ztestsapling)", className: "pill-success" as const }
        : { text: "Transparent (t1 / t3 / tm / t2)", className: "pill-warning" as const })
    : null;

  const simpleLabel = normalizedAddr && !expertAddressMode && kind !== "invalid"
    ? { text: kind === "private" ? "Private (shielded)" : "Public (transparent)", className: kind === "private" ? "pill-success" as const : "pill-warning" as const }
    : null;

  function validateBeforeSend(): boolean {
    if (!addr || !amt) return false;
    if (amountInvalid) {
      toast({
        type: "danger",
        title: "Invalid amount",
        description: "Enter a positive amount with up to 8 decimal places.",
      });
      return false;
    }
    if (amountTooHigh) {
      toast({
        type: "warning",
        title: "Amount exceeds spendable",
        description: `Spendable right now is ${fmtZec(spendableZat)} ZEC.`,
      });
      return false;
    }
    if (amountPlusFeeTooHigh) {
      toast({
        type: "warning",
        title: "Insufficient for amount + fee",
        description: `Need ${fmtZec(totalWithFeeZat)} ZEC including fee, but spendable is ${fmtZec(spendableZat)} ZEC.`,
      });
      return false;
    }
    if (kind === "invalid") {
      toast({
        type: "danger",
        title: "Invalid address",
        description: "Paste a valid Zcash address for this wallet network (UA, Sapling, or transparent). Unknown prefixes are rejected here; the wallet still validates on send.",
      });
      return false;
    }
    if (kind === "public" && !publicSendConfirmed) {
      toast({ type: "warning", title: "Confirm public send", description: "Check the box to confirm you are sending to a public address." });
      return false;
    }
    return true;
  }

  function handleSend() {
    if (!validateBeforeSend()) return;
    setShowConfirmModal(true);
  }

  async function confirmAndBroadcast() {
    if (!validateBeforeSend()) return;
    setSubmitting(true);
    try {
      const memoOut = kind === "private" ? (memo.trim() || undefined) : undefined;
      const txid = await walletApi.sendZec(normalizedAddr, amountZat, memoOut);
      setBroadcastTxid(txid);
      setShowConfirmModal(false);
      toast({ type: "success", title: "Transaction broadcast", description: `TxID: ${txid}` });
      setAddr(""); setAmt(""); setMemo(""); setPublicSendConfirmed(false);
    } catch (error) {
      const detail = errorToMessage(error);
      toast({ type: "danger", title: "Send failed", description: detail });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fade-in">
      <h1 className="t-h1" style={{ marginBottom: 24 }}>Send ZEC</h1>
      <div className="card card-pad" style={{ padding: 28 }}>
        <label className="label">Recipient address</label>
        <input
          className="input mono"
          value={addr}
          onChange={(e) => setAddr(e.target.value)}
          onBlur={() => {
            const n = normalizeRecipientInput(addr);
            if (n !== addr) setAddr(n);
          }}
          placeholder={expertAddressMode ? "u1… / utest… / zs1… / ztestsapling… / t1… / t3… / tm…" : "Paste the address you were given"}
        />
        {expertLabel && <span className={`pill ${expertLabel.className}`} style={{ marginTop: 8 }}>{expertLabel.text}</span>}
        {simpleLabel && <span className={`pill ${simpleLabel.className}`} style={{ marginTop: 8 }}>{simpleLabel.text}</span>}

        {kind === "public" && normalizedAddr && (
          <div style={{ marginTop: 14, padding: 14, background: "var(--gray-25)", border: "1px solid var(--gray-100)", borderRadius: "var(--r-md)", textAlign: "left" }}>
            <div className="t-body-med" style={{ marginBottom: 8 }}>Public address</div>
            <p className="t-caption text-gray-600" style={{ marginBottom: 12 }}>
              This payment will be visible on the public blockchain like a typical Bitcoin transfer. Only continue if you intend to send publicly.
            </p>
            <label className="hstack gap-8" style={{ alignItems: "flex-start", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={publicSendConfirmed}
                onChange={(e) => setPublicSendConfirmed(e.target.checked)}
                style={{ marginTop: 3 }}
              />
              <span className="t-caption" style={{ color: "var(--gray-800)" }}>
                I understand this is a public address and I want to send anyway.
              </span>
            </label>
          </div>
        )}

        <div className="hstack between" style={{ marginTop: 20, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label className="label">Amount</label>
            <div className="hstack gap-8">
              <input className="input mono" type="number" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="0.0000" />
              <span className="text-coral" style={{ fontWeight: 600 }}>ZEC</span>
            </div>
            <div className="hstack between" style={{ marginTop: 6 }}>
              <span className="t-caption text-gray-400">≈ ${(parseFloat(amt || "0") * zecUsdPrice).toFixed(2)} USD</span>
              <button className="t-caption text-coral" onClick={() => setAmt(max.toString())}>Max ({fmtZec(spendableZat)})</button>
            </div>
            {!amountInvalid && amountTooHigh && (
              <div className="t-caption" style={{ marginTop: 4, color: "var(--danger-strong)" }}>
                Amount exceeds spendable balance.
              </div>
            )}
            {!amountInvalid && !amountTooHigh && amountPlusFeeTooHigh && (
              <div className="t-caption" style={{ marginTop: 4, color: "var(--danger-strong)" }}>
                Amount plus fee exceeds spendable balance.
              </div>
            )}
            {trimmedAmount.length > 0 && !amountLooksValid && (
              <div className="t-caption" style={{ marginTop: 4, color: "var(--danger-strong)" }}>
                Use a valid number with up to 8 decimal places.
              </div>
            )}
            {pendingZat > 0 && (
              <div className="t-caption text-gray-400" style={{ marginTop: 4 }}>
                Pending funds are excluded from Max: {fmtZec(pendingZat)}
              </div>
            )}
          </div>
        </div>

        {kind !== "public" || !addr.trim() ? (
          <>
            <label className="label" style={{ marginTop: 20 }}>
              {kind === "private" && addr.trim() ? "Note to recipient (optional)" : "Memo (optional)"}
            </label>
            <textarea className="input" value={memo} onChange={(e) => setMemo(e.target.value.slice(0, 500))} maxLength={500} />
            <div className="t-caption text-gray-400" style={{ textAlign: "right" }}>{memo.length}/500</div>
          </>
        ) : (
          <p className="t-caption text-gray-400" style={{ marginTop: 20, textAlign: "left" }}>
            Memos apply to private (shielded) payments only.
          </p>
        )}
        {kind === "private" && normalizedAddr && (
          <p className="t-caption text-gray-400" style={{ marginTop: 6, textAlign: "left" }}>
            The recipient will only see this if their wallet supports shielded memos.
          </p>
        )}

        {/* {expertAddressMode && (
          <div style={{ marginTop: 18, padding: 14, background: "var(--gray-25)", border: "1px solid var(--gray-100)", borderRadius: "var(--r-md)", textAlign: "left" }}>
            <div className="t-body-med" style={{ marginBottom: 8 }}>How sending maps to on-chain pools</div>
            <ul className="t-caption text-gray-600" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.55 }}>
              <li>
                <strong>Source notes:</strong> this wallet may spend Orchard, Sapling, and transparent inputs in one transaction when the proposal succeeds (mixed-source sends).
              </li>
              <li>
                <strong>Unified (UA) recipients:</strong> your payment targets whichever embedded receiver their wallet chooses (often Orchard if available, else Sapling, else transparent when present).
              </li>
              <li>
                <strong>Cross-pool:</strong> shielded→transparent (deshield), transparent→shielded (shield), and Orchard↔Sapling are normal paths when consensus and balances allow.
              </li>
              <li>
                <strong>If send fails with “insufficient”:</strong> check per-pool balances on the Dashboard (Expert) — you may have enough total ZEC but not enough in the pools needed for that destination and fee.
              </li>
            </ul>
          </div>
        )} */}

        <div style={{ marginTop: 16, padding: 12, background: "var(--gray-25)", borderRadius: "var(--r-md)" }} className="hstack between">
          <span className="t-caption text-gray-600">Network fee</span>
          <span className="t-mono">0.0001 ZEC</span>
        </div>
        <button
          className="btn btn-primary btn-lg btn-block"
          style={{ marginTop: 24 }}
          onClick={handleSend}
          disabled={!addr || !amt || submitting || kind === "invalid" || amountInvalid || amountTooHigh || amountPlusFeeTooHigh || (kind === "public" && !publicSendConfirmed)}
        >
          Review Send <Icon name="arrow-up-right" size={16} />
        </button>
      </div>

      {showConfirmModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 60,
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
          onClick={() => {
            if (!submitting) setShowConfirmModal(false);
          }}
        >
          <div
            className="card card-pad"
            style={{ width: "min(620px, 100%)", textAlign: "left" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="t-h3">Confirm transfer</h3>
            <p className="t-caption text-gray-500" style={{ marginTop: 6 }}>
              Please review all details before broadcasting this transaction.
            </p>
            <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
              <div className="t-caption text-gray-600">
                Recipient
                <div className="t-mono" style={{ color: "var(--gray-900)", marginTop: 4, wordBreak: "break-all" }}>
                  {normalizedAddr}
                </div>
              </div>
              <div className="hstack between">
                <span className="t-caption text-gray-600">Type</span>
                <span className={`pill ${kind === "public" ? "pill-warning" : "pill-success"}`}>
                  {kind === "public" ? "Public (transparent)" : "Private (shielded)"}
                </span>
              </div>
              <div className="hstack between">
                <span className="t-caption text-gray-600">Amount</span>
                <span className="t-mono">{fmtZec(amountZat)} ZEC</span>
              </div>
              <div className="hstack between">
                <span className="t-caption text-gray-600">Estimated fee</span>
                <span className="t-mono">{fmtZec(feeZat)} ZEC</span>
              </div>
              <div className="hstack between">
                <span className="t-caption text-gray-600">Total debit</span>
                <span className="t-mono">{fmtZec(totalWithFeeZat)} ZEC</span>
              </div>
              <div className="hstack between">
                <span className="t-caption text-gray-600">Spendable now</span>
                <span className="t-mono">{fmtZec(spendableZat)} ZEC</span>
              </div>
              {memo.trim() && (
                <div className="t-caption text-gray-600">
                  Memo
                  <div style={{ color: "var(--gray-900)", marginTop: 4, whiteSpace: "pre-wrap" }}>
                    {memo.trim()}
                  </div>
                </div>
              )}
            </div>
            <div className="hstack gap-10" style={{ marginTop: 18, justifyContent: "flex-end" }}>
              <button className="btn btn-secondary" disabled={submitting} onClick={() => setShowConfirmModal(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" disabled={submitting} onClick={() => void confirmAndBroadcast()}>
                {submitting ? "Broadcasting..." : "Confirm & Broadcast"}
              </button>
            </div>
          </div>
        </div>
      )}

      {broadcastTxid && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 60,
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
          onClick={() => setBroadcastTxid("")}
        >
          <div
            className="card card-pad"
            style={{ width: "min(620px, 100%)", textAlign: "left" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="t-h3">Transaction broadcasted</h3>
            <p className="t-caption text-gray-500" style={{ marginTop: 6 }}>
              Your transaction has been submitted to the network.
            </p>
            <div style={{ marginTop: 12 }}>
              <div className="t-caption text-gray-600">TxID</div>
              <div className="t-mono" style={{ marginTop: 4, wordBreak: "break-all" }}>{broadcastTxid}</div>
            </div>
            <div className="hstack gap-10" style={{ marginTop: 16, justifyContent: "flex-end" }}>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  void navigator.clipboard?.writeText(broadcastTxid);
                  toast({ type: "success", title: "TxID copied" });
                }}
              >
                Copy TxID
              </button>
              <button className="btn btn-primary" onClick={() => void openExternalLink(txExplorerUrl)}>
                Open in CipherScan
              </button>
              <button className="btn btn-ghost" onClick={() => setBroadcastTxid("")}>Close</button>
            </div>
          </div>
        </div>
      )}
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
    } catch {
      // ignored
    }
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
