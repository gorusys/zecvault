import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useWalletStore } from "@/stores";
import { Icon } from "@/components/Icon";
import { toast } from "@/stores/toast";
import { useWallet } from "@/hooks/useWallet";

export function Receive() {
  const { unifiedAddress, saplingAddress, transparentAddress } = useWalletStore();
  const applyWalletSnapshot = useWalletStore((s) => s.applyWalletSnapshot);
  const walletApi = useWallet();
  const [type, setType] = useState<"unified" | "sapling" | "transparent">("unified");
  const addr = type === "unified" ? unifiedAddress : type === "sapling" ? saplingAddress : transparentAddress;
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (unifiedAddress) return;
    void walletApi.getAddress().then((ua) => {
      if (!ua) return;
      applyWalletSnapshot({
        network: "mainnet",
        walletFingerprint: "",
        unifiedAddress: ua,
        saplingAddress: saplingAddress || "",
        transparentAddress: transparentAddress || "",
        createdAtTs: Math.floor(Date.now() / 1000),
        birthdayHeight: 419_200,
      });
    });
  }, [applyWalletSnapshot, saplingAddress, transparentAddress, unifiedAddress]);

  function copy() {
    navigator.clipboard?.writeText(addr);
    setCopied(true);
    toast({ type: "success", title: "Address copied" });
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fade-in" style={{ maxWidth: 440, margin: "0 auto" }}>
      <h1 className="t-h1" style={{ marginBottom: 24 }}>Receive ZEC</h1>
      <div className="card" style={{ padding: 32, textAlign: "center" }}>
        <div className="hstack gap-4" style={{ background: "var(--gray-25)", border: "1px solid var(--gray-100)", borderRadius: "var(--r-pill)", padding: 4, justifyContent: "center", marginBottom: 24 }}>
          {(["unified", "sapling", "transparent"] as const).map((t) => (
            <button type="button" key={t} onClick={() => setType(t)}
              style={{
                padding: "6px 14px", borderRadius: "var(--r-pill)", fontSize: 12, fontWeight: 600,
                background: type === t ? "var(--coral-400)" : "transparent",
                color: type === t ? "#FFFFFF" : "var(--gray-600)",
                transition: "all 150ms",
              }}>{t === "unified" ? "Unified" : t === "sapling" ? "Sapling" : "Transparent"}</button>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 4 }}>
          <div style={{ padding: 10, background: "#fff", border: "1px solid var(--gray-100)", borderRadius: "var(--r-md)" }}>
            <QRCodeSVG value={addr || "u1"} size={220} marginSize={2} bgColor="#FFFFFF" fgColor="#1A1A18" />
          </div>
        </div>
        <h3 className="t-h3" style={{ marginTop: 16 }}>Your Zcash address</h3>
        <div className="t-mono text-gray-600" style={{ marginTop: 12, padding: 12, background: "var(--gray-25)", border: "1px solid var(--gray-100)", borderRadius: "var(--r-md)", wordBreak: "break-all", textAlign: "left" }}>
          {addr}
        </div>
        <button className="btn btn-primary btn-lg btn-block" style={{ marginTop: 16 }} onClick={copy}>
          {copied ? <><Icon name="check" size={16} /> Copied</> : <><Icon name="copy" size={16} /> Copy address</>}
        </button>
      </div>
    </div>
  );
}
