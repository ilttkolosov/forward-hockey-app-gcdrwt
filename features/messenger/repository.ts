import type { SQLiteDatabase } from "expo-sqlite";
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

function parseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export async function loadCachedMessengerRooms(
  db: SQLiteDatabase,
): Promise<MessengerRoom[]> {
  const rows = await db.getAllAsync<RoomRow>(
    "SELECT raw_json FROM messenger_rooms ORDER BY team_name, sort_order, title",
  );
  return rows
    .map((row) => parseJson<MessengerRoom>(row.raw_json))
    .filter((room): room is MessengerRoom => room !== null);
}

export async function cacheMessengerRooms(
  db: SQLiteDatabase,
  rooms: MessengerRoom[],
): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM messenger_rooms");
    for (const room of rooms) {
      await db.runAsync(
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
  await db.withTransactionAsync(async () => {
    for (const message of messages) {
      await db.runAsync(
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
  });
}

export function enqueueMessengerText(
  db: SQLiteDatabase,
  item: Omit<MessengerOutboxItem, "attempts" | "last_error">,
) {
  return db.runAsync(
    `INSERT OR IGNORE INTO messenger_outbox
      (client_message_id, room_id, text, created_at, attempts, last_error)
     VALUES (?, ?, ?, ?, 0, NULL)`,
    item.client_message_id,
    item.room_id,
    item.text,
    item.created_at,
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
  return db.runAsync(
    "DELETE FROM messenger_outbox WHERE client_message_id = ?",
    clientMessageId,
  );
}

export function markMessengerOutboxFailure(
  db: SQLiteDatabase,
  clientMessageId: string,
  error: unknown,
) {
  return db.runAsync(
    `UPDATE messenger_outbox
        SET attempts = attempts + 1, last_error = ?
      WHERE client_message_id = ?`,
    error instanceof Error
      ? error.message.slice(0, 500)
      : String(error).slice(0, 500),
    clientMessageId,
  );
}
