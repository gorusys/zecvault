import { useState } from "react";
import { useVaultStore } from "@/stores";
import { VaultCard } from "@/components/VaultCard";
import { Icon } from "@/components/Icon";
import { NewVaultDrawer } from "./NewVaultDrawer";

export function Vaults() {
  const vaults = useVaultStore((s) => s.vaults);
  const archive = useVaultStore((s) => s.archive);
  const [showNew, setShowNew] = useState(false);

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

      {vaults.length === 0 ? (
        <div className="card card-pad" style={{ textAlign: "center", padding: 64 }}>
          <div style={{ fontSize: 56 }}>🎯</div>
          <h2 className="t-h2" style={{ marginTop: 16 }}>No active vaults</h2>
          <p className="t-body text-gray-600" style={{ marginTop: 8 }}>Set your first goal — a trip, a ring, an emergency fund — and start saving on-chain.</p>
          <button className="btn btn-primary btn-lg" style={{ marginTop: 24 }} onClick={() => setShowNew(true)}>Create first vault</button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
          {vaults.map((v, i) => <VaultCard key={v.id} vault={v} animateDelay={i * 80} />)}
        </div>
      )}

      {archive.length > 0 && (
        <>
          <h2 className="t-h3" style={{ marginTop: 36, marginBottom: 14 }}>Archive ({archive.length})</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14, opacity: 0.7 }}>
            {archive.map((v) => <VaultCard key={v.id} vault={v} />)}
          </div>
        </>
      )}

      {showNew && <NewVaultDrawer onClose={() => setShowNew(false)} />}
    </div>
  );
}
