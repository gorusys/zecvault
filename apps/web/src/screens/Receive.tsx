import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useSettings, useWalletStore } from "@/stores";
import { isTransparentReceiverAddress } from "@/lib/zcash-address";
import { Icon } from "@/components/Icon";
import { toast } from "@/stores/toast";
import { useWallet } from "@/hooks/useWallet";

type ReceivePreset =
  | "recommended"
  | "orchardOnly"
  | "saplingOnly"
  | "transparentOnly"
  | "orchardSapling"
  | "orchardTransparent"
  | "saplingTransparent"
  | "orchardSaplingTransparent";

const PRESET_LABEL: Record<ReceivePreset, string> = {
  recommended: "Unified (shielded-first)",
  orchardOnly: "Orchard only",
  saplingOnly: "Sapling only (unified)",
  transparentOnly: "Transparent (standalone)",
  orchardSapling: "Orchard + Sapling",
  orchardTransparent: "Orchard + transparent (UA)",
  saplingTransparent: "Sapling + transparent (UA)",
  orchardSaplingTransparent: "Orchard + Sapling + transparent (UA)",
};

const PRESET_HELP: Record<ReceivePreset, string> = {
  recommended:
    "Shielded-first UA (Orchard + Sapling). Sender picks Orchard or Sapling; funds never land in transparent from this string alone.",
  orchardOnly:
    "Orchard-only UA: best privacy vs known modern wallets; legacy senders may be unable to pay.",
  saplingOnly:
    "Sapling-only UA (or fallback zs1): for wallets that only support Sapling.",
  transparentOnly:
    "Classic transparent at this diversifier index. Funds sit in transparent UTXOs (public graph).",
  orchardSapling: "Same as default shielded-first UA at this diversifier index.",
  orchardTransparent:
    "UA with Orchard + transparent. Sender may pay Orchard, or transparent if they cannot shield.",
  saplingTransparent:
    "UA with Sapling + transparent. Sender may pay Sapling or transparent depending on their wallet.",
  orchardSaplingTransparent:
    "Maximum compatibility: Orchard + Sapling + transparent in one UA. Which pool you receive into depends on the sender’s wallet, not this string alone.",
};

interface AddressBlock {
  key: string;
  title: string;
  subtitle: string;
  addr: string;
  fallback?: boolean;
  kind: "ua" | "receiver";
}

