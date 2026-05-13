import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  exportWalletBackupNative,
  getWalletBalanceNative,
  listWalletsNative,
  migrateSaplingToOrchardNative,
  removeWalletNative,
  renameWalletNative,
  saveTextFileWithDialogNative,
  updateWalletBirthdayNative,
} from "@/lib/wallet-native";
import { useWalletStore } from "@/stores";
import { fmtZec } from "@/lib/zec";
import { toast } from "@/stores/toast";

export function WalletDetail({ walletId }: { walletId: string }) {
  const navigate = useNavigate();
  const wallets = useWalletStore((s) => s.wallets);
  const setWallets = useWalletStore((s) => s.setWallets);
  const activeWalletFingerprint = useWalletStore((s) => s.activeWalletFingerprint);
  const wallet = wallets.find((w) => w.walletFingerprint === walletId);

  const [walletName, setWalletName] = useState(wallet?.walletName ?? "");
  const [renameBusy, setRenameBusy] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [revealedMnemonic, setRevealedMnemonic] = useState<string | null>(null);
  const [revealBusy, setRevealBusy] = useState(false);
  const [birthdayInput, setBirthdayInput] = useState(String(wallet?.birthdayHeight ?? ""));
  const [birthdayBusy, setBirthdayBusy] = useState(false);
  const [saplingZat, setSaplingZat] = useState(0);
  const [migrateBusy, setMigrateBusy] = useState(false);

  useEffect(() => {
    setWalletName(wallet?.walletName ?? "");
  }, [wallet?.walletName]);

  useEffect(() => {
    setBirthdayInput(String(wallet?.birthdayHeight ?? ""));
  }, [wallet?.birthdayHeight]);

  useEffect(() => {
    if (!wallet) return;
    void getWalletBalanceNative(wallet.walletFingerprint).then((b) => {
      if (b) setSaplingZat(b.saplingZat);
    });
  }, [wallet?.walletFingerprint]);

  async function refreshWallets() {
    const listed = await listWalletsNative();
    setWallets(listed.wallets, listed.activeWalletFingerprint);
  }

  if (!wallet) {
    return (
      <div className="fade-in">
        <h1 className="t-h1">Wallet not found</h1>
        <p className="t-body text-gray-600" style={{ marginTop: 8 }}>The wallet may have been removed.</p>
        <Link to="/wallets" className="btn btn-primary" style={{ marginTop: 16 }}>Back to Wallets</Link>
      </div>
    );
  }

  const isActive = (activeWalletFingerprint || "") === wallet.walletFingerprint;
  const canRemove = wallets.length > 1 && !isActive;

  return (
    <div className="fade-in" style={{ maxWidth: 860 }}>
      <div className="hstack between" style={{ marginBottom: 20 }}>
        <div>
          <div className="t-caption text-gray-400">Wallet details</div>
          <h1 className="t-h1">{wallet.walletName?.trim() || wallet.walletFingerprint}</h1>
          <div className="t-caption text-gray-400" style={{ marginTop: 4 }}>
            {wallet.network} • {wallet.walletFingerprint} {isActive ? "• Active" : ""}
          </div>
        </div>
        <Link to="/wallets" className="btn btn-ghost">Back</Link>
      </div>

      <div className="card card-pad" style={{ marginBottom: 14 }}>
        <h3 className="t-h3" style={{ marginBottom: 10 }}>Wallet settings</h3>
        <label className="label">Wallet name</label>
        <input
          className="input"
          value={walletName}
          onChange={(e) => setWalletName(e.target.value)}
          placeholder="Wallet name"
        />
        <button
          className="btn btn-secondary"
          style={{ marginTop: 10 }}
          disabled={!walletName.trim() || renameBusy}
          onClick={async () => {
            try {
              setRenameBusy(true);
              const resp = await renameWalletNative(wallet.walletFingerprint, walletName.trim());
              if (!resp.ok) {
                toast({ type: "danger", title: "Rename failed", description: resp.error ?? "Could not rename wallet." });
                return;
              }
              await refreshWallets();
              toast({ type: "success", title: "Wallet name updated" });
            } finally {
              setRenameBusy(false);
            }
          }}
        >
          {renameBusy ? "Saving..." : "Save name"}
        </button>
      </div>

      <div className="card card-pad" style={{ marginBottom: 14 }}>
        <h3 className="t-h3" style={{ marginBottom: 10 }}>Backup</h3>
        <p className="t-body text-gray-600">
          Download this wallet recovery backup. Keep it offline and secure.
        </p>
        <button
          className="btn btn-secondary"
          style={{ marginTop: 10 }}
          disabled={backupBusy}
          onClick={async () => {
            try {
              setBackupBusy(true);
              const backup = await exportWalletBackupNative(wallet.walletFingerprint);
              const safeName = (backup.walletName || backup.walletFingerprint).replace(/[^a-zA-Z0-9_-]+/g, "-");
              const content = [
                "ZecVault Wallet Backup",
                `Exported At: ${new Date().toISOString()}`,
                `Wallet Name: ${backup.walletName || backup.walletFingerprint}`,
                `Wallet Fingerprint: ${backup.walletFingerprint}`,
                `Network: ${backup.network}`,
                "",
                `Seed Phrase: ${backup.mnemonic}`,
                "",
                "Keep this file offline and encrypted. Anyone with this seed can spend your funds.",
              ].join("\n");
              const savedPath = await saveTextFileWithDialogNative(
                `zecvault-wallet-backup-${safeName}-${Date.now()}.txt`,
                content,
              );
              toast({
                type: "success",
                title: "Wallet backup downloaded",
                description: `Saved to: ${savedPath}`,
              });
            } catch (error) {
              const detail = error instanceof Error ? error.message : "Could not export wallet backup.";
              if (detail === "Save canceled.") {
                toast({ type: "warning", title: "Backup save canceled" });
                return;
              }
              toast({ type: "danger", title: "Backup failed", description: detail });
            } finally {
              setBackupBusy(false);
            }
          }}
        >
          {backupBusy ? "Preparing backup..." : "Download wallet backup"}
        </button>
      </div>

      <div className="card card-pad" style={{ marginBottom: 14 }}>
        <h3 className="t-h3" style={{ marginBottom: 4 }}>Birthday height</h3>
        <p className="t-body text-gray-600" style={{ marginBottom: 10 }}>
          The block height from which this wallet starts scanning for shielded history. Lowering it
          finds older transactions; raising it speeds up sync but may hide earlier history until
          you lower it again.
          {wallet.birthdayHeight
            ? <> Current birthday: <strong>{wallet.birthdayHeight.toLocaleString()}</strong>.</>
            : null}
        </p>
        <div style={{ padding: 12, borderRadius: "var(--r-sm)", background: "var(--warning-bg)", marginBottom: 12 }}>
          <p className="t-caption" style={{ color: "var(--warning-text)", margin: 0 }}>
            Changing the birthday deletes the local wallet database and triggers a full rescan from
            the new height. All transaction history will be re-downloaded — this may take several
            minutes for old wallets.
          </p>
        </div>
        <label className="label">New birthday block height</label>
        <input
          className="input"
          type="number"
          min={0}
          value={birthdayInput}
          onChange={(e) => setBirthdayInput(e.target.value)}
          placeholder={`e.g. ${wallet.birthdayHeight?.toLocaleString() ?? "419200"}`}
          disabled={birthdayBusy}
        />
        <button
          className="btn btn-secondary"
          style={{ marginTop: 10 }}
          disabled={birthdayBusy || !birthdayInput.trim() || isNaN(parseInt(birthdayInput, 10))}
          onClick={async () => {
            const newHeight = parseInt(birthdayInput.trim(), 10);
            if (isNaN(newHeight) || newHeight < 0) {
              toast({ type: "warning", title: "Invalid height", description: "Enter a non-negative block number." });
              return;
            }
            const confirmed = window.confirm(
              `Update birthday to block ${newHeight.toLocaleString()}?\n\n` +
              "This will delete the local wallet database. All history will be re-synced on the next sync. Continue?",
            );
            if (!confirmed) return;
            try {
              setBirthdayBusy(true);
              const resp = await updateWalletBirthdayNative(wallet.walletFingerprint, newHeight);
              if (!resp.ok) {
                toast({ type: "danger", title: "Update failed", description: resp.error ?? "Could not update birthday." });
                return;
              }
              await refreshWallets();
              toast({
                type: "success",
                title: "Birthday updated",
                description: "Wallet database reset. Sync from the Dashboard to re-download history.",
              });
            } finally {
              setBirthdayBusy(false);
            }
          }}
        >
          {birthdayBusy ? "Updating…" : "Update birthday & rescan"}
        </button>
      </div>

      <div className="card card-pad" style={{ marginBottom: 14 }}>
        <h3 className="t-h3" style={{ marginBottom: 6 }}>Seed phrase</h3>
        <p className="t-body text-gray-600" style={{ marginBottom: 10 }}>
          The 24-word recovery phrase for this wallet. Anyone with access to this phrase can spend your funds — never share it.
        </p>
        {revealedMnemonic ? (
          <>
            <div
              className="t-mono"
              style={{
                padding: 12,
                borderRadius: "var(--r-sm)",
                background: "var(--gray-25)",
                border: "1px solid var(--gray-100)",
                lineHeight: 1.7,
                wordBreak: "break-word",
                marginBottom: 10,
              }}
            >
              {revealedMnemonic.split(" ").map((word, i) => (
                <span key={i} style={{ marginRight: 8 }}>
                  <span className="text-gray-400" style={{ fontSize: "0.7em", marginRight: 2 }}>{i + 1}.</span>
                  {word}
                </span>
              ))}
            </div>
            <div className="hstack gap-8">
              <button
                className="btn btn-ghost"
                onClick={() => {
                  void navigator.clipboard.writeText(revealedMnemonic);
                  toast({ type: "success", title: "Copied to clipboard" });
                }}
              >
                Copy
              </button>
              <button className="btn btn-ghost" onClick={() => setRevealedMnemonic(null)}>
                Hide
              </button>
            </div>
          </>
        ) : (
          <button
            className="btn btn-secondary"
            disabled={revealBusy}
            onClick={async () => {
              try {
                setRevealBusy(true);
                const backup = await exportWalletBackupNative(wallet.walletFingerprint);
                setRevealedMnemonic(backup.mnemonic);
              } catch (error) {
                const detail = error instanceof Error ? error.message : "Could not reveal seed phrase.";
                toast({ type: "danger", title: "Reveal failed", description: detail });
              } finally {
                setRevealBusy(false);
              }
            }}
          >
            {revealBusy ? "Verifying..." : "Reveal seed phrase"}
          </button>
        )}
      </div>

      {saplingZat > 0 && (
        <div className="card card-pad" style={{ marginBottom: 14, borderColor: "var(--warning-200)" }}>
          <h3 className="t-h3" style={{ marginBottom: 6 }}>Sapling balance detected</h3>
          <p className="t-body text-gray-600" style={{ marginBottom: 10 }}>
            This wallet holds <strong>{fmtZec(saplingZat)} ZEC</strong> in the Sapling pool.
            Moving these funds to Orchard improves privacy and reduces future fees.
          </p>
          <button
            className="btn btn-secondary"
            disabled={migrateBusy}
            onClick={async () => {
              const confirmed = window.confirm(
                "Migrate all Sapling funds to the Orchard pool?\n\n" +
                "This sends your Sapling balance to your own Orchard address. A sync will run first.",
              );
              if (!confirmed) return;
              try {
                setMigrateBusy(true);
                const resp = await migrateSaplingToOrchardNative();
                if (!resp.ok) {
                  toast({ type: "danger", title: "Migration failed", description: resp.error ?? "Could not migrate Sapling funds." });
                  return;
                }
                setSaplingZat(0);
                toast({ type: "success", title: "Migration broadcast", description: "Sapling funds are on their way to Orchard. Sync to confirm." });
              } finally {
                setMigrateBusy(false);
              }
            }}
          >
            {migrateBusy ? "Migrating…" : "Migrate to Orchard"}
          </button>
        </div>
      )}

      <div className="card card-pad">
        <h3 className="t-h3" style={{ marginBottom: 10, color: "var(--danger-text)" }}>Danger zone</h3>
        <p className="t-body text-gray-600">
          Removing this wallet deletes it from this device. Make sure recovery seed backup exists.
        </p>
        <p className="t-caption" style={{ marginTop: 8, color: "var(--danger-text)" }}>
          Warning: You cannot remove the active wallet or the last remaining wallet.
        </p>
        <button
          className="btn btn-danger"
          style={{ marginTop: 10 }}
          disabled={!canRemove || removeBusy}
          onClick={async () => {
            if (!canRemove) return;
            const confirmed = window.confirm(
              "Remove this wallet from this device?\n\nThis action is destructive on this device. Ensure seed backup exists.\n\nYou cannot remove the last remaining wallet.",
            );
            if (!confirmed) return;
            try {
              setRemoveBusy(true);
              const resp = await removeWalletNative(wallet.walletFingerprint);
              if (!resp.ok) {
                toast({ type: "danger", title: "Remove failed", description: resp.error ?? "Could not remove wallet." });
                return;
              }
              await refreshWallets();
              toast({ type: "success", title: "Wallet removed" });
              void navigate({ to: "/wallets" });
            } finally {
              setRemoveBusy(false);
            }
          }}
        >
          {removeBusy ? "Removing..." : "Remove wallet"}
        </button>
        {!canRemove && (
          <div className="t-caption text-gray-400" style={{ marginTop: 8 }}>
            {isActive
              ? "Switch active wallet before removing this one."
              : "At least one wallet must remain on the device."}
          </div>
        )}
      </div>
    </div>
  );
}
