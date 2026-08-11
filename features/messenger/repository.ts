import type { SQLiteDatabase } from "expo-sqlite";
import { Platform } from "react-native";
import type {
  MessengerMessage,
  MessengerOutboxItem,
  MessengerRoom,
} from "./types";

interface RoomRow {
  raw_json: string;
}

interface MessageRow {
  raw_json: string;
}

interface HistoryStateRow {
  history_complete: number;
}

const messengerWriteQueues = new WeakMap<SQLiteDatabase, Promise<void>>();

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
    return JSON.parse(value) as T;
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

export async function loadCachedMessengerRooms(
  db: SQLiteDatabase,
): Promise<MessengerRoom[]> {
  const rows = await db.getAllAsync<RoomRow>(
    `SELECT raw_json FROM messenger_rooms
      ORDER BY CASE WHEN kind = 'direct' THEN 1 ELSE 0 END,
               team_name, sort_order, title`,
  );
  return rows
    .map((row) => parseJson<MessengerRoom>(row.raw_json))
    .filter((room): room is MessengerRoom => room !== null);
}

export async function loadCachedMessengerRoom(
  db: SQLiteDatabase,
  roomId: string,
): Promise<MessengerRoom | null> {
  const row = await db.getFirstAsync<RoomRow>(
    "SELECT raw_json FROM messenger_rooms WHERE id = ?",
    roomId,
  );
  return row ? parseJson<MessengerRoom>(row.raw_json) : null;
}

export async function cacheMessengerRooms(
  db: SQLiteDatabase,
  rooms: MessengerRoom[],
): Promise<void> {
  await enqueueMessengerWrite(db, () =>
    withMessengerTransaction(db, async (transaction) => {
      await transaction.runAsync("DELETE FROM messenger_rooms");
      for (const room of rooms) {
        await transaction.runAsync(
          `INSERT INTO messenger_rooms
          (id, team_id, team_name, kind, title, sort_order, unread_count, updated_at, raw_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          room.id,
          room.team_id,
          room.team_name,
          room.kind,
          room.title,
          room.sort_order,
          room.unread_count,
          new Date().toISOString(),
          JSON.stringify(room),
        );
      }
    }),
  );
}

export function markCachedMessengerRoomRead(
  db: SQLiteDatabase,
  roomId: string,
  sequence: string,
): Promise<void> {
  return enqueueMessengerWrite(db, async () => {
    const row = await db.getFirstAsync<RoomRow>(
      "SELECT raw_json FROM messenger_rooms WHERE id = ?",
      roomId,
    );
    if (!row) return;
    const room = parseJson<MessengerRoom>(row.raw_json);
    if (!room) return;
    const nextSequence = sequenceIsNewer(sequence, room.last_read_sequence)
      ? sequence
      : room.last_read_sequence;
    const nextRoom: MessengerRoom = {
      ...room,
      last_read_sequence: nextSequence,
      unread_count: 0,
    };
    await db.runAsync(
      `UPDATE messenger_rooms
          SET unread_count = 0, updated_at = ?, raw_json = ?
        WHERE id = ?`,
      new Date().toISOString(),
      JSON.stringify(nextRoom),
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
  return rows
    .map((row) => parseJson<MessengerMessage>(row.raw_json))
    .filter((message): message is MessengerMessage => message !== null);
}

export async function cacheMessengerMessages(
  db: SQLiteDatabase,
  messages: MessengerMessage[],
): Promise<void> {
  await enqueueMessengerWrite(db, () =>
    withMessengerTransaction(db, async (transaction) => {
      for (const message of messages) {
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
