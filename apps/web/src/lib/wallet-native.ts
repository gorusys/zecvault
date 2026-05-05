import {
  deriveWalletAddresses,
  generateWalletMnemonic,
  isValidWalletMnemonic,
  normalizeMnemonic,
  walletFingerprint,
} from "@/lib/zec";

export interface NativeWalletSnapshot {
  network: "mainnet" | "testnet";
  walletName?: string;
  walletFingerprint: string;
  unifiedAddress: string;
  /** Orchard-only unified address (`UnifiedAddressRequest::ORCHARD`), same diversifier as other receive addresses. */
  orchardUnifiedAddress?: string;
  saplingUnifiedAddress?: string;
  unifiedOrchardTransparentAddress?: string;
  unifiedSaplingTransparentAddress?: string;
  unifiedAllAddress?: string;
  saplingAddress: string;
  transparentAddress: string;
  createdAtTs: number;
  birthdayHeight: number;
}

interface NativeCreateResponse {
  mnemonicWords: string[];
  snapshot: NativeWalletSnapshot;
  draftId?: string;
}

interface NativeOpResponse {
  ok: boolean;
  snapshot?: NativeWalletSnapshot;
  error?: string;
}

export interface NativeWalletListResponse {
  wallets: NativeWalletSnapshot[];
  activeWalletFingerprint?: string;
}

export interface NativeAppLockState {
  configured: boolean;
  locked: boolean;
}

export interface NativeWalletBackupExport {
  walletFingerprint: string;
  walletName: string;
  network: "mainnet" | "testnet";
  mnemonic: string;
}

