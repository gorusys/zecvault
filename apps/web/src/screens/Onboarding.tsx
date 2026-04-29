import { useMemo, useState } from "react";
import { CATEGORIES, type GoalCategory } from "@/lib/categories";
import { tagline } from "@/lib/tokens";
import { generateMockSeed } from "@/lib/zec";
import { useSettings } from "@/stores";
import { Icon } from "@/components/Icon";
import { toast } from "@/stores/toast";

type SavingsLevel = "0" | "<50" | "50-100" | ">100";
type Stage = "starting" | "consistent" | "rebuilding" | "streak";

const STEPS = ["Welcome", "Habits", "First goal", "Wallet", "Seed phrase"] as const;

const surface = "var(--color-bg-raised)";
const border = "var(--color-border)";

export function Onboarding() {
  const completeOnboarding = useSettings((s) => s.completeOnboarding);
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [savings, setSavings] = useState<SavingsLevel | null>(null);
  const [stage, setStage] = useState<Stage | null>(null);
  const [goal, setGoal] = useState<GoalCategory | null>(null);
  const [walletChoice, setWalletChoice] = useState<"create" | "recover" | null>(null);
  const seed = useMemo(() => generateMockSeed(), []);
  const [verifyIdx] = useState(() => {
    const set = new Set<number>();
    while (set.size < 4) set.add(Math.floor(Math.random() * 24));
    return Array.from(set);
  });
  const [verifyVals, setVerifyVals] = useState<Record<number, string>>({});
  const allVerified = verifyIdx.every((i) => verifyVals[i]?.trim().toLowerCase() === seed[i]);

  const canContinue =
    step === 0 ? name.trim().length > 0 :
    step === 1 ? savings !== null && stage !== null :
    step === 2 ? goal !== null :
    step === 3 ? walletChoice !== null :
    step === 4 ? walletChoice === "recover" || allVerified :
    false;

  function next() {
    if (!canContinue) return;
    if (step === STEPS.length - 1) {
      completeOnboarding(name.trim());
      toast({ type: "success", title: "Welcome to ZecVault", description: "Your non-custodial wallet is ready. " + tagline });
      return;
    }
    setStep((s) => s + 1);
  }

  return (
    <div className="onboarding-shell">
      <aside className="onboarding-aside">
        <div className="hstack gap-10" style={{ marginBottom: 8 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: "var(--coral-100)",
            border: "1px solid var(--coral-200)",
            display: "grid", placeItems: "center", color: "var(--coral-400)",
          }}>
            <Icon name="pig" size={20} />
          </div>
          <div>
            {/* <div className="onboarding-aside-eyebrow">ZECVAULT</div> */}
            <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800, letterSpacing: -0.3 }}>ZECVAULT</div>
          </div>
        </div>

        <h1 className="t-h1" style={{ marginTop: 8 }}>Save with intent.</h1>
        <p className="t-body" style={{ color: "var(--color-text-secondary)", marginTop: 6 }}>{tagline}</p>
        <p className="onboarding-aside-lead">
          Non-custodial Zcash savings: your keys stay on this device. Goals stay on-chain with purpose.
        </p>

        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 14, paddingTop: 24 }}>
          {STEPS.map((label, i) => (
            <div key={label} className="hstack gap-12" style={{ opacity: i > step ? 0.45 : 1, transition: "opacity 250ms var(--ease-standard)" }}>
              <div style={{
                width: 24, height: 24, borderRadius: 999,
                background: i <= step ? "var(--coral-400)" : "transparent",
                border: "1.5px solid var(--coral-200)",
                color: i <= step ? "white" : "var(--coral-400)",
                display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700,
              }}>
                {i < step ? <Icon name="check" size={12} /> : i + 1}
              </div>
              <span className="t-body-med" style={{ color: "var(--color-text-primary)" }}>{label}</span>
            </div>
          ))}
        </div>
      </aside>

      <div className="onboarding-main">
        <div className="onboarding-step-line">
          <div className="onboarding-step-fill" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>

        <div className="onboarding-content">
          <div key={step} className="fade-in-up" style={{ width: "100%", maxWidth: 540 }}>
            {step === 0 && <StepWelcome name={name} setName={setName} />}
            {step === 1 && <StepHabits savings={savings} setSavings={setSavings} stage={stage} setStage={setStage} />}
            {step === 2 && <StepGoal goal={goal} setGoal={setGoal} />}
            {step === 3 && <StepWallet walletChoice={walletChoice} setWalletChoice={setWalletChoice} />}
            {step === 4 && (walletChoice === "create"
              ? <StepSeed seed={seed} verifyIdx={verifyIdx} verifyVals={verifyVals} setVerifyVals={setVerifyVals} allVerified={allVerified} />
              : <StepRecover />)}
          </div>
        </div>

        <div className="onboarding-footer">
          <button type="button" className="btn btn-secondary" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))} style={{ visibility: step === 0 ? "hidden" : "visible" }}>
            Back
          </button>
          <div className="t-caption text-gray-400">Step {step + 1} of {STEPS.length}</div>
          <button type="button" className="btn btn-primary btn-lg" disabled={!canContinue} onClick={next}>
            {step === STEPS.length - 1 ? "Enter ZecVault" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}

