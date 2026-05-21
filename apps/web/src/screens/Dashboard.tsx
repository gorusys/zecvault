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
import { useWallet } from "@/hooks/useWallet";

export function Dashboard() {
  const userName = useSettings((s) => s.userName);
  const expertAddressMode = useSettings((s) => s.expertAddressMode);
  const hideBalance = useSettings((s) => s.hideBalance);
  const setSetting = useSettings((s) => s.set);
  const walletApi = useWallet();
  const [shielding, setShielding] = useState(false);
  const {
    totalZat,
    spendableZat,
    pendingZat,
    zecUsdPrice,
    priceChange24h,
    txHistory,
    syncStatus,
    syncProgress,
    unifiedAddress,
    saplingAddress,
    transparentAddress,
    wallets,
    activeWalletFingerprint,
    walletFingerprint,
    orchardZat,
    saplingZat,
    transparentZat,
  } = useWalletStore();
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

  async function handleShield() {
    setShielding(true);
    try {
      const txid = await walletApi.shieldFunds();
      toast({ type: "success", title: "Shielding initiated", description: `Tx: ${txid.slice(0, 16)}…` });
    } catch (e) {
      toast({ type: "danger", title: "Shielding failed", description: e instanceof Error ? e.message : String(e) });
    } finally {
      setShielding(false);
    }
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
                {/* <Link
                  to="/receive"
                  className="btn btn-ghost"
                  title="Open Receive for QR codes, all address types, and optional expert combinations"
                  style={{ height: 32, padding: "0 12px", display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}
                >
                  <Icon name="receive" size={14} />
                  Receive
                </Link> */}
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

      {/* Transparent funds shielding banner */}
      {transparentZat > 0 && (
        <div style={{
          marginBottom: 20, padding: "12px 16px",
          borderRadius: "var(--r-md)",
          background: "var(--warning-bg, #fffbeb)",
          border: "1px solid var(--warning-200, #fde68a)",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <span style={{ color: "var(--warning-600, #d97706)", flexShrink: 0 }}>
            <Icon name="shield" size={18} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="t-body-med" style={{ color: "var(--warning-800, #92400e)" }}>
              Transparent funds detected
            </div>
            <div className="t-caption" style={{ color: "var(--warning-700, #b45309)", marginTop: 2 }}>
              {fmtZec(transparentZat)} ZEC is publicly visible on-chain. Shield it to protect your privacy.
            </div>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ flexShrink: 0, height: 32, padding: "0 14px" }}
            onClick={() => void handleShield()}
            disabled={shielding}
          >
            {shielding ? "Shielding…" : "Shield now"}
          </button>
        </div>
      )}

      {/* Portfolio card */}
      <div className="card card-pad" style={{ marginBottom: 28, position: "relative" }}>
        <button
          type="button"
          onClick={() => setSetting("hideBalance", !hideBalance)}
          title={hideBalance ? "Show balances" : "Hide balances"}
          style={{
            position: "absolute", top: 14, right: 14,
            background: "none", border: "none", cursor: "pointer",
            color: "var(--gray-400)", padding: 4, borderRadius: "var(--r-sm)",
          }}
        >
          <Icon name={hideBalance ? "eye-off" : "eye"} size={16} />
        </button>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0 }}>
          <Stat label="Total balance" value={Number(totalZat) / 1e8} fiat={fmtFiat(totalZat, zecUsdPrice)} color="var(--gray-800)" hidden={hideBalance} />
          <Stat label="Locked in vaults" value={lockedZat / 1e8} fiat={fmtFiat(lockedZat, zecUsdPrice)} color="var(--coral-400)" divider hidden={hideBalance} />
          <Stat label="Available to send" value={Number(spendableZat) / 1e8} fiat={fmtFiat(spendableZat, zecUsdPrice)} color="var(--success-strong)" divider hidden={hideBalance} />
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
        {(orchardZat > 0 || saplingZat > 0 || transparentZat > 0) && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--gray-100)", textAlign: "left" }}>
            <div className="t-caption text-gray-400" style={{ marginBottom: 8 }}>Pool breakdown</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {orchardZat > 0 && (
                <div className="hstack gap-8" style={{ justifyContent: "space-between" }}>
                  <span className="t-caption text-gray-600">
                    Orchard <span className="pill pill-success" style={{ fontSize: "0.7rem", padding: "1px 6px" }}>private</span>
                  </span>
                  <span className="t-mono t-caption">{hideBalance ? "••••••" : `${fmtZec(orchardZat)} ZEC`}</span>
                </div>
              )}
              {saplingZat > 0 && (
                <div className="hstack gap-8" style={{ justifyContent: "space-between" }}>
                  <span className="t-caption text-gray-600">
                    Sapling <span className="pill" style={{ fontSize: "0.7rem", padding: "1px 6px", background: "#e0f2f7", color: "#0077a0", border: "none" }}>private</span>
                  </span>
                  <span className="t-mono t-caption">{hideBalance ? "••••••" : `${fmtZec(saplingZat)} ZEC`}</span>
                </div>
              )}
              {transparentZat > 0 && (
                <div className="hstack gap-8" style={{ justifyContent: "space-between" }}>
                  <span className="t-caption text-gray-600">
                    Transparent <span className="pill pill-warning" style={{ fontSize: "0.7rem", padding: "1px 6px" }}>public</span>
                  </span>
                  <span className="t-mono t-caption">{hideBalance ? "••••••" : `${fmtZec(transparentZat)} ZEC`}</span>
                </div>
              )}
            </div>
            {saplingZat > 0 && (
              <div className="t-caption text-gray-400" style={{ marginTop: 10 }}>
                Sapling funds detected. Visit Wallet Detail to migrate them to Orchard for better privacy.
              </div>
            )}
          </div>
        )}
      </div>
      {totalZat === 0 && wallets.length > 1 && (
        <div className="card card-pad" style={{ marginBottom: 20, textAlign: "left", borderColor: "var(--warning-200)" }}>
          <div className="t-body-med" style={{ marginBottom: 6 }}>Active wallet has zero balance</div>
          <p className="t-caption text-gray-600" style={{ marginBottom: 10 }}>
            You have multiple wallets in this app. Your funds may be in another wallet profile.
          </p>
          <Link to="/wallets" className="btn btn-ghost" style={{ height: 32, padding: "0 12px", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Icon name="wallet" size={14} />
            Switch wallet
          </Link>
        </div>
      )}
      {pendingZat > 0 && (
        <p className="t-caption text-gray-500" style={{ marginTop: 10, marginBottom: 0 }}>
          Pending (not spendable yet): <span className="t-mono">{fmtZec(pendingZat)}</span>
        </p>
      )}

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

function Stat({ label, value, fiat, color, divider, hidden }: { label: string; value: number; fiat: string; color: string; divider?: boolean; hidden?: boolean }) {
  return (
    <div style={{ paddingLeft: divider ? 24 : 0, paddingRight: 24, borderLeft: divider ? "1px solid var(--gray-100)" : "none" }}>
      <div className="t-label">{label}</div>
      <div className="t-number tabular" style={{ color, marginTop: 6 }}>
        {hidden ? (
          <span style={{ letterSpacing: 3, color: "var(--gray-400)" }}>••••••</span>
        ) : (
          <>
            <AnimatedNumber value={value} decimals={4} />
            <span className="t-caption text-gray-400" style={{ marginLeft: 6, fontWeight: 500 }}>ZEC</span>
          </>
        )}
      </div>
      <div className="t-caption text-gray-400" style={{ marginTop: 4 }}>{hidden ? "——" : fiat}</div>
    </div>
  );
}
