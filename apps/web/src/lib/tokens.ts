/**
 * ZecVault design tokens (mirror of CSS :root in styles.css).
 * "Vault UI" = dark, serious, trustworthy. "Goal UI" = warm tints on vault cards.
 */

export const tokens = {
  color: {
    bgDeep: "#0D0D0B",
    bgSurface: "#1A1A16",
    bgRaised: "#242420",
    border: "#FFFFFF14",
    borderStrong: "#FFFFFF28",
    gold: "#D4A843",
    goldDim: "#8B6E2A",
    goldLight: "#F5E6C0",
    teal: "#1D9E75",
    danger: "#C0392B",
    textPrimary: "#F5F5F0",
    textSecondary: "#9A9A94",
    textTertiary: "#5A5A56",
  },
  radius: { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 },
  space: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, "2xl": 48 },
  font: {
    display: "var(--font-display)",
    body: "var(--font-text)",
    mono: "var(--font-mono)",
  },
} as const;

export const tagline = "Save with intent. Spend with purpose.";
