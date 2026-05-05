import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useSettings, useVaultStore, useWalletStore } from "@/stores";
import { fmtZec, fmtFiat, formatRelativeTime, truncateAddress } from "@/lib/zec";
import { categoryOf } from "@/lib/categories";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { Icon } from "@/components/Icon";
import { VaultCard } from "@/components/VaultCard";
import { NewVaultDrawer } from "./NewVaultDrawer";
import { toast } from "@/stores/toast";

export function Dashboard() {
  const userName = useSettings((s) => s.userName);
  const expertAddressMode = useSettings((s) => s.expertAddressMode);
  const { totalZat, spendableZat, zecUsdPrice, priceChange24h, txHistory, syncStatus, syncProgress, unifiedAddress, saplingAddress, transparentAddress, wallets, activeWalletFingerprint, walletFingerprint } = useWalletStore();
  const vaults = useVaultStore((s) => s.vaults);
  const archive = useVaultStore((s) => s.archive);
  const [showNewVault, setShowNewVault] = useState(false);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  }, []);
  const activeWallet = useMemo(
    () => wallets.find((w) => w.walletFingerprint === (activeWalletFingerprint || walletFingerprint)),
    [wallets, activeWalletFingerprint, walletFingerprint],
  );
  const activeWalletName = activeWallet?.walletName?.trim() || "Active wallet";
  const activeWalletKey = activeWalletFingerprint || walletFingerprint;
  const activeWalletVaults = useMemo(
    () => vaults.filter((v) => (v.walletFingerprint || activeWalletKey) === activeWalletKey),
    [vaults, activeWalletKey],
  );
  const activeWalletAllVaults = useMemo(
    () => [...vaults, ...archive].filter((v) => (v.walletFingerprint || activeWalletKey) === activeWalletKey),
    [vaults, archive, activeWalletKey],
  );
  const activeWalletTx = useMemo(
    () => txHistory.filter((tx) => !tx.walletFingerprint || tx.walletFingerprint === activeWalletKey),
    [txHistory, activeWalletKey],
  );
  const lockedZat = useMemo(
    () => activeWalletVaults.reduce((acc, v) => acc + v.currentBalanceZat, 0),
    [activeWalletVaults],
  );
  const recentTx = activeWalletTx.slice(0, 6);
  const displayUnified = unifiedAddress || activeWallet?.unifiedAddress || "";
  const displaySapling = saplingAddress || activeWallet?.saplingAddress || "";
  const displayTransparent = transparentAddress || activeWallet?.transparentAddress || "";

  function copyAddress(label: string, value: string) {
    if (!value) return;
    navigator.clipboard?.writeText(value);
    toast({ type: "success", title: `${label} address copied` });
  }

  return (
    <div className="fade-in">
      {/* Header */}
      <div className="hstack between" style={{ marginBottom: 24 }}>
        <div>
          <div className="t-caption text-gray-400">{greeting}, {userName}</div>
          <h1 className="t-h1">{activeWalletName}</h1>
          <div className="hstack gap-8" style={{ marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
            {expertAddressMode ? (
              <>
                {displayUnified && (
                  <button type="button" className="pill pill-info" title="Unified (click to copy)" onClick={() => copyAddress("Unified", displayUnified)}>
                    {truncateAddress(displayUnified)}
                  </button>
                )}
                {displaySapling && (
                  <button type="button" className="pill pill-success" title="Sapling (click to copy)" onClick={() => copyAddress("Sapling", displaySapling)}>
                    {truncateAddress(displaySapling)}
                  </button>
                )}
                {displayTransparent && (
                  <button type="button" className="pill pill-warning" title="Transparent (click to copy)" onClick={() => copyAddress("Transparent", displayTransparent)}>
                    {truncateAddress(displayTransparent)}
                  </button>
                )}
              </>
            ) : (
              <>
                {displayUnified && (
                  <button type="button" className="pill pill-success" title="Private receive (click to copy)" onClick={() => copyAddress("Private", displayUnified)}>
                    Private receive {truncateAddress(displayUnified)}
                  </button>
                )}
                {displayTransparent && (
                  <button type="button" className="pill pill-warning" title="Public receive (click to copy)" onClick={() => copyAddress("Public", displayTransparent)}>
                    Public receive {truncateAddress(displayTransparent)}
                  </button>
                )}
                <Link to="/receive" className="t-caption text-coral" style={{ textDecoration: "underline" }}>
                  Change receive mode
                </Link>
              </>
            )}
          </div>
        </div>
        <span className={`pill ${syncStatus === "synced" ? "pill-success" : syncStatus === "syncing" ? "pill-warning" : "pill-danger"}`}>
          <span className={`sync-dot ${syncStatus !== "synced" ? syncStatus : ""}`} style={{ marginRight: 4 }} />
          {syncStatus === "synced" ? "Fully synced" : syncStatus === "syncing" ? "Syncing…" : "Sync error"}
        </span>
      </div>
      {syncStatus === "syncing" && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ height: 6, width: "100%", background: "var(--gray-100)", borderRadius: 999 }}>
            <div
              style={{
                height: "100%",
                width: `${syncProgress}%`,
                borderRadius: 999,
                background: "var(--coral-400)",
                transition: "width 200ms ease",
              }}
            />
          </div>
        </div>
      )}

      {/* Portfolio card */}
      <div className="card card-pad" style={{ marginBottom: 28 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0 }}>
          <Stat label="Total balance" value={Number(totalZat) / 1e8} fiat={fmtFiat(totalZat, zecUsdPrice)} color="var(--gray-800)" />
          <Stat label="Locked in vaults" value={lockedZat / 1e8} fiat={fmtFiat(lockedZat, zecUsdPrice)} color="var(--coral-400)" divider />
          <Stat label="Spendable" value={Number(spendableZat) / 1e8} fiat={fmtFiat(spendableZat, zecUsdPrice)} color="var(--success-strong)" divider />
          <div style={{ paddingLeft: 24, borderLeft: "1px solid var(--gray-100)" }}>
            <div className="t-label">ZEC price</div>
            <div className="hstack gap-8" style={{ marginTop: 6 }}>
              <span className="t-number text-gray-800">${zecUsdPrice.toFixed(2)}</span>
              <span className={`pill ${priceChange24h >= 0 ? "pill-success" : "pill-danger"}`}>
                <Icon name={priceChange24h >= 0 ? "trend-up" : "trend-down"} size={11} />
                {priceChange24h >= 0 ? "+" : ""}{priceChange24h.toFixed(1)}%
              </span>
            </div>
            <div className="t-caption text-gray-400" style={{ marginTop: 4 }}>24h change</div>
          </div>
        </div>
      </div>

      {/* Vaults section */}
      <div className="hstack between" style={{ marginBottom: 14 }}>
        <div className="hstack gap-10">
          <h2 className="t-h3">Active vaults</h2>
          <span className="pill pill-coral">{activeWalletVaults.length}</span>
        </div>
        <button className="btn btn-ghost" onClick={() => setShowNewVault(true)}>
          <Icon name="plus" size={16} /> New vault
        </button>
      </div>

      {activeWalletVaults.length === 0 ? (
        <div className="card card-pad" style={{ textAlign: "center", padding: 48 }}>
          <div style={{ fontSize: 48 }}>🎯</div>
          <h3 className="t-h3" style={{ marginTop: 12 }}>No active vaults yet</h3>
          <p className="t-body text-gray-600" style={{ marginTop: 6 }}>Create your first vault to start saving with intent.</p>
          <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={() => setShowNewVault(true)}>
            <Icon name="plus" size={16} /> Create vault
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
          {activeWalletVaults.map((v, i) => <VaultCard key={v.id} vault={v} animateDelay={i * 80} />)}
        </div>
      )}

      {/* Recent activity */}
      <div className="card" style={{ marginTop: 28 }}>
        <div className="hstack between" style={{ padding: "16px 20px", borderBottom: "1px solid var(--gray-100)" }}>
          <h3 className="t-h3">Recent activity</h3>
          <Link to="/history" className="btn btn-ghost" style={{ height: 32, padding: "0 10px" }}>View all</Link>
        </div>
        {recentTx.length === 0 ? (
          <div className="t-body text-gray-600" style={{ padding: 24, textAlign: "center" }}>No transactions yet.</div>
        ) : recentTx.map((tx) => {
          const isReceived = tx.type === "received";
          const isVault = tx.type.startsWith("vault");
          const vault = isVault ? activeWalletAllVaults.find((v) => v.id === tx.vaultId) : null;
          const cat = vault ? categoryOf(vault.category) : null;
          const amountColor = isReceived ? "var(--success-strong)" : isVault ? "#4FA3E3" : "var(--coral-400)";
          return (
            <div key={tx.id} className="hstack gap-12" style={{ padding: "10px 20px", height: 52, borderBottom: "1px solid var(--gray-100)", background: "transparent" }}>
              <div style={{
                width: 32, height: 32, borderRadius: 999,
                background: isReceived ? "var(--success-bg)" : isVault && cat ? `var(--vault-${vault!.category})` : "var(--coral-100)",
                display: "grid", placeItems: "center",
                color: isReceived ? "var(--success-strong)" : isVault ? "#4FA3E3" : "var(--coral-400)",
              }}>
                <Icon name={isVault ? "lock" : isReceived ? "arrow-down-left" : "arrow-up-right"} size={14} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="t-body-med">
                  {isVault ? `Deposit to ${vault?.goalName ?? "vault"}` : isReceived ? "Received ZEC" : "Sent ZEC"}
                </div>
                <div className="t-caption text-gray-400">
                  {tx.toAddress ? truncateAddress(tx.toAddress) : tx.fromAddress ? truncateAddress(tx.fromAddress) : "shielded"} • {formatRelativeTime(tx.timestamp)}
                </div>
              </div>
              <div className="t-mono-lg tabular" style={{ color: amountColor, fontWeight: 600 }}>
                {tx.amountZat > 0 ? "+" : "−"}{fmtZec(Math.abs(tx.amountZat))}
              </div>
            </div>
          );
        })}
      </div>

      {showNewVault && <NewVaultDrawer onClose={() => setShowNewVault(false)} />}
    </div>
  );
}

function Stat({ label, value, fiat, color, divider }: { label: string; value: number; fiat: string; color: string; divider?: boolean }) {
  return (
    <div style={{ paddingLeft: divider ? 24 : 0, paddingRight: 24, borderLeft: divider ? "1px solid var(--gray-100)" : "none" }}>
      <div className="t-label">{label}</div>
      <div className="t-number tabular" style={{ color, marginTop: 6 }}>
        <AnimatedNumber value={value} decimals={4} />
        <span className="t-caption text-gray-400" style={{ marginLeft: 6, fontWeight: 500 }}>ZEC</span>
      </div>
      <div className="t-caption text-gray-400" style={{ marginTop: 4 }}>{fiat}</div>
    </div>
  );
}
