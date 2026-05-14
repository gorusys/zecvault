# Vaults

A vault is a named savings goal. You give it a name, set a ZEC target and a deadline, and deposit toward it over time. The app tracks your progress, shows a streak counter for consistent saving, and locks in a 24-hour cooldown if you try to break the vault early.

This document explains how vaults work under the hood — how deposits are tracked, how the balance stays accurate, and how the app links on-chain transactions back to the right vault.

---

## The basic idea

Vaults don't lock your ZEC on-chain. Your funds always remain in your own Zcash wallet — the vault is a layer of accounting on top of your regular wallet balance.

When you deposit into a vault, the app:
1. Records the deposit amount in the vault's contribution list
2. Subtracts that amount from your displayed spendable balance (so you don't accidentally spend it)
3. Optionally broadcasts a Zcash transaction to the vault's dedicated receive address, with a labelling memo

That memo is how the app can reconcile vault deposits if you restore from a backup or sync a new device.

---

## Vault states

A vault moves through these states:

```
active  →  breaking  →  archived   (early exit with 24h wait)
active  →  complete  →  archived   (goal reached)
```

- **active** — contributions are open, balance is growing
- **breaking** — you've requested an early exit; a 24-hour countdown is running
- **complete** — the goal amount was reached; the vault moves to your archive
- **archived** — the vault is closed and read-only (whether completed or broken early)

You can cancel a break request at any time before the 24 hours are up, which returns the vault to **active**.

---

## How the balance is tracked

The app maintains a virtual spendable balance:

> **displayed spendable = your total chain balance − sum of all active vault balances**

This means the ZEC in your vaults is hidden from your regular "available to send" balance, nudging you not to touch it. When a vault completes or is broken, that amount is released back into your spendable balance.

This is a soft lock — it's enforced by the app, not by a smart contract. The ZEC is always in your wallet and technically spendable. If you reset the app or restore from seed on a fresh device, the vault accounting starts fresh (though the on-chain history is still there).

---

## How deposits are labelled (the ZV1 memo)

When you deposit into a vault via a Zcash transaction, the transaction carries a memo in the shielded note:

```
ZV1:<vaultId>:<goalName>
```

For example:
```
ZV1:v3_1a2b3c4d:Bali Trip 2026
```

This memo is encrypted inside the shielded transaction — only the wallet owner can read it. It's not visible on-chain to anyone else.

On sync, the app scans incoming transactions for ZV1 memos and automatically credits any matching vault. This is how deposits made from another device, or deposits received from a friend who knows your vault address, get reconciled correctly.

If you deposit manually without a transaction (just updating the local balance), no memo is created — it's a local-only record.

---

## Streak tracking

The vault shows how many consecutive calendar days you've made at least one deposit. The streak resets if a full day passes with no deposit, and increments if you deposit on a day after the previous one.

Streaks are local to each device and don't depend on on-chain data.

---

## Round-up savings

If you enable round-up savings in Settings, every time you send ZEC the app rounds up to the nearest threshold (0.01, 0.1, or 1 ZEC) and deposits the difference into a vault of your choice. This is handled locally by the app — no extra transactions are created.

---

## Vault categories

When creating a vault, you pick a category that gives it a visual identity in the app:

| Category | Label |
|---|---|
| trip | Experiences |
| ring | Wedding |
| house | Home Upgrade |
| car | EV Fund |
| emer | Safety Buffer |
| gift | Family Moments |
| edu | Skills & Courses |
| tech | Creator + AI Gear |
| custom | (user-defined label) |

Categories are cosmetic — they don't affect how the vault works.

---

## Implementation notes for contributors

Vault logic lives entirely in the frontend. Nothing in the Rust backend knows about vaults — they're an app-layer concept built on top of normal Zcash transactions.

- All vault state is in `apps/web/src/stores/index.ts` (`useVaultStore`)
- The ZV1 memo helpers (`formatVaultMemo`, `parseVaultMemo`) are in `apps/web/src/lib/zec.ts`
- Deposit reconciliation against tx history is in `reconcileVaultDepositsFromTxHistory` in the vault store
- The streak calculation is the `nextStreakDays` function in the same file

To add a new vault category, update the `CATEGORIES` array in `apps/web/src/lib/categories.ts`.
