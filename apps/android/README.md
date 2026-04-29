# Android

Ways to ship on Android:

1. **Tauri 2 mobile** — [Tauri Android](https://v2.tauri.app/distribute/android/) alongside **`apps/desktop`**; Gradle and Kotlin outputs typically under `src-tauri/gen/android` for that project.
2. **Capacitor** — build `../web`, then `npx cap add android` and use Android Studio on the generated `android/` (you can symlink or set output dir into this tree).
3. **Expo / React Native** — use **`../mobile`**.

Place **keystore** references, `google-services.json` (if Firebase), and ProGuard rules here in subfolders as your setup solidifies. Do not commit real secrets; use environment-specific files and `.gitignore`.

## Prereqs

- **Android Studio**, SDK, and ideally a keystore for Play release.
