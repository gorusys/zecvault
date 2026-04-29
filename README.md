# ZecVault monorepo

ZEC-focused vault UI with a clear split between the **web** app (Vite, TanStack Start, Cloudflare Workers) and the **desktop** shell (Tauri 2 on Windows, macOS, and Linux from the same codebase). Shared TypeScript can live in `packages/shared` and be consumed with `@zecvault/shared`.

## Layout

### Apps (by platform / shell)

| Path | Role |
|------|------|
| `apps/web` | **Web + Cloudflare Worker** — React, Vite, TanStack, Wrangler, `@cloudflare/vite-plugin`. Produces `dist/client` + `dist/server`. |
| `apps/desktop` | **Desktop (Tauri 2, Win/macOS/Linux)** — dev loads Vite; release spawns `node` + bundled Wrangler. |
| `apps/pwa` | **PWA** — manifest, icons, service-worker notes; build delegates to `apps/web` until you add `vite-plugin-pwa` there. |
| `apps/windows` | **Windows extras** — MSIX, Microsoft Store, WinGet manifests; primary installers still from Tauri in `apps/desktop`. |
| `apps/macos` | **macOS extras** — notarization, entitlements, App Store, Sparkle; primary `.app`/`.dmg` from Tauri in `apps/desktop`. |
| `apps/linux` | **Linux extras** — Flatpak, AppImage recipes outside Tauri’s default bundling. |
| `apps/browser-extension` | **Chromium / Firefox / Edge / Safari (WebExt)** — scaffold with WXT or Plasmo (see `README` inside). |
| `apps/ios` | **iOS** — Tauri mobile, Capacitor, or native; placeholder until you add an Xcode / Cap layout. |
| `apps/android` | **Android** — Tauri mobile, Capacitor, or native; placeholder until you add Gradle project. |
| `apps/mobile` | **React Native / Expo (optional)** — one RN codebase for iOS+Android; alternative to Tauri mobile + Cap. |

### Shared packages

| Path | Role |
|------|------|
| `packages/shared` | Types and pure utils — `@zecvault/shared`. |
| `packages/config` | Shared app id / env contract — `@zecvault/config`. |
| `packages/assets` | Fonts, universal icons, brand (referenced from apps). |
| (root) | Workspaces, ESLint, Prettier, and scripts. |

**Platforms**

- **Web** — `apps/web` (deploy to Cloudflare or any compatible host).
- **PWA** — `apps/pwa` + PWA config in `apps/web`.
- **Desktop** — `apps/desktop` (Tauri).
- **Windows / macOS / Linux** store & packaging** — `apps/windows`, `apps/macos`, `apps/linux` layer on top of Tauri when needed.
- **Browser** — `apps/browser-extension` (WXT/Plasmo, MV3).
- **iOS / Android** — `apps/ios` + `apps/android` (Tauri, Cap, or `apps/mobile` for React Native/Expo); keep shared code in `packages/*`.

## Prereqs

- Node 20+ (LTS) and **npm 9+** (workspaces).
- [Rust / MSVC](https://tauri.app/guides/getting-started/prerequisites/) for Tauri.
- (Desktop release) `node` on the machine; Wrangler is bundled from the repo’s `node_modules` into the app resource folder.

## Commands (run from the repository root)

```bash
npm install
npm run dev              # Vite + TanStack Start in apps/web (port 5173)
npm run build            # production web build
npm run dev:desktop      # Tauri: starts web dev, opens desktop window
npm run build:win        # build web, then tauri build (MSI/NSIS, etc. on Windows)
npm run lint
npm run format
```

Workspace-scoped:

```bash
npm run build -w @zecvault/web
npm run dev  -w @zecvault/desktop
```

Tauri is always run from `apps/desktop` (see `package.json` there) so that `tauri.conf.json` and `src-tauri` paths resolve correctly.

## Environment

Put `.env` / `VITE_*` files next to `apps/web` (Vite is configured with `envDir: apps/web`).

## Notes

- The first Tauri `cargo` build under `apps/desktop` should use a **clean** `src-tauri/target` if the project was ever moved; run `cargo clean` in `apps/desktop/src-tauri` if you see path errors.
- `build:win` on Windows can hit file locks on `app.exe` (antivirus, Explorer, etc.); close locks and re-run the bundle step if needed.
