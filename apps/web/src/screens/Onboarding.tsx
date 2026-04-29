import { useEffect, useState } from "react";
import { tagline } from "@/lib/tokens";
import { isValidWalletMnemonic, normalizeMnemonic } from "@/lib/zec";
import { createWalletNative, finalizeCreateWalletNative, restoreWalletNative, type NativeWalletSnapshot } from "@/lib/wallet-native";
import { useSettings, useWalletStore } from "@/stores";
import { Icon } from "@/components/Icon";
import { toast } from "@/stores/toast";

const STEPS = ["Welcome", "Wallet", "Seed phrase", "Backup"] as const;

const surface = "var(--color-bg-raised)";
const border = "var(--color-border)";

export function Onboarding() {
  const completeOnboarding = useSettings((s) => s.completeOnboarding);
  const network = useSettings((s) => s.network);
  const applyWalletSnapshot = useWalletStore((s) => s.applyWalletSnapshot);
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [walletChoice, setWalletChoice] = useState<"create" | "recover" | null>(null);
  const [walletPassword, setWalletPassword] = useState("");
  const [walletPasswordConfirm, setWalletPasswordConfirm] = useState("");
  const [seed, setSeed] = useState<string[]>([]);
  const [seedLoading, setSeedLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [seedRetryToken, setSeedRetryToken] = useState(0);
  const [createdSnapshot, setCreatedSnapshot] = useState<NativeWalletSnapshot | null>(null);
  const [createdDraftId, setCreatedDraftId] = useState<string | undefined>(undefined);
  const [recoverPhrase, setRecoverPhrase] = useState("");
  const recoverNormalized = normalizeMnemonic(recoverPhrase);
  const recoverWordCount = recoverNormalized ? recoverNormalized.split(" ").length : 0;
  const recoverValid = isValidWalletMnemonic(recoverNormalized);
  const [verifyIdx] = useState(() => {
    const set = new Set<number>();
    while (set.size < 4) set.add(Math.floor(Math.random() * 24));
    return Array.from(set);
  });
  const [verifyVals, setVerifyVals] = useState<Record<number, string>>({});
  const allVerified = verifyIdx.every((i) => verifyVals[i]?.trim().toLowerCase() === seed[i]);
  const passwordValid = walletPassword.length >= 8 && walletPassword === walletPasswordConfirm;
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  const [backupDownloaded, setBackupDownloaded] = useState(false);

  useEffect(() => {
    setBackupConfirmed(false);
    setBackupDownloaded(false);
    if (walletChoice === "create") return;
    setSeed([]);
    setCreatedSnapshot(null);
    setCreatedDraftId(undefined);
    setSeedError(null);
    setVerifyVals({});
  }, [walletChoice]);

  useEffect(() => {
    if (step !== 2 || walletChoice !== "create" || createdSnapshot || seedLoading || seedError) return;
    if (walletPassword.length < 8) return;
    let ignore = false;
    const loadSeed = async () => {
      try {
        setSeedLoading(true);
        setSeedError(null);
        const created = await createWalletNative(network, walletPassword);
        if (ignore) return;
        setSeed(created.mnemonicWords);
        setCreatedSnapshot(created.snapshot);
        setCreatedDraftId(created.draftId);
      } catch (error) {
        if (!ignore) {
          const detail = error instanceof Error ? error.message : "Could not generate wallet seed. Please try again.";
          setSeed([]);
          setCreatedSnapshot(null);
          setCreatedDraftId(undefined);
          setSeedError(detail);
          toast({ type: "danger", title: "Wallet setup failed", description: detail });
        }
      } finally {
        if (!ignore) setSeedLoading(false);
      }
    };
    void loadSeed();
    return () => {
      ignore = true;
    };
  }, [createdSnapshot, network, seedError, seedLoading, step, walletChoice, seedRetryToken, walletPassword]);

  const canContinue =
    step === 0 ? name.trim().length > 0 :
    step === 1 ? walletChoice !== null && passwordValid :
    step === 2 ? walletChoice === "recover" ? recoverValid : seed.length === 24 && allVerified && !seedLoading :
    step === 3 ? backupConfirmed :
    false;

  function downloadBackupFile() {
    const content = [
      "ZecVault Wallet Backup",
      `Created At: ${new Date().toISOString()}`,
      `Network: ${network}`,
      "",
      walletChoice === "create" ? `Seed Phrase: ${seed.join(" ")}` : `Recovered Seed Phrase: ${recoverNormalized}`,
      "",
      "Keep this file offline and encrypted. Anyone with this seed can spend your funds.",
    ].join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `zecvault-backup-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setBackupDownloaded(true);
  }

  async function next() {
    if (!canContinue || submitting) return;
    if (step === STEPS.length - 1) {
      if (walletChoice === "create") {
        if (!createdSnapshot) {
          toast({ type: "danger", title: "Wallet setup incomplete", description: "Seed phrase generation is still in progress." });
          return;
        }
        try {
          setSubmitting(true);
          const finalized = await finalizeCreateWalletNative(seed.join(" "), network, walletPassword, undefined, createdDraftId);
          if (!finalized.ok || !finalized.snapshot) {
            toast({ type: "danger", title: "Wallet creation failed", description: finalized.error ?? "Could not finalize wallet creation." });
            return;
          }
          applyWalletSnapshot(finalized.snapshot);
        } catch (error) {
          const detail = error instanceof Error ? error.message : "Could not finalize wallet creation.";
          toast({ type: "danger", title: "Wallet creation failed", description: detail });
          return;
        } finally {
          setSubmitting(false);
        }
      } else {
        try {
          setSubmitting(true);
          const restored = await restoreWalletNative(recoverNormalized, network, walletPassword);
          if (!restored.ok) {
            toast({ type: "danger", title: "Invalid seed phrase", description: restored.error ?? "Please check your 24 words and try again." });
            return;
          }
          if (!restored.snapshot) {
            toast({ type: "danger", title: "Restore failed", description: "Wallet state was not returned by the wallet backend." });
            return;
          }
          applyWalletSnapshot(restored.snapshot);
        } catch (error) {
          const detail = error instanceof Error ? error.message : "Native restore failed unexpectedly.";
          toast({ type: "danger", title: "Restore failed", description: detail });
          return;
        } finally {
          setSubmitting(false);
        }
      }
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
          Non-custodial Zcash wallet: your keys stay on this device and you control all recovery data.
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
            {step === 1 && (
              <StepWallet
                walletChoice={walletChoice}
                setWalletChoice={setWalletChoice}
                password={walletPassword}
                setPassword={setWalletPassword}
                confirmPassword={walletPasswordConfirm}
                setConfirmPassword={setWalletPasswordConfirm}
                passwordValid={passwordValid}
              />
            )}
            {step === 2 && (walletChoice === "create"
              ? <StepSeed
                  seed={seed}
                  verifyIdx={verifyIdx}
                  verifyVals={verifyVals}
                  setVerifyVals={setVerifyVals}
                  allVerified={allVerified}
                  isLoading={seedLoading}
                  error={seedError}
                  onRetry={() => {
                    setSeedError(null);
                    setSeedRetryToken((n) => n + 1);
                  }}
                />
              : <StepRecover value={recoverPhrase} setValue={setRecoverPhrase} wordCount={recoverWordCount} isValid={recoverValid} />)}
            {step === 3 && (
              <StepBackup
                walletChoice={walletChoice}
                backupConfirmed={backupConfirmed}
                setBackupConfirmed={setBackupConfirmed}
                backupDownloaded={backupDownloaded}
                onDownload={downloadBackupFile}
              />
            )}
          </div>
        </div>

        <div className="onboarding-footer">
          <button type="button" className="btn btn-secondary" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))} style={{ visibility: step === 0 ? "hidden" : "visible" }}>
            Back
          </button>
          <div className="t-caption text-gray-400">Step {step + 1} of {STEPS.length}</div>
          <button type="button" className="btn btn-primary btn-lg" disabled={!canContinue || submitting} onClick={next}>
            {submitting ? "Please wait..." : step === STEPS.length - 1 ? "Enter ZecVault" : "Continue"}
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

function StepWallet({
  walletChoice,
  setWalletChoice,
  password,
  setPassword,
  confirmPassword,
  setConfirmPassword,
  passwordValid,
}: {
  walletChoice: "create" | "recover" | null;
  setWalletChoice: (s: "create" | "recover") => void;
  password: string;
  setPassword: (v: string) => void;
  confirmPassword: string;
  setConfirmPassword: (v: string) => void;
  passwordValid: boolean;
}) {
  return (
    <>
      <h2 className="t-h1">Wallet setup</h2>
      <p className="t-body text-gray-600" style={{ marginTop: 8 }}>Create a new wallet or restore from your existing 24-word seed phrase.</p>
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
      {walletChoice && (
        <div style={{ marginTop: 20 }}>
          <label className="label">Wallet password (desktop encryption)</label>
          <input
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
          <label className="label" style={{ marginTop: 10 }}>Confirm password</label>
          <input
            type="password"
            className="input"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Retype password"
          />
          {!passwordValid && (password.length > 0 || confirmPassword.length > 0) && (
            <div className="t-caption" style={{ marginTop: 8, color: "var(--danger-text)" }}>
              Password must be at least 8 characters and both entries must match.
            </div>
          )}
        </div>
      )}
    </>
  );
}

function StepSeed(p: {
  seed: string[];
  verifyIdx: number[];
  verifyVals: Record<number, string>;
  setVerifyVals: (r: Record<number, string>) => void;
  allVerified: boolean;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  if (p.isLoading) {
    return (
      <>
        <h2 className="t-h1">Preparing your wallet seed...</h2>
        <p className="t-body text-gray-600" style={{ marginTop: 8 }}>
          Generating a secure mnemonic in the native wallet backend.
        </p>
      </>
    );
  }
  if (p.error && p.seed.length === 0) {
    return (
      <>
        <h2 className="t-h1">Wallet seed generation failed</h2>
        <p className="t-body text-gray-600" style={{ marginTop: 8 }}>
          {p.error}
        </p>
        <button type="button" className="btn btn-primary" style={{ marginTop: 16 }} onClick={p.onRetry}>
          Retry seed generation
        </button>
      </>
    );
  }
  return (
    <>
      <h2 className="t-h1">Your 24-word seed</h2>
      <p className="t-body text-gray-600" style={{ marginTop: 8 }}>
        Write these down now. The next step lets you complete backup and confirm you stored recovery data safely.
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

function StepBackup({
  walletChoice,
  backupConfirmed,
  setBackupConfirmed,
  backupDownloaded,
  onDownload,
}: {
  walletChoice: "create" | "recover" | null;
  backupConfirmed: boolean;
  setBackupConfirmed: (v: boolean) => void;
  backupDownloaded: boolean;
  onDownload: () => void;
}) {
  return (
    <>
      <h2 className="t-h1">Backup your wallet</h2>
      <p className="t-body text-gray-600" style={{ marginTop: 8 }}>
        Keep your recovery data offline. Anyone with this seed can access your funds.
      </p>
      {walletChoice === "create" && (
        <div style={{ marginTop: 20 }}>
          <button type="button" className="btn btn-secondary" onClick={onDownload}>
            Download backup file
          </button>
          <div className="t-caption text-gray-400" style={{ marginTop: 8 }}>
            {backupDownloaded ? "Backup file downloaded. Store it securely and offline." : "Optional: download a local backup file."}
          </div>
        </div>
      )}
      <label className="hstack gap-10" style={{ marginTop: 20, alignItems: "flex-start" }}>
        <input
          type="checkbox"
          checked={backupConfirmed}
          onChange={(e) => setBackupConfirmed(e.target.checked)}
          style={{ marginTop: 2 }}
        />
        <span className="t-body">
          I confirm I have backed up my recovery seed phrase and understand it is required to restore this wallet.
        </span>
      </label>
    </>
  );
}

function StepRecover({ value, setValue, wordCount, isValid }: { value: string; setValue: (v: string) => void; wordCount: number; isValid: boolean }) {
  return (
    <>
      <h2 className="t-h1">Restore your wallet</h2>
      <p className="t-body text-gray-600" style={{ marginTop: 8 }}>Type or paste your 24 words, separated by spaces.</p>
      <textarea className="input mono" style={{ minHeight: 160, marginTop: 20 }} value={value} onChange={(e) => setValue(e.target.value)} placeholder="abandon ability able about above..." />
      <div className="t-caption text-gray-400" style={{ marginTop: 8 }}>
        {wordCount}/24 words
      </div>
      {wordCount > 0 && !isValid && (
        <div className="t-caption" style={{ marginTop: 8, color: "var(--danger-text)" }}>
          Enter a valid 24-word BIP39 seed phrase.
        </div>
      )}
    </>
  );
}
