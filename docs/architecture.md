# Architecture

ZecVault is split into two layers: a **React frontend** that handles all the UI, and a **Rust wallet backend** that handles all the cryptography and network communication. On desktop, they talk to each other through Tauri's IPC bridge. In the browser, the frontend runs alone with mock wallet data.

---

## The two layers

```
┌──────────────────────────────────┐
│          React frontend          │
│   (screens, state, routing)      │
│                                  │
│  talks to wallet via invoke()    │
└────────────┬─────────────────────┘
             │  Tauri IPC
             │  (only on desktop)
┌────────────▼─────────────────────┐
│        Rust wallet backend       │
│  (keys, sync, sign, broadcast)   │
│                                  │
│  talks to lightwalletd via gRPC  │
└────────────┬─────────────────────┘
             │  gRPC over TLS
             │
┌────────────▼─────────────────────┐
│         lightwalletd             │
│  (Zcash network gateway)         │
└──────────────────────────────────┘
```

The frontend never touches private keys or mnemonics directly. All sensitive operations happen in the Rust layer.

---

## Frontend

The frontend is a standard React SPA with file-based routing (TanStack Router). State is managed in Zustand stores that persist to `localStorage`. There are three stores:

**Wallet store** — tracks the active wallet's addresses, balance (per pool: Orchard, Sapling, transparent), sync progress, and transaction history.

**Vault store** — tracks savings goals: their name, target amount, deposits, progress, and status (active, breaking, complete, archived).

**Settings store** — user preferences: theme, currency, the lightwalletd server URL, network (mainnet/testnet), and feature flags like expert address mode.

When the app is running in desktop mode, the wallet store stays in sync with the Rust backend via two mechanisms:
- **IPC calls** — the frontend calls the backend to get balances, trigger a sync, or broadcast a transaction.
- **Tauri events** — the backend pushes sync progress and balance updates to the frontend as they happen.

When running in a browser (no Tauri), all wallet IPC calls fall back to returning empty/mock data. The full UI is still navigable and testable.

---

## Wallet backend (Rust)

The wallet backend is compiled into each Tauri desktop shell. It manages:

- **Keys** — generating, encrypting, and storing BIP39 mnemonics and derived spending keys
- **Addresses** — deriving unified (shielded), Sapling, and transparent addresses from the seed
- **Sync** — downloading compact blocks from lightwalletd and scanning them for notes belonging to the wallet
- **Spending** — building, signing, and broadcasting transactions to lightwalletd

The backend uses the official ECC Rust SDK (`zcash_client_backend`, `zcash_client_sqlite`, `zcash_keys`) and stores wallet data in a SQLite database managed by those libraries. See [wallet-backend.md](wallet-backend.md) for how each of these pieces works.

---

## How a sync works

When the user opens the app (or the sidebar triggers a refresh), the frontend calls `start_sync`. The backend:

1. Connects to lightwalletd and asks for the latest block height
2. Downloads compact blocks in batches (10,000 at a time)
3. After each batch, scans for notes belonging to the wallet and updates balances
4. Pushes a `sync-progress` event to the frontend so the UI can show progress
5. When done, emits `sync-complete` and the frontend refreshes balances

The sync is serialised — if a sync is already running, a second call waits rather than spawning a parallel one.

---

## How a send works

Sending ZEC is a two-step process, which gives the user a chance to review the fee before committing:

1. **Preview** — the backend builds a proposed transaction without broadcasting it, and returns the exact fee
2. **Execute** — the frontend shows the user the fee and recipient, and on confirmation, passes the proposal back to the backend to sign and broadcast

If the user doesn't have enough shielded balance but has transparent funds, the app offers to shield those funds first (moving them from the transparent pool to Orchard), then retry the send.

---

## State and persistence

| Store | Persisted to | Notes |
|---|---|---|
| Wallet store | `localStorage` | Addresses, balances, tx history, sync state |
| Vault store | `localStorage` | Vault goals, contributions, status |
| Settings store | `localStorage` | Preferences, lightwalletd URL, network |
| Wallet records | App data directory | Encrypted mnemonics, SQLite wallet DBs |

The mnemonic and private keys are **only** in the Rust layer (encrypted on disk). `localStorage` never contains any secret material — only addresses and balances, which are not sensitive.

---

## Adding a new feature

**New screen or UI change** — look in `apps/web/src/screens/`. Routes are in `apps/web/src/routes/`.

**New wallet behaviour** — the Rust backend exposes commands via `#[tauri::command]` functions. Add the command in `lib.rs`, register it in `tauri::Builder`, then call it from the frontend with `invoke("command_name", args)`. The `useWallet` hook in `apps/web/src/hooks/useWallet.ts` is a good place to wrap new calls.

**New app state** — the three Zustand stores are in `apps/web/src/stores/index.ts`. Add fields and actions there, and they'll persist automatically via the `persist` middleware.

**New vault behaviour** — vault logic (deposits, streak tracking, reconciliation) lives entirely in the vault store (`useVaultStore` in `stores/index.ts`). No Rust changes needed for vault-level features.
