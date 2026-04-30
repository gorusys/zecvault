import { type ReactNode } from "react";

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const path = ICONS[name];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {path}
    </svg>
  );
}

export type IconName =
  | "home" | "vault" | "send" | "receive" | "history" | "settings"
  | "plus" | "lock" | "unlock" | "arrow-up-right" | "arrow-down-left"
  | "check" | "x" | "more" | "search" | "copy" | "info"
  | "shield" | "wallet" | "key" | "bell" | "monitor" | "globe"
  | "chevron-right" | "chevron-left" | "trend-up" | "trend-down" | "flame" | "qr" | "minus" | "square" | "pig" | "owl";

const ICONS: Record<IconName, ReactNode> = {
  home: <><path d="M3 12L12 4l9 8" /><path d="M5 10v10h14V10" /></>,
  vault: <><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M8 6V4h8v2" /><circle cx="12" cy="13" r="3" /></>,
  send: <path d="M5 12h14M13 6l6 6-6 6" />,
  receive: <path d="M19 12H5M11 6l-6 6 6 6" />,
  history: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a7.97 7.97 0 0 0 0-6l1.6-1-2-3.4-1.9.7a8 8 0 0 0-5.2-3L11.6 0h-3.2L8 2.3a8 8 0 0 0-5.2 3l-1.9-.7-2 3.4 1.6 1a7.97 7.97 0 0 0 0 6l-1.6 1 2 3.4 1.9-.7a8 8 0 0 0 5.2 3l.4 2.3h3.2l.4-2.3a8 8 0 0 0 5.2-3l1.9.7 2-3.4-1.6-1z" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  unlock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 7-2.7" /></>,
  "arrow-up-right": <path d="M7 17L17 7M9 7h8v8" />,
  "arrow-down-left": <path d="M17 7L7 17M7 9v8h8" />,
  check: <path d="M20 6L9 17l-5-5" />,
  x: <path d="M18 6L6 18M6 6l12 12" />,
  more: <><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>,
  copy: <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v5h1" /></>,
  shield: <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z" />,
  wallet: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M16 12h2" /><path d="M3 9h14V6" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="M11 15h11l-3 3M11 12V8M14 8h3" /></>,
  bell: <path d="M6 8a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9zM10 21a2 2 0 0 0 4 0" />,
  monitor: <><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  "chevron-right": <path d="M9 6l6 6-6 6" />,
  "chevron-left": <path d="M15 6l-6 6 6 6" />,
  "trend-up": <path d="M3 17l6-6 4 4 8-8M21 14V7h-7" />,
  "trend-down": <path d="M3 7l6 6 4-4 8 8M21 10v7h-7" />,
  flame: <path d="M12 2c1 4 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-7 1 2 3 2 3-3z" />,
  qr: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3M20 14v7M14 17v4M17 20h4" /></>,
  minus: <path d="M5 12h14" />,
  square: <rect x="4" y="4" width="16" height="16" rx="2" />,
  pig: <path d="M19 9.5c-.6-1-1.5-1.7-2.6-2.1l-.5-1.6a1 1 0 0 0-1.6-.4l-1 .9a8 8 0 0 0-2.3-.3c-3.7 0-6.7 2.4-7.4 5.6l-1.3.6c-.4.2-.5.7-.2 1l1 1c.1 1.5.8 2.8 1.9 3.8V20a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-.7a8 8 0 0 0 3.6 0V20a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-2.3c1.4-1.3 2.4-3 2.4-4.9 0-.6-.1-1.2-.3-1.7l1.1-.5c.4-.2.4-.8 0-1l-.8-.6zM16.5 12a1 1 0 1 1 0-2 1 1 0 0 1 0 2z" />,
  owl: <><path d="M4 15c0-5 3.6-9 8-9s8 4 8 9v4H4v-4z" /><circle cx="9" cy="13" r="2" /><circle cx="15" cy="13" r="2" /><path d="M12 14.5l-1.5 2h3L12 14.5z" /><path d="M8 6l-2-2M16 6l2-2" /></>,
};
