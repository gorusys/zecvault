import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { GoalCategory } from "@/lib/categories";
import type { NativeWalletSnapshot } from "@/lib/wallet-native";
import {
  deriveWalletAddresses,
  isValidWalletMnemonic,
  mockTxId,
  mockUnifiedAddress,
  normalizeMnemonic,
  walletFingerprint,
} from "@/lib/zec";

// ---------- Types ----------
export type SyncStatus = "synced" | "syncing" | "error";

export interface TxRecord {
  id: string;
  type: "received" | "sent" | "vault-deposit" | "vault-withdraw";
  amountZat: number; // signed (received +, sent -)
  walletFingerprint?: string;
  toAddress?: string;
  fromAddress?: string;
  memo?: string;
  vaultId?: string;
  blockHeight: number;
  feeZat: number;
  timestamp: number;
}

export interface BreakRequest { requestTs: number; unlockTs: number; }

export type VaultStatus = "active" | "complete" | "breaking" | "archived";

export interface Vault {
  id: string;
  walletFingerprint: string;
  category: GoalCategory;
  goalName: string;
  targetZat: number;
  deadlineTs: number;
  createdTs: number;
  shieldedAddress: string;
  derivationIndex: number;
  currentBalanceZat: number;
  contributions: TxRecord[];
  streakDays: number;
  lastContributionTs: number;
  status: VaultStatus;
  commitmentTxId: string;
  commitmentBlock: number;
  breakRequest: BreakRequest | null;
}

