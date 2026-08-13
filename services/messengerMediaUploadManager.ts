import { messengerLog } from "./messengerLogger";

const MEDIA_UPLOAD_BACKGROUND_TIMEOUT_MS = 15 * 60 * 1000;

interface MessengerManagedUploadOptions<T> {
  roomId: string;
  clientMessageId: string;
  run(signal: AbortSignal): Promise<T>;
}

interface MessengerManagedUpload {
  roomId: string;
  controller: AbortController;
  startedAt: number;
}

const activeUploads = new Map<string, MessengerManagedUpload>();

export class MessengerMediaUploadTimeoutError extends Error {
  constructor() {
    super("Загрузка не завершилась за допустимые 15 минут");
    this.name = "MessengerMediaUploadTimeoutError";
  }
}

/**
 * Owns an upload independently of a room screen. Navigating away may unmount
 * the screen that started the request, but this module keeps the request and
 * its completion pipeline alive until success, failure, logout or timeout.
 */
export function runManagedMessengerMediaUpload<T>({
  roomId,
  clientMessageId,
  run,
}: MessengerManagedUploadOptions<T>): Promise<T> {
  if (activeUploads.has(clientMessageId)) {
    return Promise.reject(new Error("Это вложение уже отправляется"));
  }

  const controller = new AbortController();
  const startedAt = Date.now();
  const managed: MessengerManagedUpload = {
    roomId,
    controller,
    startedAt,
  };
  activeUploads.set(clientMessageId, managed);

  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, MEDIA_UPLOAD_BACKGROUND_TIMEOUT_MS);

  messengerLog("info", "media.upload.background_started", {
    room_id: roomId,
    client_message_id: clientMessageId,
    timeout_ms: MEDIA_UPLOAD_BACKGROUND_TIMEOUT_MS,
  });

  return (async () => {
    try {
      return await run(controller.signal);
    } catch (error) {
      if (timedOut) throw new MessengerMediaUploadTimeoutError();
      throw error;
    } finally {
      clearTimeout(timeout);
      if (activeUploads.get(clientMessageId) === managed) {
        activeUploads.delete(clientMessageId);
      }
      messengerLog("info", "media.upload.background_finished", {
        room_id: roomId,
        client_message_id: clientMessageId,
        duration_ms: Date.now() - startedAt,
        timed_out: timedOut,
      });
    }
  })();
}

/** Cancels uploads only when authorization itself is removed. */
export function cancelAllManagedMessengerMediaUploads(): void {
  if (!activeUploads.size) return;
  messengerLog("info", "media.upload.background_cancel_all", {
    upload_count: activeUploads.size,
  });
  activeUploads.forEach(({ controller }) => controller.abort());
  activeUploads.clear();
}
