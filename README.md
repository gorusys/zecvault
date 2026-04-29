# ZecVault monorepo

ZEC-focused vault application with a shared web core and Tauri desktop shells for Windows, macOS, and Linux.

## Layout

### Apps

| Path | Role |
|------|------|
| `apps/web` | Main React app (Vite + TanStack Start). Builds client and server outputs. Desktop builds use prerendered client pages. |
| `apps/windows` | Primary Tauri desktop shell (Windows). Also the baseline mirrored into macOS/Linux shells. |
| `apps/macos` | Tauri shell for macOS (same app flow and UI as Windows). |
| `apps/linux` | Tauri shell for Linux (same app flow and UI as Windows). |
| `apps/pwa` | PWA placeholder/build wrapper. |
| `apps/browser-extension` | Browser extension scaffold. |
| `apps/ios` | iOS scaffold. |
| `apps/android` | Android scaffold. |
| `apps/mobile` | React Native/Expo scaffold (optional alternative mobile path). |

### Shared packages

| Path | Role |
|------|------|
| `packages/shared` | Shared types/utils (`@zecvault/shared`). |
| `packages/config` | Shared config contract (`@zecvault/config`). |
| `packages/assets` | Shared brand assets/placeholders. |

## Prerequisites

- Node 20+ (LTS), npm workspaces enabled.
- Rust toolchain + platform prerequisites for Tauri:
  - Windows: MSVC + WebView2 runtime.
  - macOS: Xcode command line tools.
  - Linux: distro libs required by Tauri/WebKitGTK.

## Commands (from repo root)

```bash
npm install
npm run dev                # web app
npm run build              # web production build
npm run lint
npm run format
```

Desktop dev:

```bash
npm run dev:windows
npm run dev:macos
npm run dev:linux
```

Desktop builds:

```bash
npm run build:win
npm run build:mac
npm run build:linux
```

Workspace-scoped examples:

```bash
npm run build -w @zecvault/web
npm run dev -w @zecvault/windows
npm run tauri:build -w @zecvault/windows -- --no-bundle
```

## Environment

Put `.env` / `VITE_*` files next to `apps/web` (`envDir` points to `apps/web`).

## Product flow docs

- User flow diagram: `docs/user-flow.md`
- Platform notes: `docs/platforms.md`

## Notes

- Desktop shells (`windows`, `macos`, `linux`) are aligned to the same UI/UX and routing behavior.
- For desktop builds, the web app uses a desktop build mode (`build:desktop`) with prerendered client pages.
- If project path changes cause stale cargo artifacts, run `cargo clean` in the target app’s `src-tauri` folder.
