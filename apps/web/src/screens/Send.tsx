import { useEffect, useState } from "react";
import { useSettings, useWalletStore } from "@/stores";
import { fmtZec, zecToZat } from "@/lib/zec";
import { classifySendRecipient, surfaceKindFromRecipient } from "@/lib/zcash-address";
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
  const walletApi = useWallet();

  const kind = classifySendRecipient(addr);
  const max = Number(spendableZat) / 1e8;

  useEffect(() => {
    setPublicSendConfirmed(false);
  }, [addr]);

  const surface = addr.trim() ? surfaceKindFromRecipient(addr) : null;
  const expertLabel = addr.trim() && expertAddressMode && surface && surface !== "unknown"
    ? (surface === "unified" ? { text: "Unified address (UA)", className: "pill-info" as const }
      : surface === "sapling" ? { text: "Sapling (zs / ztestsapling)", className: "pill-success" as const }
        : { text: "Transparent (t1 / t3 / tm / t2)", className: "pill-warning" as const })
    : null;

  const simpleLabel = addr.trim() && !expertAddressMode && kind !== "invalid"
    ? { text: kind === "private" ? "Private (shielded)" : "Public (transparent)", className: kind === "private" ? "pill-success" as const : "pill-warning" as const }
    : null;

  async function handleSend() {
    if (!addr || !amt) return;
    if (kind === "invalid") {
      toast({
        type: "danger",
        title: "Invalid address",
        description: "Paste a valid Zcash address for this wallet network (UA, Sapling, or transparent). Unknown prefixes are rejected here; the wallet still validates on send.",
      });
      return;
    }
    if (kind === "public" && !publicSendConfirmed) {
      toast({ type: "warning", title: "Confirm public send", description: "Check the box to confirm you are sending to a public address." });
      return;
    }
    setSubmitting(true);
    try {
      const memoOut = kind === "private" ? (memo.trim() || undefined) : undefined;
      const txid = await walletApi.sendZec(addr.trim(), Number(zecToZat(Number(amt))), memoOut);
      toast({ type: "success", title: "Transaction broadcast", description: `TxID: ${txid}` });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Could not broadcast transaction.";
      toast({ type: "danger", title: "Send failed", description: detail });
    } finally {
      setSubmitting(false);
    }
    setAddr(""); setAmt(""); setMemo(""); setPublicSendConfirmed(false);
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
          placeholder={expertAddressMode ? "u1… / utest… / zs1… / ztestsapling… / t1… / t3… / tm…" : "Paste the address you were given"}
        />
        {expertLabel && <span className={`pill ${expertLabel.className}`} style={{ marginTop: 8 }}>{expertLabel.text}</span>}
        {simpleLabel && <span className={`pill ${simpleLabel.className}`} style={{ marginTop: 8 }}>{simpleLabel.text}</span>}

        {kind === "public" && addr.trim() && (
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
        {kind === "private" && addr.trim() && (
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
          onClick={() => void handleSend()}
          disabled={!addr || !amt || submitting || kind === "invalid" || (kind === "public" && !publicSendConfirmed)}
        >
          Send <Icon name="arrow-up-right" size={16} />
        </button>
      </div>
    </div>
  );
}
