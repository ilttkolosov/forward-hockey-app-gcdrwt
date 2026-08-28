import type { SQLiteDatabase } from 'expo-sqlite';
import type { MessengerMessage, MessengerOutboxItem } from '../features/messenger/types';
import {
  cacheIncomingMessengerMessage,
  loadMessengerOutbox,
  markMessengerOutboxFailure,
  removeMessengerOutboxItem,
} from '../features/messenger/repository';
import {
  isMessengerConnectionError,
  messengerErrorMessage,
  sendMessengerText,
} from './messengerApi';
import { messengerLog } from './messengerLogger';
import { trackMessengerAction } from './analyticsService';

export type MessengerOutboxEvent =
  | { type: 'sending'; item: MessengerOutboxItem }
  | {
      type: 'sent';
      item: MessengerOutboxItem;
      message: MessengerMessage;
      created: boolean;
    }
  | { type: 'failed'; item: MessengerOutboxItem; error: unknown; message: string };

type MessengerOutboxListener = (event: MessengerOutboxEvent) => void;

interface MessengerOutboxState {
  running: Promise<void> | null;
  requested: boolean;
  lastEmptyAt: number;
}

interface MessengerOutboxPassResult {
  firstError: unknown | null;
  pendingCount: number;
}

const EMPTY_OUTBOX_RECHECK_INTERVAL_MS = 5_000;

const listeners = new Set<MessengerOutboxListener>();
const states = new WeakMap<SQLiteDatabase, MessengerOutboxState>();

function stateFor(db: SQLiteDatabase): MessengerOutboxState {
  const current = states.get(db);
  if (current) return current;
  const created: MessengerOutboxState = {
    running: null,
    requested: false,
    lastEmptyAt: 0,
  };
  states.set(db, created);
  return created;
}

function emit(event: MessengerOutboxEvent): void {
  listeners.forEach((listener) => {
    try {
      listener(event);
    } catch (error) {
      messengerLog('warn', 'outbox.listener.failed', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

export function subscribeMessengerOutbox(
  listener: MessengerOutboxListener,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function flushPass(db: SQLiteDatabase): Promise<MessengerOutboxPassResult> {
  const pending = await loadMessengerOutbox(db);
  if (!pending.length) return { firstError: null, pendingCount: 0 };
  messengerLog('debug', 'outbox.flush.started', {
    pending_count: pending.length,
    room_count: new Set(pending.map((item) => item.room_id)).size,
  });
  let firstError: unknown = null;
  for (const item of pending) {
    emit({ type: 'sending', item });
    messengerLog('debug', 'outbox.item.sending', {
      room_id: item.room_id,
      client_message_id: item.client_message_id,
      attempts: item.attempts,
      has_reply: Boolean(item.reply_to_message_id),
    });
    try {
      const result = await sendMessengerText(
        item.room_id,
        item.client_message_id,
        item.text,
        item.reply_to_message_id,
      );
      try {
        // The same atomic write also advances the cached room card. This is
        // especially important for a just-created direct room: returning to
        // the list must show it with the sent message without a remote reload.
        await cacheIncomingMessengerMessage(
          db,
          result.message,
          result.message.author.id,
        );
      } catch (cacheError) {
        // The server is authoritative and the realtime/room sync path can
        // repair this cache. Never leave an accepted message in the outbox.
        messengerLog('warn', 'outbox.message.cache_failed', {
          room_id: item.room_id,
          client_message_id: item.client_message_id,
          message: messengerErrorMessage(cacheError),
        });
      }
      await removeMessengerOutboxItem(db, item.client_message_id);
      emit({
        type: 'sent',
        item,
        message: result.message,
        created: result.created,
      });
      if (result.created) {
        trackMessengerAction('message_sent', {
          content_type: 'text',
          has_reply: Boolean(item.reply_to_message_id),
          source: 'composer',
        });
      }
      messengerLog('info', 'outbox.item.sent', {
        room_id: item.room_id,
        client_message_id: item.client_message_id,
        message_id: result.message.id,
        sequence: result.message.sequence,
        created_at: result.message.created_at,
        created: result.created,
      });
    } catch (error) {
      await markMessengerOutboxFailure(db, item.client_message_id, error);
      firstError ??= error;
      const message = messengerErrorMessage(error, 'Не удалось отправить сообщение');
      emit({ type: 'failed', item, error, message });
      messengerLog('warn', 'outbox.item.failed', {
        room_id: item.room_id,
        client_message_id: item.client_message_id,
        category: isMessengerConnectionError(error) ? 'connection' : 'server',
        message,
      });
      if (isMessengerConnectionError(error)) break;
    }
  }
  return { firstError, pendingCount: pending.length };
}

/**
 * Flushes the durable queue independently from any mounted room. Concurrent
 * callers share one process; a message enqueued during a successful pass
 * schedules another pass before the owner is released.
 */
export function flushMessengerOutbox(db: SQLiteDatabase): Promise<void> {
  const state = stateFor(db);
  if (state.running) {
    state.requested = true;
    return state.running;
  }

  let completedWithoutError = false;
  state.running = (async () => {
    let firstError: unknown = null;
    let processedPending = false;
    do {
      state.requested = false;
      const pass = await flushPass(db);
      firstError = pass.firstError;
      processedPending ||= pass.pendingCount > 0;
      if (pass.pendingCount === 0) state.lastEmptyAt = Date.now();
    } while (!firstError && state.requested);
    if (processedPending || firstError) {
      messengerLog(firstError ? 'warn' : 'debug', 'outbox.flush.finished', {
        failed: Boolean(firstError),
      });
    }
    if (firstError) throw firstError;
    completedWithoutError = true;
  })().finally(() => {
    const rerunRequested = completedWithoutError && state.requested;
    state.running = null;
    if (rerunRequested) {
      setTimeout(() => requestMessengerOutboxFlush(db), 0);
    }
  });
  return state.running;
}

export function requestMessengerOutboxFlush(db: SQLiteDatabase): void {
  const state = stateFor(db);
  if (
    !state.running &&
    Date.now() - state.lastEmptyAt < EMPTY_OUTBOX_RECHECK_INTERVAL_MS
  ) {
    return;
  }
  void flushMessengerOutbox(db).catch(() => undefined);
}