// ---------- Wallet store ----------
interface WalletState {
  isInitialized: boolean;
  wallets: NativeWalletSnapshot[];
  activeWalletFingerprint: string;
  walletFingerprint: string;
  createdAtTs: number | null;
  birthdayHeight: number | null;
  syncStatus: SyncStatus;
  syncProgress: number; // 0..100
  syncBlock: number;
  totalZat: number;
  spendableZat: number;
  pendingZat: number;
  unifiedAddress: string;
  saplingAddress: string;
  transparentAddress: string;
  txHistory: TxRecord[];
  zecUsdPrice: number;
  priceChange24h: number;
  reset: () => void;
  applyWalletSnapshot: (snapshot: NativeWalletSnapshot) => void;
  setWallets: (wallets: NativeWalletSnapshot[], activeWalletFingerprint?: string) => void;
  setActiveWallet: (walletFingerprint: string) => void;
  createWalletFromMnemonic: (mnemonic: string, network: "mainnet" | "testnet") => void;
  restoreWalletFromMnemonic: (mnemonic: string, network: "mainnet" | "testnet") => { ok: boolean; error?: string };
  addTx: (tx: TxRecord) => void;
  setSyncStatus: (s: SyncStatus) => void;
  setSyncMetrics: (input: { syncProgress: number; syncBlock: number }) => void;
  setBalances: (input: { totalZat: number; spendableZat: number; pendingZat: number }) => void;
  setMarketData: (input: { zecUsdPrice: number; priceChange24h: number }) => void;
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set, get) => ({
      isInitialized: false,
      wallets: [],
      activeWalletFingerprint: "",
      walletFingerprint: "",
      createdAtTs: null,
      birthdayHeight: null,
      syncStatus: "synced",
      syncProgress: 100,
      syncBlock: 2_341_120,
      totalZat: 0,
      spendableZat: 0,
      pendingZat: 0,
      unifiedAddress: "",
      saplingAddress: "",
      transparentAddress: "",
      txHistory: [],
      zecUsdPrice: 364.1,
      priceChange24h: 2.4,
      reset: () => set({
        isInitialized: false,
        wallets: [],
        activeWalletFingerprint: "",
        walletFingerprint: "",
        createdAtTs: null,
        birthdayHeight: null,
        totalZat: 0,
        spendableZat: 0,
        pendingZat: 0,
        unifiedAddress: "",
        saplingAddress: "",
        transparentAddress: "",
        txHistory: [],
      }),
      applyWalletSnapshot: (snapshot) => set((state) => {
        const wallets = state.wallets.filter((w) => w.walletFingerprint !== snapshot.walletFingerprint);
        wallets.unshift(snapshot);
        return {
          isInitialized: true,
          wallets,
          activeWalletFingerprint: snapshot.walletFingerprint,
          walletFingerprint: snapshot.walletFingerprint,
          createdAtTs: snapshot.createdAtTs * 1000,
          birthdayHeight: snapshot.birthdayHeight,
          unifiedAddress: snapshot.unifiedAddress,
          saplingAddress: snapshot.saplingAddress,
          transparentAddress: snapshot.transparentAddress,
          txHistory: [],
          totalZat: 0,
          spendableZat: 0,
          pendingZat: 0,
        };
      }),
      setWallets: (wallets, activeWalletFingerprint) => set(() => {
        const active = wallets.find((w) => w.walletFingerprint === activeWalletFingerprint) ?? wallets[0];
        return {
          wallets,
          isInitialized: wallets.length > 0,
          activeWalletFingerprint: active?.walletFingerprint ?? "",
          walletFingerprint: active?.walletFingerprint ?? "",
          createdAtTs: active ? active.createdAtTs * 1000 : null,
          birthdayHeight: active?.birthdayHeight ?? null,
          unifiedAddress: active?.unifiedAddress ?? "",
          saplingAddress: active?.saplingAddress ?? "",
          transparentAddress: active?.transparentAddress ?? "",
          txHistory: [],
          totalZat: 0,
          spendableZat: 0,
          pendingZat: 0,
        };
      }),
      setActiveWallet: (walletFingerprint) => set((state) => {
        const active = state.wallets.find((w) => w.walletFingerprint === walletFingerprint);
        if (!active) return {};
        return {
          activeWalletFingerprint: walletFingerprint,
          walletFingerprint,
          createdAtTs: active.createdAtTs * 1000,
          birthdayHeight: active.birthdayHeight,
          unifiedAddress: active.unifiedAddress,
          saplingAddress: active.saplingAddress,
          transparentAddress: active.transparentAddress,
          txHistory: [],
          totalZat: 0,
          spendableZat: 0,
          pendingZat: 0,
        };
      }),
      createWalletFromMnemonic: (mnemonic, network) => {
        const normalized = normalizeMnemonic(mnemonic);
        const addresses = deriveWalletAddresses(normalized, network);
        const now = Date.now();
        set({
          isInitialized: true,
          walletFingerprint: walletFingerprint(normalized),
          createdAtTs: now,
          birthdayHeight: network === "testnet" ? 280_000 : 419_200,
          unifiedAddress: addresses.unifiedAddress,
          saplingAddress: addresses.saplingAddress,
          transparentAddress: addresses.transparentAddress,
          txHistory: [],
          totalZat: 0,
          spendableZat: 0,
          pendingZat: 0,
        });
      },
      restoreWalletFromMnemonic: (mnemonic, network) => {
        const normalized = normalizeMnemonic(mnemonic);
        if (!isValidWalletMnemonic(normalized)) {
          return { ok: false, error: "Invalid 24-word BIP39 mnemonic." };
        }
        get().createWalletFromMnemonic(normalized, network);
        return { ok: true };
      },
      addTx: (tx) => set({ txHistory: [tx, ...get().txHistory] }),
      setSyncStatus: (s) => set({ syncStatus: s }),
      setSyncMetrics: ({ syncProgress, syncBlock }) => set({
        syncProgress,
        syncBlock,
      }),
      setBalances: ({ totalZat, spendableZat, pendingZat }) => set({
        totalZat,
        spendableZat,
        pendingZat,
      }),
      setMarketData: ({ zecUsdPrice, priceChange24h }) => set({
        zecUsdPrice,
        priceChange24h,
      }),
    }),
    { name: "zecvault-wallet", storage: createJSONStorage(() => localStorage) },
  ),
);

// ---------- Vault store ----------
interface VaultState {
  vaults: Vault[];
  archive: Vault[];
  createVault: (input: { walletFingerprint: string; category: GoalCategory; goalName: string; targetZat: number; deadlineTs: number; }) => Vault;
  deposit: (id: string, amountZat: number) => void;
  getVaultsForWallet: (walletFingerprint: string) => Vault[];
  getArchiveForWallet: (walletFingerprint: string) => Vault[];
  completeVault: (id: string) => void;
  requestBreak: (id: string) => void;
  cancelBreak: (id: string) => void;
  executeBreak: (id: string) => void;
  removeVault: (id: string) => void;
}

