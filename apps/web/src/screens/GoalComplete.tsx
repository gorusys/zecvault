import { useMemo } from "react";
import type { Vault } from "@/stores";
import { fmtZec, daysBetween } from "@/lib/zec";
import { categoryOf } from "@/lib/categories";

const CONFETTI_COLORS = ["var(--coral-400)", "var(--success-strong)", "var(--warning-strong)", "#4FA3E3", "#9B6BD8"];

export function GoalComplete({ vault, onClose }: { vault: Vault; onClose: () => void }) {
  const cat = categoryOf(vault.category);
  const days = daysBetween(vault.createdTs, Date.now());
  const confetti = useMemo(() => Array.from({ length: 40 }, (_, i) => ({
    dx: (Math.random() - 0.5) * 600 + "px",
    dy: (Math.random() * 500 + 200) + "px",
    r: (Math.random() * 720 - 360) + "deg",
    bg: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    delay: Math.random() * 0.3,
  })), []);

  return (
    <div className="fade-in" style={{ position: "relative", minHeight: "70vh", display: "grid", placeItems: "center", overflow: "hidden" }}>
      {confetti.map((c, i) => (
        <span key={i} className="confetti-piece" style={{ background: c.bg, "--dx": c.dx, "--dy": c.dy, "--r": c.r, animationDelay: c.delay + "s" } as React.CSSProperties} />
      ))}
      <div style={{ textAlign: "center", maxWidth: 480, padding: 32 }}>
        <div className="badge-enter" style={{ fontSize: 80 }}>{cat.emoji}</div>
        <h1 className="t-display" style={{ marginTop: 16 }}>Goal reached.</h1>
        <h2 className="t-h1 text-coral" style={{ marginTop: 8, marginBottom: 32 }}>{vault.goalName}</h2>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 32 }}>
          {[
            { l: "Total saved", v: fmtZec(vault.currentBalanceZat) + " ZEC" },
            { l: "Days taken", v: days.toString() },
            { l: "Deposits", v: String(vault.contributions.length) },
            { l: "Streak", v: "🔥 " + vault.streakDays },
          ].map((s) => (
            <div key={s.l} style={{ background: "var(--gray-25)", borderRadius: "var(--r-md)", padding: 14 }}>
              <div className="t-label">{s.l}</div>
              <div className="t-h3" style={{ marginTop: 6 }}>{s.v}</div>
            </div>
          ))}
        </div>

        <button className="btn btn-primary btn-xl btn-block" onClick={onClose}>Unlock my {fmtZec(vault.currentBalanceZat)} ZEC</button>
        <button className="btn btn-secondary btn-block" style={{ marginTop: 10 }}>Share achievement</button>
      </div>
    </div>
  );
}
