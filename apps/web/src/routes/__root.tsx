import { Outlet, createRootRoute, HeadContent, Scripts, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import appCss from "../styles.css?url";
import { Sidebar } from "@/components/Sidebar";
import { ToastStack } from "@/components/ToastStack";
import { getAppLockStateNative, listWalletsNative, unlockAppNative } from "@/lib/wallet-native";
import { Onboarding } from "@/screens/Onboarding";
import { useSettings, useWalletStore } from "@/stores";

function NotFoundComponent() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--gray-50)" }}>
      <div style={{ textAlign: "center", maxWidth: 380 }}>
        <div className="t-display" style={{ color: "var(--coral-400)" }}>404</div>
        <h2 className="t-h2" style={{ marginTop: 8 }}>Page not found</h2>
        <p className="t-body text-gray-600" style={{ marginTop: 8 }}>That route doesn't exist.</p>
        <Link to="/" className="btn btn-primary" style={{ marginTop: 20 }}>Go home</Link>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "ZecVault — Save with intent." },
      { name: "description", content: "Non-custodial Zcash goal-savings. Private, on-chain, committed." },
      { name: "theme-color", content: "#F5F4F2" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=DM+Mono:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=Syne:wght@500;600;700;800&display=swap",
      },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  shellComponent: RootShell,
  component: AppShell,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function AppShell() {
  const onboardingComplete = useSettings((s) => s.onboardingComplete);
  const theme = useSettings((s) => s.theme);
  const setWallets = useWalletStore((s) => s.setWallets);
  const [mounted, setMounted] = useState(false);
  const [lockConfigured, setLockConfigured] = useState(false);
  const [appLocked, setAppLocked] = useState(false);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    let ignore = false;
    const bootstrap = async () => {
      try {
        const lock = await getAppLockStateNative();
        if (ignore) return;
        setLockConfigured(lock.configured);
        setAppLocked(lock.locked);
        if (!lock.locked) {
          const nativeState = await listWalletsNative();
          if (!ignore) setWallets(nativeState.wallets, nativeState.activeWalletFingerprint);
        }
      } finally {
        if (!ignore) {
          setMounted(true);
        }
      }
    };
    void bootstrap();
    return () => {
      ignore = true;
    };
  }, [setWallets]);

  if (!mounted) return null;

  if (onboardingComplete && lockConfigured && appLocked) {
    return (
      <>
        <AppUnlockScreen
          onUnlock={async (password) => {
            const ok = await unlockAppNative(password);
            if (!ok) return false;
            const nativeState = await listWalletsNative();
            setWallets(nativeState.wallets, nativeState.activeWalletFingerprint);
            setAppLocked(false);
            return true;
          }}
        />
        <ToastStack />
      </>
    );
  }

  if (!onboardingComplete) {
    return (<><Onboarding /><ToastStack /></>);
  }

  return (
    <div className="app-window">
      <div className="app-body">
        <Sidebar />
        <main className="main-content"><Outlet /></main>
      </div>
      <ToastStack />
    </div>
  );
}

function AppUnlockScreen({ onUnlock }: { onUnlock: (password: string) => Promise<boolean> }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--gray-50)" }}>
      <div className="card card-pad" style={{ width: "100%", maxWidth: 420 }}>
        <h1 className="t-h2">Unlock ZecVault</h1>
        <p className="t-body text-gray-600" style={{ marginTop: 8 }}>
          Enter your app password to access wallets.
        </p>
        <label className="label" style={{ marginTop: 16 }}>App password</label>
        <input
          type="password"
          className="input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter password"
        />
        {error && <div className="t-caption" style={{ marginTop: 8, color: "var(--danger-text)" }}>{error}</div>}
        <button
          className="btn btn-primary btn-block"
          style={{ marginTop: 14 }}
          disabled={!password || busy}
          onClick={async () => {
            try {
              setBusy(true);
              setError(null);
              const ok = await onUnlock(password);
              if (!ok) {
                setError("Invalid password.");
                return;
              }
              setPassword("");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Unlocking..." : "Unlock"}
        </button>
      </div>
    </div>
  );
}
