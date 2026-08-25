export type MessengerUnreadSource =
  | "system"
  | "stored"
  | "cache"
  | "realtime"
  | "push"
  | "authoritative"
  | "local-read"
  | "logout";

export type MessengerUnreadAuthStatus =
  | "loading"
  | "authenticated"
  | "unauthenticated"
  | "password_change_required";

export type MessengerUnreadAuthAction = "wait" | "hydrate" | "clear";

const PRESERVE_HIGHER_SOURCES = new Set<MessengerUnreadSource>([
  "system",
  "stored",
  "cache",
  "realtime",
  "push",
]);

export function normalizeMessengerUnreadCount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

/**
 * Cached/system values may be older than a push already accepted by the OS.
 * They can therefore recover or increase a counter, but never lower it.
 * Only an authoritative server snapshot, an explicit local read, or logout is
 * allowed to reduce the value.
 */
export function reconcileMessengerUnreadCount(
  current: number,
  incoming: number,
  source: MessengerUnreadSource,
  hasAuthoritativeSnapshot = false,
): number {
  const normalizedCurrent = normalizeMessengerUnreadCount(current);
  const normalizedIncoming = normalizeMessengerUnreadCount(incoming);
  if (source === "cache" && hasAuthoritativeSnapshot) {
    return normalizedCurrent;
  }
  return PRESERVE_HIGHER_SOURCES.has(source)
    ? Math.max(normalizedCurrent, normalizedIncoming)
    : normalizedIncoming;
}

/** Prevents the cold-start `loading` state from being mistaken for logout. */
export function messengerUnreadAuthAction(
  status: MessengerUnreadAuthStatus,
  userId: string | null | undefined,
): MessengerUnreadAuthAction {
  if (status === "loading") return "wait";
  return status === "authenticated" && Boolean(userId) ? "hydrate" : "clear";
}
