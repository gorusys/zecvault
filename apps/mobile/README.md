# Mobile (React Native / Expo / future native)

Use this package when the **iOS and Android** apps are **one** cross-platform mobile codebase (not only Tauri).

Typical path:

1. `npx create-expo-app@latest .` **here** (or `npx @react-native-community/cli init` if you need bare workflow).
2. Add a workspace dependency: `"@zecvault/shared": "0.0.0"` (match `packages/shared` version in the root **npm** workspaces).
3. Share types and pure logic from `packages/shared`; reimplement any web-only APIs behind small adapters.

**Alternatives** — Tauri for **iOS and Android** may live in **`apps/desktop`** with mobile targets, or in **`../ios` / `../android`** for Capacitor wrapping **`../web`**. Pick one strategy to avoid three competing shells.

## Prereqs

- **Expo** — Node, `eas-cli` for E2E builds; **Apple** and **Google Play** console accounts for release.
