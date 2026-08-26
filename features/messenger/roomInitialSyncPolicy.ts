export interface MessengerRoomInitialSyncPlanOptions {
  initial: boolean;
  expectedUnreadCount: number;
  reconciliationCursor: string | null;
}

export type MessengerRoomInitialSyncPlan =
  | { direction: "latest"; limit: number }
  | { direction: "after"; limit: number; afterSequence: string };

/**
 * A PUSH-populated SQLite cache can be sparse, so its maximum sequence must
 * never be used as the first-entry cursor. A fresh latest window is mandatory
 * on every room entry; cursor advancement remains valid for later refreshes.
 */
export function messengerRoomInitialSyncPlan(
  options: MessengerRoomInitialSyncPlanOptions,
): MessengerRoomInitialSyncPlan {
  if (options.initial || !options.reconciliationCursor) {
    const unread = Number.isFinite(options.expectedUnreadCount)
      ? Math.max(0, Math.floor(options.expectedUnreadCount))
      : 0;
    return {
      direction: "latest",
      limit: options.initial ? Math.max(20, Math.min(100, unread + 10)) : 20,
    };
  }
  return {
    direction: "after",
    limit: 20,
    afterSequence: options.reconciliationCursor,
  };
}
