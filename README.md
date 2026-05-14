# ZecVault

A privacy-first Zcash savings wallet. Set a goal, name it, save toward it — your keys stay on your device the whole time.

ZecVault wraps a full Zcash wallet (create, receive, send, sync) around a savings-goal layer called **vaults**. You name a vault, set a target amount and deadline, and deposit into it over time. The app tracks your progress and enforces a 24-hour cooldown before you can break a vault early, so you stay accountable to yourself.

It runs as a web app and as native desktop apps on Windows, macOS, and Linux — all from the same codebase.

---

## Getting started

You need **Node.js 20+** and **pnpm**.

```bash
git clone <repo>
cd zecvault
pnpm install
pnpm dev          # opens the web app at http://localhost:5173
```

That's it for the web UI. Wallet features (sync, send, receive) work in mock mode in the browser — you can click through the full app without a native build.

To run the desktop app:

```bash
# also requires Rust 1.87+ — see docs/platforms.md for system deps
pnpm dev:linux    # or dev:macos / dev:windows
```

---

## What's in the repo

```
apps/
  web/          The React app — all screens, routing, state
  linux/        Tauri desktop shell for Linux
  macos/        Tauri desktop shell for macOS
  windows/      Tauri desktop shell for Windows
  pwa/          PWA wrapper (same web app, installable)
  mobile/       React Native scaffold (future)
  ios/          iOS scaffold (future)
  android/      Android scaffold (future)
  browser-extension/  Extension scaffold (future)

packages/
  shared/       TypeScript types shared across apps
  config/       App ID and config values

docs/           All documentation (you're reading one)
scripts/        Version bump and other tooling
vendor/         Vendored Rust dependencies
```

The three desktop shells (`linux`, `macos`, `windows`) are thin wrappers around the same web app. The only thing different between them is the platform config — the wallet logic, UI, and routing are identical.

---

## How it works

The app has two layers:

**Frontend** — a React app built with Vite and TanStack Router. It handles all the UI, navigation, and state. When running in a desktop shell, it talks to the wallet backend via Tauri's IPC bridge.

**Wallet backend** — a Rust library compiled into each Tauri desktop app. It handles key generation, address derivation, syncing with the Zcash network (via lightwalletd), and building/broadcasting transactions. When running in the browser (no Tauri), wallet calls return mock data so the UI still works.

See [docs/architecture.md](docs/architecture.md) for a fuller picture of how these fit together.

---

## Common tasks

| Task | Command |
|---|---|
| Start web dev server | `pnpm dev` |
| Start Linux desktop | `pnpm dev:linux` |
| Build web app | `pnpm build` |
| Build Linux installer | `pnpm build:linux` |
| Build macOS app | `pnpm build:mac` |
| Build Windows installer | `pnpm build:win` |
| Lint | `pnpm lint` |
| Format | `pnpm format` |
| Bump version | `pnpm version:bump` |

---

## Contributing

The frontend lives in `apps/web/src/`. Most features you'd want to add or change are in `src/screens/` (the full-page views), `src/stores/` (app state), or `src/lib/` (pure utilities).

If you're touching wallet behaviour on desktop — sync, sending, receiving, key handling — that's in `apps/linux/src-tauri/src/lib.rs` (same file mirrored across the three desktop shells).

Before opening a PR:
- Run `pnpm lint` and `pnpm format`
- Test the feature in the browser (`pnpm dev`) for layout/flow
- If you changed Rust code, test the desktop build (`pnpm dev:linux` or platform of choice)

---

## Further reading

| Doc | What it covers |
|---|---|
| [docs/architecture.md](docs/architecture.md) | How the frontend and wallet backend connect |
| [docs/wallet-backend.md](docs/wallet-backend.md) | How sync, send, and key management work |
| [docs/vault-protocol.md](docs/vault-protocol.md) | How vaults work and how deposits are tracked |
| [docs/security.md](docs/security.md) | How keys and mnemonics are protected |
| [docs/user-flow.md](docs/user-flow.md) | Full onboarding and app navigation flow |
| [docs/platforms.md](docs/platforms.md) | Build and distribution notes per platform |
