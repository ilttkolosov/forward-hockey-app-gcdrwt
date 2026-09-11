import type { SQLiteDatabase } from "expo-sqlite";
import type { MessengerMessage } from "./types";
import type { MessengerUploadFile } from "../../services/messengerAttachmentPicker";
import { enqueueDatabaseWrite } from "../../database/writeCoordinator";

export interface MessengerMediaOutboxItem {
  message: MessengerMessage;
  files: MessengerUploadFile[];
  state: "queued" | "uploading" | "retry" | "failed" | "accepted";
  attempts: number;
  nextAttemptAt: number;
  prepared: boolean;
  accepted: MessengerMessage | null;
}
interface MediaOutboxRow {
  message_json: string;
  files_json: string;
  state: MessengerMediaOutboxItem["state"];
  attempts: number;
  next_attempt_at: number;
  prepared: number;
  accepted_json: string | null;
}
function decode(row: MediaOutboxRow): MessengerMediaOutboxItem {
  return { message: JSON.parse(row.message_json), files: JSON.parse(row.files_json),
    state: row.state, attempts: row.attempts, nextAttemptAt: row.next_attempt_at,
    prepared: Boolean(row.prepared), accepted: row.accepted_json ? JSON.parse(row.accepted_json) : null };
}

/** The complete optimistic message and upload job are committed in one SQLite insert, before any file work/network. */
export async function enqueueMessengerMedia(db: SQLiteDatabase, message: MessengerMessage, files: MessengerUploadFile[]): Promise<void> {
  await enqueueDatabaseWrite(() => db.runAsync(
    `INSERT OR IGNORE INTO messenger_media_outbox
      (client_message_id, user_id, room_id, created_at, message_json, files_json)
      VALUES (?, ?, ?, ?, ?, ?)`,
    message.client_message_id, message.author.id, message.room_id, message.created_at,
    JSON.stringify(message), JSON.stringify(files),
  ));
}
export async function loadMessengerMediaOutbox(db: SQLiteDatabase, userId: string, roomId?: string): Promise<MessengerMediaOutboxItem[]> {
  const rows = await db.getAllAsync<MediaOutboxRow>(
    `SELECT * FROM messenger_media_outbox WHERE user_id = ?${roomId ? " AND room_id = ?" : ""} ORDER BY created_at, client_message_id`,
    ...[userId, ...(roomId ? [roomId] : [])],
  );
  return rows.map(decode);
}
export async function saveMessengerMediaOutboxItem(db: SQLiteDatabase, item: MessengerMediaOutboxItem): Promise<boolean> {
  const result = await enqueueDatabaseWrite(() => db.runAsync(
    `UPDATE messenger_media_outbox SET message_json = ?, files_json = ?, state = ?, attempts = ?,
      next_attempt_at = ?, prepared = ?, accepted_json = ? WHERE client_message_id = ? AND user_id = ?`,
    JSON.stringify(item.message), JSON.stringify(item.files), item.state, item.attempts,
    item.nextAttemptAt, Number(item.prepared), item.accepted ? JSON.stringify(item.accepted) : null,
    item.message.client_message_id, item.message.author.id,
  ));
  return result.changes > 0;
}
export async function removeMessengerMediaOutboxItem(db: SQLiteDatabase, userId: string, clientId: string): Promise<void> {
  await enqueueDatabaseWrite(() => db.runAsync(
    "DELETE FROM messenger_media_outbox WHERE user_id = ? AND client_message_id = ?", userId, clientId,
  ));
}
export async function findAcceptedMessengerMedia(db: SQLiteDatabase, clientId: string): Promise<MessengerMessage | null> {
  const row = await db.getFirstAsync<{ raw_json: string }>(
    "SELECT raw_json FROM messenger_messages WHERE client_message_id = ?", clientId,
  );
  const message: MessengerMessage | null = row ? JSON.parse(row.raw_json) : null;
  return message && !message.pending ? message : null;
}
