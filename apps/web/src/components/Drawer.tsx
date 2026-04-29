import { useEffect, type ReactNode } from "react";
import { Icon } from "./Icon";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  width?: number;
  children: ReactNode;
}

export function Drawer({ open, onClose, width = 520, children }: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="drawer" style={{ width }} role="dialog" aria-modal="true">
        <button className="drawer-close" onClick={onClose} aria-label="Close">
          <Icon name="x" size={18} />
        </button>
        {children}
      </div>
    </>
  );
}
