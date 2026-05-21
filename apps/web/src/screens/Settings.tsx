import { useState } from "react";
import { useSettings, useVaultStore, useWalletStore } from "@/stores";
import type { ConnectionMode } from "@/stores";
import { toast } from "@/stores/toast";
import { useWallet } from "@/hooks/useWallet";
import { exportAllWalletBackupsNative, lockAppNative, saveTextFileWithDialogNative } from "@/lib/wallet-native";
import { Icon } from "@/components/Icon";

export function Settings() {
  const s = useSettings();
  const vaults = useVaultStore((v) => v.vaults);
  const wallet = useWalletStore();
  const walletApi = useWallet();

  return (
    <div className="fade-in" style={{ maxWidth: 800 }}>
      <h1 className="t-h1" style={{ marginBottom: 24 }}>Settings</h1>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <Card title="Security">
          <Row label="Windows Hello" desc="Biometric auth for sensitive actions">
            <Toggle on={s.biometricsEnabled} onChange={(v) => s.set("biometricsEnabled", v)} />
          </Row>
          <Row label="PIN code" desc="6-digit PIN as backup">
            <Toggle on={s.pinEnabled} onChange={(v) => s.set("pinEnabled", v)} />
          </Row>
          <button
            className="btn btn-secondary btn-block"
            style={{ marginTop: 12 }}
            onClick={async () => {
              const ok = await lockAppNative();
              if (!ok) {
                toast({ type: "danger", title: "Lock failed", description: "Could not lock app." });
                return;
              }
              location.reload();
            }}
          >
            Lock app now
          </button>
        </Card>

        <NetworkCard />

        <Card title="Backup">
          <p className="t-body text-gray-600">Your 24-word seed phrase is the only way to recover your wallet. Keep it offline.</p>
          <button
            className="btn btn-secondary btn-block"
            style={{ marginTop: 16 }}
            onClick={async () => {
              try {
                const backups = await exportAllWalletBackupsNative();
                if (backups.length === 0) {
                  toast({ type: "danger", title: "No wallets found", description: "No wallets available to back up." });
                  return;
                }
                const content = [
                  "ZecVault All Wallets Backup",
                  `Exported At: ${new Date().toISOString()}`,
                  `Wallet Count: ${backups.length}`,
                  "",
                  ...backups.flatMap((b, idx) => ([
                    `--- Wallet ${idx + 1} ---`,
                    `Wallet Name: ${b.walletName || b.walletFingerprint}`,
                    `Wallet Fingerprint: ${b.walletFingerprint}`,
                    `Network: ${b.network}`,
                    `Seed Phrase: ${b.mnemonic}`,
                    "",
                  ])),
                  "Keep this file offline and encrypted. Anyone with these seeds can spend your funds.",
                ].join("\n");
                const savedPath = await saveTextFileWithDialogNative(
                  `zecvault-all-wallets-backup-${Date.now()}.txt`,
                  content,
                );
                toast({
                  type: "success",
                  title: "All wallets backup downloaded",
                  description: `Saved to: ${savedPath}`,
                });
              } catch (error) {
                const detail = error instanceof Error ? error.message : "Could not export all wallets backup.";
                if (detail === "Save canceled.") {
                  toast({ type: "warning", title: "Backup save canceled" });
                  return;
                }
                toast({ type: "danger", title: "Backup failed", description: detail });
              }
            }}
          >
            Download all wallets backup
          </button>
        </Card>

        <Card title="Display">
          <Row
            label="Expert address options"
            desc="Show technical address details for advanced users."
          >
            <Toggle on={s.expertAddressMode} onChange={(v) => s.set("expertAddressMode", v)} />
          </Row>
          <Row label="Theme" desc="Choose app appearance"><span /></Row>
          <div className="hstack gap-8" style={{ marginTop: 10, marginBottom: 12, flexWrap: "wrap" }}>
            {(["light", "dark", "forest"] as const).map((theme) => (
              <button
                key={theme}
                className={`btn ${s.theme === theme ? "btn-primary" : "btn-secondary"}`}
                style={{ height: 32, padding: "0 12px" }}
                onClick={() => s.set("theme", theme)}
              >
                {theme[0].toUpperCase() + theme.slice(1)}
              </button>
            ))}
          </div>
          <label className="label">Currency</label>
          <select className="input" value={s.currency} onChange={(e) => s.set("currency", e.target.value as never)}>
            {["USD", "SGD", "EUR", "GBP", "JPY"].map((c) => <option key={c}>{c}</option>)}
          </select>
        </Card>

        <Card title="Round-up">
          <Row label="Enable round-ups" desc="Round each send up to nearest threshold">
            <Toggle on={s.roundupEnabled} onChange={(v) => s.set("roundupEnabled", v)} />
          </Row>
          {s.roundupEnabled && (
            <>
              <label className="label" style={{ marginTop: 12 }}>Active vault</label>
              <select className="input" value={s.roundupVaultId ?? ""} onChange={(e) => s.set("roundupVaultId", e.target.value || null)}>
                {vaults.map((v) => <option key={v.id} value={v.id}>{v.goalName}</option>)}
              </select>
              <label className="label" style={{ marginTop: 12 }}>Threshold</label>
              <select className="input" value={s.roundupThreshold} onChange={(e) => s.set("roundupThreshold", Number(e.target.value) as never)}>
                <option value={0.01}>Nearest 0.01 ZEC</option>
                <option value={0.1}>Nearest 0.1 ZEC</option>
                <option value={1}>Nearest 1 ZEC</option>
              </select>
            </>
          )}
        </Card>

        <ViewingKeyCard />

        <Card title="About">
          <Row label="Version" desc="ZecVault 0.1.0 (Windows MVP)"><span /></Row>
          <Row label="Block height" desc={wallet.syncBlock.toLocaleString()}><span /></Row>
          <p className="t-caption text-gray-400" style={{ marginTop: 16 }}>Built with care for Zcash. Open source. No telemetry.</p>
          <button className="btn btn-secondary btn-block" style={{ marginTop: 12 }} onClick={() => { localStorage.clear(); location.reload(); }}>Reset wallet (demo)</button>
        </Card>
      </div>
    </div>
  );
}

