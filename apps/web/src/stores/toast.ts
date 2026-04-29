import { create } from "zustand";

export type ToastType = "success" | "danger" | "warning" | "info";
export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, "id">) => void;
  dismiss: (id: string) => void;
}

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = Math.random().toString(36).slice(2);
    set({ toasts: [...get().toasts, { ...t, id }] });
    setTimeout(() => get().dismiss(id), 4000);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((x) => x.id !== id) }),
}));

export function toast(t: Omit<Toast, "id">) {
  useToasts.getState().push(t);
}
