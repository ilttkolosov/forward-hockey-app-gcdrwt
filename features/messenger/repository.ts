import type { SQLiteDatabase } from "expo-sqlite";
import { Platform } from "react-native";
import { applyMessengerAliases } from "./aliases";
import { mergeMessengerDelivery } from "./feed";
import type {
  MessengerMessage,
  MessengerMessageDeliveryUpdate,
  MessengerOutboxItem,
  MessengerRoom,
} from "./types";

interface RoomRow {
  raw_json: string;
  local_read_sequence?: string | null;
}

interface MessageRow {
  raw_json: string;
}

interface IdentifiedMessageRow extends MessageRow {
  id: string;
}

interface SearchMessageRow extends MessageRow {
  created_at: string;
}

interface MessageBoundsRow {
  oldest_sequence: string | null;
  latest_sequence: string | null;
}

interface HistoryStateRow {
  history_complete: number;
}

interface ReadStateRow {
  room_id: string;
  local_read_sequence: string;
  synced_read_sequence: string;
  pending_read_sequence: string | null;
}

export interface MessengerLocalReadState {
  room_id: string;
  local_read_sequence: string;
  synced_read_sequence: string;
  pending_read_sequence: string | null;
}

export interface MessengerMessageWindowOptions {
  anchorSequence?: string | null;
  hasUnread?: boolean;
  limit?: number;
}

export interface MessengerCachedMessageSearchOptions {
  query?: string;
  roomId?: string;
  authorUserId?: string;
  dateFrom?: string;
  dateTo?: string;
  cursor?: string;
  limit?: number;
}

export interface MessengerCachedMessageSearchResult {
  items: MessengerMessage[];
  page: {
    has_more: boolean;
    next_cursor: string | null;
  };
}

const messengerWriteQueues = new WeakMap<SQLiteDatabase, Promise<void>>();
const messengerRoomCacheWrites = new WeakMap<
  SQLiteDatabase,
  WeakMap<MessengerRoom[], Promise<MessengerRoom[]>>
>();

function enqueueMessengerWrite<T>(
  db: SQLiteDatabase,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = messengerWriteQueues.get(db) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  messengerWriteQueues.set(
    db,
    current.then(
      () => undefined,
      () => undefined,
    ),
  );
  return current;
}

async function withMessengerTransaction(
  db: SQLiteDatabase,
  operation: (transaction: SQLiteDatabase) => Promise<void>,
): Promise<void> {
  if (Platform.OS === "web") {
    await db.withTransactionAsync(() => operation(db));
    return;
  }
  await db.withExclusiveTransactionAsync(operation);
}

function parseJson<T>(value: string): T | null {
  try {
    return applyMessengerAliases(JSON.parse(value) as T);
  } catch {
    return null;
  }
}

function sequenceIsNewer(candidate: string, current: string): boolean {
  const left = candidate.replace(/^0+/, "") || "0";
  const right = current.replace(/^0+/, "") || "0";
  return left.length !== right.length
    ? left.length > right.length
    : left.localeCompare(right) > 0;
}

function newestSequence(left: string, right: string): string {
  return sequenceIsNewer(left, right) ? left : right;
}

function parsedMessages(rows: MessageRow[]): MessengerMessage[] {
  return rows
    .map((row) => parseJson<MessengerMessage>(row.raw_json))
    .filter((message): message is MessengerMessage => message !== null);
}

function normalizedSearchText(value: string): string {
  return value
    .replace(/[\u2060-\u2063]/g, "")
    .normalize("NFKC")
    .toLocaleLowerCase("ru-RU");
}

function messengerMessageSearchText(message: MessengerMessage): string {
  const mediaNames = (message.media_items?.length
    ? message.media_items
    : message.media
      ? [message.media]
      : []
  )
    .map((item) => item.original_name)
    .join(" ");
  return normalizedSearchText(
    [message.text, mediaNames, message.author.display_name]
      .filter(Boolean)
      .join(" "),
  );
}

