import { useSettings, useVaultStore, useWalletStore } from "@/stores";
import { toast } from "@/stores/toast";
import { useWallet } from "@/hooks/useWallet";

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
          <button className="btn btn-secondary btn-block" style={{ marginTop: 12 }}>View seed phrase</button>
        </Card>

        <Card title="Network">
          <label className="label">Lightwalletd endpoint</label>
          <input className="input mono" value={s.lightwalletdEndpoint} onChange={(e) => s.set("lightwalletdEndpoint", e.target.value)} />
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
          <button
            className="btn btn-secondary btn-block"
            style={{ marginTop: 12 }}
            onClick={async () => {
              try {
                const ok = await walletApi.setLightwalletdServer(s.lightwalletdEndpoint);
                toast({ type: ok ? "success" : "error", title: ok ? "Connected" : "Connection failed", description: ok ? "Server configured for sync." : "Could not configure lightwalletd endpoint." });
              } catch (error) {
                const detail = error instanceof Error ? error.message : "Could not configure endpoint.";
                toast({ type: "error", title: "Connection failed", description: detail });
              }
            }}
          >
            Test connection
          </button>
        </Card>

        <Card title="Backup">
          <p className="t-body text-gray-600">Your 24-word seed phrase is the only way to recover your wallet. Keep it offline.</p>
          <button className="btn btn-secondary btn-block" style={{ marginTop: 16 }}>View seed phrase</button>
        </Card>

        <Card title="Display">
          <label className="label">Currency</label>
          <select className="input" value={s.currency} onChange={(e) => s.set("currency", e.target.value as never)}>
            {["USD", "SGD", "EUR", "GBP", "JPY"].map((c) => <option key={c}>{c}</option>)}
          </select>
          <label className="label" style={{ marginTop: 12 }}>ZEC decimals</label>
          <select className="input" value={s.zecDecimals} onChange={(e) => s.set("zecDecimals", Number(e.target.value) as never)}>
            {[2, 4, 8].map((d) => <option key={d} value={d}>{d}</option>)}
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
