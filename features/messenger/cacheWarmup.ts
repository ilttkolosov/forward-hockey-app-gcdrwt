import type { SQLiteDatabase } from "expo-sqlite";
import {
  getMessengerMessages,
  messengerErrorMessage,
} from "../../services/messengerApi";
import { messengerLog } from "../../services/messengerLogger";
import { getMessengerActiveRoomId } from "../../services/messengerRealtime";
import {
  cacheMessengerMessages,
  isMessengerRoomHistoryComplete,
  loadCachedMessengerMessageBounds,
  markMessengerRoomHistoryComplete,
} from "./repository";
import type { MessengerRoom } from "./types";

const CATCH_UP_PAGE_SIZE = 50;
const HISTORY_PAGE_SIZE = 100;
const WARMUP_CONCURRENCY = 1;

const activeWarmups = new WeakMap<SQLiteDatabase, Map<string, Promise<void>>>();

function compareSequence(left: string, right: string): number {
  const normalizedLeft = left.replace(/^0+/, "") || "0";
  const normalizedRight = right.replace(/^0+/, "") || "0";
  if (normalizedLeft.length !== normalizedRight.length) {
    return normalizedLeft.length - normalizedRight.length;
  }
  return normalizedLeft.localeCompare(normalizedRight);
}

function databaseWarmups(db: SQLiteDatabase): Map<string, Promise<void>> {
  let warmups = activeWarmups.get(db);
  if (!warmups) {
    warmups = new Map();
    activeWarmups.set(db, warmups);
  }
  return warmups;
}

/**
 * Ensures that a room known from `/chat/rooms` also has a real message window
 * in SQLite. Room cards contain only summary metadata and cannot render the
 * feed by themselves. Keeping this work outside screen navigation makes even
 * a room that has never been opened available from the local cache.
 */
export function warmMessengerRoomWindow(
  db: SQLiteDatabase,
  room: MessengerRoom,
): Promise<void> {
  const targetSequence = room.last_message?.sequence;
  if (!targetSequence) return Promise.resolve();
  if (getMessengerActiveRoomId() === room.id) return Promise.resolve();

  const warmups = databaseWarmups(db);
  const running = warmups.get(room.id);
  if (running) return running;

  const task = (async () => {
    const startedAt = Date.now();
    let bounds = await loadCachedMessengerMessageBounds(db, room.id);
    let historyComplete = await isMessengerRoomHistoryComplete(db, room.id);
    let localLatestSequence = bounds.latest_sequence;
    if (
      localLatestSequence &&
      compareSequence(localLatestSequence, targetSequence) >= 0 &&
      historyComplete
    ) {
      return;
    }
    // Foreground room reconciliation has priority over speculative cache
    // warming. Re-check after SQLite because the user may have opened this
    // room while the bounds query was queued.
    if (getMessengerActiveRoomId() === room.id) return;

    const source = localLatestSequence
      ? historyComplete
        ? "catch_up"
        : "history_backfill"
      : "missing_window";
    messengerLog("debug", "room.cache.warm.started", {
      room_id: room.id,
      source,
      local_latest_sequence: localLatestSequence,
      target_sequence: targetSequence,
    });

    let cachedCount = 0;
    let pageCount = 0;
    if (!localLatestSequence) {
      const latest = await getMessengerMessages(room.id, {
        limit: CATCH_UP_PAGE_SIZE,
        priority: "background",
      });
      pageCount = 1;
      if (latest.items.length) {
        await cacheMessengerMessages(db, latest.items);
        cachedCount += latest.items.length;
        localLatestSequence = latest.items.at(-1)?.sequence ?? null;
      }
      if (!latest.page.has_more) {
        await markMessengerRoomHistoryComplete(db, room.id);
        historyComplete = true;
      }
    } else {
      while (
        compareSequence(localLatestSequence, targetSequence) < 0
      ) {
        const page = await getMessengerMessages(room.id, {
          cursor: localLatestSequence,
          direction: "after",
          limit: CATCH_UP_PAGE_SIZE,
          priority: "background",
        });
        pageCount += 1;
        if (!page.items.length) break;
        await cacheMessengerMessages(db, page.items);
        cachedCount += page.items.length;
        const nextSequence = page.items.at(-1)?.sequence ?? null;
        if (
          !nextSequence ||
          compareSequence(nextSequence, localLatestSequence) <= 0
        ) {
          break;
        }
        localLatestSequence = nextSequence;
        if (!page.page.has_more) break;
      }
    }

    // Search is intentionally local-first, so every room is backfilled all
    // the way to its first message. These low-priority requests are cancelled
    // immediately whenever a user-visible API operation starts.
    bounds = await loadCachedMessengerMessageBounds(db, room.id);
    let oldestSequence = bounds.oldest_sequence;
    while (!historyComplete && oldestSequence) {
      if (getMessengerActiveRoomId() === room.id) break;
      const page = await getMessengerMessages(room.id, {
        cursor: oldestSequence,
        direction: "before",
        limit: HISTORY_PAGE_SIZE,
        priority: "background",
      });
      pageCount += 1;
      if (page.items.length) {
        await cacheMessengerMessages(db, page.items);
        cachedCount += page.items.length;
      }
      const nextOldestSequence = page.items[0]?.sequence ?? null;
      if (!page.page.has_more || !nextOldestSequence) {
        await markMessengerRoomHistoryComplete(db, room.id);
        historyComplete = true;
        break;
      }
      if (compareSequence(nextOldestSequence, oldestSequence) >= 0) break;
      oldestSequence = nextOldestSequence;
    }

    messengerLog("info", "room.cache.warm.completed", {
      room_id: room.id,
      source,
      cached_message_count: cachedCount,
      page_count: pageCount,
      latest_sequence: localLatestSequence,
      target_sequence: targetSequence,
      history_complete: historyComplete,
      duration_ms: Date.now() - startedAt,
    });
  })();

  warmups.set(room.id, task);
  void task.then(
    () => {
      if (warmups.get(room.id) === task) warmups.delete(room.id);
    },
    (error) => {
      if (warmups.get(room.id) === task) warmups.delete(room.id);
      messengerLog("warn", "room.cache.warm.failed", {
        room_id: room.id,
        message: messengerErrorMessage(error),
      });
    },
  );
  return task;
}

/** Warms rooms sequentially in one lane to avoid competing with foreground sync. */
export async function warmMessengerRoomWindows(
  db: SQLiteDatabase,
  rooms: MessengerRoom[],
): Promise<void> {
  const candidates = rooms.filter((room) => Boolean(room.last_message));
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < candidates.length) {
      const room = candidates[nextIndex];
      nextIndex += 1;
      if (!room) continue;
      if (getMessengerActiveRoomId() === room.id) continue;
      try {
        await warmMessengerRoomWindow(db, room);
      } catch {
        // The per-room function has already logged the failure. A temporary
        // network/SQLite issue must not prevent the remaining rooms warming.
      }
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(WARMUP_CONCURRENCY, candidates.length) },
      worker,
    ),
  );
}
