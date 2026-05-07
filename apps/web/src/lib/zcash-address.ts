/**
 * Lightweight client-side classification for Send / validation UX.
 * Authoritative checks happen in the Tauri wallet via `Address::decode`.
 */
export type ZcashRecipientSurfaceKind = "unified" | "sapling" | "transparent" | "unknown";

export function normalizeRecipientInput(addr: string): string {
  let t = addr.trim();
  if (!t) return "";
  // Common paste artifacts from chat / docs lists.
  t = t.replace(/^[\-\*\u2022]+\s*/, "");
  // Support zcash URI forms like: zcash:u1... or zcash:zs1...?amount=...
  t = t.replace(/^zcash:/i, "");
  const q = t.indexOf("?");
  if (q >= 0) t = t.slice(0, q);
  // If users paste with accidental "to " prefix.
  t = t.replace(/^to\s+/i, "");
  return t.trim();
}

export function surfaceKindFromRecipient(addr: string): ZcashRecipientSurfaceKind {
  const t = normalizeRecipientInput(addr);
  if (!t) return "unknown";
  if (t.startsWith("u1") || t.startsWith("utest")) return "unified";
  if (t.startsWith("zs1") || t.startsWith("ztestsapling")) return "sapling";
  if (t.startsWith("t1") || t.startsWith("t3") || t.startsWith("tm") || t.startsWith("t2")) {
    return "transparent";
  }
  return "unknown";
}

export function classifySendRecipient(addr: string): "private" | "public" | "invalid" {
  const k = surfaceKindFromRecipient(addr);
  if (k === "unified" || k === "sapling") return "private";
  if (k === "transparent") return "public";
  return "invalid";
}

export function isTransparentReceiverAddress(addr: string): boolean {
  return surfaceKindFromRecipient(addr) === "transparent";
}
