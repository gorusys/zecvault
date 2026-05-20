import { useState } from "react";
import { deriveAddressAlias } from "@/lib/zcash-address";
import { Icon } from "@/components/Icon";
import { toast } from "@/stores/toast";
import { useSettings } from "@/stores";

interface AddressAliasProps {
  address: string;
}

export function AddressAlias({ address }: AddressAliasProps) {
  const [copied, setCopied] = useState(false);
  const showVerificationPhrase = useSettings((s) => s.showVerificationPhrase);

  if (!address || !showVerificationPhrase) return null;

  const alias = deriveAddressAlias(address);

  function copyAlias() {
    navigator.clipboard?.writeText(alias);
    setCopied(true);
    toast({ type: "success", title: "Verification phrase copied" });
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      style={{
        marginTop: 8,
        padding: "7px 10px",
        background: "var(--gray-25)",
        border: "1px solid var(--gray-100)",
        borderRadius: "var(--r-sm)",
      }}
    >
      <div
        className="hstack between"
        style={{ alignItems: "center", marginBottom: 4 }}
      >
        <span
          className="t-caption text-gray-600"
          style={{ display: "flex", alignItems: "center", gap: 4 }}
          title="4-word verification phrase — share this alongside your address to help the payer confirm they have the right address. Derived locally; never sent over the network."
        >
          Verification phrase
          <span
            aria-label="What is this?"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 14,
              height: 14,
              borderRadius: "50%",
              background: "var(--gray-100)",
              color: "var(--gray-600)",
              fontSize: 9,
              fontWeight: 700,
              cursor: "help",
              flexShrink: 0,
            }}
          >
            ?
          </span>
        </span>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ height: 22, padding: "0 6px", gap: 4, fontSize: 11 }}
          onClick={copyAlias}
          title="Copy verification phrase"
        >
          {copied ? (
            <Icon name="check" size={12} />
          ) : (
            <Icon name="copy" size={12} />
          )}
        </button>
      </div>
      <div
        className="t-mono"
        style={{
          color: "var(--gray-800)",
          fontSize: "0.88em",
          letterSpacing: "0.03em",
        }}
      >
        {alias}
      </div>
    </div>
  );
}
