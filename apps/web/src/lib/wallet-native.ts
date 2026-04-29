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
}

interface NativeOpResponse {
  ok: boolean;
  snapshot?: NativeWalletSnapshot;
  error?: string;
}

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function invokeTauri<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import("@tauri-apps/api/core");
  return mod.invoke<T>(cmd, args);
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

export async function createWalletNative(network: "mainnet" | "testnet"): Promise<NativeCreateResponse> {
  if (isTauriRuntime()) {
    return invokeTauri<NativeCreateResponse>("wallet_create", { network });
  }
  const mnemonicWords = generateWalletMnemonic();
  const snapshot = fallbackSnapshot(mnemonicWords.join(" "), network);
  return { mnemonicWords, snapshot };
}

export async function restoreWalletNative(
  mnemonic: string,
  network: "mainnet" | "testnet",
  birthdayHeight?: number,
): Promise<NativeOpResponse> {
  const normalized = normalizeMnemonic(mnemonic);
  if (!isValidWalletMnemonic(normalized)) {
    return { ok: false, error: "Invalid 24-word BIP39 mnemonic." };
  }
  if (isTauriRuntime()) {
    return invokeTauri<NativeOpResponse>("wallet_restore", { mnemonic: normalized, network, birthdayHeight });
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
