# Platforms

ZecVault runs on web, desktop (Windows, macOS, Linux), and has scaffolds for mobile and browser extensions. This page covers how to build and distribute each target.

---

## Web

The web app is the shared frontend used by all platforms. It runs standalone in a browser (wallet features use mock data) or embedded in a Tauri desktop shell (wallet features use the real Rust backend).

```bash
pnpm dev       # dev server at localhost:5173
pnpm build     # production build (Cloudflare Workers)
pnpm preview   # preview the production build locally
```

The web build deploys to Cloudflare Workers using the Cloudflare Vite plugin. The same app also ships as a PWA — add it to your home screen from the browser for an installable experience.

---

## Desktop (Linux, macOS, Windows)

All three desktop builds share the same wallet backend code (`src-tauri/src/lib.rs`). The Rust source is identical across the three shells — only the Tauri config (window chrome, app identifier, icon paths) differs.

### Prerequisites

Install the [Rust toolchain](https://rustup.rs/) (1.87+) and Tauri's platform prerequisites:

**Linux:**
```bash
sudo apt-get install libwebkit2gtk-4.1-dev libgtk-3-dev \
  libappindicator3-dev librsvg2-dev patchelf
```

**macOS:** Install Xcode command line tools:
```bash
xcode-select --install
```

**Windows:** Install Visual Studio Build Tools 2022 with the "Desktop development with C++" workload. WebView2 ships with Windows 11; on Windows 10 it installs automatically via a bootstrapper bundled with the app.

### Running in dev mode

```bash
pnpm dev:linux
pnpm dev:macos
pnpm dev:windows
```

This starts the Vite dev server and the Tauri app together. The app connects to localhost for the frontend and uses the native wallet backend for all wallet operations.

### Building installers

```bash
pnpm build:linux    # .deb, .rpm, .AppImage
pnpm build:mac      # .dmg, .app
pnpm build:win      # .msi, .exe
```

Each command first builds the web frontend in desktop mode (prerendered static HTML, so no dev server is needed at runtime), then compiles the Tauri app.

Output lands in `apps/<platform>/src-tauri/target/release/bundle/`.

### Stale build artifacts

If you move the repo or rename a directory and the build fails, clear the Rust build cache:

```bash
cd apps/linux/src-tauri && cargo clean
```

---

## Distribution

### Linux

The build produces an AppImage, `.deb`, and `.rpm`. For Flathub submission, use the AppImage as the source for a Flatpak manifest, or build inside a Flatpak sandbox using `flatpak-builder`.

### macOS

Apple requires apps distributed outside the App Store to be notarized. Use `xcrun notarytool` with an Apple Developer ID certificate to notarize the `.dmg` before distributing. For Mac App Store submission, additional sandbox entitlements are required in the Tauri config.

### Windows

The build produces `.msi` (WiX installer) and `.exe` (NSIS). For WinGet and the Microsoft Store, you'll need an Authenticode code signing certificate. MSIX packaging (required for Partner Center submission) can be produced from the `.msi` output.

---

## PWA

The PWA is the web app with a Web App Manifest attached. It doesn't use the native wallet backend — all wallet operations fall back to mock mode. To build it:

```bash
pnpm build:pwa
```

---

## Browser extension (`apps/browser-extension`)

Scaffold only — not yet functional. The intended approach is [WXT](https://wxt.dev) or [Plasmo](https://plasmo.com) targeting Chrome, Firefox, Edge, and Safari (WebExtension API). The background script will proxy wallet requests to a content-script message channel.

---

## Mobile (`apps/ios`, `apps/android`, `apps/mobile`)

Three scaffold paths exist. Pick one for production — running all three would mean maintaining competing shells:

| Path | Approach | Notes |
|---|---|---|
| `apps/ios` + `apps/android` | Tauri mobile or Capacitor | Can share the Rust wallet backend with desktop |
| `apps/mobile` | Expo / React Native | Simpler to start; wallet backend would need to be re-implemented or wrapped separately |

The Tauri mobile path is the best choice for feature parity with desktop (offline signing, native OS keyring, full sync). It reuses the same `lib.rs` wallet backend.

---

## Environment variables

Put `.env` files in `apps/web/` — Vite resolves `VITE_*` variables from there.

| Variable | What it does |
|---|---|
| `VITE_LIGHTWALLETD_URL` | Override the default lightwalletd URL in the web build |
| `ZEC_DESKTOP_BUILD` | Set to `1` by desktop build scripts; switches to prerender mode |