export function Receive() {
  const expertAddressMode = useSettings((s) => s.expertAddressMode);
  const {
    unifiedAddress,
    orchardUnifiedAddress,
    saplingUnifiedAddress,
    unifiedOrchardTransparentAddress,
    unifiedSaplingTransparentAddress,
    unifiedAllAddress,
    saplingAddress,
    transparentAddress,
  } = useWalletStore();
  const applyWalletSnapshot = useWalletStore((s) => s.applyWalletSnapshot);
  const walletApi = useWallet();
  const [selectedPools, setSelectedPools] = useState({
    transparent: false,
    sapling: true,
    orchard: false,
  });
  const [copiedKey, setCopiedKey] = useState("");
  const [qrPreviewKey, setQrPreviewKey] = useState("");
  const [howReceivingOpen, setHowReceivingOpen] = useState(false);

  const addressesByPreset: Record<ReceivePreset, { addr: string; fallback: boolean }> = {
    recommended: { addr: unifiedAddress, fallback: false },
    orchardOnly: { addr: orchardUnifiedAddress || unifiedAddress, fallback: !orchardUnifiedAddress },
    saplingOnly: { addr: saplingUnifiedAddress || saplingAddress, fallback: !saplingUnifiedAddress },
    transparentOnly: { addr: transparentAddress, fallback: false },
    orchardSapling: { addr: unifiedAddress, fallback: false },
    orchardTransparent: {
      addr: unifiedOrchardTransparentAddress || transparentAddress,
      fallback: !unifiedOrchardTransparentAddress,
    },
    saplingTransparent: {
      addr: unifiedSaplingTransparentAddress || saplingAddress,
      fallback: !unifiedSaplingTransparentAddress,
    },
    orchardSaplingTransparent: { addr: unifiedAllAddress || unifiedAddress, fallback: !unifiedAllAddress },
  };

  const baseBlocks: AddressBlock[] = [
    {
      key: "private",
      title: "Private (shielded)",
      subtitle: "Recommended for most users",
      addr: unifiedAddress,
      kind: "receiver",
    },
    {
      key: "public",
      title: "Public (transparent)",
      subtitle: "Use only when sender/exchange requires it",
      addr: transparentAddress,
      kind: "receiver",
    },
  ];
  const expertPreset: ReceivePreset = selectedPools.transparent
    ? selectedPools.sapling
      ? selectedPools.orchard
        ? "orchardSaplingTransparent"
        : "saplingTransparent"
      : selectedPools.orchard
        ? "orchardTransparent"
        : "transparentOnly"
    : selectedPools.sapling
      ? selectedPools.orchard
        ? "orchardSapling"
        : "saplingOnly"
      : "orchardOnly";

  const presetUnifiedAddr = addressesByPreset[expertPreset].addr;
  const hideUnifiedWhenSameAsTransparent =
    isTransparentReceiverAddress(transparentAddress) && presetUnifiedAddr === transparentAddress;

  const expertTabBlocks: AddressBlock[] = [
    ...(hideUnifiedWhenSameAsTransparent
      ? []
      : [
          {
            key: `expert-${expertPreset}-ua`,
            title: "Unified address",
            subtitle: PRESET_HELP[expertPreset],
            addr: presetUnifiedAddr,
            fallback: addressesByPreset[expertPreset].fallback,
            kind: "ua" as const,
          },
        ]),
    {
      key: `expert-${expertPreset}-orchard-only`,
      title: "Orchard-only address",
      subtitle: "Unified address with Orchard receiver only",
      addr: orchardUnifiedAddress || unifiedAddress,
      fallback: !orchardUnifiedAddress,
      kind: "ua",
    },
    {
      key: `expert-${expertPreset}-sapling`,
      title: "Sapling address",
      subtitle: "Standalone Sapling receiver (zs-address)",
      addr: saplingAddress,
      kind: "receiver",
    },
    {
      key: `expert-${expertPreset}-transparent`,
      title: "Transparent address",
      subtitle: "Standalone transparent receiver (t-address)",
      addr: transparentAddress,
      kind: "receiver",
    },
  ];
  useEffect(() => {
    if (unifiedAddress) return;
    void walletApi.getAddress().then((ua) => {
      if (!ua) return;
      applyWalletSnapshot({
        network: "mainnet",
        walletFingerprint: "",
        unifiedAddress: ua,
        orchardUnifiedAddress: "",
        saplingUnifiedAddress: "",
        unifiedOrchardTransparentAddress: "",
        unifiedSaplingTransparentAddress: "",
        unifiedAllAddress: "",
        saplingAddress: saplingAddress || "",
        transparentAddress: transparentAddress || "",
        createdAtTs: Math.floor(Date.now() / 1000),
        birthdayHeight: 419_200,
      });
    });
  }, [applyWalletSnapshot, saplingAddress, transparentAddress, unifiedAddress, walletApi]);

  function copy(label: string, value: string) {
    navigator.clipboard?.writeText(value);
    setCopiedKey(label);
    toast({ type: "success", title: "Address copied" });
    setTimeout(() => setCopiedKey(""), 2000);
  }

  function togglePool(pool: "transparent" | "sapling" | "orchard") {
    setSelectedPools((prev) => {
      const next = { ...prev, [pool]: !prev[pool] };
      if (!next.transparent && !next.sapling && !next.orchard) {
        return prev;
      }
      return next;
    });
  }

  return (
    <div className="fade-in">
      <h1 className="t-h1" style={{ marginBottom: 24 }}>Receive ZEC</h1>
      <div className="card" style={{ padding: 24 }}>
        <div style={{ marginBottom: 14, color: "var(--gray-600)", fontSize: 13 }}>
          Pick one mode, copy, and share. Most users should use <strong>Private</strong>.
        </div>
        <div
          style={{
            marginBottom: 16,
            background: "var(--gray-25)",
            border: "1px solid var(--gray-100)",
            borderRadius: "var(--r-md)",
            textAlign: "left",
            overflow: "hidden",
          }}
        >
          <button
            type="button"
            className="btn btn-ghost"
            aria-expanded={howReceivingOpen}
            onClick={() => setHowReceivingOpen((o) => !o)}
            style={{
              width: "100%",
              height: "auto",
              minHeight: 44,
              padding: "12px 14px",
              borderRadius: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              textAlign: "left",
              fontWeight: 600,
              color: "var(--gray-800)",
            }}
          >
            <span className="t-body-med" style={{ flex: 1, minWidth: 0 }}>
              How receiving works on Zcash
            </span>
            <span
              aria-hidden
              style={{
                display: "flex",
                flexShrink: 0,
                color: "var(--gray-500)",
                transition: "transform 160ms ease",
                transform: howReceivingOpen ? "rotate(90deg)" : "rotate(0deg)",
              }}
            >
              <Icon name="chevron-right" size={18} />
            </span>
          </button>
          {howReceivingOpen && (
            <div style={{ padding: "0 14px 14px", borderTop: "1px solid var(--gray-100)" }}>
              <ul className="t-caption text-gray-600" style={{ margin: "10px 0 0", paddingLeft: 18, lineHeight: 1.55 }}>
                <li>
                  <strong>Transparent (t…):</strong> funds land in transparent UTXOs — low privacy, common for exchanges.
                </li>
                <li>
                  <strong>Sapling (zs…):</strong> funds land in the Sapling shielded pool.
                </li>
                <li>
                  <strong>Orchard-only UA (u… with Orchard only):</strong> funds land in Orchard when the sender supports it.
                </li>
                <li>
                  <strong>Unified with several receivers:</strong> the <em>sender’s</em> wallet chooses which embedded receiver it can pay (often Orchard, else Sapling, else transparent). The same UA string can therefore credit Orchard, Sapling, or transparent depending on them, not you.
                </li>
                <li>
                  <strong>Guidance:</strong> share the full Orchard+Sapling+transparent UA for max compatibility; Orchard-only UA for max privacy with modern peers; standalone transparent only when the other party requires it.
                </li>
              </ul>
            </div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
          {baseBlocks.map((item) => (
            <div key={item.key} style={{ border: "1px solid var(--gray-100)", borderRadius: "var(--r-md)", padding: 14, display: "flex", flexDirection: "column", minHeight: 460 }}>
              <div className="t-body-med">{item.title}</div>
              <div className="t-caption text-gray-400" style={{ marginTop: 2 }}>{item.subtitle}</div>
              <div style={{ display: "flex", justifyContent: "center", marginTop: 10 }}>
                <div style={{ padding: 8, background: "#fff", border: "1px solid var(--gray-100)", borderRadius: "var(--r-md)" }}>
                  <QRCodeSVG value={item.addr || "u1"} size={180} marginSize={2} bgColor="#FFFFFF" fgColor="#1A1A18" />
                </div>
              </div>
              <div className="t-mono text-gray-600" style={{ marginTop: 10, padding: 10, background: "var(--gray-25)", border: "1px solid var(--gray-100)", borderRadius: "var(--r-md)", wordBreak: "break-all", minHeight: 86 }}>
                {item.addr}
              </div>
              <button className="btn btn-primary btn-block" style={{ marginTop: "auto" }} onClick={() => copy(item.key, item.addr)}>
                {copiedKey === item.key ? <><Icon name="check" size={16} /> Copied</> : <><Icon name="copy" size={16} /> Copy {item.title}</>}
              </button>
            </div>
          ))}
        </div>

        {expertAddressMode && (
          <>
            <div style={{ marginTop: 18, marginBottom: 8, fontSize: 12, fontWeight: 700, color: "var(--gray-800)" }}>
              Expert: tab-based address combinations
            </div>
            <div style={{ marginBottom: 10, color: "var(--gray-600)", fontSize: 12 }}>
              Multi-select pools to see the UA variant for that combination. Rows below are for comparison; old senders may only support a subset of receivers.
            </div>
            <div className="hstack gap-4" style={{ background: "var(--gray-25)", border: "1px solid var(--gray-100)", borderRadius: "var(--r-pill)", padding: 4, justifyContent: "center", marginBottom: 12, flexWrap: "wrap" }}>
              {([
                ["transparent", "Transparent"],
                ["sapling", "Sapling"],
                ["orchard", "Orchard"],
              ] as const).map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => togglePool(value)}
                  style={{
                    padding: "6px 16px",
                    borderRadius: "var(--r-pill)",
                    fontSize: 11,
                    fontWeight: 700,
                    background: selectedPools[value] ? "var(--success-strong)" : "transparent",
                    color: selectedPools[value] ? "#FFFFFF" : "var(--gray-600)",
                    transition: "all 150ms",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div style={{ textAlign: "left", marginBottom: 10, fontSize: 12, color: "var(--gray-600)" }}>
              <strong>{PRESET_LABEL[expertPreset]}:</strong> {PRESET_HELP[expertPreset]}
            </div>
            <div style={{ border: "1px solid var(--gray-100)", borderRadius: "var(--r-md)", overflow: "hidden" }}>
              {expertTabBlocks.map((item) => (
                <div key={item.key} style={{ padding: "12px 14px", borderBottom: "1px solid var(--gray-100)" }}>
                  <div className="hstack between" style={{ alignItems: "center", gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div className="t-body-med">{item.title}</div>
                      <div className="t-caption text-gray-400" style={{ marginTop: 2 }}>{item.subtitle}</div>
                    </div>
                    <div className="hstack gap-6">
                      <button className="btn btn-ghost" style={{ height: 30, width: 30, padding: 0 }} onClick={() => setQrPreviewKey(qrPreviewKey === item.key ? "" : item.key)} title="Show QR">
                        <Icon name="qr" size={16} />
                      </button>
                      <button className="btn btn-ghost" style={{ height: 30, width: 30, padding: 0 }} onClick={() => copy(item.key, item.addr)} title="Copy">
                        {copiedKey === item.key ? <Icon name="check" size={16} /> : <Icon name="copy" size={16} />}
                      </button>
                    </div>
                  </div>
                  {item.fallback && (
                    <div style={{ marginTop: 8, color: "var(--coral-400)", fontSize: 12 }}>
                      Showing closest compatible fallback for this variant.
                    </div>
                  )}
                  <div className="t-mono text-gray-600" style={{ marginTop: 8, wordBreak: "break-all" }}>
                    {item.addr}
                  </div>
                  {qrPreviewKey === item.key && (
                    <div style={{ marginTop: 10, display: "flex", justifyContent: "center" }}>
                      <div style={{ padding: 8, background: "#fff", border: "1px solid var(--gray-100)", borderRadius: "var(--r-md)" }}>
                        <QRCodeSVG value={item.addr || "u1"} size={160} marginSize={2} bgColor="#FFFFFF" fgColor="#1A1A18" />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
