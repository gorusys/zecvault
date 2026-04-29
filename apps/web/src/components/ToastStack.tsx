import { Icon, type IconName } from "./Icon";
import { useToasts, type Toast } from "@/stores/toast";

export function ToastStack() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((t) => <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />)}
    </div>
  );
}

const ICON_FOR: Record<Toast["type"], IconName> = {
  success: "check", danger: "x", warning: "info", info: "info",
};
const COLOR_FOR: Record<Toast["type"], string> = {
  success: "var(--success-strong)", danger: "var(--danger-strong)",
  warning: "var(--warning-strong)", info: "var(--info-text)",
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  return (
    <div className={`toast ${toast.type}`} onClick={onDismiss} role="status">
      <div className="toast-icon" style={{ color: COLOR_FOR[toast.type] }}>
        <Icon name={ICON_FOR[toast.type]} size={20} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="toast-title">{toast.title}</div>
        {toast.description && <div className="toast-desc">{toast.description}</div>}
      </div>
    </div>
  );
}
