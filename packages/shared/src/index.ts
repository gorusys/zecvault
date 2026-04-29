/** Shared types and pure utilities used by web, desktop, and (future) mobile. */
export type Platform = "web" | "desktop" | "mobile";

export function assertNever(_: never): never {
  throw new Error("unreachable");
}
