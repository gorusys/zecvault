// ZecVault helpers (mock layer mirroring future Tauri command shapes)

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

// Mock 24-word seed
const BIP39_SAMPLE = [
  "abandon","ability","able","about","above","absent","absorb","abstract","absurd","abuse","access","accident",
  "account","accuse","achieve","acid","acoustic","acquire","across","act","action","actor","actress","actual",
  "adapt","add","addict","address","adjust","admit","adult","advance","advice","aerobic","affair","afford",
  "afraid","again","age","agent","agree","ahead","aim","air","airport","aisle","alarm","album",
  "alcohol","alert","alien","all","alley","allow","almost","alone","alpha","already","also","alter",
  "always","amateur","amazing","among","amount","amused","analyst","anchor","ancient","anger","angle","angry",
  "animal","ankle","announce","annual","another","answer","antenna","antique","anxiety","any","apart","apology",
  "appear","apple","approve","april","arch","arctic","area","arena","argue","arm","armed","armor",
  "army","around","arrange","arrest","arrive","arrow","art","artefact","artist","artwork","ask","aspect",
];
export function generateMockSeed(): string[] {
  const out: string[] = [];
  for (let i = 0; i < 24; i++) {
    out.push(BIP39_SAMPLE[Math.floor(Math.random() * BIP39_SAMPLE.length)]);
  }
  return out;
}
