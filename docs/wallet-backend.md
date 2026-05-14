# Wallet backend

The wallet backend is a Rust library compiled into each Tauri desktop shell. It's the only part of the app that touches private keys or talks to the Zcash network directly. The frontend never handles key material — it delegates everything to the backend via IPC.

The core of it is in `apps/linux/src-tauri/src/lib.rs` (identical across the three desktop shells).

---

## What the backend does

- Generates and stores BIP39 seed phrases (24 words)
- Derives Zcash addresses from those seeds (unified, Sapling, transparent)
- Syncs with the Zcash network by downloading and scanning compact blocks
- Builds and broadcasts transactions
- Manages the app password and optional screen lock

It uses the [ECC Rust SDK](https://github.com/zcash/librustzcash) — the same libraries the Zcash core team maintains for building Zcash wallets.

---

## How keys and wallets are stored

When you create or restore a wallet, the backend:

1. Derives all the addresses from the mnemonic (unified, Sapling, transparent)
2. Encrypts the mnemonic with AES-256-GCM, using a key derived from your password via Argon2id
3. Stores the **encrypted** mnemonic, salt, and nonce in a JSON file on disk (via `tauri-plugin-store`)
4. Initialises a SQLite database for the wallet (managed by `zcash_client_sqlite`)

The mnemonic is never stored in plaintext. The encryption key is derived from your password on demand and never saved anywhere. See [security.md](security.md) for the full picture.

### Multiple wallets and accounts

ZecVault supports multiple wallets (separate seed phrases) and multiple accounts per seed (ZIP-32 derivation). Accounts from the same seed share a `seedFingerprint` — so the app knows they're related without decrypting any mnemonics. A single backup phrase covers all accounts derived from it.

---

## How sync works

Zcash uses a privacy-preserving protocol where the blockchain doesn't reveal who received what. Instead of scanning raw blocks, the wallet downloads **compact blocks** — small summaries with just enough data to detect incoming notes — from a [lightwalletd](https://github.com/zcash/lightwalletd) server.

The sync process:

1. Connect to the lightwalletd server (default: `https://zec.rocks:443`, configurable in Settings)
2. Fetch compact blocks in batches of 10,000 (this batching makes historical syncs much faster)
3. After each batch, scan for notes belonging to the wallet and update balances
4. Emit progress events so the frontend can show a progress bar

Syncs are serialised — only one can run at a time to avoid conflicting writes to the SQLite database.

After a sync, the frontend refreshes balances by asking the backend for the current totals broken down by pool (Orchard, Sapling, transparent).

### First sync after restore

If you restore from a seed phrase without providing a **birthday height**, the wallet scans from the Zcash Sapling activation block (around 2018). That's a lot of history. If you know roughly when the wallet was first used, entering a block height (visible on block explorers) near that date makes the initial sync much faster. You can update this later in Settings if needed.

---

## How sending works

Sending is split into two steps so you can review the fee before committing:

**Step 1 — Preview.** The backend builds a transaction proposal without broadcasting it. This gives you the exact fee and total amount to debit.

**Step 2 — Execute.** After you confirm, the frontend passes the proposal back to the backend, which signs it with your spending key and broadcasts it to lightwalletd.

The spending key is derived from your mnemonic only during signing and is not stored anywhere between requests.

### Which pool gets spent first?

When you send, the wallet spends from pools in this order: **Orchard first, then Sapling, then transparent**. This keeps funds in the most private pool as long as possible and avoids revealing transparent UTXOs unnecessarily.

### Send max

"Send max" drains all spendable shielded funds (Orchard + Sapling) to a recipient in a single transaction. The fee is automatically deducted from the total, so the recipient gets exactly what's left.

### Shielding transparent funds

If you receive ZEC to a transparent address (visible on-chain, like a Bitcoin transaction), the app can sweep it to your Orchard shielded balance. This is called **shielding**. The app prompts you to do this automatically if a send would fail due to insufficient shielded balance but you have transparent funds available.

By default, transparent funds are shielded to the Orchard pool (the most modern and private). Expert users can choose to shield to Sapling instead.

### Sapling → Orchard migration

If you have funds in the Sapling pool (from an older wallet or exchange withdrawal), you can migrate them to Orchard via a self-send. The migration option is available in Settings under the wallet management section.

---

## Address types

When you create a wallet, the backend derives several kinds of addresses from your seed:

| Type | Starts with | Privacy | Use case |
|---|---|---|---|
| Unified (Orchard + Sapling) | `u1` | Shielded | Default receive address — use this whenever possible |
| Orchard-only unified | `u1` | Shielded | Best forward privacy; some older senders can't pay it |
| Sapling | `zs1` | Shielded | For wallets that don't support Orchard yet |
| Transparent | `t1` | Public | Exchanges, legacy integrations — avoid for privacy |

All of these addresses receive into the same wallet account. Unified Addresses let the sender's wallet automatically pick the best pool it supports.

On the Receive screen, you can choose which type to show. The default is the unified address with Orchard + Sapling receivers, which works with the widest range of senders while keeping funds shielded.

---

## ZIP support

The backend implements the Zcash Improvement Proposals relevant to a modern wallet:

| ZIP | What it does |
|---|---|
| ZIP-32 | Hierarchical key derivation (same concept as BIP-32 for Bitcoin, adapted for shielded pools) |
| ZIP-302 | Encrypted memo field in shielded transactions (512 bytes, UTF-8) |
| ZIP-316 | Unified Addresses — one address string that encodes multiple receiver types |
| ZIP-317 | Fee calculation rules (fee scales with transaction complexity) |
| ZIP-321 | Payment URI format (`zcash:address?amount=0.5&memo=...`) for QR codes and payment links |
