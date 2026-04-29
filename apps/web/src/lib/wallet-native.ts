import {
  deriveWalletAddresses,
  generateWalletMnemonic,
  isValidWalletMnemonic,
  normalizeMnemonic,
  walletFingerprint,
} from "@/lib/zec";

export interface NativeWalletSnapshot {
  network: "mainnet" | "testnet";
  walletFingerprint: string;
  unifiedAddress: string;
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
    saplingAddress: derived.saplingAddress,
    transparentAddress: derived.transparentAddress,
    createdAtTs: Math.floor(Date.now() / 1000),
    birthdayHeight: network === "testnet" ? 280_000 : 419_200,
  };
}

export async function createWalletNative(network: "mainnet" | "testnet", password: string): Promise<NativeCreateResponse> {
  void password;
  if (isTauriRuntime()) {
    return invokeTauri<NativeCreateResponse>("wallet_create", { network, password }, 60_000);
  }
  const mnemonicWords = generateWalletMnemonic();
  const snapshot = fallbackSnapshot(mnemonicWords.join(" "), network);
  return { mnemonicWords, snapshot, draftId: undefined };
}

export async function finalizeCreateWalletNative(
  mnemonic: string,
  network: "mainnet" | "testnet",
  password: string,
  birthdayHeight?: number,
  draftId?: string,
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
    }, 60_000);
  }
  return { ok: true, snapshot: fallbackSnapshot(normalized, network) };
}

export async function restoreWalletNative(
  mnemonic: string,
  network: "mainnet" | "testnet",
  password: string,
  birthdayHeight?: number,
): Promise<NativeOpResponse> {
  const normalized = normalizeMnemonic(mnemonic);
  if (!isValidWalletMnemonic(normalized)) {
    return { ok: false, error: "Invalid 24-word BIP39 mnemonic." };
  }
  if (isTauriRuntime()) {
    return invokeTauri<NativeOpResponse>("wallet_restore", { mnemonic: normalized, network, password, birthdayHeight }, 60_000);
  }
  return { ok: true, snapshot: fallbackSnapshot(normalized, network) };
}

export async function getWalletStateNative(): Promise<NativeOpResponse> {
  if (isTauriRuntime()) {
    return invokeTauri<NativeOpResponse>("wallet_get_state");
  }
  return { ok: false };
}

export async function resetWalletNative(): Promise<NativeOpResponse> {
  if (isTauriRuntime()) {
    return invokeTauri<NativeOpResponse>("wallet_reset");
  }
  return { ok: true };
}
