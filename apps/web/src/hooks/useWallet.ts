import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface BalanceInfo {
  orchardZat: number;
  saplingZat: number;
  transparentZat: number;
  pendingZat: number;
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
}

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function useWallet() {
  async function getBalance(): Promise<BalanceInfo> {
    if (!isTauriRuntime()) {
      return { orchardZat: 0, saplingZat: 0, transparentZat: 0, pendingZat: 0 };
    }
    return invoke<BalanceInfo>("get_balance");
  }

  async function getAddress(): Promise<string> {
    if (!isTauriRuntime()) return "";
    return invoke<string>("get_unified_address");
  }

  async function sendZec(to: string, amountZat: number, memo?: string): Promise<string> {
    if (!isTauriRuntime()) {
      throw new Error("Native wallet send is only available in desktop runtime.");
    }
    const proposal = await invoke<string>("propose_transfer", { to, amountZat, memo });
    return invoke<string>("execute_transfer", { proposalJson: proposal });
  }

  async function startSync(
    onProgress?: (progress: SyncProgressPayload) => void,
    onBalanceUpdated?: () => void,
    onComplete?: (payload?: SyncCompletePayload) => void,
  ) {
    if (!isTauriRuntime()) return () => {};
    const unlistenProgress = await listen<SyncProgressPayload>("sync-progress", (event) => onProgress?.(event.payload));
    const unlistenBalance = await listen("balance-updated", () => onBalanceUpdated?.());
    const unlistenComplete = await listen<SyncCompletePayload>("sync-complete", (event) => onComplete?.(event.payload));
    await invoke("start_sync");
    return () => {
      unlistenProgress();
      unlistenBalance();
      unlistenComplete();
    };
  }

  async function importWallet(mnemonic: string, birthdayHeight?: number): Promise<boolean> {
    if (!isTauriRuntime()) return false;
    const resp = await invoke<{ ok: boolean }>("wallet_restore", {
      mnemonic,
      network: "mainnet",
      birthdayHeight,
    });
    return Boolean(resp?.ok);
  }

  async function createWallet(): Promise<string[]> {
    if (!isTauriRuntime()) return [];
    const resp = await invoke<{ mnemonicWords: string[] }>("wallet_create", {
      network: "mainnet",
    });
    return resp?.mnemonicWords ?? [];
  }

  async function setLightwalletdServer(url: string): Promise<boolean> {
    if (!isTauriRuntime()) return false;
    return invoke<boolean>("set_lightwalletd_server", { url });
  }

  async function getTransactions(limit: number): Promise<TxInfo[]> {
    if (!isTauriRuntime()) return [];
    return invoke<TxInfo[]>("get_transactions", { limit });
  }

  return {
    getBalance,
    getAddress,
    sendZec,
    startSync,
    importWallet,
    createWallet,
    setLightwalletdServer,
    getTransactions,
  };
}
