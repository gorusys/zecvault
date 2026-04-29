# ZecVault User Flow Diagram

This diagram reflects the current implemented flow across web and desktop shells.

```mermaid
flowchart TD
    A[App Launch\nWeb / Windows / macOS / Linux] --> B{First-time user?}
    B -->|Yes| C[Onboarding Step 1\nName]
    B -->|No| H[Dashboard]

    C --> D[Step 2\nWallet choice + password\nCreate or Recover]
    D --> E{Create wallet?}
    E -->|Create| F[Step 3\nSeed phrase reveal + verify]
    E -->|Recover| G[Step 3\nEnter seed phrase]
    F --> H1[Step 4\nBackup confirmation]
    G --> H1[Step 4\nBackup confirmation]
    H1 --> H

    H --> I[Vaults List]
    H --> J[Send]
    H --> K[Receive]
    H --> L[History]
    H --> M[Settings]

    I --> I1[Create New Vault\nGoal, amount, deadline, summary]
    I1 --> I2[Vault created]
    I2 --> I

    I --> N[Open Vault Detail]
    N --> N1[Deposit to vault]
    N1 --> N2[Progress + history updated]
    N2 --> N

    N --> N3{Goal reached?}
    N3 -->|Yes| N4[Goal Complete screen]
    N4 --> N5[Unlock / archive flow]
    N5 --> I
    N3 -->|No| N

    N --> N6[Break vault early]
    N6 --> N7[24h unlock countdown]
    N7 --> N8{Countdown finished?}
    N8 -->|No| N7
    N8 -->|Yes| N9[Execute withdrawal]
    N9 --> I

    J --> J1[Enter address + amount + memo]
    J1 --> J2[Send tx]
    J2 --> L

    K --> K1[Choose address type\nUnified / Sapling / Transparent]
    K1 --> K2[Show QR + address]
    K2 --> K3[Copy address]

    L --> L1[Filter tabs\nAll / Vaults / Received / Sent / Memos]
    L1 --> L2[View tx details]

    M --> M1[Security settings]
    M --> M2[Network settings]
    M --> M3[Backup / Display / Round-up]
    M --> M4[About / Reset demo]
```

## Notes

- Navigation shell is consistent across `apps/windows`, `apps/macos`, and `apps/linux`.
- Vault detail navigation uses a stable route path and query id for packaged desktop reliability.
- Onboarding completion gates entry into the main app shell.
