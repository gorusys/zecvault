# iOS

Ways to ship the same product on iOS:

1. **Tauri 2 mobile** — extend **`apps/desktop`** (same Rust) with the [Tauri iOS](https://v2.tauri.app/distribute/macos-and-ios/) workflow; generated Xcode project often lives under `src-tauri/gen` / Apple targets.
2. **Capacitor** — from `../web` build, run `npx cap add ios` and open the `ios/` folder here (or a subfolder) in Xcode.
3. **Expo / React Native** — use `../mobile` and keep shared logic in `packages/shared`.

This directory holds **iOS-only** config (Xcode project layout, `Info.plist` snippets, entitlements) once you pick an approach. Until then it is a placeholder for the monorepo layout.

## Prereqs

- macOS with **Xcode** and Apple Developer account for device/TestFlight.
