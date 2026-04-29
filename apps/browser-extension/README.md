# Browser extension (Chromium, Firefox, Edge, Safari)

Recommended scaffolds:

- **[WXT](https://wxt.dev/)** — `npx wxt@latest init` in this directory (Vite, MV3, great DX).
- **[Plasmo](https://www.plasmo.com/)** — `npx plasmo init` for React-first extensions.

**Sharing code with the main app:** depend on `@zecvault/web` only for **extracted** UI/logic, or add `@zecvault/shared` and copy minimal wallet flows (extensions often need a different security model; avoid pulling the full TanStack server bundle into the background script).

**Manifest** — use MV3 for Chrome/Edge; Firefox supports MV3 with some flags; Safari needs Xcode + “Safari Web Extension” conversion for App Store.

## Next steps

1. Run a framework init in this folder.
2. Add `web_accessible_resources` and **CSP** for your ZEC / RPC usage.
3. List in Chrome Web Store / AMO (Firefox) / Edge Add-ons with store-specific assets under `store/`.