function localSearchOffset(cursor: string | undefined): number {
  if (!cursor?.startsWith("local:")) return 0;
  const value = Number(cursor.slice("local:".length));
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function parsedRoom(row: RoomRow | null | undefined): MessengerRoom | null {
  if (!row) return null;
  const room = parseJson<MessengerRoom>(row.raw_json);
  if (!room || !row.local_read_sequence) return room;
  return reconcileRoomWithLocalRead(room, row.local_read_sequence);
}

function reconcileRoomWithLocalRead(
  room: MessengerRoom,
  localReadSequence: string,
): MessengerRoom {
  const effectiveReadSequence = newestSequence(
    localReadSequence,
    room.last_read_sequence,
  );
  return {
    ...room,
    last_read_sequence: effectiveReadSequence,
    unread_count:
      room.last_message &&
      !sequenceIsNewer(room.last_message.sequence, effectiveReadSequence)
        ? 0
        : room.unread_count,
  };
}

export async function loadCachedMessengerRooms(
  db: SQLiteDatabase,
): Promise<MessengerRoom[]> {
  const rows = await db.getAllAsync<RoomRow>(
    `SELECT room.raw_json, read_state.local_read_sequence
       FROM messenger_rooms room
       LEFT JOIN messenger_room_read_state read_state ON read_state.room_id = room.id
      ORDER BY CASE WHEN kind = 'direct' THEN 1 ELSE 0 END,
               team_name, sort_order, title`,
  );
  return rows
    .map(parsedRoom)
    .filter((room): room is MessengerRoom => room !== null);
}

export async function loadCachedMessengerRoom(
  db: SQLiteDatabase,
  roomId: string,
): Promise<MessengerRoom | null> {
  const row = await db.getFirstAsync<RoomRow>(
    `SELECT room.raw_json, read_state.local_read_sequence
       FROM messenger_rooms room
       LEFT JOIN messenger_room_read_state read_state ON read_state.room_id = room.id
      WHERE room.id = ?`,
    roomId,
  );
  return parsedRoom(row);
}

export function cacheMessengerRooms(
  db: SQLiteDatabase,
  rooms: MessengerRoom[],
): Promise<MessengerRoom[]> {
  let writesForDatabase = messengerRoomCacheWrites.get(db);
  if (!writesForDatabase) {
    writesForDatabase = new WeakMap();
    messengerRoomCacheWrites.set(db, writesForDatabase);
  }
  const existingWrite = writesForDatabase.get(rooms);
  if (existingWrite) return existingWrite;
  const reconciledRooms: MessengerRoom[] = [];
  const write = enqueueMessengerWrite(db, async () => {
    await withMessengerTransaction(db, async (transaction) => {
      const existingRows = await transaction.getAllAsync<
        RoomRow & { id: string }
      >("SELECT id, raw_json FROM messenger_rooms");
      const readStateRows = await transaction.getAllAsync<ReadStateRow>(
        `SELECT room_id, local_read_sequence, synced_read_sequence, pending_read_sequence
           FROM messenger_room_read_state`,
      );
      const existingById = new Map(
        existingRows
          .map(
            (row) => [row.id, parseJson<MessengerRoom>(row.raw_json)] as const,
          )
          .filter(
            (entry): entry is readonly [string, MessengerRoom] =>
              entry[1] !== null,
          ),
      );
      const localReadByRoomId = new Map(
        readStateRows.map(
          (state) => [state.room_id, state.local_read_sequence] as const,
        ),
      );
      await transaction.runAsync("DELETE FROM messenger_rooms");
      for (const room of rooms) {
        const existing = existingById.get(room.id);
        const keepLocalTail = Boolean(
          existing?.last_message &&
          sequenceIsNewer(
            existing.last_message.sequence,
            room.last_message?.sequence || "0",
          ),
        );
        const mergedRoom: MessengerRoom =
          keepLocalTail && existing
            ? {
                ...room,
                last_message: existing.last_message,
                unread_count: Math.max(
                  room.unread_count,
                  existing.unread_count,
                ),
              }
            : room;
        // A request for `/chat/rooms` may have started before the user read the
        // visible tail and finish after it. Never let that older server
        // snapshot move the device cursor backwards or resurrect its badge.
        const localReadSequence = newestSequence(
          localReadByRoomId.get(room.id) || "0",
          existing?.last_read_sequence || "0",
        );
        const nextRoom = reconcileRoomWithLocalRead(
          mergedRoom,
          localReadSequence,
        );
        reconciledRooms.push(nextRoom);
        await transaction.runAsync(
          `INSERT INTO messenger_rooms
          (id, team_id, team_name, kind, title, sort_order, unread_count, updated_at, raw_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          nextRoom.id,
          nextRoom.team_id,
          nextRoom.team_name,
          nextRoom.kind,
          nextRoom.title,
          nextRoom.sort_order,
          nextRoom.unread_count,
          new Date().toISOString(),
          JSON.stringify(nextRoom),
        );
      }
    });
    return reconciledRooms;
  });
  writesForDatabase.set(rooms, write);
  void write.then(
    () => {
      if (writesForDatabase?.get(rooms) === write) {
        writesForDatabase.delete(rooms);
      }
    },
    () => {
      if (writesForDatabase?.get(rooms) === write) {
        writesForDatabase.delete(rooms);
      }
    },
  );
  return write;
}

/** Upserts one authoritative room without evicting the rest of the room cache. */
export function cacheMessengerRoomSnapshot(
  db: SQLiteDatabase,
  room: MessengerRoom,
): Promise<MessengerRoom> {
  return enqueueMessengerWrite(db, async () => {
    const readState = await db.getFirstAsync<
      Pick<ReadStateRow, "local_read_sequence">
    >(
      `SELECT local_read_sequence
         FROM messenger_room_read_state
        WHERE room_id = ?`,
      room.id,
    );
    const nextRoom = reconcileRoomWithLocalRead(
      room,
      readState?.local_read_sequence || room.last_read_sequence,
    );
    await db.runAsync(
      `INSERT INTO messenger_rooms
        (id, team_id, team_name, kind, title, sort_order, unread_count, updated_at, raw_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         team_id = excluded.team_id,
         team_name = excluded.team_name,
         kind = excluded.kind,
         title = excluded.title,
         sort_order = excluded.sort_order,
         unread_count = excluded.unread_count,
         updated_at = excluded.updated_at,
         raw_json = excluded.raw_json`,
      nextRoom.id,
      nextRoom.team_id,
      nextRoom.team_name,
      nextRoom.kind,
      nextRoom.title,
      nextRoom.sort_order,
      nextRoom.unread_count,
      new Date().toISOString(),
      JSON.stringify(nextRoom),
    );
    return nextRoom;
  });
}

export function markCachedMessengerRoomRead(
  db: SQLiteDatabase,
  roomId: string,
  sequence: string,
  currentUserId?: string,
): Promise<void> {
  return enqueueMessengerWrite(db, async () => {
    const row = await db.getFirstAsync<RoomRow>(
      "SELECT raw_json FROM messenger_rooms WHERE id = ?",
      roomId,
    );
    const room = row ? parseJson<MessengerRoom>(row.raw_json) : null;
    const existing = await db.getFirstAsync<ReadStateRow>(
      `SELECT room_id, local_read_sequence, synced_read_sequence, pending_read_sequence
         FROM messenger_room_read_state
        WHERE room_id = ?`,
      roomId,
    );
    const serverSequence = room?.last_read_sequence || "0";
    const localSequence = existing?.local_read_sequence || serverSequence;
    const syncedSequence = existing?.synced_read_sequence || serverSequence;
    const nextSequence = newestSequence(sequence, localSequence);
    const pendingSequence = sequenceIsNewer(nextSequence, syncedSequence)
      ? newestSequence(nextSequence, existing?.pending_read_sequence || "0")
      : existing?.pending_read_sequence || null;
    const updatedAt = new Date().toISOString();
    await db.runAsync(
      `INSERT INTO messenger_room_read_state
        (room_id, local_read_sequence, synced_read_sequence, pending_read_sequence, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(room_id) DO UPDATE SET
         local_read_sequence = excluded.local_read_sequence,
         pending_read_sequence = excluded.pending_read_sequence,
         updated_at = excluded.updated_at`,
      roomId,
      nextSequence,
      syncedSequence,
      pendingSequence,
      updatedAt,
    );
    if (room) {
      const unreadRow = currentUserId
        ? await db.getFirstAsync<{ unread_count: number }>(
            `SELECT COUNT(*) AS unread_count
               FROM messenger_messages
              WHERE room_id = ?
                AND CAST(sequence AS INTEGER) > CAST(? AS INTEGER)
                AND json_extract(raw_json, '$.author.id') <> ?`,
            roomId,
            nextSequence,
            currentUserId,
          )
        : null;
      const nextRoom: MessengerRoom = {
        ...room,
        last_read_sequence: newestSequence(
          nextSequence,
          room.last_read_sequence,
        ),
        unread_count: unreadRow?.unread_count ?? room.unread_count,
      };
      await db.runAsync(
        `UPDATE messenger_rooms
            SET unread_count = ?, updated_at = ?, raw_json = ?
          WHERE id = ?`,
        nextRoom.unread_count,
        updatedAt,
        JSON.stringify(nextRoom),
        roomId,
      );
    }
  });
}

export async function loadMessengerLocalReadState(
  db: SQLiteDatabase,
  roomId: string,
  fallbackSequence = "0",
): Promise<MessengerLocalReadState> {
  return enqueueMessengerWrite(db, async () => {
    const existing = await db.getFirstAsync<ReadStateRow>(
      `SELECT room_id, local_read_sequence, synced_read_sequence, pending_read_sequence
         FROM messenger_room_read_state
        WHERE room_id = ?`,
      roomId,
    );
    const localSequence = newestSequence(
      existing?.local_read_sequence || "0",
      fallbackSequence,
    );
    const syncedSequence = newestSequence(
      existing?.synced_read_sequence || "0",
      fallbackSequence,
    );
    const pendingSequence =
      existing?.pending_read_sequence &&
      sequenceIsNewer(existing.pending_read_sequence, syncedSequence)
        ? existing.pending_read_sequence
        : null;
    const state: MessengerLocalReadState = {
      room_id: roomId,
      local_read_sequence: localSequence,
      synced_read_sequence: syncedSequence,
      pending_read_sequence: pendingSequence,
    };
    await db.runAsync(
      `INSERT INTO messenger_room_read_state
        (room_id, local_read_sequence, synced_read_sequence, pending_read_sequence, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(room_id) DO UPDATE SET
         local_read_sequence = excluded.local_read_sequence,
         synced_read_sequence = excluded.synced_read_sequence,
         pending_read_sequence = excluded.pending_read_sequence,
         updated_at = excluded.updated_at`,
      roomId,
      localSequence,
      syncedSequence,
      pendingSequence,
      new Date().toISOString(),
    );
    return state;
  });
}

export async function loadPendingMessengerReadReceipts(
  db: SQLiteDatabase,
): Promise<MessengerLocalReadState[]> {
  const rows = await db.getAllAsync<ReadStateRow>(
    `SELECT room_id, local_read_sequence, synced_read_sequence, pending_read_sequence
       FROM messenger_room_read_state
      WHERE pending_read_sequence IS NOT NULL`,
  );
  return rows;
}

export function markMessengerReadReceiptSynced(
  db: SQLiteDatabase,
  roomId: string,
  sequence: string,
): Promise<void> {
  return enqueueMessengerWrite(db, async () => {
    const existing = await db.getFirstAsync<ReadStateRow>(
      `SELECT room_id, local_read_sequence, synced_read_sequence, pending_read_sequence
         FROM messenger_room_read_state
        WHERE room_id = ?`,
      roomId,
    );
    if (!existing) return;
    const syncedSequence = newestSequence(
      sequence,
      existing.synced_read_sequence,
    );
    const pendingSequence =
      existing.pending_read_sequence &&
      sequenceIsNewer(existing.pending_read_sequence, syncedSequence)
        ? existing.pending_read_sequence
        : null;
    await db.runAsync(
      `UPDATE messenger_room_read_state
          SET synced_read_sequence = ?, pending_read_sequence = ?, updated_at = ?
        WHERE room_id = ?`,
      syncedSequence,
      pendingSequence,
      new Date().toISOString(),
      roomId,
    );
  });
}

export async function loadCachedMessengerMessages(
  db: SQLiteDatabase,
  roomId: string,
): Promise<MessengerMessage[]> {
  const rows = await db.getAllAsync<MessageRow>(
    `SELECT raw_json
       FROM messenger_messages
      WHERE room_id = ?
      ORDER BY CAST(sequence AS INTEGER), created_at`,
    roomId,
  );
  return parsedMessages(rows);
}

/**
 * Searches only messages already authorised and persisted on this device.
 * Text matching is completed in JavaScript because stock SQLite LOWER/LIKE
 * does not case-fold Cyrillic reliably on every iOS/Android build.
 */
export async function searchCachedMessengerMessages(
  db: SQLiteDatabase,
  options: MessengerCachedMessageSearchOptions,
): Promise<MessengerCachedMessageSearchResult> {
  const clauses = ["message.raw_json IS NOT NULL"];
  const values: (string | number)[] = [];
  if (options.roomId) {
    clauses.push("message.room_id = ?");
    values.push(options.roomId);
  }
  if (options.authorUserId) {
    clauses.push("json_extract(message.raw_json, '$.author.id') = ?");
    values.push(options.authorUserId);
  }
  if (options.dateFrom) {
    clauses.push("message.created_at >= ?");
    values.push(options.dateFrom);
  }
  if (options.dateTo) {
    clauses.push("message.created_at <= ?");
    values.push(options.dateTo);
  }

  const rows = await db.getAllAsync<SearchMessageRow>(
    `SELECT message.raw_json, message.created_at
       FROM messenger_messages message
       JOIN messenger_rooms room ON room.id = message.room_id
      WHERE ${clauses.join(" AND ")}
      ORDER BY message.created_at DESC, CAST(message.sequence AS INTEGER) DESC`,
    ...values,
  );
  const needle = normalizedSearchText(options.query?.trim() || "");
  const matches = parsedMessages(rows).filter(
    (message) =>
      !message.deleted_at &&
      (!needle || messengerMessageSearchText(message).includes(needle)),
  );
  const offset = localSearchOffset(options.cursor);
  const limit = Math.max(1, Math.min(100, options.limit ?? 50));
  const items = matches.slice(offset, offset + limit);
  const nextOffset = offset + items.length;
  const hasMore = nextOffset < matches.length;
  return {
    items,
    page: {
      has_more: hasMore,
      next_cursor: hasMore ? `local:${nextOffset}` : null,
    },
  };
}

/**
 * Loads only the first viewport from SQLite. For a room with unread messages
 * the window is centred around the local read cursor; otherwise it contains
 * the newest messages. This keeps FlatList independent from the total history
 * size while preserving a stable unread anchor.
 */
export async function loadCachedMessengerMessageWindow(
  db: SQLiteDatabase,
  roomId: string,
  options: MessengerMessageWindowOptions = {},
): Promise<MessengerMessage[]> {
  const limit = Math.max(1, Math.min(100, options.limit ?? 20));
  const anchor = options.anchorSequence || "0";

  if (options.hasUnread && anchor !== "0") {
    const afterLimit = Math.max(1, Math.floor(limit / 2));
    const afterRows = await db.getAllAsync<MessageRow>(
      `SELECT raw_json
         FROM messenger_messages
        WHERE room_id = ? AND CAST(sequence AS INTEGER) > CAST(? AS INTEGER)
        ORDER BY CAST(sequence AS INTEGER), created_at
        LIMIT ?`,
      roomId,
      anchor,
      afterLimit,
    );
    const beforeLimit = Math.max(1, limit - afterRows.length);
    const beforeRows = await db.getAllAsync<MessageRow>(
      `SELECT raw_json
         FROM messenger_messages
        WHERE room_id = ? AND CAST(sequence AS INTEGER) <= CAST(? AS INTEGER)
        ORDER BY CAST(sequence AS INTEGER) DESC, created_at DESC
        LIMIT ?`,
      roomId,
      anchor,
      beforeLimit,
    );
    return parsedMessages([...beforeRows.reverse(), ...afterRows]);
  }

  if (options.hasUnread) {
    const rows = await db.getAllAsync<MessageRow>(
      `SELECT raw_json
         FROM messenger_messages
        WHERE room_id = ?
        ORDER BY CAST(sequence AS INTEGER), created_at
        LIMIT ?`,
      roomId,
      limit,
    );
    return parsedMessages(rows);
  }

  const rows = await db.getAllAsync<MessageRow>(
    `SELECT raw_json
       FROM messenger_messages
      WHERE room_id = ?
      ORDER BY CAST(sequence AS INTEGER) DESC, created_at DESC
      LIMIT ?`,
    roomId,
    limit,
  );
  return parsedMessages(rows.reverse());
}

export async function loadCachedMessengerMessageContext(
  db: SQLiteDatabase,
  roomId: string,
  anchorSequence: string,
  limit = 30,
): Promise<MessengerMessage[]> {
  const boundedLimit = Math.max(3, Math.min(100, limit));
  const beforeLimit = Math.ceil(boundedLimit / 2);
  const beforeRows = await db.getAllAsync<MessageRow>(
    `SELECT raw_json
       FROM messenger_messages
      WHERE room_id = ? AND CAST(sequence AS INTEGER) <= CAST(? AS INTEGER)
      ORDER BY CAST(sequence AS INTEGER) DESC, created_at DESC
      LIMIT ?`,
    roomId,
    anchorSequence,
    beforeLimit,
  );
  const afterRows = await db.getAllAsync<MessageRow>(
    `SELECT raw_json
       FROM messenger_messages
      WHERE room_id = ? AND CAST(sequence AS INTEGER) > CAST(? AS INTEGER)
      ORDER BY CAST(sequence AS INTEGER), created_at
      LIMIT ?`,
    roomId,
    anchorSequence,
    boundedLimit - beforeRows.length,
  );
  return parsedMessages([...beforeRows.reverse(), ...afterRows]);
}

export async function loadCachedMessengerMessagesBefore(
  db: SQLiteDatabase,
  roomId: string,
  beforeSequence: string,
  limit = 20,
): Promise<MessengerMessage[]> {
  const rows = await db.getAllAsync<MessageRow>(
    `SELECT raw_json
       FROM messenger_messages
      WHERE room_id = ? AND CAST(sequence AS INTEGER) < CAST(? AS INTEGER)
      ORDER BY CAST(sequence AS INTEGER) DESC, created_at DESC
      LIMIT ?`,
    roomId,
    beforeSequence,
    Math.max(1, Math.min(100, limit)),
  );
  return parsedMessages(rows.reverse());
}

export async function loadCachedMessengerMessagesAfter(
  db: SQLiteDatabase,
  roomId: string,
  afterSequence: string,
  limit = 20,
): Promise<MessengerMessage[]> {
  const rows = await db.getAllAsync<MessageRow>(
    `SELECT raw_json
       FROM messenger_messages
      WHERE room_id = ? AND CAST(sequence AS INTEGER) > CAST(? AS INTEGER)
      ORDER BY CAST(sequence AS INTEGER), created_at
      LIMIT ?`,
    roomId,
    afterSequence,
    Math.max(1, Math.min(100, limit)),
  );
  return parsedMessages(rows);
}

export async function loadCachedMessengerMessageBounds(
  db: SQLiteDatabase,
  roomId: string,
): Promise<{ oldest_sequence: string | null; latest_sequence: string | null }> {
  const row = await db.getFirstAsync<MessageBoundsRow>(
    `SELECT CAST(MIN(CAST(sequence AS INTEGER)) AS TEXT) AS oldest_sequence,
            CAST(MAX(CAST(sequence AS INTEGER)) AS TEXT) AS latest_sequence
       FROM messenger_messages
      WHERE room_id = ?`,
    roomId,
  );
  return {
    oldest_sequence: row?.oldest_sequence ?? null,
    latest_sequence: row?.latest_sequence ?? null,
  };
}

export async function cacheMessengerMessages(
  db: SQLiteDatabase,
  messages: MessengerMessage[],
): Promise<void> {
  await enqueueMessengerWrite(db, () =>
    withMessengerTransaction(db, async (transaction) => {
      const messageIds = [...new Set(messages.map((message) => message.id))];
      const existingById = new Map<string, MessengerMessage>();
      if (messageIds.length) {
        const placeholders = messageIds.map(() => "?").join(", ");
        const existingRows =
          await transaction.getAllAsync<IdentifiedMessageRow>(
            `SELECT id, raw_json
             FROM messenger_messages
            WHERE id IN (${placeholders})`,
            ...messageIds,
          );
        for (const row of existingRows) {
          const existing = parseJson<MessengerMessage>(row.raw_json);
          if (existing) existingById.set(row.id, existing);
        }
      }
      for (const message of messages) {
        const existing = existingById.get(message.id);
        const cachedMessage = existing
          ? {
              ...message,
              delivery: mergeMessengerDelivery(
                existing.delivery,
                message.delivery,
              ),
            }
          : message;
        await transaction.runAsync(
          `INSERT INTO messenger_messages
          (id, room_id, sequence, client_message_id, created_at, raw_json)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           sequence = excluded.sequence,
           client_message_id = excluded.client_message_id,
           created_at = excluded.created_at,
           raw_json = excluded.raw_json`,
          cachedMessage.id,
          cachedMessage.room_id,
          cachedMessage.sequence,
          cachedMessage.client_message_id,
          cachedMessage.created_at,
          JSON.stringify(cachedMessage),
        );
      }
    }),
  );
}

/** Persists a live/push message and advances the cached room card atomically. */
export function cacheIncomingMessengerMessage(
  db: SQLiteDatabase,
  message: MessengerMessage,
  currentUserId: string,
): Promise<void> {
  return enqueueMessengerWrite(db, () =>
    withMessengerTransaction(db, async (transaction) => {
      const existingRow = await transaction.getFirstAsync<IdentifiedMessageRow>(
        "SELECT id, raw_json FROM messenger_messages WHERE id = ?",
        message.id,
      );
      const existingMessage = existingRow
        ? parseJson<MessengerMessage>(existingRow.raw_json)
        : null;
      const cachedMessage = existingMessage
        ? {
            ...message,
            delivery: mergeMessengerDelivery(
              existingMessage.delivery,
              message.delivery,
            ),
          }
        : message;
      await transaction.runAsync(
        `INSERT INTO messenger_messages
          (id, room_id, sequence, client_message_id, created_at, raw_json)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           sequence = excluded.sequence,
           client_message_id = excluded.client_message_id,
           created_at = excluded.created_at,
           raw_json = excluded.raw_json`,
        cachedMessage.id,
        cachedMessage.room_id,
        cachedMessage.sequence,
        cachedMessage.client_message_id,
        cachedMessage.created_at,
        JSON.stringify(cachedMessage),
      );

      const roomRow = await transaction.getFirstAsync<RoomRow>(
        "SELECT raw_json FROM messenger_rooms WHERE id = ?",
        cachedMessage.room_id,
      );
      const room = roomRow ? parseJson<MessengerRoom>(roomRow.raw_json) : null;
      if (!room) return;
      const readState = await transaction.getFirstAsync<ReadStateRow>(
        `SELECT room_id, local_read_sequence, synced_read_sequence, pending_read_sequence
           FROM messenger_room_read_state
          WHERE room_id = ?`,
        message.room_id,
      );
      const localReadSequence = newestSequence(
        readState?.local_read_sequence || "0",
        room.last_read_sequence,
      );
      const isNewer = sequenceIsNewer(
        message.sequence,
        room.last_message?.sequence || "0",
      );
      const shouldIncrementUnread =
        !existingRow &&
        isNewer &&
        message.author.id !== currentUserId &&
        sequenceIsNewer(message.sequence, localReadSequence);
      const nextRoom: MessengerRoom = {
        ...room,
        last_read_sequence: localReadSequence,
        unread_count: room.unread_count + (shouldIncrementUnread ? 1 : 0),
        last_message: isNewer
          ? {
              id: message.id,
              sequence: message.sequence,
              kind: message.kind,
              text: message.text,
              created_at: message.created_at,
              media: message.media,
              media_items: message.media_items,
              location: message.location,
              author: {
                id: message.author.id,
                display_name: message.author.display_name,
                avatar_url: message.author.avatar_url,
              },
            }
          : room.last_message,
      };
      await transaction.runAsync(
        `UPDATE messenger_rooms
            SET unread_count = ?, updated_at = ?, raw_json = ?
          WHERE id = ?`,
        nextRoom.unread_count,
        new Date().toISOString(),
        JSON.stringify(nextRoom),
        message.room_id,
      );
    }),
  );
}

/** Persists an edit/tombstone while preserving per-device reaction state. */
export function cacheUpdatedMessengerMessage(
  db: SQLiteDatabase,
  incoming: MessengerMessage,
): Promise<void> {
  return enqueueMessengerWrite(db, () =>
    withMessengerTransaction(db, async (transaction) => {
      const existingRow = await transaction.getFirstAsync<MessageRow>(
        "SELECT raw_json FROM messenger_messages WHERE id = ?",
        incoming.id,
      );
      const existing = existingRow
        ? parseJson<MessengerMessage>(existingRow.raw_json)
        : null;
      const message: MessengerMessage = {
        ...incoming,
        reactions: existing?.reactions ?? incoming.reactions,
        delivery: existing
          ? mergeMessengerDelivery(existing.delivery, incoming.delivery)
          : incoming.delivery,
      };
      await transaction.runAsync(
        `INSERT INTO messenger_messages
          (id, room_id, sequence, client_message_id, created_at, raw_json)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           sequence = excluded.sequence,
           client_message_id = excluded.client_message_id,
           created_at = excluded.created_at,
           raw_json = excluded.raw_json`,
        message.id,
        message.room_id,
        message.sequence,
        message.client_message_id,
        message.created_at,
        JSON.stringify(message),
      );

      const roomRow = await transaction.getFirstAsync<RoomRow>(
        "SELECT raw_json FROM messenger_rooms WHERE id = ?",
        message.room_id,
      );
      const room = roomRow ? parseJson<MessengerRoom>(roomRow.raw_json) : null;
      if (!room || room.last_message?.id !== message.id) return;
      const nextRoom: MessengerRoom = {
        ...room,
        last_message: {
          ...room.last_message,
          kind: message.kind,
          text: message.deleted_at ? "Сообщение удалено" : message.text,
          media: message.deleted_at ? null : message.media,
          media_items: message.deleted_at ? [] : message.media_items,
          location: message.deleted_at ? null : message.location,
        },
      };
      await transaction.runAsync(
        `UPDATE messenger_rooms
            SET updated_at = ?, raw_json = ?
          WHERE id = ?`,
        new Date().toISOString(),
        JSON.stringify(nextRoom),
        message.room_id,
      );
    }),
  );
}

/** Persists receipt aggregates without changing message order or room cards. */
export function cacheMessengerDeliveryUpdates(
  db: SQLiteDatabase,
  updates: readonly MessengerMessageDeliveryUpdate[],
): Promise<void> {
  if (!updates.length) return Promise.resolve();
  return enqueueMessengerWrite(db, () =>
    withMessengerTransaction(db, async (transaction) => {
      for (const update of updates) {
        const row = await transaction.getFirstAsync<MessageRow>(
          "SELECT raw_json FROM messenger_messages WHERE id = ?",
          update.message_id,
        );
        const message = row ? parseJson<MessengerMessage>(row.raw_json) : null;
        if (!message) continue;
        const delivery = mergeMessengerDelivery(
          message.delivery,
          update.delivery,
        );
        if (delivery === message.delivery) continue;
        await transaction.runAsync(
          "UPDATE messenger_messages SET raw_json = ? WHERE id = ?",
          JSON.stringify({ ...message, delivery }),
          update.message_id,
        );
      }
    }),
  );
}

export function enqueueMessengerText(
  db: SQLiteDatabase,
  item: Omit<MessengerOutboxItem, "attempts" | "last_error">,
) {
  return enqueueMessengerWrite(db, () =>
    db.runAsync(
      `INSERT OR IGNORE INTO messenger_outbox
      (client_message_id, room_id, text, reply_to_message_id, created_at, attempts, last_error)
     VALUES (?, ?, ?, ?, ?, 0, NULL)`,
      item.client_message_id,
      item.room_id,
      item.text,
      item.reply_to_message_id,
      item.created_at,
    ),
  );
}

export function replaceMessengerOutboxItem(
  db: SQLiteDatabase,
  previousClientMessageId: string,
  item: Omit<MessengerOutboxItem, "attempts" | "last_error">,
) {
  return enqueueMessengerWrite(db, () =>
    withMessengerTransaction(db, async (transaction) => {
      await transaction.runAsync(
        "DELETE FROM messenger_outbox WHERE client_message_id = ?",
        previousClientMessageId,
      );
      await transaction.runAsync(
        `INSERT INTO messenger_outbox
          (client_message_id, room_id, text, reply_to_message_id, created_at, attempts, last_error)
         VALUES (?, ?, ?, ?, ?, 0, NULL)`,
        item.client_message_id,
        item.room_id,
        item.text,
        item.reply_to_message_id,
        item.created_at,
      );
    }),
  );
}

export function loadMessengerOutbox(db: SQLiteDatabase, roomId?: string) {
  if (roomId) {
    return db.getAllAsync<MessengerOutboxItem>(
      "SELECT * FROM messenger_outbox WHERE room_id = ? ORDER BY created_at",
      roomId,
    );
  }
  return db.getAllAsync<MessengerOutboxItem>(
    "SELECT * FROM messenger_outbox ORDER BY created_at",
  );
}

export function removeMessengerOutboxItem(
  db: SQLiteDatabase,
  clientMessageId: string,
) {
  return enqueueMessengerWrite(db, () =>
    db.runAsync(
      "DELETE FROM messenger_outbox WHERE client_message_id = ?",
      clientMessageId,
    ),
  );
}

export function removeMessengerOutboxItems(
  db: SQLiteDatabase,
  clientMessageIds: string[],
) {
  if (!clientMessageIds.length) return Promise.resolve();
  return enqueueMessengerWrite(db, () =>
    withMessengerTransaction(db, async (transaction) => {
      for (const clientMessageId of clientMessageIds) {
        await transaction.runAsync(
          "DELETE FROM messenger_outbox WHERE client_message_id = ?",
          clientMessageId,
        );
      }
    }),
  );
}

export function markMessengerOutboxFailure(
  db: SQLiteDatabase,
  clientMessageId: string,
  error: unknown,
) {
  return enqueueMessengerWrite(db, () =>
    db.runAsync(
      `UPDATE messenger_outbox
        SET attempts = attempts + 1, last_error = ?
      WHERE client_message_id = ?`,
      error instanceof Error
        ? error.message.slice(0, 500)
        : String(error).slice(0, 500),
      clientMessageId,
    ),
  );
}

export async function isMessengerRoomHistoryComplete(
  db: SQLiteDatabase,
  roomId: string,
): Promise<boolean> {
  const row = await db.getFirstAsync<HistoryStateRow>(
    `SELECT history_complete
       FROM messenger_room_cache_state
      WHERE room_id = ?`,
    roomId,
  );
  return row?.history_complete === 1;
}

export function markMessengerRoomHistoryComplete(
  db: SQLiteDatabase,
  roomId: string,
) {
  return enqueueMessengerWrite(db, () =>
    db.runAsync(
      `INSERT INTO messenger_room_cache_state
        (room_id, history_complete, updated_at)
       VALUES (?, 1, ?)
       ON CONFLICT(room_id) DO UPDATE SET
         history_complete = 1,
         updated_at = excluded.updated_at`,
      roomId,
      new Date().toISOString(),
    ),
  );
}

export function clearMessengerLocalData(db: SQLiteDatabase): Promise<void> {
  return enqueueMessengerWrite(db, () =>
    withMessengerTransaction(db, async (transaction) => {
      await transaction.runAsync("DELETE FROM messenger_outbox");
      await transaction.runAsync("DELETE FROM messenger_messages");
      await transaction.runAsync("DELETE FROM messenger_room_read_state");
      await transaction.runAsync("DELETE FROM messenger_room_cache_state");
      await transaction.runAsync("DELETE FROM messenger_rooms");
    }),
  );
}
