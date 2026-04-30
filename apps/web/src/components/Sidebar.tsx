import { Link, useRouterState } from "@tanstack/react-router";
import { Icon, type IconName } from "./Icon";
import { useVaultStore, useWalletStore } from "@/stores";

interface NavDef { to: string; icon: IconName; label: string; section: "Main" | "Account"; badge?: number; }

export function Sidebar() {
  const { location } = useRouterState();
  const vaults = useVaultStore((s) => s.vaults);
  const syncStatus = useWalletStore((s) => s.syncStatus);
  const syncBlock = useWalletStore((s) => s.syncBlock);

  const items: NavDef[] = [
    { to: "/", icon: "home", label: "Dashboard", section: "Main" },
    { to: "/wallets" as const, icon: "wallet", label: "Wallets", section: "Main" },
    { to: "/vaults" as const, icon: "vault", label: "Vaults", section: "Main", badge: vaults.length || undefined },
    { to: "/send" as const, icon: "send", label: "Send", section: "Main" },
    { to: "/receive" as const, icon: "receive", label: "Receive", section: "Main" },
    { to: "/history" as const, icon: "history", label: "History", section: "Main" },
    { to: "/settings" as const, icon: "settings", label: "Settings", section: "Account" },
  ];

  const isActive = (to: string) =>
    to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);

  const grouped = {
    Main: items.filter((i) => i.section === "Main"),
    Account: items.filter((i) => i.section === "Account"),
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon" aria-hidden="true">
          <Icon name="pig" size={20} />
        </div>
        <div className="sidebar-logo-text">
          <span className="sidebar-logo-name">ZecVault</span>
          <span className="sidebar-logo-tag">SAVE OUT LOUD</span>
        </div>
      </div>

      <nav style={{ display: "flex", flexDirection: "column", flex: 1 }}>
        {(["Main", "Account"] as const).map((section) => (
          <div key={section}>
            <div className="sidebar-section-label">{section}</div>
            {grouped[section].map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`nav-item ${isActive(item.to) ? "active" : ""}`}
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
                {item.badge !== undefined && <span className="nav-badge">{item.badge}</span>}
              </Link>
            ))}
          </div>
        ))}

        <div className="sidebar-footer">
          <span className={`sync-dot ${syncStatus !== "synced" ? syncStatus : ""}`} />
          <span className="sync-text">Block {syncBlock.toLocaleString()}</span>
        </div>
      </nav>
    </aside>
  );
}
