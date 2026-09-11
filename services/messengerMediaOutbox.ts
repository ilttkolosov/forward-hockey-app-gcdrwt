import type { SQLiteDatabase } from "expo-sqlite";
import type { MessengerMessage } from "../features/messenger/types";
import {
  enqueueMessengerMedia, findAcceptedMessengerMedia, loadMessengerMediaOutbox,
  removeMessengerMediaOutboxItem, saveMessengerMediaOutboxItem,
  type MessengerMediaOutboxItem,
} from "../features/messenger/mediaOutboxRepository";
import { cacheIncomingMessengerMessage } from "../features/messenger/repository";
import { MessengerApiError, isMessengerUploadCancelledError, messengerErrorMessage, sendMessengerMedia } from "./messengerApi";
import { loadMessengerSession } from "./messengerSession";
import { assertMessengerUploadLimits, type MessengerUploadFile } from "./messengerAttachmentPicker";
import { beginLocalMessengerMediaUpload, endLocalMessengerMediaUpload, seedMessengerMediaCache } from "./messengerMediaCache";
import { runManagedMessengerMediaUpload } from "./messengerMediaUploadManager";
import { createMessengerMediaPosters, releaseMessengerMediaFiles, retainMessengerMediaFiles } from "./messengerMediaOutboxFiles";
import { messengerLog } from "./messengerLogger";
import { trackMessengerAction } from "./analyticsService";

export const MEDIA_RETRY_DELAY_MS = 3_000;
export const MEDIA_MAX_ATTEMPTS = 5; // Initial request + four retries.
export function isRetryableMediaUploadError(error: unknown): boolean {
  if (isMessengerUploadCancelledError(error)) return false;
  return !(error instanceof MessengerApiError) || error.status === 408 || error.status === 429 || error.status >= 500;
}

