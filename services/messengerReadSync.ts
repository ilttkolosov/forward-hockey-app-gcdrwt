import type { SQLiteDatabase } from "expo-sqlite";
import {
  loadPendingMessengerReadReceipts,
  markCachedMessengerRoomRead,
  markMessengerReadReceiptSynced,
} from "../features/messenger/repository";
import { markMessengerRead, messengerErrorMessage } from "./messengerApi";
import { messengerLog } from "./messengerLogger";

interface ReadSyncQueue {
  timer: ReturnType<typeof setTimeout> | null;
  running: boolean;
  requestedWhileRunning: boolean;
}

const READ_RECEIPT_DEBOUNCE_MS = 1_500;
const READ_RECEIPT_RETRY_MS = 15_000;
const queues = new WeakMap<SQLiteDatabase, ReadSyncQueue>();

function queueFor(db: SQLiteDatabase): ReadSyncQueue {
  const existing = queues.get(db);
  if (existing) return existing;
  const created: ReadSyncQueue = {
    timer: null,
    running: false,
    requestedWhileRunning: false,
  };
  queues.set(db, created);
  return created;
}

function scheduleFlush(db: SQLiteDatabase, delay: number): void {
  const queue = queueFor(db);
  if (queue.timer) clearTimeout(queue.timer);
  queue.timer = setTimeout(() => {
    queue.timer = null;
    void flushMessengerReadReceipts(db);
  }, delay);
}

/**
 * Advances the UI cursor in SQLite immediately. The server sees only the
 * newest cursor for each room after a debounce, irrespective of how many
 * messages became visible in that interval.
 */
export async function queueMessengerReadReceipt(
  db: SQLiteDatabase,
  roomId: string,
  sequence: string,
  currentUserId?: string,
): Promise<void> {
  await markCachedMessengerRoomRead(db, roomId, sequence, currentUserId);
  scheduleFlush(db, READ_RECEIPT_DEBOUNCE_MS);
}

export async function flushMessengerReadReceipts(
  db: SQLiteDatabase,
): Promise<void> {
  const queue = queueFor(db);
  if (queue.running) {
    queue.requestedWhileRunning = true;
    return;
  }
  queue.running = true;
  let failed = false;
  try {
    const pending = await loadPendingMessengerReadReceipts(db);
    if (!pending.length) return;
    messengerLog("debug", "read_receipts.batch.started", {
      room_count: pending.length,
    });
    const results = await Promise.allSettled(
      pending.map(async (state) => {
        const sequence = state.pending_read_sequence;
        if (!sequence) return;
        await markMessengerRead(state.room_id, sequence);
        await markMessengerReadReceiptSynced(db, state.room_id, sequence);
      }),
    );
    failed = results.some((result) => result.status === "rejected");
    results.forEach((result, index) => {
      if (result.status !== "rejected") return;
      messengerLog("warn", "read_receipts.room.failed", {
        room_id: pending[index]?.room_id,
        message: messengerErrorMessage(result.reason),
      });
    });
    messengerLog(failed ? "warn" : "info", "read_receipts.batch.finished", {
      room_count: pending.length,
      failed_count: results.filter((result) => result.status === "rejected")
        .length,
    });
  } catch (error) {
    failed = true;
    messengerLog("warn", "read_receipts.batch.failed", {
      message: messengerErrorMessage(error),
    });
  } finally {
    queue.running = false;
    if (queue.requestedWhileRunning) {
      queue.requestedWhileRunning = false;
      scheduleFlush(db, READ_RECEIPT_DEBOUNCE_MS);
    } else if (failed) {
      scheduleFlush(db, READ_RECEIPT_RETRY_MS);
    }
  }
}