function ViewingKeyCard() {
  const walletApi = useWallet();
  const [viewingKey, setViewingKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);

  async function handleReveal() {
    setLoading(true);
    try {
      const key = await walletApi.getViewingKey();
      setViewingKey(key);
      setVisible(true);
    } catch (e) {
      toast({ type: "danger", title: "Could not export viewing key", description: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (!viewingKey) return;
    navigator.clipboard?.writeText(viewingKey);
    toast({ type: "success", title: "Viewing key copied" });
  }

  return (
    <Card title="Viewing key">
      <p className="t-body text-gray-600" style={{ marginBottom: 12 }}>
        A unified full viewing key (UFVK) lets anyone see all your incoming and outgoing transactions without spending authority.
      </p>
      <div style={{ padding: "10px 12px", marginBottom: 12, borderRadius: "var(--r-md)", background: "var(--warning-bg, #fffbeb)", border: "1px solid var(--warning-200, #fde68a)" }}>
        <span className="t-caption" style={{ color: "var(--warning-700, #b45309)" }}>
          Keep this key private. Anyone with it can see your full transaction history.
        </span>
      </div>
      {!visible ? (
        <button
          className="btn btn-secondary btn-block"
          onClick={() => void handleReveal()}
          disabled={loading}
        >
          {loading ? "Deriving key…" : "Show viewing key"}
        </button>
      ) : (
        <div>
          <div style={{
            padding: "10px 12px",
            borderRadius: "var(--r-md)",
            background: "var(--color-bg-raised)",
            border: "1px solid var(--color-border)",
            fontFamily: "var(--font-mono, monospace)",
            fontSize: "0.75rem",
            wordBreak: "break-all",
            overflowWrap: "anywhere",
            color: "var(--gray-800)",
            marginBottom: 10,
          }}>
            {viewingKey}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={handleCopy}>
              <Icon name="copy" size={14} /> Copy
            </button>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setVisible(false); setViewingKey(null); }}>
              Hide
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

function NetworkCard() {
  const s = useSettings();
  const walletApi = useWallet();
  const [testing, setTesting] = useState(false);

  const activeUrl = s.connectionMode === "full_node" ? s.fullNodeUrl : s.lightwalletdEndpoint;

  async function handleTestAndSave() {
    setTesting(true);
    try {
      const result = await walletApi.testGrpcConnection(activeUrl);
      if (!result.ok) {
        toast({ type: "danger", title: "Connection failed", description: result.error ?? "Could not reach server." });
        return;
      }
      await walletApi.setConnectionConfig(s.connectionMode, s.lightwalletdEndpoint, s.fullNodeUrl);
      toast({
        type: "success",
        title: "Saved",
        description: `Connected — tip block ${result.tipHeight?.toLocaleString() ?? "?"}`,
      });
    } catch (e) {
      toast({ type: "danger", title: "Error", description: e instanceof Error ? e.message : String(e) });
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card title="Network">
      <label className="label" style={{ marginBottom: 6 }}>Connection mode</label>
      <div className="hstack gap-8" style={{ marginBottom: 14 }}>
        {([
          { value: "lightwalletd" as ConnectionMode, label: "Lightwalletd", desc: "Remote server (recommended)" },
          { value: "full_node" as ConnectionMode, label: "Full node", desc: "Local zebrad (max privacy)" },
        ]).map(({ value, label, desc }) => (
          <button
            key={value}
            onClick={() => s.set("connectionMode", value)}
            style={{
              flex: 1, padding: "8px 10px", borderRadius: "var(--r-md)",
              border: `2px solid ${s.connectionMode === value ? "var(--coral-400)" : "var(--color-border)"}`,
              background: s.connectionMode === value ? "var(--coral-50, #fff5f3)" : "var(--color-bg-raised)",
              textAlign: "left", cursor: "pointer",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, color: s.connectionMode === value ? "var(--coral-500)" : "var(--gray-700)" }}>{label}</div>
            <div style={{ fontSize: 11, color: "var(--gray-400)", marginTop: 2 }}>{desc}</div>
          </button>
        ))}
      </div>

      {s.connectionMode === "lightwalletd" ? (
        <>
          <label className="label">Server URL</label>
          <input className="input mono" value={s.lightwalletdEndpoint} onChange={(e) => s.set("lightwalletdEndpoint", e.target.value)} />
        </>
      ) : (
        <>
          <label className="label">Zebrad RPC URL</label>
          <input className="input mono" placeholder="http://localhost:9067" value={s.fullNodeUrl} onChange={(e) => s.set("fullNodeUrl", e.target.value)} />
          <p className="t-caption text-gray-400" style={{ marginTop: 4 }}>
            Run <code>zebrad start</code> locally. Your wallet data never leaves your machine.
          </p>
        </>
      )}

      <Row label="Network" desc={s.network === "mainnet" ? "Mainnet (real ZEC)" : "Testnet (no value)"}>
        <div className="hstack gap-4" style={{ background: "var(--color-bg-raised)", padding: 4, borderRadius: "var(--r-pill)", border: "1px solid var(--color-border)" }}>
          {(["mainnet", "testnet"] as const).map((n) => (
            <button key={n} onClick={() => s.set("network", n)} style={{
              padding: "4px 12px", borderRadius: "var(--r-pill)", fontSize: 11, fontWeight: 600,
              background: s.network === n ? "var(--coral-400)" : "transparent", color: s.network === n ? "#ffffff" : "var(--gray-600)",
            }}>{n}</button>
          ))}
        </div>
      </Row>
      <button className="btn btn-secondary btn-block" style={{ marginTop: 12 }} onClick={handleTestAndSave} disabled={testing}>
        {testing ? "Testing…" : "Test & save"}
      </button>
    </Card>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card card-pad">
      <h3 className="t-h3" style={{ marginBottom: 16 }}>{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="hstack between" style={{ padding: "10px 0", borderBottom: "1px solid var(--gray-100)" }}>
      <div>
        <div className="t-body-med">{label}</div>
        {desc && <div className="t-caption text-gray-400" style={{ marginTop: 2 }}>{desc}</div>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return <button className={`toggle ${on ? "on" : ""}`} onClick={() => onChange(!on)} aria-pressed={on} aria-label="Toggle" />;
}
