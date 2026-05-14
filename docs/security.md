# Security

ZecVault is non-custodial: your seed phrase and private keys are generated on your device and never leave it. No account, no server, no cloud backup. This document explains how the app protects your keys and what you should know about its limitations.

---

## Your seed phrase

When you create a wallet, the app generates a 24-word seed phrase (BIP39, 256-bit entropy) inside the Rust wallet backend. The seed is shown to you once during onboarding and you're asked to verify four of the words before continuing.

**The seed phrase is the master key to your wallet.** Anyone who has it can access all your funds from any Zcash wallet app. Treat it like cash.

The seed is encrypted before it's ever written to disk. The app uses a strong encryption scheme (AES-256-GCM with an Argon2id-derived key) so that even if someone gets access to your device's files, they can't read the mnemonic without your password.

---

## How the password protects your keys

Your wallet password is never stored anywhere. Instead, every time the app needs to use your seed (for signing a transaction or exporting a backup), it:

1. Takes your password
2. Runs it through Argon2id (a memory-hard key derivation function) with a random salt stored alongside the encrypted mnemonic
3. Uses the result to decrypt the mnemonic with AES-256-GCM

The decrypted mnemonic exists only in memory during the operation and is then discarded. This means:

- A weak password is a real risk — use something you won't forget but isn't easy to guess
- If you forget your password, **there is no recovery path** other than your seed phrase backup

The app password is also used for the lock screen. When you lock the app, it stores a hash (not the password itself) to verify your password on unlock. This uses the same Argon2id algorithm.

---

## OS keyring (biometrics)

On desktop, the app can store your password in the operating system's secure credential store (Keychain on macOS, Credential Manager on Windows, Secret Service on Linux). This allows biometric unlock (Touch ID, Windows Hello) without weakening the underlying encryption — the OS handles biometric authentication and then provides your password to the app.

Biometrics are optional. You can disable them in Settings → Security at any time.

---

## What's stored where

| Location | What's there | Secret? |
|---|---|---|
| App data directory (disk) | Encrypted mnemonic + wallet database (SQLite) | The mnemonic is encrypted; the wallet DB contains transaction history but not keys |
| localStorage (browser) | Addresses, balances, vault goals, settings | No secrets — addresses are meant to be shared |
| OS keyring | Your password (only if biometrics enabled) | Managed by the OS; accessible only via system auth |
| Memory (runtime only) | Decrypted mnemonic, spending keys | Never persisted; cleared after use |

Your seed phrase is never in `localStorage`, never in a log file, and never sent over the network.

---

## Privacy: shielded vs transparent

Zcash has two types of addresses with very different privacy properties:

**Shielded addresses** (unified `u1...` and Sapling `zs1...`) — transaction amounts and participants are hidden from on-chain observers. Only you (and anyone you share your viewing key with) can see the details.

**Transparent addresses** (`t1...`) — fully public, like Bitcoin. Anyone can see what was sent, when, and to whom.

ZecVault defaults to shielded receiving. The recommended receive address uses both the Orchard and Sapling protocols, so it works with a wide range of Zcash senders while keeping your funds off the transparent ledger.

If you receive funds to a transparent address (from an exchange, for example), the app can shield them to your Orchard balance via the **Shield funds** option on the Send screen.

---

## Lightwalletd and metadata privacy

To sync without downloading the full Zcash blockchain, the app connects to a **lightwalletd** server over an encrypted connection (gRPC/TLS). The default server is `zec.rocks`.

The server can see:
- Which blocks your wallet downloads (this reveals roughly when your wallet is active)
- The transactions you broadcast (since those go through the server to reach the network)

The server cannot see the contents of your shielded transactions — those are cryptographically private.

If this level of metadata privacy isn't sufficient for your threat model, you can run your own lightwalletd instance and point ZecVault to it in Settings → Network.

---

## Vault security

Vault balances are a virtual accounting layer — the ZEC is always in your own Zcash wallet, not locked in a smart contract. The 24-hour break cooldown is enforced by the app, not the blockchain.

This means:
- If you export a backup or restore from seed on a new device, vault accounting starts fresh
- A compromised or modified app could bypass the vault lock

The vault system is designed for **self-accountability**, not cryptographic enforcement. Don't put funds in a vault that you couldn't afford to have spent by a sufficiently motivated attacker with physical access to your device and your password.

---

## Backup

Your seed phrase is the only true backup. The "Download backup file" option in onboarding creates a plaintext `.txt` file containing your mnemonic — it's a convenient copy, not a secure one.

If you download a backup file:
- Don't store it in cloud storage (Dropbox, Google Drive, iCloud)
- Don't email it to yourself
- Store it somewhere offline and physically secure (printed paper, encrypted USB drive)

If you lose your seed phrase and your device breaks, your funds are unrecoverable. Back up early and store it safely.
