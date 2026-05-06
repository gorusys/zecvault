/**
 * Lightweight client-side classification for Send / validation UX.
 * Authoritative checks happen in the Tauri wallet via `Address::decode`.
 */
export type ZcashRecipientSurfaceKind = "unified" | "sapling" | "transparent" | "unknown";

export function surfaceKindFromRecipient(addr: string): ZcashRecipientSurfaceKind {
  const t = addr.trim();
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
