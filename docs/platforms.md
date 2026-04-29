# Platform directory map

| Directory | What ships | Primary tooling |
|-----------|------------|-----------------|
| `apps/web` | Web app + Worker (SSR) | Vite, TanStack Start, Wrangler |
| `apps/desktop` | Windows / macOS / Linux desktop | Tauri 2 |
| `apps/pwa` | Installable PWA (same app as web) | Manifest + (future) `vite-plugin-pwa` in web |
| `apps/windows` | Windows Store, WinGet, MSIX (extras) | MSIX, Partner Center, alongside Tauri output |
| `apps/macos` | Notarization, App Store, entitlements (extras) | `notarytool`, App Store Connect |
| `apps/linux` | Flathub, custom Flatpak / AppImage | `flatpak-builder` |
| `apps/browser-extension` | Chrome, Firefox, Edge, Safari (WebExt) | WXT or Plasmo |
| `apps/ios` | iOS | Tauri mobile, Capacitor, or native |
| `apps/android` | Android | Tauri mobile, Capacitor, or native |
| `apps/mobile` | Optional RN/Expo iOS+Android in one project | Expo / React Native |
| `packages/shared` | Shared TypeScript | — |
| `packages/config` | Shared id / config contract | — |
| `packages/assets` | Cross-app assets | — |

Choose **one** path for iOS+Android in production (Tauri, Cap, or `apps/mobile`) to avoid three competing shells.
