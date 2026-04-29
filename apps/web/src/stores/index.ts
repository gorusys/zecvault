import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { GoalCategory } from "@/lib/categories";
import { mockUnifiedAddress, mockTxId } from "@/lib/zec";

// ---------- Types ----------
export type SyncStatus = "synced" | "syncing" | "error";

export interface TxRecord {
  id: string;
  type: "received" | "sent" | "vault-deposit" | "vault-withdraw";
  amountZat: number; // signed (received +, sent -)
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
  initialize: () => void;
  reset: () => void;
  addTx: (tx: TxRecord) => void;
  setSyncStatus: (s: SyncStatus) => void;
}

function seedTxHistory(unified: string): TxRecord[] {
  const now = Date.now();
  return [
    { id: mockTxId("tx1"), type: "received", amountZat: 250_000_000, toAddress: unified, blockHeight: 2_341_120, feeZat: 0, timestamp: now - 5 * 60 * 1000, memo: "Salary stream" },
    { id: mockTxId("tx2"), type: "vault-deposit", amountZat: -15_000_000, vaultId: "v1", blockHeight: 2_341_080, feeZat: 1000, timestamp: now - 6 * 3600 * 1000, memo: "ZV1|t:trip|n:Tokyo|a:80|dl:" },
    { id: mockTxId("tx3"), type: "sent", amountZat: -32_500_000, toAddress: mockUnifiedAddress("friend", 3), blockHeight: 2_340_980, feeZat: 1000, timestamp: now - 26 * 3600 * 1000, memo: "Dinner split" },
    { id: mockTxId("tx4"), type: "vault-deposit", amountZat: -8_000_000, vaultId: "v2", blockHeight: 2_340_700, feeZat: 1000, timestamp: now - 2 * 86400_000, memo: "Round-up" },
    { id: mockTxId("tx5"), type: "received", amountZat: 500_000_000, toAddress: unified, blockHeight: 2_340_500, feeZat: 0, timestamp: now - 4 * 86400_000 },
    { id: mockTxId("tx6"), type: "vault-deposit", amountZat: -25_000_000, vaultId: "v1", blockHeight: 2_340_300, feeZat: 1000, timestamp: now - 6 * 86400_000 },
    { id: mockTxId("tx7"), type: "received", amountZat: 1_200_000_000, toAddress: unified, blockHeight: 2_339_900, feeZat: 0, timestamp: now - 12 * 86400_000, memo: "Refund from Joey" },
  ];
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set, get) => ({
      isInitialized: false,
      syncStatus: "synced",
      syncProgress: 100,
      syncBlock: 2_341_120,
      totalZat: 412_5000_000,
      spendableZat: 304_2500_000,
      pendingZat: 0,
      unifiedAddress: "",
      saplingAddress: "",
      transparentAddress: "",
      txHistory: [],
      zecUsdPrice: 32.41,
      priceChange24h: 2.4,
      initialize: () => {
        if (get().isInitialized) return;
        const unified = mockUnifiedAddress("zecvault-main", 0);
        const sapling = "zs1" + mockUnifiedAddress("sap", 0).slice(2, 78);
        const transparent = "t1" + mockUnifiedAddress("tr", 0).slice(2, 34);
        set({
          isInitialized: true,
          unifiedAddress: unified,
          saplingAddress: sapling,
          transparentAddress: transparent,
          txHistory: seedTxHistory(unified),
        });
      },
      reset: () => set({ isInitialized: false, txHistory: [] }),
      addTx: (tx) => set({ txHistory: [tx, ...get().txHistory] }),
      setSyncStatus: (s) => set({ syncStatus: s }),
    }),
    { name: "zecvault-wallet", storage: createJSONStorage(() => localStorage) },
  ),
);

