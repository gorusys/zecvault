/** Shared types and pure utilities used by web, desktop, and (future) mobile. */
export type Platform = "web" | "desktop" | "mobile";

export type ConnectionMode = "lightwalletd" | "full_node";

export interface ConnectionConfig {
  mode: ConnectionMode;
  lightwalletdUrl: string;
  fullNodeUrl: string;
}

export function assertNever(_: never): never {
  throw new Error("unreachable");
}
