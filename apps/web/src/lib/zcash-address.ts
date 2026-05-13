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

export interface ParsedPaymentUri {
  address: string;
  /** Amount in ZEC (decimal string, e.g. "0.001") — present when the URI includes ?amount= */
  amount?: string;
  /** Memo text decoded from base64url — present when the URI includes ?memo= */
  memo?: string;
}

/**
 * Parse a ZIP-321 payment URI into its components.
 * Handles both bare addresses and full zcash: URIs with query params.
 * Returns null if the input is not a zcash: URI (bare addresses pass through normalizeRecipientInput).
 */
export function parsePaymentUri(raw: string): ParsedPaymentUri | null {
  const trimmed = raw.trim();
  if (!/^zcash:/i.test(trimmed)) return null;

  // Strip the "zcash:" prefix (case-insensitive)
  const withoutScheme = trimmed.replace(/^zcash:/i, "");

  // Split address and query string
  const qIdx = withoutScheme.indexOf("?");
  const address = qIdx >= 0 ? withoutScheme.slice(0, qIdx).trim() : withoutScheme.trim();

  if (!address) return null;

  const result: ParsedPaymentUri = { address };

  if (qIdx < 0) return result;

  const queryString = withoutScheme.slice(qIdx + 1);
  const params = new URLSearchParams(queryString);

  // ZIP-321: amount is decimal ZEC
  const amountParam = params.get("amount");
  if (amountParam) {
    const parsed = parseFloat(amountParam);
    if (isFinite(parsed) && parsed > 0) {
      result.amount = amountParam;
    }
  }

  // ZIP-321: memo is base64url-encoded
  const memoParam = params.get("memo");
  if (memoParam) {
    try {
      // base64url → base64 → bytes → UTF-8
      const b64 = memoParam.replace(/-/g, "+").replace(/_/g, "/");
      const decoded = atob(b64);
      // Convert binary string to UTF-8 using TextDecoder
      const bytes = Uint8Array.from(decoded, (c) => c.charCodeAt(0));
      result.memo = new TextDecoder("utf-8", { fatal: false }).decode(bytes).trim();
    } catch {
      // ignore malformed base64; memo stays absent
    }
  }

  return result;
}
