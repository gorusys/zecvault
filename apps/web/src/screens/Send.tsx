import { useState } from "react";
import { useWalletStore } from "@/stores";
import { fmtZec, zecToZat } from "@/lib/zec";
import { Icon } from "@/components/Icon";
import { toast } from "@/stores/toast";
import { useWallet } from "@/hooks/useWallet";

export function Send() {
  const { spendableZat, zecUsdPrice } = useWalletStore();
  const [addr, setAddr] = useState("");
  const [amt, setAmt] = useState("");
  const [memo, setMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const walletApi = useWallet();

  const addrType = addr.startsWith("u1") ? { label: "Shielded (UA)", style: "pill-info" } :
                   addr.startsWith("zs1") ? { label: "Sapling", style: "pill-success" } :
                   addr.startsWith("t1") ? { label: "Transparent", style: "pill-warning" } : null;

  const max = Number(spendableZat) / 1e8;

  async function handleSend() {
    if (!addr || !amt) return;
    if (!addr.startsWith("u1") && !addr.startsWith("zs1") && !addr.startsWith("t1")) {
      toast({ type: "error", title: "Invalid address", description: "Use a valid unified, sapling, or transparent address." });
      return;
    }
    if (addr.startsWith("t1")) {
      toast({ type: "error", title: "Transparent warning", description: "Transparent addresses reduce privacy. Prefer unified addresses (u1...)." });
      return;
    }
    setSubmitting(true);
    try {
      const txid = await walletApi.sendZec(addr.trim(), zecToZat(Number(amt)), memo.trim() || undefined);
      toast({ type: "success", title: "Transaction broadcast", description: `TxID: ${txid}` });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Could not broadcast transaction.";
      toast({ type: "error", title: "Send failed", description: detail });
    } finally {
      setSubmitting(false);
    }
    setAddr(""); setAmt(""); setMemo("");
  }

  return (
    <div className="fade-in">
      <h1 className="t-h1" style={{ marginBottom: 24 }}>Send ZEC</h1>
      <div className="card card-pad" style={{ padding: 28 }}>
        <label className="label">Recipient address</label>
        <input className="input mono" value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="u1..., zs1..., or t1..." />
        {addrType && <span className={`pill ${addrType.style}`} style={{ marginTop: 8 }}>{addrType.label}</span>}

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

        <label className="label" style={{ marginTop: 20 }}>Memo (optional)</label>
        <textarea className="input" value={memo} onChange={(e) => setMemo(e.target.value.slice(0, 500))} maxLength={500} />
        <div className="t-caption text-gray-400" style={{ textAlign: "right" }}>{memo.length}/500</div>

        <div style={{ marginTop: 16, padding: 12, background: "var(--gray-25)", borderRadius: "var(--r-md)" }} className="hstack between">
          <span className="t-caption text-gray-600">Network fee</span>
          <span className="t-mono">0.0001 ZEC</span>
        </div>

        <button className="btn btn-primary btn-lg btn-block" style={{ marginTop: 24 }} onClick={() => void handleSend()} disabled={!addr || !amt || submitting}>
          Send <Icon name="arrow-up-right" size={16} />
        </button>
      </div>
    </div>
  );
}
