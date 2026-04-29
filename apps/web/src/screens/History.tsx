import { useMemo, useState } from "react";
import { useWalletStore, useVaultStore } from "@/stores";
import { fmtZec, formatRelativeTime, truncateAddress } from "@/lib/zec";
import { categoryOf } from "@/lib/categories";
import { Icon } from "@/components/Icon";

const TABS = ["All", "Vaults", "Received", "Sent", "Memos"] as const;

export function History() {
  const txHistory = useWalletStore((s) => s.txHistory);
  const vaults = useVaultStore((s) => s.vaults);
  const [tab, setTab] = useState<typeof TABS[number]>("All");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => txHistory.filter((tx) => {
    if (tab === "Vaults" && !tx.type.startsWith("vault")) return false;
    if (tab === "Received" && tx.type !== "received") return false;
    if (tab === "Sent" && tx.type !== "sent") return false;
    if (tab === "Memos" && !tx.memo) return false;
    if (q) {
      const s = q.toLowerCase();
      return (tx.toAddress?.toLowerCase().includes(s) || tx.memo?.toLowerCase().includes(s) || fmtZec(Math.abs(tx.amountZat)).includes(s));
    }
    return true;
  }), [txHistory, tab, q]);

  return (
    <div className="fade-in">
      <h1 className="t-h1" style={{ marginBottom: 24 }}>Transaction history</h1>

      <div className="hstack gap-8" style={{ marginBottom: 16, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button type="button" key={t} onClick={() => setTab(t)} className="pill"
            style={{ height: 32, padding: "0 14px", cursor: "pointer", border: "1px solid var(--color-border)",
              background: tab === t ? "var(--coral-400)" : "var(--color-bg-raised)",
              color: tab === t ? "#ffffff" : "var(--gray-600)",
            }}>{t}</button>
        ))}
      </div>

      <div style={{ position: "relative", marginBottom: 16 }}>
        <Icon name="search" size={16} />
        <input className="input" placeholder="Search by address, memo, or amount…" value={q} onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 36, height: 36 }} />
        <span style={{ position: "absolute", left: 12, top: 10, color: "var(--gray-400)" }}><Icon name="search" size={16} /></span>
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <div className="t-body text-gray-600" style={{ padding: 48, textAlign: "center" }}>No transactions match your filter.</div>
        ) : filtered.map((tx) => {
          const isReceived = tx.type === "received";
          const isVault = tx.type.startsWith("vault");
          const vault = isVault ? vaults.find((v) => v.id === tx.vaultId) : null;
          const cat = vault ? categoryOf(vault.category) : null;
          const color = isReceived ? "var(--success-strong)" : isVault ? "#4FA3E3" : "var(--coral-400)";
          return (
            <div key={tx.id} className="hstack gap-12" style={{ padding: "10px 20px", height: 52, borderBottom: "1px solid var(--gray-100)" }}>
              <div style={{ width: 32, height: 32, borderRadius: 999, background: isReceived ? "var(--success-bg)" : isVault ? `var(--vault-${vault!.category})` : "var(--coral-100)", display: "grid", placeItems: "center", color }}>
                <Icon name={isVault ? "lock" : isReceived ? "arrow-down-left" : "arrow-up-right"} size={14} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="t-body-med">{isVault ? `Vault: ${vault?.goalName ?? ""}` : isReceived ? "Received" : "Sent"} {cat && <span className="pill cat-tint" style={{ marginLeft: 6 }}>{cat.emoji} {cat.name}</span>}</div>
                <div className="t-caption text-gray-400">{tx.toAddress ? truncateAddress(tx.toAddress) : "shielded"} • {formatRelativeTime(tx.timestamp)}</div>
              </div>
              <div className="t-mono-lg tabular" style={{ color, fontWeight: 600 }}>{tx.amountZat > 0 ? "+" : "−"}{fmtZec(Math.abs(tx.amountZat))}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
