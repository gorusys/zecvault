import { generateMnemonic, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

// ZecVault helpers (wallet/on-chain formatting primitives)

export const ZAT_PER_ZEC = 100_000_000n;

export function zatToZec(zat: bigint | number): string {
  const z = typeof zat === "number" ? BigInt(Math.round(zat)) : zat;
  const whole = z / ZAT_PER_ZEC;
  const frac = z % ZAT_PER_ZEC;
  const fracStr = frac.toString().padStart(8, "0").slice(0, 4);
  return `${whole.toString()}.${fracStr}`;
}

export function zecToZat(zec: string | number): bigint {
  const n = typeof zec === "string" ? parseFloat(zec) : zec;
  if (!isFinite(n)) return 0n;
  return BigInt(Math.round(n * 1e8));
}

export function fmtZec(zat: bigint | number): string {
  return zatToZec(zat);
}

export function truncateAddress(addr: string): string {
  if (!addr) return "";
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

export function formatRelativeTime(ts: number): string {
  const now = Date.now();
  const diff = Math.max(0, now - ts);
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(diff / 86_400_000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d}d ago`;
  const date = new Date(ts);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function fmtFiat(zat: bigint | number, price: number, currency = "USD"): string {
  const z = typeof zat === "number" ? zat : Number(zat);
  const usd = (z / 1e8) * price;
  return new Intl.NumberFormat(undefined, {
    style: "currency", currency, maximumFractionDigits: 2,
  }).format(usd);
}

export function daysBetween(from: number, to: number): number {
  return Math.max(0, Math.ceil((to - from) / 86_400_000));
}

export function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
}

export function fmtCountdown(ms: number): string {
  if (ms <= 0) return "00:00:00";
  const s = Math.floor(ms / 1000);
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return `${h}:${m}:${sec}`;
}

// Mock address generator (looks like a Zcash unified address)
export function mockUnifiedAddress(seed: string, idx = 0): string {
  const base = "u1";
  let acc = seed + idx;
  let out = "";
  for (let i = 0; i < 76; i++) {
    let h = 0;
    for (let j = 0; j < acc.length; j++) h = (h * 31 + acc.charCodeAt(j) + i) >>> 0;
    out += "qpzry9x8gf2tvdw0s3jn54khce6mua7l"[h % 32];
    acc = h.toString(36) + acc;
  }
  return base + out;
}

export function mockTxId(seed: string): string {
  let acc = seed + Date.now() + Math.random();
  let out = "";
  const chars = "0123456789abcdef";
  for (let i = 0; i < 64; i++) {
    let h = 0;
    for (let j = 0; j < acc.length; j++) h = (h * 31 + acc.charCodeAt(j) + i) >>> 0;
    out += chars[h % 16];
    acc = h.toString(36) + acc;
  }
  return out;
}

export function normalizeMnemonic(input: string): string {
  return input.trim().toLowerCase().split(/\s+/).filter(Boolean).join(" ");
}

export function generateWalletMnemonic(): string[] {
  return generateMnemonic(wordlist, 256).split(" ");
}

export function isValidWalletMnemonic(input: string): boolean {
  const normalized = normalizeMnemonic(input);
  const words = normalized ? normalized.split(" ") : [];
  if (words.length !== 24) return false;
  return validateMnemonic(normalized, wordlist);
}

function deterministicHex(input: string, length: number): string {
  const chars = "0123456789abcdef";
  let acc = input;
  let out = "";
  for (let i = 0; i < length; i++) {
    let h = 0x811c9dc5;
    for (let j = 0; j < acc.length; j++) {
      h ^= acc.charCodeAt(j) + i;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    out += chars[h % 16];
    acc = h.toString(16) + acc;
  }
  return out;
}

export function walletFingerprint(mnemonic: string): string {
  return deterministicHex("fp|" + normalizeMnemonic(mnemonic), 16);
}

export function deriveWalletAddresses(mnemonic: string, network: "mainnet" | "testnet") {
  const normalized = normalizeMnemonic(mnemonic);
  const suffix = deterministicHex(`${network}|${normalized}`, 76);
  const transparentSuffix = deterministicHex(`t|${network}|${normalized}`, 33);
  return {
    unifiedAddress: "u1" + suffix,
    saplingAddress: "zs1" + suffix,
    transparentAddress: "t1" + transparentSuffix,
  };
}
