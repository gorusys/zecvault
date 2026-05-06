import { useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { reconcileWalletDerivedAddressesNative } from "@/lib/wallet-native";
import type { NativeWalletSnapshot } from "@/lib/wallet-native";

export interface BalanceInfo {
  orchardZat: number;
  saplingZat: number;
  transparentZat: number;
  pendingZat: number;
  totalZat: number;
  spendableZat: number;
}

export interface TxInfo {
  txid: string;
  valueZat: number;
  timestamp: number;
  blockHeight: number;
  memo?: string;
  isIncoming: boolean;
}

interface SyncProgressPayload {
  height: number;
  total: number;
}

interface SyncCompletePayload {
  ok?: boolean;
  error?: string;
  skipped?: boolean;
}

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function useWallet() {
  const getBalance = useCallback(async (): Promise<BalanceInfo> => {
    if (!isTauriRuntime()) {
      return {
        orchardZat: 0,
        saplingZat: 0,
        transparentZat: 0,
        pendingZat: 0,
        totalZat: 0,
        spendableZat: 0,
      };
    }
    return invoke<BalanceInfo>("get_balance");
  }, []);

  const getAddress = useCallback(async (): Promise<string> => {
    if (!isTauriRuntime()) return "";
    return invoke<string>("get_unified_address");
  }, []);

  const sendZec = useCallback(async (to: string, amountZat: number, memo?: string): Promise<string> => {
    if (!isTauriRuntime()) {
      throw new Error("Native wallet send is only available in desktop runtime.");
    }
    const proposal = await invoke<string>("propose_transfer", { to, amountZat, memo });
    return invoke<string>("execute_transfer", { proposalJson: proposal });
  }, []);

  const startSync = useCallback(
    async (
      onProgress?: (progress: SyncProgressPayload) => void,
      onBalanceUpdated?: () => void,
      onComplete?: (payload?: SyncCompletePayload) => void,
    ) => {
      if (!isTauriRuntime()) return () => {};
      const unlistenProgress = await listen<SyncProgressPayload>("sync-progress", (event) =>
        onProgress?.(event.payload),
      );
      const unlistenBalance = await listen("balance-updated", () => onBalanceUpdated?.());
      const unlistenComplete = await listen<SyncCompletePayload>("sync-complete", (event) =>
        onComplete?.(event.payload),
      );
      await invoke("start_sync");
      return () => {
        unlistenProgress();
        unlistenBalance();
        unlistenComplete();
      };
    },
    [],
  );

  const importWallet = useCallback(async (mnemonic: string, birthdayHeight?: number): Promise<boolean> => {
    if (!isTauriRuntime()) return false;
    const resp = await invoke<{ ok: boolean }>("wallet_restore", {
      mnemonic,
      network: "mainnet",
      birthdayHeight,
    });
    return Boolean(resp?.ok);
  }, []);

  const createWallet = useCallback(async (): Promise<string[]> => {
    if (!isTauriRuntime()) return [];
    const resp = await invoke<{ mnemonicWords: string[] }>("wallet_create", {
      network: "mainnet",
    });
    return resp?.mnemonicWords ?? [];
  }, []);

  const setLightwalletdServer = useCallback(async (url: string): Promise<boolean> => {
    if (!isTauriRuntime()) return false;
    return invoke<boolean>("set_lightwalletd_server", { url });
  }, []);

  const getTransactions = useCallback(async (limit: number): Promise<TxInfo[]> => {
    if (!isTauriRuntime()) return [];
    return invoke<TxInfo[]>("get_transactions", { limit });
  }, []);

  const getLatestBlockHeight = useCallback(async (): Promise<number> => {
    if (!isTauriRuntime()) return 0;
    return invoke<number>("get_latest_block_height");
  }, []);

  const reconcileDerivedAddresses = useCallback(async (): Promise<NativeWalletSnapshot | null> => {
    const r = await reconcileWalletDerivedAddressesNative();
    if (!r.ok || !r.snapshot) return null;
    return r.snapshot;
  }, []);

  return useMemo(
    () => ({
      getBalance,
      getAddress,
      sendZec,
      startSync,
      importWallet,
      createWallet,
      setLightwalletdServer,
      getTransactions,
      getLatestBlockHeight,
      reconcileDerivedAddresses,
    }),
    [
      getBalance,
      getAddress,
      sendZec,
      startSync,
      importWallet,
      createWallet,
      setLightwalletdServer,
      getTransactions,
      getLatestBlockHeight,
      reconcileDerivedAddresses,
    ],
  );
}
