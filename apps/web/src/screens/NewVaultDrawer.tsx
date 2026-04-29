import { useMemo, useState } from "react";
import { Drawer } from "@/components/Drawer";
import { Icon } from "@/components/Icon";
import { CATEGORIES, type GoalCategory, categoryOf } from "@/lib/categories";
import { fmtDate, fmtZec, zecToZat } from "@/lib/zec";
import { useSettings, useVaultStore, useWalletStore } from "@/stores";
import { toast } from "@/stores/toast";

const STEPS = ["Goal", "Amount", "Deadline", "Summary"] as const;

export function NewVaultDrawer({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [category, setCategory] = useState<GoalCategory | null>(null);
  const [customName, setCustomName] = useState("");
  const [amountZec, setAmountZec] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState("");
  const [days, setDays] = useState<number | null>(null);
  const createVault = useVaultStore((s) => s.createVault);
  const userName = useSettings((s) => s.userName);
  const price = useWalletStore((s) => s.zecUsdPrice);

  const cat = category ? categoryOf(category) : null;
  const goalName = category === "custom" ? (customName || "Custom goal") : (cat?.name ?? "");
  const finalAmount = amountZec ?? parseFloat(customAmount || "0");
  const deadlineTs = days ? Date.now() + days * 86400_000 : null;
  const dailyNeeded = finalAmount && days ? finalAmount / days : 0;

  const canNext =
    step === 0 ? category !== null && (category !== "custom" || customName.trim().length > 0) :
    step === 1 ? finalAmount > 0 :
    step === 2 ? days !== null :
    true;

  function handleNext() {
    if (!canNext) return;
    if (step === STEPS.length - 1) {
      const v = createVault({
        category: category!,
        goalName,
        targetZat: Number(zecToZat(finalAmount)),
        deadlineTs: deadlineTs!,
      });
      toast({ type: "success", title: "Vault created", description: `${v.goalName} is now active and sealed.` });
      onClose();
      return;
    }
    setStep((s) => s + 1);
  }

  return (
    <Drawer open onClose={onClose}>
      <div style={{ padding: "32px 32px 16px" }}>
        <div className="step-dots">
          {STEPS.map((_, i) => (
            <span key={i} className={`step-dot ${i === step ? "active" : i < step ? "complete" : ""}`} />
          ))}
        </div>
        <div className="t-caption text-gray-400" style={{ marginTop: 10 }}>Step {step + 1} of {STEPS.length} — {STEPS[step]}</div>
      </div>

      <div className="drawer-body" key={step} style={{ animation: "fade-in-up 250ms var(--ease-enter)" }}>
        {step === 0 && (
          <>
            <h2 className="t-h2">What are you saving for?</h2>
            <p className="t-body text-gray-600" style={{ marginTop: 6 }}>Pick one goal to start stacking.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 24 }}>
              {CATEGORIES.map((c) => {
                const sel = category === c.id;
                return (
                  <button key={c.id} onClick={() => setCategory(c.id)}
                    style={{
                      position: "relative", minHeight: 90, padding: 12, borderRadius: "var(--r-md)",
                      background: sel ? "var(--coral-50)" : "var(--color-bg-raised)",
                      border: sel ? "2px solid var(--coral-400)" : "1px solid var(--gray-100)",
                      transform: sel ? "scale(1.02)" : "scale(1)",
                      transition: "all 150ms var(--ease-spring)",
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
                    }}>
                    <span style={{ fontSize: 26 }}>{c.emoji}</span>
                    <span className="t-caption" style={{ fontWeight: 600 }}>{c.name}</span>
                    {sel && <span style={{
                      position: "absolute", top: 6, right: 6, width: 16, height: 16, borderRadius: 999,
                      background: "var(--coral-400)", color: "#ffffff", display: "grid", placeItems: "center",
                    }}><Icon name="check" size={10} /></span>}
                  </button>
                );
              })}
            </div>
            {category === "custom" && (
              <div style={{ marginTop: 20 }} className="fade-in-up">
                <label className="label">Name your goal</label>
                <input className="input" autoFocus value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="e.g. New synthesizer" />
              </div>
            )}
          </>
        )}

        {step === 1 && (
          <>
            <h2 className="t-h2">How much for your <span className="text-coral">{goalName}</span>?</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 24 }}>
              {[
                { v: 2, label: "Casual" },
                { v: 5, label: "Regular" },
                { v: 10, label: "Serious" },
                { v: 25, label: "Intense" },
              ].map((o) => (
                <button key={o.v} onClick={() => { setAmountZec(o.v); setCustomAmount(""); }}
                  className="hstack between"
                  style={{
                    height: 52, padding: "0 16px", borderRadius: "var(--r-md)",
                    border: amountZec === o.v ? "2px solid var(--coral-400)" : "1px solid var(--gray-100)",
                    background: amountZec === o.v ? "var(--coral-50)" : "var(--color-bg-raised)",
                    transition: "all 150ms var(--ease-standard)",
                  }}>
                  <div className="hstack gap-10">
                    <Icon name="wallet" size={18} />
                    <span className="t-body-med">{o.v} ZEC</span>
                  </div>
                  <span className="pill">{o.label}</span>
                </button>
              ))}
              <div style={{
                padding: "12px 16px", borderRadius: "var(--r-md)",
                border: amountZec === null && customAmount ? "2px solid var(--coral-400)" : "1px solid var(--gray-100)",
                background: amountZec === null && customAmount ? "var(--coral-50)" : "var(--color-bg-raised)",
              }}>
                <div className="hstack gap-10">
                  <span className="t-mono-lg text-coral">ZEC</span>
                  <input
                    type="number"
                    className="input"
                    style={{ flex: 1, height: 36, border: "none", boxShadow: "none", padding: 0 }}
                    value={customAmount}
                    onChange={(e) => { setCustomAmount(e.target.value); setAmountZec(null); }}
                    placeholder="Custom amount"
                  />
                  <span className="t-caption text-gray-400">≈ ${(parseFloat(customAmount || "0") * price).toFixed(2)}</span>
                </div>
              </div>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="t-h2">Set your deadline.</h2>
            <p className="t-body text-gray-600" style={{ marginTop: 6, fontStyle: "italic" }}>Deadlines make goals real.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 24 }}>
              {[30, 60, 90, 180].map((d) => (
                <button key={d} onClick={() => setDays(d)} className="hstack between"
                  style={{
                    height: 52, padding: "0 16px", borderRadius: "var(--r-md)",
                    border: days === d ? "2px solid var(--coral-400)" : "1px solid var(--gray-100)",
                    background: days === d ? "var(--coral-50)" : "var(--color-bg-raised)",
                  }}>
                  <span className="t-body-med">{d === 30 ? "1 month" : d === 60 ? "2 months" : d === 90 ? "3 months" : "6 months"}</span>
                  <span className="t-mono text-gray-600">{fmtDate(Date.now() + d * 86400_000)}</span>
                </button>
              ))}
            </div>
            {finalAmount > 0 && days && (
              <div style={{ marginTop: 20, padding: "12px 14px", background: "var(--info-bg)", borderRadius: "var(--r-md)" }}>
                <span className="t-body" style={{ color: "var(--info-text)" }}>
                  To save <strong>{finalAmount.toFixed(2)} ZEC</strong> by <strong>{fmtDate(deadlineTs!)}</strong>, you need <strong>{(finalAmount / days).toFixed(4)} ZEC/day</strong>
                </span>
              </div>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <h2 className="t-h1">You're almost there.</h2>
            <p className="t-body" style={{ marginTop: 6 }}>
              <span className="text-coral" style={{ fontWeight: 600 }}>{userName}</span>, you've got this.
            </p>

            <div style={{ background: "var(--gray-25)", borderRadius: "var(--r-lg)", padding: 20, marginTop: 24 }}>
              <SumRow label="Goal" value={`${cat?.emoji}  ${goalName}`} />
              <SumRow label="Target" value={`${finalAmount.toFixed(4)} ZEC`} />
              <SumRow label="Deadline" value={fmtDate(deadlineTs!)} />
              <SumRow label="On-chain memo" value="Encrypted commitment" />
              <SumRow label="Daily needed" value={`${dailyNeeded.toFixed(4)} ZEC`} last />
            </div>

            <div style={{ marginTop: 24, textAlign: "center" }}>
              <div className="t-caption text-gray-400">That's</div>
              <div className="t-number-lg text-coral" style={{ marginTop: 4 }}>{dailyNeeded.toFixed(4)}</div>
              <div className="t-caption text-gray-400" style={{ marginTop: 4 }}>ZEC per day</div>
            </div>

            <div style={{ marginTop: 24, padding: "12px 14px", background: "var(--info-bg)", borderRadius: "var(--r-md)" }}>
              <span className="t-caption" style={{ color: "var(--info-text)" }}>
                An encrypted commitment memo will be written to the Zcash blockchain on your first deposit. Only you can read it.
              </span>
            </div>
          </>
        )}
      </div>

      <div className="drawer-footer hstack between">
        <button className="btn btn-secondary" onClick={() => step === 0 ? onClose() : setStep((s) => s - 1)}>
          {step === 0 ? "Cancel" : "Back"}
        </button>
        <button className="btn btn-primary btn-lg" disabled={!canNext} onClick={handleNext} style={{ minWidth: step === 3 ? 200 : 140 }}>
          {step === 3 ? "🔒 Seal vault" : "Continue"}
        </button>
      </div>
    </Drawer>
  );
}

function SumRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div className="hstack between" style={{ padding: "10px 0", borderBottom: last ? "none" : "1px solid var(--gray-100)" }}>
      <span className="t-caption text-gray-400">{label}</span>
      <span className="t-body-med">{value}</span>
    </div>
  );
}
