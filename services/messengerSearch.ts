import type { SQLiteDatabase } from "expo-sqlite";
import {
  cacheMessengerMessages,
  searchCachedMessengerMessages,
  type MessengerCachedMessageSearchOptions,
} from "../features/messenger/repository";
import {
  searchMessengerMessages,
  type MessengerMessageSearchResponse,
} from "./messengerApi";
import { messengerLog } from "./messengerLogger";

const SERVER_CURSOR_PREFIX = "server:";

export type MessengerSearchSource = "local" | "server";
export type MessengerSearchResult = MessengerMessageSearchResponse & {
  source: MessengerSearchSource;
};

function serverCursor(cursor: string | undefined): string | undefined {
  if (!cursor?.startsWith(SERVER_CURSOR_PREFIX)) return undefined;
  try {
    return decodeURIComponent(cursor.slice(SERVER_CURSOR_PREFIX.length));
  } catch {
    return undefined;
  }
}

function taggedServerCursor(cursor: string | null): string | null {
  return cursor
    ? `${SERVER_CURSOR_PREFIX}${encodeURIComponent(cursor)}`
    : null;
}

/**
 * SQLite is the primary search index. The server is queried only when the
 * device has no local match at all, which also repairs a freshly installed or
 * not-yet-backfilled cache without making normal searches network-dependent.
 */
export async function searchMessengerMessagesLocallyFirst(
  db: SQLiteDatabase,
  options: MessengerCachedMessageSearchOptions,
): Promise<MessengerSearchResult> {
  const remoteCursor = serverCursor(options.cursor);
  if (!remoteCursor && options.cursor?.startsWith(SERVER_CURSOR_PREFIX)) {
    return {
      items: [],
      page: { has_more: false, next_cursor: null },
      source: "server",
    };
  }

  if (remoteCursor) {
    const remote = await searchMessengerMessages({
      ...options,
      cursor: remoteCursor,
    });
    if (remote.items.length) {
      await cacheMessengerMessages(db, remote.items);
    }
    return {
      ...remote,
      source: "server",
      page: {
        ...remote.page,
        next_cursor: taggedServerCursor(remote.page.next_cursor),
      },
    };
  }

  const local = await searchCachedMessengerMessages(db, options);
  if (local.items.length || local.page.has_more || options.cursor) {
    messengerLog("debug", "search.local.completed", {
      room_id: options.roomId,
      result_count: local.items.length,
      has_more: local.page.has_more,
    });
    return { ...local, source: "local" };
  }

  try {
    const remote = await searchMessengerMessages({ ...options, cursor: undefined });
    if (remote.items.length) {
      await cacheMessengerMessages(db, remote.items);
    }
    messengerLog("info", "search.server_fallback.completed", {
      room_id: options.roomId,
      result_count: remote.items.length,
      has_more: remote.page.has_more,
    });
    return {
      ...remote,
      source: "server",
      page: {
        ...remote.page,
        next_cursor: taggedServerCursor(remote.page.next_cursor),
      },
    };
  } catch (error) {
    messengerLog("debug", "search.server_fallback.deferred", {
      room_id: options.roomId,
      message: error instanceof Error ? error.message : String(error),
    });
    return { ...local, source: "local" };
  }
}
