import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { Icon, type IconName } from "./Icon";
import type { TxRecord } from "@/stores";
import { useSettings, useVaultStore, useWalletStore } from "@/stores";
import { useWallet } from "@/hooks/useWallet";

interface NavDef { to: string; icon: IconName; label: string; section: "Main" | "Account"; badge?: number; }

export function Sidebar() {
  const { location } = useRouterState();
  const vaults = useVaultStore((s) => s.vaults);
  const activeWalletFingerprint = useWalletStore((s) => s.activeWalletFingerprint);
  const fallbackWalletFingerprint = useWalletStore((s) => s.walletFingerprint);
  const expertAddressMode = useSettings((s) => s.expertAddressMode);
  const showVerificationPhrase = useSettings((s) => s.showVerificationPhrase);
  const setSetting = useSettings((s) => s.set);
  const syncStatus = useWalletStore((s) => s.syncStatus);
  const syncBlock = useWalletStore((s) => s.syncBlock);
  const setSyncStatus = useWalletStore((s) => s.setSyncStatus);
  const setSyncMetrics = useWalletStore((s) => s.setSyncMetrics);
  const setBalances = useWalletStore((s) => s.setBalances);
  const setNativeTxHistory = useWalletStore((s) => s.setNativeTxHistory);
  const applyWalletSnapshot = useWalletStore((s) => s.applyWalletSnapshot);
  const setMarketData = useWalletStore((s) => s.setMarketData);
  const walletApi = useWallet();
  const syncInFlight = useRef(false);
  const syncCooldownUntilRef = useRef(0);
  const syncFailureCountRef = useRef(0);
  const retryTimerRef = useRef<number | null>(null);
  const lastAutoSyncAtRef = useRef(0);
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
    let tipInFlight = false;

    const refreshBalanceLight = async () => {
      try {
        const bal = await walletApi.getBalance();
        const poolTotal = bal.orchardZat + bal.saplingZat + bal.transparentZat;
        const chainSpendable = typeof bal.spendableZat === "number"
          ? bal.spendableZat
          : Math.max(0, poolTotal - bal.pendingZat);
        const walletState = useWalletStore.getState();
        const activeWalletKey = walletState.activeWalletFingerprint || walletState.walletFingerprint;
        const lockedInVaults = useVaultStore.getState().vaults
          .filter((v) => (v.walletFingerprint || activeWalletKey) === activeWalletKey)
          .reduce((acc, v) => acc + Math.max(0, v.currentBalanceZat), 0);
        const spendable = Math.max(0, chainSpendable - lockedInVaults);
        // Some native snapshots can temporarily report `total` behind pending updates.
        // Keep UI coherent by deriving total from spendable + pending when higher.
        const totalFromApi = typeof bal.totalZat === "number" ? bal.totalZat : poolTotal;
        const totalFromParts = chainSpendable + bal.pendingZat;
        const total = Math.max(totalFromApi, totalFromParts, poolTotal);
        setBalances({
          totalZat: total,
          spendableZat: spendable,
          pendingZat: bal.pendingZat,
          orchardZat: bal.orchardZat,
          saplingZat: bal.saplingZat,
          transparentZat: bal.transparentZat,
        });
        console.info(
          "[zecvault][balance] orchard=%d sapling=%d transparent=%d pending=%d total=%d spendable=%d",
          bal.orchardZat,
          bal.saplingZat,
          bal.transparentZat,
          bal.pendingZat,
          total,
          spendable,
        );
      } catch (e) {
        console.warn("[zecvault] getBalance failed", e);
      }
    };

    const refreshTransactions = async () => {
      try {
        const state = useWalletStore.getState();
        const walletKey = state.activeWalletFingerprint || state.walletFingerprint;
        if (!walletKey) return;
        const txs = await walletApi.getTransactions(200);
        // Guard: if the active wallet changed while the request was in-flight, discard
        // these results. The new wallet's effect will issue its own fresh fetch.
        const stateAfter = useWalletStore.getState();
        const currentKey = stateAfter.activeWalletFingerprint || stateAfter.walletFingerprint;
        if (currentKey !== walletKey) return;
        console.info("[zecvault][txpoll] fetched=%d wallet=%s", txs.length, walletKey);
        const nativeTxs: TxRecord[] = txs.map((tx) => ({
          id: `native:${tx.txid}`,
          type: tx.isIncoming ? "received" : "sent",
          amountZat: tx.valueZat,
          walletFingerprint: walletKey,
          memo: tx.memo,
          blockHeight: tx.blockHeight,
          feeZat: tx.feeZat ?? 0,
          toAddress: tx.toAddress,
          fromAddress: tx.fromAddress,
          timestamp: tx.timestamp > 1_000_000_000_000 ? tx.timestamp : tx.timestamp * 1000,
          pools: tx.pools,
          isShielding: tx.isShielding,
        }));
        setNativeTxHistory(nativeTxs);
        useVaultStore.getState().reconcileVaultDepositsFromTxHistory(nativeTxs);
      } catch (e) {
        console.warn("[zecvault] getTransactions failed", e);
      }
    };

    const refreshBalanceWithReconcile = async () => {
      try {
        try {
          const snapshot = await walletApi.reconcileDerivedAddresses();
          if (snapshot) {
            applyWalletSnapshot(snapshot);
          }
        } catch (e) {
          console.warn("[zecvault] reconcileDerivedAddresses failed", e);
        }
        await refreshBalanceLight();
        await refreshTransactions();
      } catch (e) {
        console.warn("[zecvault] refreshBalanceWithReconcile failed", e);
      }
    };

    const refreshMarketPrice = async () => {
      if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const mp = await invoke<{ zecUsdPrice: number; priceChange24h: number }>("get_market_price");
        if (typeof mp?.zecUsdPrice === "number" && Number.isFinite(mp.zecUsdPrice) && mp.zecUsdPrice > 0) {
          setMarketData({
            zecUsdPrice: mp.zecUsdPrice,
            priceChange24h: typeof mp.priceChange24h === "number" && Number.isFinite(mp.priceChange24h) ? mp.priceChange24h : 0,
          });
        }
      } catch {
        // Keep previous market values on transient fetch failures.
      }
    };

    const refreshChainTip = async () => {
      if (tipInFlight) return;
      tipInFlight = true;
      try {
        const latestTip = await walletApi.getLatestBlockHeight();
        if (!Number.isFinite(latestTip) || latestTip <= 0) return;
        const current = useWalletStore.getState().syncBlock;
        if (latestTip > current) {
          const currentProgress = useWalletStore.getState().syncProgress;
          setSyncMetrics({ syncProgress: currentProgress, syncBlock: Math.max(current, latestTip) });
          console.info("[zecvault][tip] latest=%d previous=%d", latestTip, current);
          const now = Date.now();
          // Trigger a faster incremental sync when chain advances, but throttle to avoid storms.
          if (!syncInFlight.current && now - lastAutoSyncAtRef.current > 20_000) {
            lastAutoSyncAtRef.current = now;
            void startSyncCycle();
          }
        }
      } catch (e) {
        console.warn("[zecvault] getLatestBlockHeight failed", e);
      } finally {
        tipInFlight = false;
      }
    };

    const startSyncCycle = async () => {
      if (syncInFlight.current) return;
      if (Date.now() < syncCooldownUntilRef.current) return;
      syncInFlight.current = true;
      syncCooldownUntilRef.current = Date.now() + 8_000;
      try {
        dispose();
        setSyncStatus("syncing");
        dispose = await walletApi.startSync(
          (progress) => {
            const pct = progress.total > 0 ? Math.round((progress.height / progress.total) * 100) : 0;
            setSyncStatus(pct >= 100 ? "synced" : "syncing");
            const current = useWalletStore.getState().syncBlock;
            setSyncMetrics({ syncProgress: pct, syncBlock: Math.max(current, progress.total) });
            console.info("[zecvault][sync] progress height=%d total=%d pct=%d", progress.height, progress.total, pct);
          },
          () => {
            // Avoid sync storms: balance-updated can fire many times per sync pass.
            // We refresh once on sync completion instead.
          },
          (result) => {
            syncInFlight.current = false;
            if (result?.skipped) {
              // Another sync run is currently active in backend; wait for the next regular cycle.
              return;
            }
            if (result?.ok === false) {
              syncFailureCountRef.current += 1;
              const retryDelayMs = Math.min(120_000, 5_000 * 2 ** Math.min(syncFailureCountRef.current, 4));
              setSyncStatus("error");
              console.warn("[zecvault][sync] failed; retrying in %dms", retryDelayMs, result.error);
              if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current);
              retryTimerRef.current = window.setTimeout(() => {
                if (!stopped) void startSyncCycle();
              }, retryDelayMs);
              void refreshBalanceWithReconcile();
              return;
            }
            syncFailureCountRef.current = 0;
            setSyncStatus("synced");
            console.info("[zecvault][sync] complete");
            void refreshBalanceWithReconcile();
            void refreshTransactions();
          },
        );
      } catch (e) {
        syncInFlight.current = false;
        syncFailureCountRef.current += 1;
        setSyncStatus("error");
        console.warn("[zecvault] startSync failed", e);
        const retryDelayMs = Math.min(120_000, 5_000 * 2 ** Math.min(syncFailureCountRef.current, 4));
        if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = window.setTimeout(() => {
          if (!stopped) void startSyncCycle();
        }, retryDelayMs);
        void refreshBalanceWithReconcile();
      }
    };

    void refreshBalanceWithReconcile();
    void refreshTransactions();
    void startSyncCycle();
    void refreshChainTip();
    void refreshMarketPrice();
    const balancePoll = setInterval(() => {
      if (stopped) return;
      void refreshBalanceLight();
    }, 10_000);
    const chainResync = setInterval(() => {
      if (stopped) return;
      void startSyncCycle();
    }, 90_000);
    const tipPoll = setInterval(() => {
      if (stopped) return;
      void refreshChainTip();
    }, 5_000);
    const priceTimer = setInterval(() => {
      if (stopped) return;
      void refreshMarketPrice();
    }, 60_000);
    const txPoll = setInterval(() => {
      if (stopped) return;
      void refreshTransactions();
    }, 20_000);

    return () => {
      stopped = true;
      syncInFlight.current = false;
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
      }
      clearInterval(balancePoll);
      clearInterval(chainResync);
      clearInterval(tipPoll);
      clearInterval(priceTimer);
      clearInterval(txPoll);
      dispose();
    };
  // activeWalletFingerprint / fallbackWalletFingerprint in deps: re-run the whole polling
  // cycle immediately when the user switches wallets so fresh data loads without waiting
  // for the next interval tick.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyWalletSnapshot, setBalances, setMarketData, setNativeTxHistory, setSyncMetrics, setSyncStatus, walletApi, activeWalletFingerprint, fallbackWalletFingerprint]);

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
          <button
            className="btn btn-ghost"
            onClick={() => setSetting("showVerificationPhrase", !showVerificationPhrase)}
            style={{ height: 28, padding: "0 8px", display: "inline-flex", alignItems: "center", gap: 6, marginTop: 4 }}
            aria-pressed={showVerificationPhrase}
            aria-label="Toggle verification phrase"
          >
            <span
              className={`toggle ${showVerificationPhrase ? "on" : ""}`}
              style={{ transform: "scale(0.82)", transformOrigin: "center", pointerEvents: "none" }}
            />
            <span className="t-caption text-gray-600">Verification phrase</span>
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