function StepWelcome({ name, setName }: { name: string; setName: (s: string) => void }) {
  return (
    <>
      <h2 className="t-h1">What should we call you?</h2>
      <p className="t-body text-gray-600" style={{ marginTop: 8 }}>Your name stays on this device only. No accounts, no cloud.</p>
      <div style={{ marginTop: 28 }}>
        <label className="label">Your name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Casey" autoFocus />
      </div>
    </>
  );
}

function StepHabits(p: { savings: SavingsLevel | null; setSavings: (s: SavingsLevel) => void; stage: Stage | null; setStage: (s: Stage) => void }) {
  const savingsOpts: { v: SavingsLevel; label: string }[] = [
    { v: "0", label: "$0" }, { v: "<50", label: "Under $50" }, { v: "50-100", label: "$50–$100" }, { v: ">100", label: "Over $100" },
  ];
  const stageOpts: { v: Stage; label: string; sub: string }[] = [
    { v: "starting", label: "Just getting started", sub: "Brand new to saving" },
    { v: "consistent", label: "Staying consistent", sub: "I save a little every month" },
    { v: "rebuilding", label: "Rebuilding", sub: "Coming back after a break" },
    { v: "streak", label: "On a streak", sub: "Saving like a pro" },
  ];
  return (
    <>
      <h2 className="t-h1">Your starting point.</h2>
      <p className="t-body text-gray-600" style={{ marginTop: 8 }}>So we can celebrate your wins from day one.</p>

      <div style={{ marginTop: 28 }}>
        <div className="t-label" style={{ marginBottom: 10 }}>How much do you currently save per month?</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
          {savingsOpts.map((o) => (
            <button type="button" key={o.v} onClick={() => p.setSavings(o.v)}
              className="t-body-med"
              style={{
                height: 48, borderRadius: "var(--r-md)",
                border: p.savings === o.v ? "2px solid var(--coral-400)" : "1px solid " + border,
                background: p.savings === o.v ? "var(--coral-100)" : surface,
                color: "var(--color-text-primary)",
                transition: "all 150ms var(--ease-spring)",
              }}>{o.label}</button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 28 }}>
        <div className="t-label" style={{ marginBottom: 10 }}>Where are you on the savings journey?</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {stageOpts.map((o) => (
            <button type="button" key={o.v} onClick={() => p.setStage(o.v)}
              style={{
                padding: "14px 16px", borderRadius: "var(--r-md)", textAlign: "left",
                border: p.stage === o.v ? "2px solid var(--coral-400)" : "1px solid " + border,
                background: p.stage === o.v ? "var(--coral-100)" : surface,
                transition: "all 150ms var(--ease-spring)",
              }}>
              <div className="t-body-med">{o.label}</div>
              <div className="t-caption text-gray-400" style={{ marginTop: 2 }}>{o.sub}</div>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function StepGoal({ goal, setGoal }: { goal: GoalCategory | null; setGoal: (g: GoalCategory) => void }) {
  return (
    <>
      <h2 className="t-h1">What is your first goal?</h2>
      <p className="t-body text-gray-600" style={{ marginTop: 8 }}>This is the warm layer — you can add more vaults later.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 24 }}>
        {CATEGORIES.map((c) => {
          const sel = goal === c.id;
          return (
            <button type="button" key={c.id} onClick={() => setGoal(c.id)}
              style={{
                position: "relative", minHeight: 96, borderRadius: "var(--r-md)",
                background: sel ? "var(--coral-100)" : surface,
                border: sel ? "2px solid var(--coral-400)" : "1px solid " + border,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
                transform: sel ? "scale(1.02)" : "scale(1)",
                transition: "all 150ms var(--ease-spring)",
                boxShadow: sel ? "var(--shadow-gold-glow)" : "none",
              }}>
              <span style={{ fontSize: 28 }} aria-hidden="true">{c.emoji}</span>
              <span className="t-caption" style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>{c.name}</span>
              {sel && <span style={{
                position: "absolute", top: 8, right: 8, width: 18, height: 18, borderRadius: 999,
                background: "var(--coral-400)", color: "#ffffff", display: "grid", placeItems: "center",
              }}><Icon name="check" size={12} /></span>}
            </button>
          );
        })}
      </div>
    </>
  );
}

function StepWallet({ walletChoice, setWalletChoice }: { walletChoice: "create" | "recover" | null; setWalletChoice: (s: "create" | "recover") => void }) {
  return (
    <>
      <h2 className="t-h1">Wallet setup</h2>
      <p className="t-body text-gray-600" style={{ marginTop: 8 }}>Vault layer: create a new wallet or restore. Keys never leave this device (demo uses mock data).</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 28 }}>
        {([
          { v: "create", title: "Create new wallet", sub: "Generate a fresh 24-word seed phrase" },
          { v: "recover", title: "I have a seed phrase", sub: "Restore an existing Zcash wallet" },
        ] as const).map((opt) => (
          <button type="button" key={opt.v} onClick={() => setWalletChoice(opt.v)}
            style={{
              padding: 24, borderRadius: "var(--r-lg)", textAlign: "left",
              border: walletChoice === opt.v ? "2px solid var(--coral-400)" : "1px solid " + border,
              background: walletChoice === opt.v ? "var(--coral-100)" : surface,
              transition: "all 150ms var(--ease-spring)",
            }}>
            <div className="t-h3">{opt.title}</div>
            <div className="t-caption" style={{ marginTop: 6, color: "var(--color-text-secondary)" }}>{opt.sub}</div>
          </button>
        ))}
      </div>
    </>
  );
}

function StepSeed(p: { seed: string[]; verifyIdx: number[]; verifyVals: Record<number, string>; setVerifyVals: (r: Record<number, string>) => void; allVerified: boolean }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <>
      <h2 className="t-h1">Your 24-word seed</h2>
      <p className="t-body text-gray-600" style={{ marginTop: 8 }}>
        Write these down on paper. In production, this is generated in secure hardware-backed storage, not shown in logs.
      </p>

      <div style={{
        position: "relative", marginTop: 20, padding: 18,
        background: "var(--color-bg-raised)", borderRadius: "var(--r-lg)", border: "1px solid " + border,
      }}>
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10,
          filter: revealed ? "none" : "blur(6px)",
          transition: "filter 250ms var(--ease-spring)",
        }}>
          {p.seed.map((w, i) => (
            <div key={i} className="hstack gap-6" style={{ padding: "8px 10px", background: "var(--color-bg-surface)", borderRadius: "var(--r-sm)", border: "1px solid " + border }}>
              <span className="t-mono text-gray-400" style={{ width: 18 }}>{i + 1}.</span>
              <span className="t-mono" style={{ fontWeight: 500, color: "var(--color-text-primary)" }}>{w}</span>
            </div>
          ))}
        </div>
        {!revealed && (
          <button type="button" onClick={() => setRevealed(true)} className="btn btn-primary"
            style={{ position: "absolute", inset: 0, margin: "auto", width: 200, height: 44 }}>
            Reveal words
          </button>
        )}
      </div>

      {revealed && (
        <div style={{ marginTop: 24 }} className="fade-in-up">
          <div className="t-label" style={{ marginBottom: 10 }}>Verify four words to continue</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
            {p.verifyIdx.map((i) => {
              const correct = p.verifyVals[i]?.trim().toLowerCase() === p.seed[i];
              return (
                <div key={i}>
                  <label className="label">Word #{i + 1}</label>
                  <input
                    className={`input mono ${p.verifyVals[i] ? (correct ? "success" : "error") : ""}`}
                    value={p.verifyVals[i] ?? ""}
                    onChange={(e) => p.setVerifyVals({ ...p.verifyVals, [i]: e.target.value })}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

function StepRecover() {
  const [val, setVal] = useState("");
  return (
    <>
      <h2 className="t-h1">Restore your wallet</h2>
      <p className="t-body text-gray-600" style={{ marginTop: 8 }}>Type or paste your 24 words, separated by spaces.</p>
      <textarea className="input mono" style={{ minHeight: 160, marginTop: 20 }} value={val} onChange={(e) => setVal(e.target.value)} placeholder="abandon ability able about above..." />
      <div className="t-caption text-gray-400" style={{ marginTop: 8 }}>
        {val.trim().split(/\s+/).filter(Boolean).length}/24 words
      </div>
    </>
  );
}
