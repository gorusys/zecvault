import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useWalletStore, useVaultStore } from "@/stores";
import { fmtZec, formatRelativeTime, truncateAddress } from "@/lib/zec";
import { categoryOf } from "@/lib/categories";
import { Icon } from "@/components/Icon";

const TABS = ["All", "Vaults", "Received", "Sent", "Memos"] as const;

const wrapMono: CSSProperties = {
  overflowWrap: "anywhere",
  wordBreak: "break-word",
  fontFamily: "var(--font-mono, DM Mono, ui-monospace, monospace)",
  fontSize: "0.85rem",
};

async function copyText(text: string) {
  try {
    await navigator.clipboard?.writeText(text);
  } catch {
    /* ignore */
  }
}

function IconGhostBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="btn btn-ghost"
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{
        height: 28,
        width: 28,
        padding: 0,
        display: "inline-grid",
        placeItems: "center",
        flexShrink: 0,
        color: "var(--gray-500)",
      }}
    >
      {children}
    </button>
  );
}

function DetailRow({
  label,
  value,
  copyable,
}: {
  label: string;
  value: string | undefined | null;
  copyable?: boolean;
}) {
  const text = (value ?? "").trim();
  const show = text.length > 0;
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
      <span className="text-gray-500" style={{ flexShrink: 0, minWidth: 72 }}>
        {label}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {show ? (
          <span className="t-mono" style={wrapMono}>
            {text}
          </span>
        ) : (
          <span className="t-caption text-gray-400">—</span>
        )}
      </div>
      {copyable && show ? (
        <IconGhostBtn label={`Copy ${label}`} onClick={() => void copyText(text)}>
          <Icon name="copy" size={14} />
        </IconGhostBtn>
      ) : null}
    </div>
  );
}

