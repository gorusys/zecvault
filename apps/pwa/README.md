# PWA (Progressive Web App)

The app shell lives in **`../web`**. This folder is the home for PWA-only assets and notes:

- `public/` — add `manifest.webmanifest`, **icons** (192/512, maskable), and optional `offline` artwork.
- Enable **`vite-plugin-pwa`** (or workbox) in `apps/web/vite.config.ts` and point the manifest to files here, or colocate `manifest` in `public/` under `web`.

`npm run build` in this package runs the same production build as `@zecvault/web`.

## Next steps

1. Add `vite-plugin-pwa` in `apps/web` (or PWA Vite config that extends the web app).
2. Add install prompts / update flows in the React app if you want “Add to Home Screen”.
