import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  listWalletsNative,
  removeWalletNative,
  renameWalletNative,
} from "@/lib/wallet-native";
import { useWalletStore } from "@/stores";
import { toast } from "@/stores/toast";

export function WalletDetail({ walletId }: { walletId: string }) {
  const navigate = useNavigate();
  const wallets = useWalletStore((s) => s.wallets);
  const setWallets = useWalletStore((s) => s.setWallets);
  const activeWalletFingerprint = useWalletStore((s) => s.activeWalletFingerprint);
  const wallet = wallets.find((w) => w.walletFingerprint === walletId);

  const [walletName, setWalletName] = useState(wallet?.walletName ?? "");
  const [renameBusy, setRenameBusy] = useState(false);
  const [removeBusy, setRemoveBusy] = useState(false);

  useEffect(() => {
    setWalletName(wallet?.walletName ?? "");
  }, [wallet?.walletName]);

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