export function History() {
  const txHistory = useWalletStore((s) => s.txHistory);
  const vaults = useVaultStore((s) => s.vaults);
  const archive = useVaultStore((s) => s.archive);
  const activeWalletFingerprint = useWalletStore((s) => s.activeWalletFingerprint);
  const fallbackWalletFingerprint = useWalletStore((s) => s.walletFingerprint);
  const activeWalletKey = activeWalletFingerprint || fallbackWalletFingerprint;
  const [tab, setTab] = useState<typeof TABS[number]>("All");
  const [q, setQ] = useState("");
  const [expandedTx, setExpandedTx] = useState<string | null>(null);

  const filtered = useMemo(() => txHistory.filter((tx) => {
    if (tx.walletFingerprint && tx.walletFingerprint !== activeWalletKey) return false;
    if (tab === "Vaults" && !tx.type.startsWith("vault")) return false;
    if (tab === "Received" && tx.type !== "received") return false;
    if (tab === "Sent" && tx.type !== "sent") return false;
    if (tab === "Memos" && !tx.memo) return false;
    if (q) {
      const s = q.toLowerCase();
      return (
        tx.fromAddress?.toLowerCase().includes(s)
        || tx.toAddress?.toLowerCase().includes(s)
        || tx.memo?.toLowerCase().includes(s)
        || fmtZec(Math.abs(tx.amountZat)).includes(s)
      );
    }
    return true;
  }), [txHistory, tab, q, activeWalletKey]);

  const openExternalLink = async (url: string) => {
    try {
      await openUrl(url);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

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
        <input className="input" placeholder="Search by address, memo, or amount…" value={q} onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 36, height: 36 }} />
        <span style={{ position: "absolute", left: 12, top: 10, color: "var(--gray-400)" }}><Icon name="search" size={16} /></span>
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <div className="t-body text-gray-600" style={{ padding: 48, textAlign: "center" }}>No transactions match your filter.</div>
        ) : filtered.map((tx) => {
          const isReceived = tx.type === "received";
          const isVault = tx.type.startsWith("vault");
          const isNativeTx = tx.id.startsWith("native:");
          const vault = isVault ? [...vaults, ...archive].find((v) => v.id === tx.vaultId) : null;
          const cat = vault ? categoryOf(vault.category) : null;
          const color = isReceived ? "var(--success-strong)" : isVault ? "#4FA3E3" : "var(--coral-400)";
          const txid = isNativeTx ? tx.id.slice("native:".length) : "";
          const isExpanded = expandedTx === tx.id;
          return (
            <div key={tx.id} style={{ borderBottom: "1px solid var(--gray-100)" }}>
              <button
                type="button"
                className="hstack gap-12"
                onClick={() => setExpandedTx(isExpanded ? null : tx.id)}
                style={{ width: "100%", padding: "10px 20px", minHeight: 52, border: 0, background: "transparent", cursor: "pointer" }}
              >
                <div style={{ width: 32, height: 32, borderRadius: 999, background: isReceived ? "var(--success-bg)" : isVault ? `var(--vault-${vault?.category ?? "travel"})` : "var(--coral-100)", display: "grid", placeItems: "center", color }}>
                  <Icon name={isVault ? "lock" : isReceived ? "arrow-down-left" : "arrow-up-right"} size={14} />
                </div>
                <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                  <div className="t-body-med">
                    {isVault ? `Vault: ${vault?.goalName ?? ""}` : isReceived ? "Received" : "Sent"}
                    {cat && <span className="pill cat-tint" style={{ marginLeft: 6 }}>{cat.emoji} {cat.name}</span>}
                    {isNativeTx && tx.blockHeight > 0 && <span className="pill" style={{ marginLeft: 6 }}>Mined</span>}
                    {isNativeTx && tx.blockHeight === 0 && <span className="pill" style={{ marginLeft: 6 }}>Pending</span>}
                  </div>
                  <div className="t-caption text-gray-400">
                    {(tx.toAddress || tx.fromAddress) ? truncateAddress(tx.toAddress || tx.fromAddress || "") : "shielded"}
                    {" • "}
                    {formatRelativeTime(tx.timestamp)}
                  </div>
                </div>
                <div className="t-mono-lg tabular" style={{ color, fontWeight: 600 }}>{tx.amountZat > 0 ? "+" : "−"}{fmtZec(Math.abs(tx.amountZat))}</div>
              </button>
              {isExpanded && (
                <div style={{ padding: "0 20px 16px 64px", maxWidth: "100%" }}>
                  <div
                    className="t-caption text-gray-600"
                    style={{
                      marginBottom: 12,
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    {isNativeTx && isReceived && !tx.fromAddress?.trim() && (
                      <div className="t-caption text-gray-400" style={{ ...wrapMono }}>
                        Incoming shielded transfers do not reveal the sender&apos;s address on-chain.
                      </div>
                    )}
                    <DetailRow label="From" value={tx.fromAddress} copyable />
                    <DetailRow label="To" value={tx.toAddress} copyable />
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
                      <span className="text-gray-500" style={{ flexShrink: 0, minWidth: 72 }}>Amount</span>
                      <span className="t-mono" style={{ ...wrapMono, flex: 1 }}>
                        {tx.amountZat > 0 ? "+" : "−"}
                        {fmtZec(Math.abs(tx.amountZat))}
                      </span>
                    </div>
                    {isNativeTx && (
                      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
                        <span className="text-gray-500" style={{ flexShrink: 0, minWidth: 72 }}>Fee</span>
                        <span className="t-mono" style={wrapMono}>{fmtZec(Math.max(0, tx.feeZat || 0))}</span>
                      </div>
                    )}
                    {isNativeTx && tx.blockHeight > 0 && (
                      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
                        <span className="text-gray-500" style={{ flexShrink: 0, minWidth: 72 }}>Block</span>
                        <span className="t-mono" style={wrapMono}>{tx.blockHeight.toLocaleString()}</span>
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
                      <span className="text-gray-500" style={{ flexShrink: 0, minWidth: 72 }}>Time</span>
                      <span className="t-mono" style={wrapMono}>{new Date(tx.timestamp).toLocaleString()}</span>
                    </div>
                  </div>
                  {tx.memo && (
                    <div className="t-caption text-gray-600" style={{ marginBottom: 12, overflowWrap: "anywhere", wordBreak: "break-word" }}>
                      Memo: {tx.memo}
                    </div>
                  )}
                  {isNativeTx && txid && (
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
                      <span className="text-gray-500" style={{ flexShrink: 0, minWidth: 72 }}>Tx ID</span>
                      <span className="t-mono" style={{ ...wrapMono, flex: 1 }}>{txid}</span>
                      <IconGhostBtn label="Copy transaction id" onClick={() => void copyText(txid)}>
                        <Icon name="copy" size={14} />
                      </IconGhostBtn>
                      <IconGhostBtn label="Open in CipherScan" onClick={() => void openExternalLink(`https://cipherscan.app/tx/${txid}`)}>
                        <Icon name="external-link" size={14} />
                      </IconGhostBtn>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
