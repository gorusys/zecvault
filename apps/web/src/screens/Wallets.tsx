import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  createWalletNative,
  finalizeCreateWalletNative,
  listWalletsNative,
  restoreWalletNative,
  setActiveWalletNative,
} from "@/lib/wallet-native";
import { useSettings, useWalletStore } from "@/stores";
import { Icon } from "@/components/Icon";
import { toast } from "@/stores/toast";

export function Wallets() {
  const navigate = useNavigate();
  const network = useSettings((s) => s.network);
  const wallets = useWalletStore((s) => s.wallets);
  const activeWalletFingerprint = useWalletStore((s) => s.activeWalletFingerprint);
  const fallbackWalletFingerprint = useWalletStore((s) => s.walletFingerprint);
  const setActiveWallet = useWalletStore((s) => s.setActiveWallet);
  const setWallets = useWalletStore((s) => s.setWallets);

  const [showAdd, setShowAdd] = useState(false);
  const [addMode, setAddMode] = useState<"create" | "import">("create");

  const [createWalletName, setCreateWalletName] = useState("");
  const [createMnemonic, setCreateMnemonic] = useState("");
  const [createDraftId, setCreateDraftId] = useState<string | undefined>(undefined);
  const [createSeedConfirmed, setCreateSeedConfirmed] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);

  const [importMnemonic, setImportMnemonic] = useState("");
  const [importWalletName, setImportWalletName] = useState("");
  const [importBusy, setImportBusy] = useState(false);

  const createNameValid = createWalletName.trim().length > 0;
  const importNameValid = importWalletName.trim().length > 0;

  async function refreshWallets() {
    const listed = await listWalletsNative();
    setWallets(listed.wallets, listed.activeWalletFingerprint);
  }

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
    <div className="fade-in" style={{ maxWidth: 900 }}>
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
              Create wallet
            </button>
            <button className={`btn ${addMode === "import" ? "btn-primary" : "btn-ghost"}`} onClick={() => setAddMode("import")}>
              Import wallet
            </button>
          </div>

          {addMode === "create" ? (
            <>
              {!createMnemonic ? (
                <>
                  <label className="label">Wallet name</label>
                  <input
                    className="input"
                    value={createWalletName}
                    onChange={(e) => setCreateWalletName(e.target.value)}
                    placeholder="e.g. Daily Spending"
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
                  <div className="t-caption text-gray-400">Save this 24-word seed before finalizing:</div>
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
                    <span className="t-caption text-gray-600">I confirmed this seed is backed up securely.</span>
                  </label>
                  <div className="hstack gap-8" style={{ marginTop: 10 }}>
                    <button
                      className="btn btn-primary"
                      disabled={!createSeedConfirmed || createBusy}
                      onClick={async () => {
                        try {
                          setCreateBusy(true);
                          const finalized = await finalizeCreateWalletNative(
                            createMnemonic,
                            network,
                            undefined,
                            undefined,
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
                        setCreateSeedConfirmed(false);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </>
          ) : (
            <>
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
              <button
                className="btn btn-secondary"
                style={{ marginTop: 10 }}
                disabled={!importNameValid || !importMnemonic.trim() || importBusy}
                onClick={async () => {
                  try {
                    setImportBusy(true);
                    const restored = await restoreWalletNative(importMnemonic, network, undefined, undefined, importWalletName.trim());
                    if (!restored.ok || !restored.snapshot) {
                      toast({ type: "danger", title: "Import failed", description: restored.error ?? "Could not import wallet." });
                      return;
                    }
                    await refreshWallets();
                    setImportMnemonic("");
                    setImportWalletName("");
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
              return (
                <div key={w.walletFingerprint} className="hstack between" style={{ padding: 10, border: "1px solid var(--gray-100)", borderRadius: "var(--r-md)" }}>
                  <div>
                    <div className="t-body-med">{w.walletName?.trim() || w.walletFingerprint}</div>
                    <div className="t-caption text-gray-400">
                      {w.network} • {w.walletFingerprint}
                    </div>
                    <div className="t-caption text-gray-400">{w.unifiedAddress.slice(0, 12)}…{w.unifiedAddress.slice(-10)}</div>
                  </div>
                  <div className="hstack gap-8">
                    <button
                      className="btn btn-ghost"
                      onClick={() => void navigate({ to: "/wallets/$walletId", params: { walletId: w.walletFingerprint } })}
                    >
                      Details
                    </button>
                    <button className={`btn ${isActive ? "btn-secondary" : "btn-ghost"}`} disabled={isActive} onClick={() => void handleSetActive(w.walletFingerprint)}>
                      {isActive ? "Active" : "Set active"}
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
