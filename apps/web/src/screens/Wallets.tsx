import { useState, useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  addAccountNative,
  createWalletNative,
  finalizeCreateWalletNative,
  getWalletBalanceNative,
  listWalletsNative,
  restoreWalletNative,
  setActiveWalletNative,
  type NativeWalletBalanceInfo,
} from "@/lib/wallet-native";
import { fmtZec } from "@/lib/zec";
import { useSettings, useVaultStore, useWalletStore } from "@/stores";
import { Icon } from "@/components/Icon";
import { toast } from "@/stores/toast";

export function Wallets() {
  const navigate = useNavigate();
  const network = useSettings((s) => s.network);
  const wallets = useWalletStore((s) => s.wallets);
  const activeWalletFingerprint = useWalletStore((s) => s.activeWalletFingerprint);
  const fallbackWalletFingerprint = useWalletStore((s) => s.walletFingerprint);
  const totalZat = useWalletStore((s) => s.totalZat);
  const spendableZat = useWalletStore((s) => s.spendableZat);
  const setActiveWallet = useWalletStore((s) => s.setActiveWallet);
  const setWallets = useWalletStore((s) => s.setWallets);
  const vaults = useVaultStore((s) => s.vaults);

  const [showAdd, setShowAdd] = useState(false);
  const [addMode, setAddMode] = useState<"create" | "import" | "account">("create");

  const [createWalletName, setCreateWalletName] = useState("");
  const [createMnemonic, setCreateMnemonic] = useState("");
  const [createDraftId, setCreateDraftId] = useState<string | undefined>(undefined);
  const [createSeedConfirmed, setCreateSeedConfirmed] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);

  const [importMnemonic, setImportMnemonic] = useState("");
  const [importWalletName, setImportWalletName] = useState("");
  const [importBirthdayHeight, setImportBirthdayHeight] = useState("");
  const [importBusy, setImportBusy] = useState(false);

  const [createBirthdayHeight, setCreateBirthdayHeight] = useState("");

  const [accountSourceFingerprint, setAccountSourceFingerprint] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountBirthdayHeight, setAccountBirthdayHeight] = useState("");
  const [accountBusy, setAccountBusy] = useState(false);

  const [walletBalances, setWalletBalances] = useState<Record<string, NativeWalletBalanceInfo>>({});
  const balanceFetchRef = useRef(false);

  const createNameValid = createWalletName.trim().length > 0;
  const importNameValid = importWalletName.trim().length > 0;
  const accountSourceValid = accountSourceFingerprint.trim().length > 0;

  async function refreshWallets() {
    const listed = await listWalletsNative();
    setWallets(listed.wallets, listed.activeWalletFingerprint);
  }

  // Fetch balance for every wallet in the list (non-active wallets show 0 without this).
  useEffect(() => {
    if (balanceFetchRef.current || wallets.length === 0) return;
    balanceFetchRef.current = true;
    void (async () => {
      const results: Record<string, NativeWalletBalanceInfo> = {};
      await Promise.allSettled(
        wallets.map(async (w) => {
          const bal = await getWalletBalanceNative(w.walletFingerprint);
          if (bal) results[w.walletFingerprint] = bal;
        }),
      );
      setWalletBalances(results);
      balanceFetchRef.current = false;
    })();
  }, [wallets]);

  async function handleSetActive(walletFingerprint: string) {
    const resp = await setActiveWalletNative(walletFingerprint);
    if (!resp.ok) {
      toast({ type: "danger", title: "Switch failed", description: resp.error ?? "Could not set active wallet." });
      return;
    }
    setActiveWallet(walletFingerprint);
    toast({ type: "success", title: "Active wallet updated" });
  }

  return (
    <div className="fade-in">
      <div className="hstack between" style={{ marginBottom: 20 }}>
        <div>
          <div className="t-caption text-gray-400">Wallet management</div>
          <h1 className="t-h1">Wallets</h1>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd((v) => !v)}>
          <Icon name="plus" size={16} /> {showAdd ? "Close" : "Add wallet"}
        </button>
      </div>

      {showAdd && (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div className="hstack gap-8" style={{ marginBottom: 14 }}>
            <button className={`btn ${addMode === "create" ? "btn-primary" : "btn-ghost"}`} onClick={() => setAddMode("create")}>
              New seed
            </button>
            <button className={`btn ${addMode === "account" ? "btn-primary" : "btn-ghost"}`} onClick={() => setAddMode("account")}>
              Add account
            </button>
            <button className={`btn ${addMode === "import" ? "btn-primary" : "btn-ghost"}`} onClick={() => setAddMode("import")}>
              Import seed
            </button>
          </div>

          {addMode === "create" && (
            <>
              {!createMnemonic ? (
                <>
                  <div className="t-caption text-gray-400" style={{ marginBottom: 10 }}>
                    Generate a brand-new 24-word seed phrase. By default the birthday is set to the current block so syncing starts from today.
                  </div>
                  <label className="label">Wallet name</label>
                  <input
                    className="input"
                    value={createWalletName}
                    onChange={(e) => setCreateWalletName(e.target.value)}
                    placeholder="e.g. Daily Spending"
                  />
                  <label className="label" style={{ marginTop: 8 }}>
                    Birthday block height <span className="text-gray-400">(optional — leave blank for current block)</span>
                  </label>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={createBirthdayHeight}
                    onChange={(e) => setCreateBirthdayHeight(e.target.value)}
                    placeholder="e.g. 2500000"
                  />
                  <button
                    className="btn btn-secondary"
                    style={{ marginTop: 10 }}
                    disabled={!createNameValid || createBusy}
                    onClick={async () => {
                      try {
                        setCreateBusy(true);
                        const created = await createWalletNative(network);
                        setCreateMnemonic(created.mnemonicWords.join(" "));
                        setCreateDraftId(created.draftId);
                        setCreateSeedConfirmed(false);
                      } catch (error) {
                        const detail = error instanceof Error ? error.message : "Could not generate wallet seed.";
                        toast({ type: "danger", title: "Create failed", description: detail });
                      } finally {
                        setCreateBusy(false);
                      }
                    }}
                  >
                    {createBusy ? "Generating..." : "Generate seed"}
                  </button>
                </>
              ) : (
                <>
                  <div className="t-caption text-gray-400">Write down this 24-word seed and store it offline. It cannot be recovered if lost.</div>
                  <div className="t-mono text-gray-600" style={{ marginTop: 8, padding: 10, borderRadius: "var(--r-sm)", background: "var(--gray-25)", border: "1px solid var(--gray-100)" }}>
                    {createMnemonic}
                  </div>
                  <label className="hstack gap-10" style={{ marginTop: 10, alignItems: "flex-start" }}>
                    <input
                      type="checkbox"
                      checked={createSeedConfirmed}
                      onChange={(e) => setCreateSeedConfirmed(e.target.checked)}
                      style={{ marginTop: 2 }}
                    />
                    <span className="t-caption text-gray-600">I have backed up this seed securely.</span>
                  </label>
                  <div className="hstack gap-8" style={{ marginTop: 10 }}>
                    <button
                      className="btn btn-primary"
                      disabled={!createSeedConfirmed || createBusy}
                      onClick={async () => {
                        try {
                          setCreateBusy(true);
                          const parsedCreateBirthday = createBirthdayHeight.trim()
                            ? parseInt(createBirthdayHeight.trim(), 10)
                            : undefined;
                          const finalized = await finalizeCreateWalletNative(
                            createMnemonic,
                            network,
                            undefined,
                            parsedCreateBirthday,
                            createDraftId,
                            createWalletName.trim(),
                          );
                          if (!finalized.ok || !finalized.snapshot) {
                            toast({ type: "danger", title: "Create failed", description: finalized.error ?? "Could not finalize wallet." });
                            return;
                          }
                          await refreshWallets();
                          setCreateMnemonic("");
                          setCreateDraftId(undefined);
                          setCreateWalletName("");
                          setCreateBirthdayHeight("");
                          setCreateSeedConfirmed(false);
                          setShowAdd(false);
                          toast({ type: "success", title: "Wallet added" });
                        } finally {
                          setCreateBusy(false);
                        }
                      }}
                    >
                      {createBusy ? "Adding..." : "Finalize & add wallet"}
                    </button>
                    <button
                      className="btn btn-ghost"
                      onClick={() => {
                        setCreateMnemonic("");
                        setCreateDraftId(undefined);
                        setCreateWalletName("");
                        setCreateBirthdayHeight("");
                        setCreateSeedConfirmed(false);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {addMode === "account" && (
            <>
              <div className="t-caption text-gray-400" style={{ marginBottom: 10 }}>
                Derive an additional account from an existing seed phrase (ZIP-32). All accounts share one backup — no new seed is created.
              </div>
              <label className="label">Source wallet</label>
              <select
                className="input"
                value={accountSourceFingerprint}
                onChange={(e) => setAccountSourceFingerprint(e.target.value)}
              >
                <option value="">— Select a wallet —</option>
                {wallets
                  .filter((w) => (w.accountIndex ?? 0) === 0 || w.seedFingerprint === (wallets.find((x) => x.walletFingerprint === accountSourceFingerprint)?.seedFingerprint))
                  .filter((w, i, arr) => arr.findIndex((x) => (x.seedFingerprint || x.walletFingerprint) === (w.seedFingerprint || w.walletFingerprint)) === i)
                  .map((w) => (
                    <option key={w.walletFingerprint} value={w.walletFingerprint}>
                      {w.walletName || w.walletFingerprint} ({w.network})
                    </option>
                  ))}
              </select>
              <label className="label" style={{ marginTop: 8 }}>Account name (optional)</label>
              <input
                className="input"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="e.g. Savings"
              />
              <label className="label" style={{ marginTop: 8 }}>
                Birthday block height <span className="text-gray-400">(optional — leave blank for current block)</span>
              </label>
              <input
                className="input"
                type="number"
                min={0}
                value={accountBirthdayHeight}
                onChange={(e) => setAccountBirthdayHeight(e.target.value)}
                placeholder="e.g. 2500000"
              />
              <button
                className="btn btn-secondary"
                style={{ marginTop: 10 }}
                disabled={!accountSourceValid || accountBusy}
                onClick={async () => {
                  try {
                    setAccountBusy(true);
                    const parsedAccountBirthday = accountBirthdayHeight.trim()
                      ? parseInt(accountBirthdayHeight.trim(), 10)
                      : undefined;
                    const resp = await addAccountNative(
                      accountSourceFingerprint,
                      accountName.trim() || undefined,
                      parsedAccountBirthday,
                    );
                    if (!resp.ok) {
                      toast({ type: "danger", title: "Add account failed", description: resp.error ?? "Could not derive new account." });
                      return;
                    }
                    await refreshWallets();
                    setAccountSourceFingerprint("");
                    setAccountName("");
                    setAccountBirthdayHeight("");
                    setShowAdd(false);
                    const idx = resp.snapshot?.accountIndex ?? "?";
                    const birthdayDesc = parsedAccountBirthday
                      ? `Birthday set to block ${parsedAccountBirthday.toLocaleString()}.`
                      : "Syncing from current block height.";
                    toast({ type: "success", title: `Account #${idx} added`, description: birthdayDesc });
                  } catch (error) {
                    const detail = error instanceof Error ? error.message : "Could not derive new account.";
                    toast({ type: "danger", title: "Add account failed", description: detail });
                  } finally {
                    setAccountBusy(false);
                  }
                }}
              >
                {accountBusy ? "Deriving..." : "Add account from seed"}
              </button>
            </>
          )}

          {addMode === "import" && (
            <>
              <div className="t-caption text-gray-400" style={{ marginBottom: 10 }}>
                Restore a wallet from an existing 24-word seed phrase. Leave the birthday blank to scan from the Sapling activation height (safest — finds all funds). If you know the block height when the wallet was first created, enter it to speed up the initial sync.
                <span style={{ display: "block", marginTop: 6, color: "var(--warning-text)" }}>
                  Tip: If your transparent funds don't appear after syncing, use the "Shield transparent funds" option in the Send screen — it fetches pre-birthday UTXOs directly from the network.
                </span>
              </div>
              <label className="label">Wallet name</label>
              <input
                className="input"
                value={importWalletName}
                onChange={(e) => setImportWalletName(e.target.value)}
                placeholder="e.g. Savings Wallet"
              />
              <label className="label" style={{ marginTop: 8 }}>24-word seed phrase</label>
              <textarea
                className="input mono"
                style={{ minHeight: 100 }}
                value={importMnemonic}
                onChange={(e) => setImportMnemonic(e.target.value)}
                placeholder="abandon ability able about above..."
              />
              <label className="label" style={{ marginTop: 8 }}>
                Birthday block height <span className="text-gray-400">(optional — leave blank to scan from Sapling activation)</span>
              </label>
              <input
                className="input"
                type="number"
                min={0}
                value={importBirthdayHeight}
                onChange={(e) => setImportBirthdayHeight(e.target.value)}
                placeholder="e.g. 2400000"
              />
              <button
                className="btn btn-secondary"
                style={{ marginTop: 10 }}
                disabled={!importNameValid || !importMnemonic.trim() || importBusy}
                onClick={async () => {
                  try {
                    setImportBusy(true);
                    const parsedHeight = importBirthdayHeight.trim()
                      ? parseInt(importBirthdayHeight.trim(), 10)
                      : undefined;
                    const restored = await restoreWalletNative(
                      importMnemonic,
                      network,
                      undefined,
                      parsedHeight,
                      importWalletName.trim(),
                    );
                    if (!restored.ok || !restored.snapshot) {
                      toast({ type: "danger", title: "Import failed", description: restored.error ?? "Could not import wallet." });
                      return;
                    }
                    await refreshWallets();
                    setImportMnemonic("");
                    setImportWalletName("");
                    setImportBirthdayHeight("");
                    setShowAdd(false);
                    toast({ type: "success", title: "Wallet imported" });
                  } finally {
                    setImportBusy(false);
                  }
                }}
              >
                {importBusy ? "Importing..." : "Import wallet"}
              </button>
            </>
          )}
        </div>
      )}

      <div className="card card-pad">
        <div className="t-label" style={{ marginBottom: 10 }}>Wallet list ({wallets.length})</div>
        {wallets.length === 0 ? (
          <div className="t-body text-gray-600">No wallet snapshots found yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {wallets.map((w) => {
              const isActive = (activeWalletFingerprint || fallbackWalletFingerprint) === w.walletFingerprint;
              const lockedZat = vaults
                .filter((v) => (v.walletFingerprint || w.walletFingerprint) === w.walletFingerprint)
                .reduce((sum, v) => sum + v.currentBalanceZat, 0);
              const walletTotal = isActive ? totalZat : (walletBalances[w.walletFingerprint]?.totalZat ?? null);
              const walletSpendable = isActive
                ? spendableZat
                : walletBalances[w.walletFingerprint]
                  ? Math.max(0, (walletBalances[w.walletFingerprint].spendableZat) - lockedZat)
                  : null;
              return (
                <div key={w.walletFingerprint} className="hstack between" style={{ padding: 10, border: "1px solid var(--gray-100)", borderRadius: "var(--r-md)" }}>
                  <div>
                    <div className="hstack gap-8" style={{ alignItems: "center" }}>
                      <div className="t-body-med">{w.walletName?.trim() || w.walletFingerprint}</div>
                      {isActive && <span className="pill pill-success">Active</span>}
                      {(w.accountIndex ?? 0) > 0 && <span className="pill">Account {w.accountIndex}</span>}
                    </div>
                    <div className="t-caption text-gray-400">
                      {w.network}
                    </div>
                    <div className="hstack gap-8" style={{ marginTop: 4, flexWrap: "wrap" }}>
                      <span className="pill">Total: {walletTotal !== null ? `${fmtZec(walletTotal)} ZEC` : "Loading…"}</span>
                      <span className="pill">Locked: {fmtZec(lockedZat)} ZEC</span>
                      <span className="pill">Spendable: {walletSpendable !== null ? `${fmtZec(walletSpendable)} ZEC` : "Loading…"}</span>
                      {w.birthdayHeight ? <span className="pill" title="Wallet birthday — blocks before this height were not scanned for shielded history">Birthday: {w.birthdayHeight.toLocaleString()}</span> : null}
                    </div>
                  </div>
                  <div className="hstack gap-8">
                    <button
                      className="btn btn-ghost"
                      onClick={() => void navigate({ to: "/wallets/$walletId", params: { walletId: w.walletFingerprint } })}
                    >
                      Details
                    </button>
                    <button className={`btn ${isActive ? "btn-secondary" : "btn-ghost"}`} disabled={isActive} onClick={() => void handleSetActive(w.walletFingerprint)}>
                      {isActive ? "Current" : "Use this wallet"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
