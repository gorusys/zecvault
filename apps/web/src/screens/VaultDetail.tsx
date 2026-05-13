import { useParams, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useVaultStore, useWalletStore } from "@/stores";
import { categoryOf } from "@/lib/categories";
import { fmtZec, fmtDate, daysBetween, truncateAddress, formatRelativeTime, mockTxId, formatVaultMemo } from "@/lib/zec";
import { Icon } from "@/components/Icon";
import { Drawer } from "@/components/Drawer";
import { toast } from "@/stores/toast";
import { GoalComplete } from "./GoalComplete";
import { setActiveWalletNative } from "@/lib/wallet-native";
import { useWallet } from "@/hooks/useWallet";
import type { TransferPreviewResult } from "@/hooks/useWallet";

export function VaultDetailView({ vaultId }: { vaultId: string }) {
  const vault = useVaultStore((s) => s.vaults.find((v) => v.id === vaultId) ?? s.archive.find((v) => v.id === vaultId));
  const txHistory = useWalletStore((s) => s.txHistory);
  const wallets = useWalletStore((s) => s.wallets);
  const spendableZat = useWalletStore((s) => s.spendableZat);
  const activeWalletFingerprint = useWalletStore((s) => s.activeWalletFingerprint);
  const fallbackWalletFingerprint = useWalletStore((s) => s.walletFingerprint);
  const setActiveWallet = useWalletStore((s) => s.setActiveWallet);
  const addTx = useWalletStore((s) => s.addTx);
  const deposit = useVaultStore((s) => s.deposit);
  const setCommitmentTx = useVaultStore((s) => s.setCommitmentTx);
  const requestBreak = useVaultStore((s) => s.requestBreak);
  const completeVault = useVaultStore((s) => s.completeVault);
  const [showBreak, setShowBreak] = useState(false);
  const [showDeposit, setShowDeposit] = useState(false);
  const [showComplete, setShowComplete] = useState(false);
  const walletApi = useWallet();

  if (!vault) {
    return (
      <div className="fade-in" style={{ textAlign: "center", padding: 64 }}>
        <h2 className="t-h2">Vault not found</h2>
        <Link to="/vaults" className="btn btn-primary" style={{ marginTop: 16 }}>Back to vaults</Link>
      </div>
    );
  }

  const cat = categoryOf(vault.category);
  const pct = Math.min(100, (vault.currentBalanceZat / vault.targetZat) * 100);
  const days = daysBetween(Date.now(), vault.deadlineTs);
  const remaining = Math.max(0, vault.targetZat - vault.currentBalanceZat);
  const dailyNeeded = days > 0 ? remaining / 1e8 / days : 0;
  const onPace = pct >= ((Date.now() - vault.createdTs) / (vault.deadlineTs - vault.createdTs)) * 100;
  const vaultTxs = txHistory.filter((tx) => tx.vaultId === vault.id);
  const currentActiveWallet = activeWalletFingerprint || fallbackWalletFingerprint;
  const vaultWalletFingerprint = vault.walletFingerprint || currentActiveWallet;

  const C = 2 * Math.PI * 52;

  if (showComplete) return <GoalComplete vault={vault} onClose={() => { completeVault(vault.id); setShowComplete(false); }} />;

  return (
    <div className="fade-in">
      <Link to="/vaults" className="t-caption text-coral hstack gap-4" style={{ marginBottom: 12 }}>
        <Icon name="chevron-left" size={14} /> All vaults
      </Link>
      <div className="hstack between" style={{ marginBottom: 24 }}>
        <div className="hstack gap-16">
          <div className={`cat-tint cat-${vault.category}`} style={{ width: 56, height: 56, borderRadius: "var(--r-xl)", display: "grid", placeItems: "center", fontSize: 28 }}>{cat.emoji}</div>
          <div>
            <h1 className="t-display" style={{ fontSize: 28 }}>{vault.goalName}</h1>
            <div className="t-mono text-gray-400">{truncateAddress(vault.shieldedAddress || "—")}</div>
          </div>
        </div>
        <div className="hstack gap-8">
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <button className="btn btn-primary" disabled={spendableZat <= 0} onClick={() => setShowDeposit(true)}>
              <Icon name="plus" size={16} /> Deposit
            </button>
            {spendableZat <= 0 && (
              <span className="t-caption text-gray-400">Add ZEC to deposit</span>
            )}
          </div>
          <button className="btn btn-secondary" style={{ width: 40, padding: 0 }}><Icon name="more" size={16} /></button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 20 }}>
        <div className="vstack gap-20">
          <div className="card card-pad">
            <div className="hstack gap-24">
              <div style={{ flex: 1 }}>
                <div className="hstack gap-8" style={{ alignItems: "baseline" }}>
                  <span className="t-number-lg text-coral">{fmtZec(vault.currentBalanceZat)}</span>
                  <span className="t-caption text-gray-400">of {fmtZec(vault.targetZat)} ZEC</span>
                </div>
                <div className="progress thick" style={{ marginTop: 20, position: "relative" }}>
                  <div className="progress-fill" style={{ transform: `scaleX(${pct / 100})` }} />
                  {[25, 50, 75].map((p) => <span key={p} className="progress-pip" style={{ left: `${p}%` }} />)}
                </div>
                <div className="hstack between" style={{ marginTop: 14 }}>
                  <span className="t-caption text-gray-400">{fmtZec(remaining)} ZEC to go</span>
                  <span className="t-caption text-gray-400">{fmtDate(vault.deadlineTs)}</span>
                  <span className={`pill ${onPace ? "pill-success" : "pill-warning"}`}>{onPace ? "On track" : "Behind pace"}</span>
                </div>
              </div>
              <div style={{ position: "relative", width: 120, height: 120 }}>
                <svg width="120" height="120" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="52" stroke="var(--gray-100)" strokeWidth="10" fill="none" />
                  <circle cx="60" cy="60" r="52" stroke="var(--coral-400)" strokeWidth="10" fill="none"
                    strokeDasharray={C} strokeDashoffset={C - (C * pct) / 100} strokeLinecap="round"
                    transform="rotate(-90 60 60)" style={{ transition: "stroke-dashoffset 800ms var(--ease-smooth)" }} />
                </svg>
                <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>
                  <div>
                    <div className="t-number tabular">{Math.round(pct)}%</div>
                    <div className="t-caption text-gray-400">complete</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {[
              { l: "Deadline", v: `${days}d`, sub: fmtDate(vault.deadlineTs) },
              { l: "Needed/day", v: dailyNeeded.toFixed(4), sub: "ZEC" },
              { l: "Total deposits", v: vaultTxs.length.toString(), sub: "all-time" },
              { l: "Streak", v: `🔥 ${vault.streakDays}`, sub: "days" },
            ].map((s) => (
              <div key={s.l} style={{ background: "var(--gray-25)", borderRadius: "var(--r-md)", padding: 14 }}>
                <div className="t-label">{s.l}</div>
                <div className="t-h3" style={{ marginTop: 6 }}>{s.v}</div>
                <div className="t-caption text-gray-400">{s.sub}</div>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="hstack between" style={{ padding: "16px 20px", borderBottom: "1px solid var(--gray-100)" }}>
              <h3 className="t-h3">Contribution history</h3>
              <span className="t-caption text-gray-400">{vaultTxs.length} entries</span>
            </div>
            {vaultTxs.length === 0 ? (
              <div className="t-body text-gray-600" style={{ padding: 24, textAlign: "center" }}>No deposits yet. Tap Deposit to get started.</div>
            ) : vaultTxs.map((tx) => (
              <div key={tx.id} className="hstack gap-12" style={{ padding: "12px 20px", borderBottom: "1px solid var(--gray-100)" }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: tx.id.startsWith("offline:") ? "var(--gray-300)" : "var(--coral-400)" }} />
                <span className="t-mono text-gray-400" style={{ width: 90 }}>{formatRelativeTime(tx.timestamp)}</span>
                <span className="t-body" style={{ flex: 1 }}>
                  {tx.id.startsWith("offline:") ? "Offline deposit" : tx.memo?.startsWith("ZV1") ? "On-chain deposit" : tx.memo || "Deposit"}
                </span>
                <span className="t-caption text-gray-400" style={{ marginRight: 8 }}>
                  {tx.id.startsWith("offline:") ? "local" : "on-chain"}
                </span>
                <span className="t-mono-lg text-success tabular">+{fmtZec(Math.abs(tx.amountZat))}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="vstack gap-14">
          <div className="card card-pad">
            <div className="t-label">Streak</div>
            <div className="t-number-lg text-coral" style={{ marginTop: 6 }}>🔥 {vault.streakDays}</div>
            <div className="t-caption text-gray-400">consecutive days</div>
            <div className="t-caption" style={{ marginTop: 10 }}>Personal best: <strong>{Math.max(vault.streakDays, 1)}</strong> days</div>
          </div>
          <div className="card card-pad">
            <div className="t-label">Pace</div>
            <div className="t-body" style={{ marginTop: 6 }}>At current rate, goal reached by <strong>{fmtDate(Date.now() + (days * (vault.targetZat / Math.max(1, vault.currentBalanceZat))) * 86400_000 / 2)}</strong></div>
            <div className="progress" style={{ marginTop: 12 }}>
              <div className="progress-fill" style={{ transform: `scaleX(${onPace ? 0.85 : 0.55})`, background: onPace ? "var(--success-strong)" : "var(--warning-strong)" }} />
            </div>
          </div>
          <div className="card card-pad">
            <div className="t-label">On-chain record</div>
            {vault.commitmentTxId ? (
              <>
                <div className="t-caption text-gray-400" style={{ marginTop: 6 }}>First deposit recorded at block {vault.commitmentBlock > 0 ? vault.commitmentBlock.toLocaleString() : "pending"}</div>
                <div className="t-mono" style={{ marginTop: 8, padding: 8, background: "var(--gray-25)", borderRadius: "var(--r-md)", fontSize: 10, wordBreak: "break-all" }}>{vault.commitmentTxId.slice(0, 32)}…</div>
              </>
            ) : (
              <div className="t-caption text-gray-400" style={{ marginTop: 6 }}>No on-chain record yet. Your first online deposit creates an encrypted commitment memo visible only to you.</div>
            )}
          </div>
          <button className="t-caption text-danger" style={{ textAlign: "center", padding: 8, textDecoration: "underline" }} onClick={() => setShowBreak(true)}>
            Break vault early…
          </button>
        </div>
      </div>

      {showDeposit && (
        <Drawer open onClose={() => setShowDeposit(false)} width={420}>
          <div className="drawer-body">
            <h2 className="t-h2">Deposit to {vault.goalName}</h2>
            <DepositForm
              wallets={wallets}
              vaultId={vault.id}
              vaultGoalName={vault.goalName}
              vaultAddress={vault.shieldedAddress}
              spendableZat={spendableZat}
              defaultSourceWalletFingerprint={currentActiveWallet || vaultWalletFingerprint}
              vaultWalletFingerprint={vaultWalletFingerprint}
              walletApi={walletApi}
              onSubmit={async ({ amountZat, memo, sourceWalletFingerprint }) => {
                if (!Number.isFinite(amountZat) || amountZat <= 0) {
                  toast({ type: "danger", title: "Invalid amount", description: "Amount must be greater than zero." });
                  return;
                }
                const sourceWallet = wallets.find((w) => w.walletFingerprint === sourceWalletFingerprint);
                if (!sourceWallet) {
                  toast({ type: "danger", title: "Invalid source wallet", description: "Selected source wallet was not found." });
                  return;
                }

                // Online deposit — real on-chain self-send (or cross-wallet send)
                const originalActive = currentActiveWallet;
                let currentWalletFingerprint = originalActive;
                let switchedAwayFromOriginal = false;
                const switchActive = async (fp: string) => {
                  if (!fp || fp === currentWalletFingerprint) return;
                  const resp = await setActiveWalletNative(fp);
                  if (!resp.ok) throw new Error(resp.error ?? "Could not switch wallet.");
                  setActiveWallet(fp);
                  currentWalletFingerprint = fp;
                  if (originalActive && fp !== originalActive) switchedAwayFromOriginal = true;
                };

                try {
                  await switchActive(sourceWalletFingerprint);
                  const memoText = memo.trim();
                  const txid = await walletApi.sendZec(vault.shieldedAddress, amountZat, memoText || undefined);
                  const now = Date.now();
                  addTx({
                    id: txid || mockTxId(`vault|${vaultWalletFingerprint}|${vault.id}|${now}`),
                    type: "vault-deposit",
                    amountZat: Math.abs(amountZat),
                    walletFingerprint: vaultWalletFingerprint,
                    fromAddress: sourceWallet.unifiedAddress,
                    memo: memoText || undefined,
                    vaultId: vault.id,
                    blockHeight: 0,
                    feeZat: 0,
                    timestamp: now,
                  });
                  deposit(vault.id, amountZat);
                  // Record commitment tx on first online deposit
                  if (!vault.commitmentTxId && txid) {
                    setCommitmentTx(vault.id, txid, 0);
                  }
                  toast({ type: "success", title: "Deposit sent", description: `${fmtZec(amountZat)} ZEC on-chain deposit in progress.` });
                  setShowDeposit(false);
                  if ((vault.currentBalanceZat + amountZat) >= vault.targetZat) setShowComplete(true);
                } catch (error) {
                  const detail = error instanceof Error ? error.message : "Could not process deposit.";
                  toast({ type: "danger", title: "Deposit failed", description: detail });
                } finally {
                  if (originalActive && switchedAwayFromOriginal) {
                    try { await switchActive(originalActive); } catch { /* keep current */ }
                  }
                }
              }}
            />
          </div>
        </Drawer>
      )}
      {showBreak && <BreakVaultDrawer vaultId={vault.id} onClose={() => setShowBreak(false)} />}
    </div>
  );
}

export function VaultDetail() {
  const { vaultId } = useParams({ from: "/vaults/$vaultId" });
  return <VaultDetailView vaultId={vaultId} />;
}

function DepositForm({
  wallets,
  vaultId,
  vaultGoalName,
  vaultAddress,
  spendableZat,
  defaultSourceWalletFingerprint,
  vaultWalletFingerprint,
  walletApi,
  onSubmit,
}: {
  wallets: Array<{ walletFingerprint: string; walletName?: string; unifiedAddress: string }>;
  vaultId: string;
  vaultGoalName: string;
  vaultAddress: string;
  spendableZat: number;
  defaultSourceWalletFingerprint: string;
  vaultWalletFingerprint: string;
  walletApi: ReturnType<typeof useWallet>;
  onSubmit: (input: { amountZat: number; memo: string; sourceWalletFingerprint: string }) => Promise<void>;
}) {
  const defaultMemo = formatVaultMemo(vaultId, vaultGoalName);
  const [amt, setAmt] = useState("1");
  const [memo, setMemo] = useState(defaultMemo);
  const [sourceWalletFingerprint, setSourceWalletFingerprint] = useState(defaultSourceWalletFingerprint || vaultWalletFingerprint);
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState<TransferPreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const amtZat = parseFloat(amt || "0") * 1e8;
  const overBalance = amtZat > 0 && amtZat > spendableZat;
  const selectedWallet = wallets.find((w) => w.walletFingerprint === sourceWalletFingerprint);

  // Preview fee whenever address + amount change
  useEffect(() => {
    if (!vaultAddress || !(amtZat > 0)) { setPreview(null); return; }
    let cancelled = false;
    setPreviewLoading(true);
    walletApi.previewSend(vaultAddress, amtZat, memo.trim() || undefined).then((r) => {
      if (!cancelled) { setPreview(r); setPreviewLoading(false); }
    }).catch(() => { if (!cancelled) setPreviewLoading(false); });
    return () => { cancelled = true; };
  }, [vaultAddress, amtZat, memo, walletApi]);

  return (
    <div style={{ marginTop: 24 }}>
      <label className="label">Amount (ZEC)</label>
      <input
        className={`input mono${overBalance ? " error" : ""}`}
        type="number"
        min="0"
        step="0.0001"
        value={amt}
        onChange={(e) => setAmt(e.target.value)}
      />
      {overBalance && (
        <div className="t-caption" style={{ marginTop: 4, color: "var(--danger-text)" }}>
          Exceeds available balance ({fmtZec(spendableZat)} ZEC)
        </div>
      )}

      <label className="label" style={{ marginTop: 12 }}>Deposit from wallet</label>
      <select className="input" value={sourceWalletFingerprint} onChange={(e) => setSourceWalletFingerprint(e.target.value)}>
        {wallets.map((w) => (
          <option key={w.walletFingerprint} value={w.walletFingerprint}>
            {(w.walletName?.trim() || w.walletFingerprint)}{w.walletFingerprint === vaultWalletFingerprint ? " (vault wallet)" : ""}
          </option>
        ))}
      </select>

      <label className="label" style={{ marginTop: 12 }}>Memo (encrypted on-chain)</label>
      <textarea
        className="input"
        value={memo}
        onChange={(e) => setMemo(e.target.value.slice(0, 500))}
        maxLength={500}
        rows={2}
        placeholder="Leave blank for no memo"
        style={{ resize: "vertical" }}
      />
      <div className="t-caption text-gray-400" style={{ marginTop: 4 }}>
        Pre-filled with vault tag. Only you can read this memo — it's end-to-end encrypted.
      </div>

      {/* Fee preview */}
      <div style={{ marginTop: 12, padding: "10px 12px", background: "var(--gray-25)", borderRadius: "var(--r-md)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="t-caption text-gray-600">Network fee</span>
        <span className="t-mono t-caption">
          {previewLoading ? "Estimating…" : preview?.ok ? `${fmtZec(preview.feeZat)} ZEC` : "—"}
        </span>
      </div>
      {preview?.ok && (
        <div style={{ marginTop: 4, padding: "6px 12px", background: "var(--gray-25)", borderRadius: "var(--r-md)", display: "flex", justifyContent: "space-between" }}>
          <span className="t-caption text-gray-600">Total debit</span>
          <span className="t-mono t-caption">{fmtZec(preview.totalDebitZat)} ZEC</span>
        </div>
      )}
      {preview?.needsShielding && (
        <div className="t-caption" style={{ marginTop: 8, color: "var(--warning-text)" }}>
          Transparent funds detected — switch to Send screen to shield them first.
        </div>
      )}
      {selectedWallet && selectedWallet.walletFingerprint !== vaultWalletFingerprint && (
        <div className="t-caption text-gray-400" style={{ marginTop: 8 }}>
          Cross-wallet: ZEC sent from {selectedWallet.walletName?.trim() || "selected wallet"} to the vault wallet address.
        </div>
      )}

      <button
        className="btn btn-primary btn-lg btn-block"
        style={{ marginTop: 20 }}
        disabled={!amt || Number(amt) <= 0 || overBalance || submitting || Boolean(preview?.needsShielding)}
        onClick={async () => {
          try {
            setSubmitting(true);
            await onSubmit({ amountZat: parseFloat(amt) * 1e8, memo, sourceWalletFingerprint });
          } finally {
            setSubmitting(false);
          }
        }}
      >
        {submitting ? "Processing…" : `Deposit ${amt} ZEC`}
      </button>
    </div>
  );
}

function BreakVaultDrawer({ vaultId, onClose }: { vaultId: string; onClose: () => void }) {
  const vault = useVaultStore((s) => s.vaults.find((v) => v.id === vaultId));
  const requestBreak = useVaultStore((s) => s.requestBreak);
  const cancelBreak = useVaultStore((s) => s.cancelBreak);
  const executeBreak = useVaultStore((s) => s.executeBreak);
  const [step, setStep] = useState<0 | 1 | 2>(vault?.breakRequest ? 2 : 0);
  const [confirmText, setConfirmText] = useState("");

  if (!vault) return null;
  const matches = confirmText.trim().toLowerCase() === vault.goalName.toLowerCase();
  const pct = Math.round((vault.currentBalanceZat / vault.targetZat) * 100);
  const unlockTs = vault.breakRequest?.unlockTs ?? Date.now() + 24 * 3600 * 1000;
  const remaining = Math.max(0, unlockTs - Date.now());

  return (
    <Drawer open onClose={onClose} width={480}>
      <div className="drawer-body" style={{ background: "var(--danger-bg)", borderTop: "3px solid var(--danger-strong)" }}>
        {step === 0 && (
          <div style={{ textAlign: "center" }}>
            <div className="badge-enter" style={{ fontSize: 64, margin: "8px 0 16px" }}>🔓</div>
            <h2 className="t-h1 text-danger">Are you sure?</h2>
            <p className="t-body" style={{ marginTop: 8 }}>You're {pct}% of the way to <strong>{vault.goalName}</strong>.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 24 }}>
              {[{ l: "reached", v: pct + "%" }, { l: "saved", v: fmtZec(vault.currentBalanceZat) }, { l: "streak", v: "🔥" + vault.streakDays }].map((s) => (
                <div key={s.l} style={{ background: "var(--color-bg-raised)", border: "1px solid var(--coral-200)", borderRadius: "var(--r-md)", padding: 12, animation: "danger-pulse 2.5s infinite" }}>
                  <div className="t-h3 text-danger">{s.v}</div>
                  <div className="t-caption text-gray-400">{s.l}</div>
                </div>
              ))}
            </div>
            <button className="btn btn-primary btn-lg btn-block" style={{ marginTop: 28 }} onClick={onClose}>Keep saving — I'm committed</button>
            <button className="t-caption text-danger" style={{ marginTop: 12, textDecoration: "underline" }} onClick={() => setStep(1)}>I understand, continue breaking</button>
          </div>
        )}
        {step === 1 && (
          <>
            <h2 className="t-h2 text-danger">Confirm to continue</h2>
            <p className="t-body" style={{ marginTop: 8 }}>Type the exact vault name to confirm:</p>
            <div className="t-mono" style={{ marginTop: 12, padding: 8, background: "var(--color-bg-raised)", borderRadius: "var(--r-sm)" }}>{vault.goalName}</div>
            <input className={`input mono ${confirmText && (matches ? "success" : "error")}`} style={{ marginTop: 16 }} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="Type vault name" />
            <button className="btn btn-danger btn-lg btn-block" style={{ marginTop: 24 }} disabled={!matches} onClick={() => { requestBreak(vault.id); setStep(2); toast({ type: "warning", title: "Unlock countdown started", description: "Your vault unlocks in 24 hours." }); }}>
              Start 24h unlock countdown
            </button>
          </>
        )}
        {step === 2 && (
          <div style={{ textAlign: "center" }}>
            <h2 className="t-h2">Vault sealed for</h2>
            <div className="t-number-lg tabular" style={{ marginTop: 16, fontFamily: "var(--font-mono)" }}>
              {Math.floor(remaining / 3600000).toString().padStart(2, "0")}:
              {Math.floor((remaining / 60000) % 60).toString().padStart(2, "0")}:
              {Math.floor((remaining / 1000) % 60).toString().padStart(2, "0")}
            </div>
            <div className="progress" style={{ marginTop: 20 }}>
              <div className="progress-fill" style={{ transform: `scaleX(${remaining / (24 * 3600 * 1000)})`, background: "var(--danger-strong)" }} />
            </div>
            <p className="t-body text-gray-600" style={{ marginTop: 20 }}>Your vault remains sealed. Come back tomorrow.</p>
            <button className="btn btn-secondary" style={{ marginTop: 20 }} onClick={() => { cancelBreak(vault.id); onClose(); }}>Cancel break</button>
            {remaining <= 0 && (
              <button className="btn btn-danger btn-lg btn-block" style={{ marginTop: 12 }} onClick={() => { executeBreak(vault.id); toast({ type: "danger", title: "Vault broken", description: "Virtual lock released — ZEC remains in your wallet." }); onClose(); }}>
                Release lock
              </button>
            )}
          </div>
        )}
      </div>
    </Drawer>
  );
}