export const useVaultStore = create<VaultState>()(
  persist(
    (set, get) => ({
      vaults: [],
      archive: [],
      createVault: ({ walletFingerprint, category, goalName, targetZat, deadlineTs }) => {
        const idx = get().vaults.length + get().archive.length + 1;
        const v: Vault = {
          id: "v" + idx + "_" + Date.now().toString(36),
          walletFingerprint,
          category, goalName, targetZat, deadlineTs,
          createdTs: Date.now(),
          shieldedAddress: mockUnifiedAddress(`${walletFingerprint}|vault-${category}`, idx),
          derivationIndex: idx,
          currentBalanceZat: 0,
          contributions: [],
          streakDays: 0,
          lastContributionTs: 0,
          status: "active",
          commitmentTxId: mockTxId("c" + idx),
          commitmentBlock: 2_341_120,
          breakRequest: null,
        };
        set({ vaults: [v, ...get().vaults] });
        return v;
      },
      deposit: (id, amountZat) => set({
        vaults: get().vaults.map((v) => v.id === id
          ? { ...v, currentBalanceZat: v.currentBalanceZat + amountZat, lastContributionTs: Date.now(), streakDays: v.streakDays + 1 }
          : v),
      }),
      getVaultsForWallet: (walletFingerprint) => get().vaults.filter((v) => (v.walletFingerprint || walletFingerprint) === walletFingerprint),
      getArchiveForWallet: (walletFingerprint) => get().archive.filter((v) => (v.walletFingerprint || walletFingerprint) === walletFingerprint),
      completeVault: (id) => set({
        vaults: get().vaults.map((v) => v.id === id ? { ...v, status: "complete" as const } : v),
      }),
      requestBreak: (id) => set({
        vaults: get().vaults.map((v) => v.id === id
          ? { ...v, status: "breaking" as const, breakRequest: { requestTs: Date.now(), unlockTs: Date.now() + 24 * 3600 * 1000 } }
          : v),
      }),
      cancelBreak: (id) => set({
        vaults: get().vaults.map((v) => v.id === id ? { ...v, status: "active" as const, breakRequest: null } : v),
      }),
      executeBreak: (id) => {
        const v = get().vaults.find((x) => x.id === id);
        if (!v) return;
        set({
          vaults: get().vaults.filter((x) => x.id !== id),
          archive: [{ ...v, status: "archived" as const }, ...get().archive],
        });
      },
      removeVault: (id) => set({ vaults: get().vaults.filter((v) => v.id !== id) }),
    }),
    { name: "zecvault-vaults", storage: createJSONStorage(() => localStorage) },
  ),
);

// ---------- Settings store ----------
interface SettingsState {
  theme: "light" | "dark" | "forest";
  currency: "USD" | "SGD" | "EUR" | "GBP" | "JPY";
  zecDecimals: 2 | 4 | 8;
  lightwalletdEndpoint: string;
  network: "mainnet" | "testnet";
  biometricsEnabled: boolean;
  pinEnabled: boolean;
  notificationsEnabled: boolean;
  roundupEnabled: boolean;
  roundupVaultId: string | null;
  roundupThreshold: 0.01 | 0.1 | 1;
  onboardingComplete: boolean;
  userName: string;
  set: <K extends keyof SettingsState>(k: K, v: SettingsState[K]) => void;
  completeOnboarding: (name: string) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "light",
      currency: "USD",
      zecDecimals: 4,
      lightwalletdEndpoint: "https://zec.rocks:443",
      network: "mainnet",
      biometricsEnabled: true,
      pinEnabled: false,
      notificationsEnabled: true,
      roundupEnabled: false,
      roundupVaultId: null,
      roundupThreshold: 0.1,
      onboardingComplete: false,
      userName: "Friend",
      set: (k, v) => set({ [k]: v } as Pick<SettingsState, typeof k>),
      completeOnboarding: (name) => set({ onboardingComplete: true, userName: name }),
    }),
    { name: "zecvault-settings", storage: createJSONStorage(() => localStorage) },
  ),
);
