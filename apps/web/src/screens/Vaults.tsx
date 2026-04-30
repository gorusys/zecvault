import { useState } from "react";
import { useVaultStore, useWalletStore } from "@/stores";
import { VaultCard } from "@/components/VaultCard";
import { Icon } from "@/components/Icon";
import { NewVaultDrawer } from "./NewVaultDrawer";

export function Vaults() {
  const vaults = useVaultStore((s) => s.vaults);
  const archive = useVaultStore((s) => s.archive);
  const wallets = useWalletStore((s) => s.wallets);
  const activeWalletFingerprint = useWalletStore((s) => s.activeWalletFingerprint);
  const fallbackWalletFingerprint = useWalletStore((s) => s.walletFingerprint);
  const [showNew, setShowNew] = useState(false);
  const activeWalletKey = activeWalletFingerprint || fallbackWalletFingerprint;

  return (
    <div className="fade-in">
      <div className="hstack between" style={{ marginBottom: 24 }}>
        <div>
          <div className="t-caption text-gray-400">Your goals</div>
          <h1 className="t-h1">Vaults</h1>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>
          <Icon name="plus" size={16} /> New vault
        </button>
      </div>

      {vaults.length === 0 && archive.length === 0 ? (
        <div className="card card-pad" style={{ textAlign: "center", padding: 64 }}>
          <div style={{ fontSize: 56 }}>🎯</div>
          <h2 className="t-h2" style={{ marginTop: 16 }}>No active vaults</h2>
          <p className="t-body text-gray-600" style={{ marginTop: 8 }}>Set your first goal — a trip, a ring, an emergency fund — and start saving on-chain.</p>
          <button className="btn btn-primary btn-lg" style={{ marginTop: 24 }} onClick={() => setShowNew(true)}>Create first vault</button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {wallets.length === 0 && (
            <section className="card card-pad">
              <div className="t-body text-gray-600">Wallet snapshots are unavailable. Showing legacy vault data.</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14, marginTop: 12 }}>
                {vaults.map((v, i) => <VaultCard key={v.id} vault={v} animateDelay={i * 60} />)}
              </div>
            </section>
          )}
          {wallets.map((wallet) => {
            const walletVaults = vaults.filter((v) => (v.walletFingerprint || activeWalletKey) === wallet.walletFingerprint);
            const walletArchive = archive.filter((v) => (v.walletFingerprint || activeWalletKey) === wallet.walletFingerprint);
            if (walletVaults.length === 0 && walletArchive.length === 0) return null;
            const isActive = wallet.walletFingerprint === activeWalletKey;
            return (
              <section key={wallet.walletFingerprint} className="card card-pad">
                <div className="hstack between" style={{ marginBottom: 12 }}>
                  <div>
                    <div className="t-body-med">
                      {wallet.walletName?.trim() || wallet.walletFingerprint}
                      {isActive ? " • Active" : ""}
                    </div>
                    <div className="t-caption text-gray-400">{wallet.network} • {wallet.walletFingerprint}</div>
                  </div>
                  <span className="pill">{walletVaults.length} active</span>
                </div>

                {walletVaults.length === 0 ? (
                  <div className="t-body text-gray-600">No active vaults in this wallet.</div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
                    {walletVaults.map((v, i) => <VaultCard key={v.id} vault={v} animateDelay={i * 60} />)}
                  </div>
                )}

                {walletArchive.length > 0 && (
                  <>
                    <h3 className="t-label" style={{ marginTop: 16, marginBottom: 10 }}>Archive ({walletArchive.length})</h3>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14, opacity: 0.75 }}>
                      {walletArchive.map((v) => <VaultCard key={v.id} vault={v} />)}
                    </div>
                  </>
                )}
              </section>
            );
          })}
        </div>
      )}

      {showNew && <NewVaultDrawer onClose={() => setShowNew(false)} />}
    </div>
  );
}
