export type MessengerUnreadSource =
  | "system"
  | "stored"
  | "presented"
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

export class MessengerUnreadMessageLedger {
  private readonly ids = new Set<string>();
  private readonly order: string[] = [];
  private readonly capacity: number;

  constructor(capacity = 256) {
    this.capacity = capacity;
  }

  /** Returns true only for the first observation of a message. */
  record(messageId: string): boolean {
    if (!messageId || this.ids.has(messageId)) return false;
    this.ids.add(messageId);
    this.order.push(messageId);
    while (this.order.length > this.capacity) {
      const oldest = this.order.shift();
      if (oldest) this.ids.delete(oldest);
    }
    return true;
  }

  clear(): void {
    this.ids.clear();
    this.order.length = 0;
  }
}

const PRESERVE_HIGHER_SOURCES = new Set<MessengerUnreadSource>([
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
 * A positive native badge was supplied by the OS from a newer PUSH and is
 * preferable to an older persisted JS value. Some Android launchers cannot
 * report their badge and return zero; only then use persistence as fallback.
 */
export function selectMessengerUnreadRestore(
  stored: number,
  system: number,
): number {
  const normalizedSystem = normalizeMessengerUnreadCount(system);
  return normalizedSystem > 0
    ? normalizedSystem
    : normalizeMessengerUnreadCount(stored);
}

/**
 * Cached/persisted values may be older than a push already accepted by the OS,
 * so they can recover or increase a counter but never lower it. A positive
 * native badge and the newest still-present notification are exact OS/server
 * snapshots and may correct stale persistence during application startup.
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