export async function saveTextFileWithDialogNative(suggestedFileName: string, content: string): Promise<string> {
  if (isTauriRuntime()) {
    const [{ save }, { writeTextFile }] = await Promise.all([
      import("@tauri-apps/plugin-dialog"),
      import("@tauri-apps/plugin-fs"),
    ]);
    const selected = await save({
      defaultPath: suggestedFileName,
      filters: [{ name: "Text", extensions: ["txt"] }],
    });
    const selectedPath = Array.isArray(selected) ? selected[0] : selected;
    if (!selectedPath) {
      throw new Error("Save canceled.");
    }
    await writeTextFile(selectedPath, content);
    return selectedPath;
  }

  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggestedFileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return suggestedFileName;
}

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function invokeTauri<T>(cmd: string, args?: Record<string, unknown>, timeoutMs = 15_000): Promise<T> {
  const mod = await import("@tauri-apps/api/core");
  try {
    const result = await Promise.race([
      mod.invoke<T>(cmd, args),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs),
      ),
    ]);
    return result;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${cmd} failed: ${detail}`);
  }
}

function fallbackSnapshot(mnemonic: string, network: "mainnet" | "testnet"): NativeWalletSnapshot {
  const normalized = normalizeMnemonic(mnemonic);
  const derived = deriveWalletAddresses(normalized, network);
  return {
    network,
    walletFingerprint: walletFingerprint(normalized),
    unifiedAddress: derived.unifiedAddress,
    orchardUnifiedAddress: "",
    saplingUnifiedAddress: "",
    unifiedOrchardTransparentAddress: "",
    unifiedSaplingTransparentAddress: "",
    unifiedAllAddress: "",
    saplingAddress: derived.saplingAddress,
    transparentAddress: derived.transparentAddress,
    createdAtTs: Math.floor(Date.now() / 1000),
    birthdayHeight: network === "testnet" ? 280_000 : 419_200,
  };
}

export async function createWalletNative(network: "mainnet" | "testnet"): Promise<NativeCreateResponse> {
  if (isTauriRuntime()) {
    return invokeTauri<NativeCreateResponse>("wallet_create", { network }, 60_000);
  }
  const mnemonicWords = generateWalletMnemonic();
  const snapshot = fallbackSnapshot(mnemonicWords.join(" "), network);
  return { mnemonicWords, snapshot, draftId: undefined };
}

export async function finalizeCreateWalletNative(
  mnemonic: string,
  network: "mainnet" | "testnet",
  password?: string,
  birthdayHeight?: number,
  draftId?: string,
  walletName?: string,
): Promise<NativeOpResponse> {
  const normalized = normalizeMnemonic(mnemonic);
  if (!isValidWalletMnemonic(normalized)) {
    return { ok: false, error: "Invalid 24-word BIP39 mnemonic." };
  }
  if (isTauriRuntime()) {
    return invokeTauri<NativeOpResponse>("wallet_finalize_create", {
      mnemonic: normalized,
      network,
      password,
      birthdayHeight,
      draftId,
      walletName,
    }, 60_000);
  }
  return { ok: true, snapshot: fallbackSnapshot(normalized, network) };
}

export async function restoreWalletNative(
  mnemonic: string,
  network: "mainnet" | "testnet",
  password?: string,
  birthdayHeight?: number,
  walletName?: string,
): Promise<NativeOpResponse> {
  const normalized = normalizeMnemonic(mnemonic);
  if (!isValidWalletMnemonic(normalized)) {
    return { ok: false, error: "Invalid 24-word BIP39 mnemonic." };
  }
  if (isTauriRuntime()) {
    return invokeTauri<NativeOpResponse>("wallet_restore", { mnemonic: normalized, network, password, birthdayHeight, walletName }, 60_000);
  }
  return { ok: true, snapshot: fallbackSnapshot(normalized, network) };
}

export async function getAppLockStateNative(): Promise<NativeAppLockState> {
  if (isTauriRuntime()) {
    try {
      return await invokeTauri<NativeAppLockState>("app_get_lock_state");
    } catch {
      return { configured: false, locked: false };
    }
  }
  return { configured: false, locked: false };
}

export async function lockAppNative(): Promise<boolean> {
  if (isTauriRuntime()) {
    try {
      return await invokeTauri<boolean>("app_lock");
    } catch {
      return false;
    }
  }
  return true;
}

export async function unlockAppNative(password: string): Promise<boolean> {
  if (isTauriRuntime()) {
    try {
      return await invokeTauri<boolean>("app_unlock", { password });
    } catch {
      return false;
    }
  }
  return true;
}

export async function getWalletStateNative(): Promise<NativeOpResponse> {
  if (isTauriRuntime()) {
    return invokeTauri<NativeOpResponse>("wallet_get_state");
  }
  return { ok: false };
}

export async function listWalletsNative(): Promise<NativeWalletListResponse> {
  if (isTauriRuntime()) {
    try {
      return await invokeTauri<NativeWalletListResponse>("wallet_list");
    } catch {
      // Backward-compatible fallback for older native shells that only expose one wallet.
      try {
        const state = await getWalletStateNative();
        return {
          wallets: state.ok && state.snapshot ? [state.snapshot] : [],
          activeWalletFingerprint: state.snapshot?.walletFingerprint,
        };
      } catch {
        return { wallets: [] };
      }
    }
  }
  return { wallets: [] };
}

export async function setActiveWalletNative(walletFingerprint: string): Promise<NativeOpResponse> {
  if (isTauriRuntime()) {
    try {
      return await invokeTauri<NativeOpResponse>("wallet_set_active", { walletFingerprint });
    } catch {
      return { ok: false, error: "Native wallet switching is unavailable on this platform build." };
    }
  }
  return { ok: false, error: "Native runtime unavailable." };
}

export async function renameWalletNative(walletFingerprint: string, walletName: string): Promise<NativeOpResponse> {
  if (isTauriRuntime()) {
    try {
      return await invokeTauri<NativeOpResponse>("wallet_update_name", { walletFingerprint, walletName }, 30_000);
    } catch {
      return { ok: false, error: "Native wallet rename is unavailable on this platform build." };
    }
  }
  return { ok: false, error: "Native runtime unavailable." };
}

export async function removeWalletNative(walletFingerprint: string): Promise<NativeOpResponse> {
  if (isTauriRuntime()) {
    try {
      return await invokeTauri<NativeOpResponse>("wallet_remove", { walletFingerprint }, 30_000);
    } catch {
      return { ok: false, error: "Native wallet removal is unavailable on this platform build." };
    }
  }
  return { ok: false, error: "Native runtime unavailable." };
}

export async function exportWalletBackupNative(walletFingerprint: string): Promise<NativeWalletBackupExport> {
  if (isTauriRuntime()) {
    return invokeTauri<NativeWalletBackupExport>("wallet_export_backup", { walletFingerprint }, 30_000);
  }
  throw new Error("Native runtime unavailable.");
}

export async function exportAllWalletBackupsNative(): Promise<NativeWalletBackupExport[]> {
  if (isTauriRuntime()) {
    return invokeTauri<NativeWalletBackupExport[]>("wallet_export_all_backups", undefined, 60_000);
  }
  throw new Error("Native runtime unavailable.");
}

export async function resetWalletNative(): Promise<NativeOpResponse> {
  if (isTauriRuntime()) {
    return invokeTauri<NativeOpResponse>("wallet_reset");
  }
  return { ok: true };
}
