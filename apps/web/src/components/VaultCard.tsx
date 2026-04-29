import { Link, useNavigate } from "@tanstack/react-router";
import { categoryOf } from "@/lib/categories";
import { fmtZec, daysBetween } from "@/lib/zec";
import type { Vault } from "@/stores";
import { Icon } from "./Icon";
import { useEffect, useState } from "react";

export function VaultCard({ vault, animateDelay = 0 }: { vault: Vault; animateDelay?: number }) {
  const navigate = useNavigate();
  const cat = categoryOf(vault.category);
  const pct = Math.min(100, (vault.currentBalanceZat / vault.targetZat) * 100);
  const days = daysBetween(Date.now(), vault.deadlineTs);
  const complete = vault.status === "complete" || pct >= 100;

  // Animate progress bar
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setWidth(pct), 80 + animateDelay);
    return () => clearTimeout(t);
  }, [pct, animateDelay]);

  const daysPill =
    days > 30 ? <span className="pill">{days} days left</span> :
    days >= 14 ? <span className="pill pill-warning">{days} days left</span> :
    days > 0 ? <span className="pill pill-danger">{days} days left</span> :
    <span className="pill pill-success">Due today</span>;

  return (
    <Link
      to="/vault-detail"
      search={{ id: vault.id }}
      className={`vault-card cat-${vault.category}`}
      style={{ textDecoration: "none" }}
      onClick={(e) => {
        e.preventDefault();
        navigate({ to: "/vault-detail", search: { id: vault.id } });
      }}
    >
      <span className="vault-accent" />
      {complete && <span style={{ position: "absolute", top: 12, right: 12, width: 8, height: 8, borderRadius: 999, background: "var(--success-strong)", boxShadow: "0 0 0 0 rgba(46,158,117,0.5)", animation: "pulse-dot 2s infinite" }} />}

      <div className="hstack between" style={{ marginBottom: 14 }}>
        <div className="cat-tint" style={{ width: 40, height: 40, borderRadius: "var(--r-md)", display: "grid", placeItems: "center", fontSize: 22 }}>
          {cat.emoji}
        </div>
        {daysPill}
      </div>

      <div className="t-h4" style={{ marginBottom: 4 }}>{vault.goalName}</div>

      <div style={{ marginTop: "auto" }}>
        <div className="progress" style={{ marginBottom: 10, position: "relative" }}>
          <div className="progress-fill" style={{
            transform: `scaleX(${width / 100})`,
            background: complete ? "var(--success-strong)" : "var(--coral-400)",
          }} />
          {[25, 50, 75].map((p) => (
            <span key={p} className="progress-pip" style={{ left: `${p}%`, top: "50%" }} />
          ))}
        </div>
        <div className="hstack between" style={{ marginBottom: 8 }}>
          <span className="t-mono" style={{ fontWeight: 600 }}>
            <span className="text-gray-800">{fmtZec(vault.currentBalanceZat)}</span>
            <span className="text-gray-400"> / {fmtZec(vault.targetZat)} ZEC</span>
          </span>
        </div>
        <div className="hstack between">
          <span className="pill pill-coral hstack gap-4"><Icon name="flame" size={11} />{vault.streakDays} day streak</span>
          <span className="t-caption text-gray-400">{new Date(vault.deadlineTs).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
        </div>
      </div>
    </Link>
  );
}
