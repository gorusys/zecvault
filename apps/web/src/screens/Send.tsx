import { useEffect, useState } from "react";
import { useSettings, useWalletStore } from "@/stores";
import { fmtZec, zecToZat } from "@/lib/zec";
import { Icon } from "@/components/Icon";
import { toast } from "@/stores/toast";
import { useWallet } from "@/hooks/useWallet";

function classifyRecipient(addr: string): "private" | "public" | "invalid" {
  const t = addr.trim();
  if (t.startsWith("u1") || t.startsWith("zs1")) return "private";
  if (t.startsWith("t1")) return "public";
  return "invalid";
}

export function Send() {
  const expertAddressMode = useSettings((s) => s.expertAddressMode);
  const { spendableZat, zecUsdPrice } = useWalletStore();
  const [addr, setAddr] = useState("");
  const [amt, setAmt] = useState("");
  const [memo, setMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [publicSendConfirmed, setPublicSendConfirmed] = useState(false);
  const walletApi = useWallet();

  const kind = classifyRecipient(addr);
  const max = Number(spendableZat) / 1e8;

  useEffect(() => {
    setPublicSendConfirmed(false);
  }, [addr]);

  const expertLabel = addr.trim() && expertAddressMode
    ? (addr.trim().startsWith("u1") ? { text: "Unified address (UA)", className: "pill-info" as const }
      : addr.trim().startsWith("zs1") ? { text: "Sapling", className: "pill-success" as const }
        : addr.trim().startsWith("t1") ? { text: "Transparent", className: "pill-warning" as const }
        : null)
    : null;

  const simpleLabel = addr.trim() && !expertAddressMode && kind !== "invalid"
    ? { text: kind === "private" ? "Private (shielded)" : "Public (transparent)", className: kind === "private" ? "pill-success" as const : "pill-warning" as const }
    : null;

  async function handleSend() {
    if (!addr || !amt) return;
    if (kind === "invalid") {
      toast({ type: "error", title: "Invalid address", description: "Paste a valid Zcash address (starts with u1, zs1, or t1)." });
      return;
    }
    if (kind === "public" && !publicSendConfirmed) {
      toast({ type: "warning", title: "Confirm public send", description: "Check the box to confirm you are sending to a public address." });
      return;
    }
    setSubmitting(true);
    try {
      const memoOut = kind === "private" ? (memo.trim() || undefined) : undefined;
      const txid = await walletApi.sendZec(addr.trim(), zecToZat(Number(amt)), memoOut);
      toast({ type: "success", title: "Transaction broadcast", description: `TxID: ${txid}` });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Could not broadcast transaction.";
      toast({ type: "error", title: "Send failed", description: detail });
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
          placeholder={expertAddressMode ? "u1..., zs1..., or t1..." : "Paste the address you were given"}
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