type MediaOutboxListener = (message: MessengerMessage) => void;
const listeners = new Set<MediaOutboxListener>();
interface Worker {
  running: Promise<void> | null;
  requested: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  generation: number;
  enabled: boolean;
}
const workers = new WeakMap<SQLiteDatabase, Map<string, Worker>>();
function workerFor(db: SQLiteDatabase, userId: string): Worker {
  let users = workers.get(db);
  if (!users) { users = new Map(); workers.set(db, users); }
  let worker = users.get(userId);
  if (!worker) {
    worker = { running: null, requested: false, timer: null, generation: 0, enabled: true };
    users.set(userId, worker);
  }
  return worker;
}
function emit(message: MessengerMessage): void {
  for (const listener of listeners) {
    try { listener(message); } catch { /* A screen cannot interrupt the durable queue. */ }
  }
}
export function subscribeMessengerMediaOutbox(listener: MediaOutboxListener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function updateAttachment(item: MessengerMediaOutboxItem, label: string, stage: "preparing" | "uploading" | "failed", error: string | null = null): void {
  item.message = { ...item.message, send_error: error, pending_attachment: item.message.pending_attachment ? {
    ...item.message.pending_attachment, stage, label, progress_percent: null,
    local_uri: item.files[0]?.uri ?? null, thumbnail_uri: item.files[0]?.thumbnail_uri,
    items: item.files.map(file => ({ kind: file.kind, local_uri: file.uri, thumbnail_uri: file.thumbnail_uri,
      file_name: file.name, mime_type: file.type, size_bytes: file.size_bytes,
      original_size_bytes: file.original_size_bytes, width: file.width, height: file.height })),
  } : null };
}

async function processItem(db: SQLiteDatabase, item: MessengerMediaOutboxItem, active: () => boolean): Promise<void> {
  const message = item.message;
  const clientId = message.client_message_id;
  let networkAttempt = false;
  beginLocalMessengerMediaUpload(clientId);
  try {
    // Realtime may have committed a response that the upload request never received.
    item.accepted ??= await findAcceptedMessengerMedia(db, clientId);
    if (!active()) return;
    if (!item.accepted) {
      assertMessengerUploadLimits(item.files);
      if (!item.prepared) {
        item.files = await retainMessengerMediaFiles(clientId, item.files);
        if (!active()) return;
        item.prepared = true;
        updateAttachment(item, "Подготовка превью…", "preparing");
        if (!await saveMessengerMediaOutboxItem(db, item)) return;
        emit(item.message);
        item.files = await createMessengerMediaPosters(item.files);
        if (!active()) return;
      }
      const resumingAttempt = item.state === "uploading";
      item.state = "uploading";
      // An interrupted process replays the same reserved attempt/idempotency key.
      // Only a recorded transport failure consumes the retry budget.
      item.attempts = resumingAttempt ? Math.max(1, item.attempts) : Math.min(MEDIA_MAX_ATTEMPTS, item.attempts + 1);
      updateAttachment(item, "Отправляем вложение…", "uploading");
      if (!await saveMessengerMediaOutboxItem(db, item) || !active()) return;
      emit(item.message);
      networkAttempt = true;
      let lastPercent = -5;
      const result = await runManagedMessengerMediaUpload({ roomId: message.room_id, clientMessageId: clientId,
        run: signal => sendMessengerMedia(message.room_id, clientId, item.files, message.text, message.reply_to?.id,
          ({ percent }) => {
            if (!active() || (percent < lastPercent + 5 && percent !== 100)) return;
            lastPercent = percent;
            if (item.message.pending_attachment) {
              item.message = { ...item.message, pending_attachment: { ...item.message.pending_attachment,
                label: `Загрузка: ${percent}%`, progress_percent: percent } };
              emit(item.message);
            }
          }, signal),
      });
      if (!active()) return;
      item.accepted = result.message;
      if (result.created) trackMessengerAction("message_sent", {
        content_type: item.files.length > 1 ? "multiple" : item.files[0]?.kind || "file",
        attachment_count: item.files.length, has_text: Boolean(message.text),
        has_reply: Boolean(message.reply_to), source: "composer",
      });
    }
    item.state = "accepted";
    if (!await saveMessengerMediaOutboxItem(db, item) || !active()) return;
    const accepted = item.accepted;
    const media = accepted.media_items?.length ? accepted.media_items : accepted.media ? [accepted.media] : [];
    for (const [index, asset] of media.entries()) {
      const file = item.files[index];
      if (file) await seedMessengerMediaCache(asset, file.uri).catch(() => undefined);
    }
    if (!active()) return;
    // Keep the accepted job until the server message is durably cached. Cache errors never re-upload it.
    await cacheIncomingMessengerMessage(db, accepted, message.author.id);
    if (!active()) return;
    await removeMessengerMediaOutboxItem(db, message.author.id, clientId);
    emit(accepted);
    await releaseMessengerMediaFiles(clientId).catch(() => undefined);
    messengerLog("info", "media.outbox.sent", { client_message_id: clientId, attempts: item.attempts });
  } catch (error) {
    if (!active() || isMessengerUploadCancelledError(error)) return;
    if (item.accepted) throw error;
    const retry = networkAttempt && isRetryableMediaUploadError(error) && item.attempts < MEDIA_MAX_ATTEMPTS;
    item.state = retry ? "retry" : "failed";
    item.nextAttemptAt = retry ? Date.now() + MEDIA_RETRY_DELAY_MS : 0;
    updateAttachment(item, retry ? `Повтор ${item.attempts} из 4 через 3 с…` : "Неотправлено",
      retry ? "uploading" : "failed", retry ? null : messengerErrorMessage(error, "Не удалось отправить вложение"));
    if (await saveMessengerMediaOutboxItem(db, item)) emit(item.message);
    messengerLog("warn", retry ? "media.outbox.retry" : "media.outbox.failed", {
      client_message_id: clientId, attempts: item.attempts, next_attempt_at: item.nextAttemptAt,
      message: messengerErrorMessage(error),
    });
  } finally { endLocalMessengerMediaUpload(clientId); }
}

/** One worker per signed-in account, owned by the application, never by a room. */
export function requestMessengerMediaOutboxFlush(db: SQLiteDatabase, userId: string): void {
  const worker = workerFor(db, userId);
  if (!worker.enabled) return;
  if (worker.running) { worker.requested = true; return; }
  if (worker.timer) clearTimeout(worker.timer);
  worker.timer = null;
  const generation = worker.generation;
  const active = () => worker.enabled && worker.generation === generation;
  const schedule = (delay: number) => {
    if (active()) worker.timer = setTimeout(() => { worker.timer = null; requestMessengerMediaOutboxFlush(db, userId); }, delay);
  };
  worker.running = (async () => {
    do {
      worker.requested = false;
      const session = await loadMessengerSession();
      if (!active() || session?.user.id !== userId) return;
      const items = await loadMessengerMediaOutbox(db, userId);
      let due = Infinity;
      for (const item of items) {
        if (!active()) return;
        if (item.state === "failed") {
          item.accepted = await findAcceptedMessengerMedia(db, item.message.client_message_id);
          if (!item.accepted) continue;
        }
        if (item.nextAttemptAt > Date.now()) { due = Math.min(due, item.nextAttemptAt); continue; }
        await processItem(db, item, active);
        worker.requested = true;
      }
      if (!worker.requested && due < Infinity) schedule(Math.max(0, due - Date.now()));
    } while (active() && worker.requested);
  })().catch(error => {
    messengerLog("warn", "media.outbox.storage_deferred", { message: messengerErrorMessage(error) });
    schedule(MEDIA_RETRY_DELAY_MS);
  }).finally(() => {
    worker.running = null;
    // Auth may have resumed while the cancelled generation was completing.
    if (worker.enabled && worker.generation !== generation) requestMessengerMediaOutboxFlush(db, userId);
  });
}
export function startMessengerMediaOutbox(db: SQLiteDatabase, userId: string): () => void {
  const worker = workerFor(db, userId);
  worker.enabled = true;
  requestMessengerMediaOutboxFlush(db, userId);
  return () => {
    worker.enabled = false;
    worker.generation += 1;
    if (worker.timer) clearTimeout(worker.timer);
    worker.timer = null;
  };
}
export async function queueMessengerMediaMessage(db: SQLiteDatabase, message: MessengerMessage, files: MessengerUploadFile[]): Promise<void> {
  assertMessengerUploadLimits(files);
  await enqueueMessengerMedia(db, message, files);
  emit(message);
  requestMessengerMediaOutboxFlush(db, message.author.id);
}
export async function retryMessengerMediaMessage(db: SQLiteDatabase, userId: string, clientId: string): Promise<void> {
  const item = (await loadMessengerMediaOutbox(db, userId)).find(entry => entry.message.client_message_id === clientId);
  if (!item) throw new Error("Вложение не сохранено в очереди. Выберите файл и отправьте его заново.");
  if (item.state !== "failed") return;
  item.state = "queued";
  item.attempts = 0;
  item.nextAttemptAt = 0;
  updateAttachment(item, "Ожидает отправки…", "uploading");
  if (await saveMessengerMediaOutboxItem(db, item)) {
    emit(item.message);
    requestMessengerMediaOutboxFlush(db, userId);
  }
}
