import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { Icon, type IconName } from "./Icon";
import { useSettings, useVaultStore, useWalletStore } from "@/stores";
import { useWallet } from "@/hooks/useWallet";

interface NavDef { to: string; icon: IconName; label: string; section: "Main" | "Account"; badge?: number; }

export function Sidebar() {
  const { location } = useRouterState();
  const vaults = useVaultStore((s) => s.vaults);
  const activeWalletFingerprint = useWalletStore((s) => s.activeWalletFingerprint);
  const fallbackWalletFingerprint = useWalletStore((s) => s.walletFingerprint);
  const expertAddressMode = useSettings((s) => s.expertAddressMode);
  const setSetting = useSettings((s) => s.set);
  const syncStatus = useWalletStore((s) => s.syncStatus);
  const syncBlock = useWalletStore((s) => s.syncBlock);
  const setSyncStatus = useWalletStore((s) => s.setSyncStatus);
  const setSyncMetrics = useWalletStore((s) => s.setSyncMetrics);
  const setBalances = useWalletStore((s) => s.setBalances);
  const setMarketData = useWalletStore((s) => s.setMarketData);
  const walletApi = useWallet();
  const syncInFlight = useRef(false);
  const activeVaultCount = vaults.filter(
    (v) => (v.walletFingerprint || (activeWalletFingerprint || fallbackWalletFingerprint)) === (activeWalletFingerprint || fallbackWalletFingerprint),
  ).length;

  const items: NavDef[] = [
    { to: "/", icon: "home", label: "Dashboard", section: "Main" },
    { to: "/wallets" as const, icon: "wallet", label: "Wallets", section: "Main" },
    { to: "/vaults" as const, icon: "vault", label: "Vaults", section: "Main", badge: activeVaultCount || undefined },
    { to: "/send" as const, icon: "send", label: "Send", section: "Main" },
    { to: "/receive" as const, icon: "receive", label: "Receive", section: "Main" },
    { to: "/history" as const, icon: "history", label: "History", section: "Main" },
    { to: "/settings" as const, icon: "shield", label: "Settings", section: "Account" },
  ];

  const isActive = (to: string) =>
    to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);

  const grouped = {
    Main: items.filter((i) => i.section === "Main"),
    Account: items.filter((i) => i.section === "Account"),
  };

  useEffect(() => {
    let dispose = () => {};
    let stopped = false;

    const refreshBalance = async () => {
      try {
        const bal = await walletApi.getBalance();
        const total = bal.orchardZat + bal.saplingZat + bal.transparentZat;
        setBalances({ totalZat: total, spendableZat: total, pendingZat: bal.pendingZat });
      } catch {
        // Keep previous values on transient network/native errors.
      }
    };

    const refreshMarketPrice = async () => {
      try {
        const res = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=zcash&vs_currencies=usd&include_24hr_change=true",
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const json = (await res.json()) as {
          zcash?: { usd?: number; usd_24h_change?: number };
        };
        const usd = json.zcash?.usd;
        const change24h = json.zcash?.usd_24h_change;
        if (typeof usd !== "number" || Number.isNaN(usd)) return;
        setMarketData({
          zecUsdPrice: usd,
          priceChange24h:
            typeof change24h === "number" && !Number.isNaN(change24h) ? change24h : 0,
        });
      } catch {
        // Keep previous market values on transient fetch failures.
      }
    };

    const startSyncCycle = async () => {
      if (syncInFlight.current) return;
      syncInFlight.current = true;
      try {
        dispose();
        dispose = await walletApi.startSync(
          (progress) => {
            const pct = progress.total > 0 ? Math.round((progress.height / progress.total) * 100) : 0;
            setSyncStatus(pct >= 100 ? "synced" : "syncing");
            setSyncMetrics({ syncProgress: pct, syncBlock: progress.total });
          },
          () => {
            // Avoid sync storms: balance-updated can fire many times per sync pass.
            // We refresh once on sync completion instead.
          },
          (result) => {
            syncInFlight.current = false;
            if (result?.ok === false) {
              setSyncStatus("error");
              return;
            }
            setSyncStatus("synced");
            void refreshBalance();
          },
        );
      } catch {
        syncInFlight.current = false;
        setSyncStatus("error");
      }
    };

    void startSyncCycle();
    void refreshMarketPrice();
    const timer = setInterval(() => {
      if (stopped) return;
      void startSyncCycle();
    }, 30_000);
    const priceTimer = setInterval(() => {
      if (stopped) return;
      void refreshMarketPrice();
    }, 60_000);

    return () => {
      stopped = true;
      syncInFlight.current = false;
      clearInterval(timer);
      clearInterval(priceTimer);
      dispose();
    };
  }, [setBalances, setMarketData, setSyncMetrics, setSyncStatus]);

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon" aria-hidden="true">
          <Icon name="owl" size={30} />
        </div>
        <div className="sidebar-logo-text">
          <span className="sidebar-logo-name">ZecVault</span>
          <span className="sidebar-logo-tag">SAVE OUT LOUD</span>
        </div>
      </div>

      <nav style={{ display: "flex", flexDirection: "column", flex: 1 }}>
        {(["Main", "Account"] as const).map((section) => (
          <div key={section}>
            <div className="sidebar-section-label">{section}</div>
            {grouped[section].map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`nav-item ${isActive(item.to) ? "active" : ""}`}
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
                {item.badge !== undefined && <span className="nav-badge">{item.badge}</span>}
              </Link>
            ))}
          </div>
        ))}

        <div style={{ marginTop: 8, padding: "10px 12px" }}>
          <div className="t-caption text-gray-400" style={{ marginBottom: 6 }}>Address view</div>
          <button
            className="btn btn-ghost"
            onClick={() => setSetting("expertAddressMode", !expertAddressMode)}
            style={{ height: 28, padding: "0 8px", display: "inline-flex", alignItems: "center", gap: 6 }}
            aria-pressed={expertAddressMode}
            aria-label="Toggle expert address options"
          >
            <span
              className={`toggle ${expertAddressMode ? "on" : ""}`}
              style={{ transform: "scale(0.82)", transformOrigin: "center", pointerEvents: "none" }}
            />
            <span className="t-caption text-gray-600">
              {expertAddressMode ? "Expert mode" : "Simple mode"}
            </span>
          </button>
        </div>

        <div className="sidebar-footer">
          <span className={`sync-dot ${syncStatus !== "synced" ? syncStatus : ""}`} />
          <span className="sync-text">Block {syncBlock.toLocaleString()}</span>
        </div>
      </nav>
    </aside>
  );
}
