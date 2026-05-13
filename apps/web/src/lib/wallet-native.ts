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
  /** ZIP-32 account index. 0 = first (default) account; 1, 2, … = additional accounts from the same seed. */
  accountIndex?: number;
  /** Fingerprint shared by all accounts from the same seed phrase (equals walletFingerprint for account 0). */
  seedFingerprint?: string;
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
  hasWallets?: boolean;
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

/** Re-derive receive addresses from seed and persist to native store (align UI with wallet DB). */
export async function reconcileWalletDerivedAddressesNative(): Promise<NativeOpResponse> {
  if (!isTauriRuntime()) {
    return { ok: false, error: "Native runtime unavailable." };
  }
  return invokeTauri<NativeOpResponse>("wallet_reconcile_derived_addresses", undefined, 30_000);
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

export async function updateWalletBirthdayNative(
  walletFingerprint: string,
  birthdayHeight: number,
): Promise<NativeOpResponse> {
  if (isTauriRuntime()) {
    try {
      return await invokeTauri<NativeOpResponse>(
        "wallet_update_birthday",
        { walletFingerprint, birthdayHeight },
        30_000,
      );
    } catch {
      return { ok: false, error: "Birthday update unavailable on this platform build." };
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

/**
 * Derive a new ZIP-32 account from the seed of an existing wallet.
 *
 * This is the recommended way to "add a wallet" when the user already has a seed phrase
 * in the app: instead of generating a new mnemonic, a new account (index 1, 2, …) is
 * derived from the same seed.  A single backup phrase then covers all accounts.
 *
 * @param sourceFingerprint  walletFingerprint of any existing account from the target seed.
 * @param walletName         Optional display name for the new account.
 */
export async function addAccountNative(
  sourceFingerprint: string,
  walletName?: string,
  birthdayHeight?: number,
): Promise<NativeOpResponse> {
  if (!isTauriRuntime()) {
    return { ok: false, error: "Native runtime unavailable." };
  }
  return invokeTauri<NativeOpResponse>(
    "wallet_add_account",
    { sourceFingerprint, walletName, birthdayHeight },
    60_000,
  );
}

export interface NativeWalletBalanceInfo {
  orchardZat: number;
  saplingZat: number;
  transparentZat: number;
  pendingZat: number;
  totalZat: number;
  spendableZat: number;
}

export async function getWalletBalanceNative(walletFingerprint: string): Promise<NativeWalletBalanceInfo | null> {
  if (!isTauriRuntime()) return null;
  try {
    return await invokeTauri<NativeWalletBalanceInfo>("wallet_get_balance", { walletFingerprint }, 15_000);
  } catch {
    return null;
  }
}

export interface NativeTransferPreviewResult {
  ok: boolean;
  error?: string;
  feeZat: number;
  amountZat: number;
  totalDebitZat: number;
  needsShielding: boolean;
}

/** Preview exact send-max fee and amount. Orchard-first pool order. Does not sync. */
export async function previewSendMaxNative(
  to: string,
  memo?: string,
): Promise<NativeTransferPreviewResult> {
  if (!isTauriRuntime()) {
    return { ok: false, error: "Native runtime unavailable.", feeZat: 0, amountZat: 0, totalDebitZat: 0, needsShielding: false };
  }
  return invokeTauri<NativeTransferPreviewResult>("preview_send_max", { to, memo }, 30_000);
}

/** Drain all spendable shielded funds (Orchard first, then Sapling) to a single recipient. Syncs first. */
export async function sendMaxTransferNative(to: string, memo?: string): Promise<string> {
  if (!isTauriRuntime()) throw new Error("Native runtime unavailable.");
  return invokeTauri<string>("send_max_transfer", { to, memo }, 120_000);
}

/**
 * Shield transparent funds to a shielded pool.
 * @param targetPool "orchard" (default, always) | "sapling" (expert opt-in only)
 */
export async function shieldTransparentFundsNative(targetPool?: "orchard" | "sapling"): Promise<string> {
  if (!isTauriRuntime()) throw new Error("Native runtime unavailable.");
  return invokeTauri<string>("shield_transparent_funds", { targetPool }, 120_000);
}

/** Migrate all spendable Sapling funds to the Orchard pool via a self-send. */
export async function migrateSaplingToOrchardNative(): Promise<NativeOpResponse> {
  if (!isTauriRuntime()) {
    return { ok: false, error: "Native runtime unavailable." };
  }
  try {
    await invokeTauri<string>("migrate_sapling_to_orchard", undefined, 120_000);
    return { ok: true, snapshot: undefined, error: undefined };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { ok: false, error: detail };
  }
}