// ---------- Vault store ----------
interface VaultState {
  vaults: Vault[];
  archive: Vault[];
  ensureSeeded: () => void;
  createVault: (input: { category: GoalCategory; goalName: string; targetZat: number; deadlineTs: number; }) => Vault;
  deposit: (id: string, amountZat: number) => void;
  completeVault: (id: string) => void;
  requestBreak: (id: string) => void;
  cancelBreak: (id: string) => void;
  executeBreak: (id: string) => void;
  removeVault: (id: string) => void;
}

function seededVaults(): Vault[] {
  const now = Date.now();
  return [
    {
      id: "v1", category: "trip", goalName: "Tokyo trip",
      targetZat: 80 * 1e8, deadlineTs: now + 73 * 86400_000, createdTs: now - 42 * 86400_000,
      shieldedAddress: mockUnifiedAddress("vault-trip", 1), derivationIndex: 1,
      currentBalanceZat: 51.2 * 1e8,
      contributions: [], streakDays: 18, lastContributionTs: now - 6 * 3600_000,
      status: "active", commitmentTxId: mockTxId("c1"), commitmentBlock: 2_298_400, breakRequest: null,
    },
    {
      id: "v2", category: "ring", goalName: "Engagement ring",
      targetZat: 120 * 1e8, deadlineTs: now + 22 * 86400_000, createdTs: now - 90 * 86400_000,
      shieldedAddress: mockUnifiedAddress("vault-ring", 2), derivationIndex: 2,
      currentBalanceZat: 88.4 * 1e8,
      contributions: [], streakDays: 41, lastContributionTs: now - 2 * 86400_000,
      status: "active", commitmentTxId: mockTxId("c2"), commitmentBlock: 2_265_120, breakRequest: null,
    },
    {
      id: "v3", category: "emer", goalName: "Emergency fund",
      targetZat: 200 * 1e8, deadlineTs: now + 180 * 86400_000, createdTs: now - 12 * 86400_000,
      shieldedAddress: mockUnifiedAddress("vault-emer", 3), derivationIndex: 3,
      currentBalanceZat: 14.7 * 1e8,
      contributions: [], streakDays: 5, lastContributionTs: now - 86400_000,
      status: "active", commitmentTxId: mockTxId("c3"), commitmentBlock: 2_336_200, breakRequest: null,
    },
    {
      id: "v4", category: "house", goalName: "House down payment",
      targetZat: 500 * 1e8, deadlineTs: now + 9 * 86400_000, createdTs: now - 240 * 86400_000,
      shieldedAddress: mockUnifiedAddress("vault-house", 4), derivationIndex: 4,
      currentBalanceZat: 320 * 1e8,
      contributions: [], streakDays: 62, lastContributionTs: now - 4 * 3600_000,
      status: "active", commitmentTxId: mockTxId("c4"), commitmentBlock: 2_120_800, breakRequest: null,
    },
  ];
}

export const useVaultStore = create<VaultState>()(
  persist(
    (set, get) => ({
      vaults: [],
      archive: [],
      ensureSeeded: () => {
        if (get().vaults.length === 0 && get().archive.length === 0) {
          set({ vaults: seededVaults() });
        }
      },
      createVault: ({ category, goalName, targetZat, deadlineTs }) => {
        const idx = get().vaults.length + get().archive.length + 1;
        const v: Vault = {
          id: "v" + idx + "_" + Date.now().toString(36),
          category, goalName, targetZat, deadlineTs,
          createdTs: Date.now(),
          shieldedAddress: mockUnifiedAddress("vault-" + category, idx),
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
      currency: "USD",
      zecDecimals: 4,
      lightwalletdEndpoint: "https://zec.rocks:443",
      network: "mainnet",
      biometricsEnabled: true,
      pinEnabled: false,
      notificationsEnabled: true,
      roundupEnabled: true,
      roundupVaultId: "v1",
      roundupThreshold: 0.1,
      onboardingComplete: false,
      userName: "Friend",
      set: (k, v) => set({ [k]: v } as Pick<SettingsState, typeof k>),
      completeOnboarding: (name) => set({ onboardingComplete: true, userName: name }),
    }),
    { name: "zecvault-settings", storage: createJSONStorage(() => localStorage) },
  ),
);
