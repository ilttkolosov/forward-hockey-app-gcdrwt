import { fetch as expoFetch } from "expo/fetch";
import { File as ExpoFile } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import type {
  InvitationPreview,
  MessengerContact,
  MessengerMessageReceipt,
  MessengerLoginResult,
  MessengerMessage,
  MessengerReaction,
  MessengerRoom,
  MessengerRoomMember,
  MessengerRoomSettings,
  MessengerPushRegistration,
  MessengerSession,
  MessengerUser,
} from "../features/messenger/types";
import {
  clearMessengerPasswordChange,
  clearMessengerSession,
  getMessengerDeviceId,
  loadMessengerSession,
  saveMessengerPasswordChange,
  saveMessengerSession,
} from "./messengerSession";
import { messengerLog, messengerRequestId } from "./messengerLogger";

export const MESSENGER_SERVER_ORIGIN = "https://forward.is-gone.com";
export const MESSENGER_API_BASE_URL = `${MESSENGER_SERVER_ORIGIN}/api/v1`;

export function messengerMediaUrl(path: string | null): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${MESSENGER_SERVER_ORIGIN}${path.startsWith("/") ? "" : "/"}${path}`;
}

interface ApiErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

interface ApiEnvelope<T> {
  data: T;
}

interface RequestOptions extends RequestInit {
  public?: boolean;
  noRefresh?: boolean;
}

export interface MessengerUploadProgress {
  sent_bytes: number;
  total_bytes: number;
  percent: number;
}

interface MessengerMessagesResponse {
  items: MessengerMessage[];
  page: {
    direction: "latest" | "before" | "after";
    has_more: boolean;
    oldest_sequence: string | null;
    latest_sequence: string | null;
  };
}

export class MessengerApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details: unknown = {},
  ) {
    super(message);
    this.name = "MessengerApiError";
  }
}

export class MessengerUploadCancelledError extends Error {
  constructor(message = "Загрузка отменена") {
    super(message);
    this.name = "MessengerUploadCancelledError";
  }
}

export function isMessengerUploadCancelledError(
  error: unknown,
): error is MessengerUploadCancelledError {
  return error instanceof MessengerUploadCancelledError;
}

/**
 * HTTP errors mean that the device reached the messenger server and received
 * a response. Only fetch-level failures should switch the UI to offline mode.
 */
export function isMessengerConnectionError(error: unknown): boolean {
  return !(error instanceof MessengerApiError);
}

export function messengerErrorMessage(
  error: unknown,
  fallback = "Не удалось выполнить запрос к мессенджеру",
): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function messengerErrorDetails(error: unknown): string | undefined {
  if (!(error instanceof MessengerApiError) || error.details === undefined) {
    return undefined;
  }
  try {
    return JSON.stringify(error.details, (key, value) =>
      /token|password|authorization|cookie/i.test(key) ? "[REDACTED]" : value,
    ).slice(0, 1000);
  } catch {
    return "[unserializable]";
  }
}

let refreshPromise: Promise<MessengerSession> | null = null;
const REFRESH_RETRY_DELAYS_MS = [0, 400, 1_200] as const;

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as ApiEnvelope<T> &
    ApiErrorEnvelope;
  if (!response.ok) {
    throw new MessengerApiError(
      payload.error?.message || "Не удалось выполнить запрос к мессенджеру",
      response.status,
      payload.error?.code || "request_failed",
      payload.error?.details,
    );
  }
  return payload.data;
}

function parseUploadResponse<T>(status: number, body: string): T {
  let payload: (ApiEnvelope<T> & ApiErrorEnvelope) | null = null;
  try {
    payload = JSON.parse(body || "{}") as ApiEnvelope<T> & ApiErrorEnvelope;
  } catch {
    // Nginx may return a small HTML error page for transport-level limits.
  }
  if (status < 200 || status >= 300) {
    throw new MessengerApiError(
      payload?.error?.message ||
        (status === 413
          ? "Файл превышает допустимый размер"
          : `Сервер отклонил загрузку (HTTP ${status})`),
      status,
      payload?.error?.code ||
        (status === 413 ? "upload_too_large" : "request_failed"),
      payload?.error?.details,
    );
  }
  if (!payload || !("data" in payload)) {
    throw new Error("Сервер вернул некорректный ответ на загрузку");
  }
  return payload.data;
}

async function refreshMessengerSession(): Promise<MessengerSession> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const session = await loadMessengerSession();
    if (!session?.refresh_token) {
      throw new MessengerApiError(
        "Необходим вход",
        401,
        "authentication_required",
      );
    }
    for (
      let attempt = 0;
      attempt < REFRESH_RETRY_DELAYS_MS.length;
      attempt += 1
    ) {
      const delay = REFRESH_RETRY_DELAYS_MS[attempt] ?? 0;
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      try {
        const response = await fetch(`${MESSENGER_API_BASE_URL}/auth/refresh`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ refresh_token: session.refresh_token }),
        });
        const refreshed = await parseResponse<MessengerSession>(response);
        await saveMessengerSession(refreshed);
        return refreshed;
      } catch (error) {
        if (error instanceof MessengerApiError) {
          if (error.status === 401) await clearMessengerSession();
          throw error;
        }
        if (attempt === REFRESH_RETRY_DELAYS_MS.length - 1) throw error;
        messengerLog("info", "auth.refresh.retry", {
          attempt: attempt + 2,
          reason: "connection_lost",
        });
      }
    }
    throw new Error("Не удалось обновить сессию");
  })().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

export async function messengerRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const startedAt = Date.now();
  const requestId = messengerRequestId();
  const method = options.method || "GET";
  const session = await loadMessengerSession();
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  headers.set("x-request-id", requestId);
  if (options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (!options.public && session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  messengerLog("debug", "api.request", {
    request_id: requestId,
    method,
    path,
    authenticated: Boolean(!options.public && session?.access_token),
    body_kind:
      options.body instanceof FormData
        ? "form-data"
        : options.body
          ? "json"
          : "none",
  });
  try {
    const response = await fetch(`${MESSENGER_API_BASE_URL}${path}`, {
      ...options,
      headers,
    });
    const serverRequestId = response.headers.get("x-request-id") || requestId;
    messengerLog(response.ok ? "info" : "warn", "api.response", {
      request_id: serverRequestId,
      method,
      path,
      status: response.status,
      duration_ms: Date.now() - startedAt,
    });
    if (
      response.status === 401 &&
      !options.public &&
      !options.noRefresh &&
      Boolean(session?.refresh_token)
    ) {
      messengerLog("info", "auth.refresh", {
        request_id: serverRequestId,
        reason: "http_401",
      });
      await refreshMessengerSession();
      return messengerRequest<T>(path, { ...options, noRefresh: true });
    }
    return await parseResponse<T>(response);
  } catch (error) {
    // A fetch-level failure is an expected offline condition on mobile. Expo
    // turns console.error into a red development overlay (with a synthetic
    // NamelessError stack), although the exception is handled by the caller
    // and the local SQLite cache remains usable. Keep the diagnostic record,
    // but log it as a warning so a temporary network loss does not look like an
    // application crash.
    messengerLog("warn", "api.failure", {
      request_id: requestId,
      method,
      path,
      duration_ms: Date.now() - startedAt,
      category: error instanceof MessengerApiError ? "http" : "connection",
      status: error instanceof MessengerApiError ? error.status : undefined,
      code: error instanceof MessengerApiError ? error.code : undefined,
      message: messengerErrorMessage(error),
      details: messengerErrorDetails(error),
    });
    throw error;
  }
}

async function sessionContext() {
  return {
    device_id: await getMessengerDeviceId(),
    device_name: `Forward · ${Platform.OS}`,
    platform:
      Platform.OS === "ios" || Platform.OS === "android"
        ? Platform.OS
        : "unknown",
  };
}

export async function loginToMessenger(username: string, password: string) {
  const result = await messengerRequest<MessengerLoginResult>("/auth/login", {
    public: true,
    method: "POST",
    body: JSON.stringify({ username, password, ...(await sessionContext()) }),
  });
  if ("password_change_required" in result) {
    await clearMessengerSession();
    await saveMessengerPasswordChange(result);
    return result;
  }
  await clearMessengerPasswordChange();
  await saveMessengerSession(result);
  return result;
}

export async function registerInMessenger(payload: {
  invite_token: string;
  username: string;
  password: string;
  display_name?: string;
  email?: string;
}) {
  const result = await messengerRequest<MessengerSession>("/auth/register", {
    public: true,
    method: "POST",
    body: JSON.stringify({ ...payload, ...(await sessionContext()) }),
  });
  await clearMessengerPasswordChange();
  await saveMessengerSession(result);
  return result;
}

export async function completeMessengerPasswordChange(
  changeToken: string,
  password: string,
  passwordConfirmation: string,
) {
  const result = await messengerRequest<MessengerSession>(
    "/auth/complete-password-reset",
    {
      public: true,
      method: "POST",
      body: JSON.stringify({
        change_token: changeToken,
        password,
        password_confirmation: passwordConfirmation,
        ...(await sessionContext()),
      }),
    },
  );
  await saveMessengerSession(result);
  await clearMessengerPasswordChange();
  return result;
}

export function previewMessengerInvitation(token: string) {
  return messengerRequest<InvitationPreview>(
    `/invites/preview/${encodeURIComponent(token)}`,
    {
      public: true,
    },
  );
}

export function getMessengerMe() {
  return messengerRequest<MessengerUser>("/auth/me");
}

export function updateMessengerProfile(displayName: string) {
  return messengerRequest<MessengerUser>("/users/me", {
    method: "PATCH",
    body: JSON.stringify({ display_name: displayName }),
  });
}

export function uploadMessengerAvatar(file: {
  uri: string;
  name: string;
  type: string;
}) {
  const form = new FormData();
  form.append("file", file as unknown as Blob);
  return messengerRequest<{ asset_id: string; url: string }>(
    "/users/me/avatar",
    { method: "PUT", body: form },
  );
}

export function removeMessengerAvatar() {
  return messengerRequest<{ removed: true }>("/users/me/avatar", {
    method: "DELETE",
  });
}

export async function deleteMessengerAccount() {
  const result = await messengerRequest<{ deleted: true }>("/users/me", {
    method: "DELETE",
    body: JSON.stringify({ confirmation: "DELETE_MY_ACCOUNT" }),
  });
  const cleanup = await Promise.allSettled([
    clearMessengerSession(),
    clearMessengerPasswordChange(),
  ]);
  if (cleanup.some((item) => item.status === "rejected")) {
    console.warn(
      "[Messenger] Сервер удалил профиль, но защищённое хранилище будет очищено повторно при следующем запуске",
    );
  }
  return result;
}

export async function logoutFromMessenger(): Promise<void> {
  try {
    await messengerRequest("/auth/logout", { method: "POST" });
  } catch (error) {
    console.warn("[Messenger] Серверный выход не подтверждён:", error);
  } finally {
    await clearMessengerSession();
    await clearMessengerPasswordChange();
  }
}

let messengerRoomsRequest: Promise<MessengerRoom[]> | null = null;

/**
 * The persistence bridge, rooms screen and realtime recovery can all request
 * the same snapshot during one foreground transition. Share that request so a
 * navigation never competes with two or three identical HTTP/TLS exchanges.
 */
export function getMessengerRooms() {
  if (messengerRoomsRequest) return messengerRoomsRequest;
  const request = messengerRequest<MessengerRoom[]>("/chat/rooms");
  messengerRoomsRequest = request;
  void request.then(
    () => {
      if (messengerRoomsRequest === request) messengerRoomsRequest = null;
    },
    () => {
      if (messengerRoomsRequest === request) messengerRoomsRequest = null;
    },
  );
  return request;
}

export function leaveMessengerRoom(roomId: string) {
  return messengerRequest<{
    left: true;
    room_id: string;
    room_type: "direct" | "private_group";
  }>(`/chat/rooms/${roomId}/membership`, { method: "DELETE" });
}

export function getMessengerContacts(teamId?: string) {
  const query = teamId ? `?team_id=${encodeURIComponent(teamId)}` : "";
  return messengerRequest<MessengerContact[]>(`/chat/contacts${query}`);
}

export function createMessengerDirectRoom(teamId: string, userId: string) {
  return messengerRequest<{ room: MessengerRoom; created: boolean }>(
    "/chat/direct-rooms",
    {
      method: "POST",
      body: JSON.stringify({ team_id: teamId, user_id: userId }),
    },
  );
}

export function createMessengerPrivateRoom(
  teamId: string,
  title: string,
  memberUserIds: string[],
) {
  return messengerRequest<{ room: MessengerRoom; created: boolean }>(
    "/chat/private-rooms",
    {
      method: "POST",
      body: JSON.stringify({
        team_id: teamId,
        title,
        member_user_ids: memberUserIds,
      }),
    },
  );
}

export function getMessengerRoomSettings(roomId: string) {
  return messengerRequest<MessengerRoomSettings>(
    `/chat/rooms/${roomId}/settings`,
  );
}

export function getMessengerRoomMembers(roomId: string) {
  return messengerRequest<MessengerRoomMember[]>(
    `/chat/rooms/${roomId}/members`,
  );
}

export function updateMessengerRoomProfile(roomId: string, title: string) {
  return messengerRequest<MessengerRoom>(`/chat/rooms/${roomId}/profile`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
}

export function uploadMessengerRoomAvatar(
  roomId: string,
  file: { uri: string; name: string; type: string },
) {
  const form = new FormData();
  form.append("file", file as unknown as Blob);
  return messengerRequest<{ asset_id: string; url: string }>(
    `/chat/rooms/${roomId}/avatar`,
    { method: "PUT", body: form },
  );
}

export function removeMessengerRoomAvatar(roomId: string) {
  return messengerRequest<{ removed: true }>(`/chat/rooms/${roomId}/avatar`, {
    method: "DELETE",
  });
}

export function addMessengerPrivateRoomMember(roomId: string, userId: string) {
  return messengerRequest<MessengerRoomSettings>(
    `/chat/rooms/${roomId}/members`,
    { method: "POST", body: JSON.stringify({ user_id: userId }) },
  );
}

export function removeMessengerPrivateRoomMember(
  roomId: string,
  userId: string,
) {
  return messengerRequest<MessengerRoomSettings>(
    `/chat/rooms/${roomId}/members/${userId}`,
    { method: "DELETE" },
  );
}

export function deleteMessengerPrivateRoom(roomId: string) {
  return messengerRequest<{ deleted: true }>(`/chat/rooms/${roomId}`, {
    method: "DELETE",
  });
}

const messengerMessageRequests = new Map<
  string,
  Promise<MessengerMessagesResponse>
>();

export function getMessengerMessages(
  roomId: string,
  options: {
    cursor?: string;
    direction?: "before" | "after";
    limit?: number;
  } = {},
) {
  const query = new URLSearchParams();
  query.set("limit", String(options.limit ?? 100));
  if (options.cursor) query.set("cursor", options.cursor);
  if (options.direction) query.set("direction", options.direction);
  const path = `/chat/rooms/${roomId}/messages?${query.toString()}`;
  const running = messengerMessageRequests.get(path);
  if (running) return running;
  const request = messengerRequest<MessengerMessagesResponse>(path);
  messengerMessageRequests.set(path, request);
  void request.then(
    () => {
      if (messengerMessageRequests.get(path) === request) {
        messengerMessageRequests.delete(path);
      }
    },
    () => {
      if (messengerMessageRequests.get(path) === request) {
        messengerMessageRequests.delete(path);
      }
    },
  );
  return request;
}

export function getMessengerMessage(messageId: string) {
  return messengerRequest<MessengerMessage>(
    `/chat/messages/${encodeURIComponent(messageId)}`,
  );
}

export function updateMessengerMessage(messageId: string, text: string) {
  return messengerRequest<{ message: MessengerMessage }>(
    `/chat/messages/${encodeURIComponent(messageId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ text }),
    },
  );
}

export function deleteMessengerMessage(messageId: string) {
  return messengerRequest<{ message: MessengerMessage }>(
    `/chat/messages/${encodeURIComponent(messageId)}`,
    { method: "DELETE" },
  );
}

export function sendMessengerText(
  roomId: string,
  clientMessageId: string,
  text: string,
  replyToMessageId?: string | null,
) {
  return messengerRequest<{ message: MessengerMessage; created: boolean }>(
    `/chat/rooms/${roomId}/messages`,
    {
      method: "POST",
      body: JSON.stringify({
        client_message_id: clientMessageId,
        text,
        reply_to_message_id: replyToMessageId || undefined,
      }),
    },
  );
}

type MessengerMediaUploadResult = {
  message: MessengerMessage;
  created: boolean;
};

type MessengerMediaUploadFile = {
  uri: string;
  name: string;
  type: string;
  size_bytes?: number | null;
};

// Slow mobile uplinks may legitimately need more than ten minutes for the
// allowed 50 MiB. Cancel only a stalled transfer; continuing byte progress is
// not an error and must not be cut off by an absolute wall-clock timeout.
const MEDIA_UPLOAD_STALL_TIMEOUT_MS = 3 * 60 * 1000;

// Expo's File + fetch path avoids the legacy multipart copy and has proven
// reliable on iOS. SDK 54's native FileSystem upload task can report bytes
// queued into URLSession rather than delivered to nginx and then time out
// after a partial request. Use expo/fetch for every allowed single file on
// iOS; the server's 50 MiB limit bounds the buffered multipart body. Android
// keeps native progress for large files and uses expo/fetch for small ones.
const BUFFERED_MEDIA_UPLOAD_MAX_BYTES = 1024 * 1024;
const EXPO_FETCH_MEDIA_UPLOAD_TIMEOUT_MS = 15 * 60 * 1000;
const MEDIA_UPLOAD_PROGRESS_POLL_INTERVAL_MS = 1_250;
const MEDIA_UPLOAD_PROGRESS_STEP_PERCENT = 10;

function shouldUseBufferedMediaUpload(file: MessengerMediaUploadFile) {
  return (
    typeof file.size_bytes === "number" &&
    file.size_bytes >= 0 &&
    file.size_bytes <= BUFFERED_MEDIA_UPLOAD_MAX_BYTES
  );
}

function startServerUploadProgressPolling(
  uploadId: string,
  totalBytes: number,
  accessToken: string | undefined,
  onProgress: ((progress: MessengerUploadProgress) => void) | undefined,
): () => void {
  if (
    !onProgress ||
    !accessToken ||
    !Number.isFinite(totalBytes) ||
    totalBytes <= 0
  ) {
    return () => undefined;
  }

  let active = true;
  let inFlight = false;
  let lastReportedPercent = 0;
  let currentController: AbortController | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  const stop = () => {
    active = false;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    currentController?.abort();
    currentController = null;
  };

  const poll = async () => {
    if (!active || inFlight) return;
    inFlight = true;
    const controller = new AbortController();
    currentController = controller;
    try {
      const response = await fetch(
        `${MESSENGER_API_BASE_URL}/media-uploads/${encodeURIComponent(uploadId)}/progress`,
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          signal: controller.signal,
        },
      );
      if (!active) return;
      if (!response.ok) {
        messengerLog("debug", "api.media_upload.progress_unavailable", {
          upload_id: uploadId,
          status: response.status,
        });
        stop();
        return;
      }
      const payload = (await response.json()) as ApiEnvelope<{
        received_bytes?: number;
      }>;
      if (!active) return;
      const receivedBytes = Number(payload.data?.received_bytes ?? 0);
      if (!Number.isFinite(receivedBytes) || receivedBytes <= 0) return;
      const measuredPercent = Math.max(
        0,
        Math.min(100, Math.floor((receivedBytes / totalBytes) * 100)),
      );
      const coarsePercent = Math.min(
        100,
        Math.floor(measuredPercent / MEDIA_UPLOAD_PROGRESS_STEP_PERCENT) *
          MEDIA_UPLOAD_PROGRESS_STEP_PERCENT,
      );
      if (coarsePercent <= lastReportedPercent) return;
      lastReportedPercent = coarsePercent;
      onProgress({
        sent_bytes: Math.min(receivedBytes, totalBytes),
        total_bytes: totalBytes,
        percent: coarsePercent,
      });
      messengerLog("debug", "api.media_upload.server_progress", {
        upload_id: uploadId,
        received_bytes: receivedBytes,
        total_bytes: totalBytes,
        percent: coarsePercent,
      });
    } catch (error) {
      if (!active) return;
      messengerLog("debug", "api.media_upload.progress_unavailable", {
        upload_id: uploadId,
        message: messengerErrorMessage(error),
      });
      stop();
    } finally {
      if (currentController === controller) currentController = null;
      inFlight = false;
    }
  };

  timer = setInterval(() => {
    void poll();
  }, MEDIA_UPLOAD_PROGRESS_POLL_INTERVAL_MS);
  return stop;
}

async function sendBufferedSingleMessengerMedia(
  roomId: string,
  clientMessageId: string,
  file: MessengerMediaUploadFile,
  caption?: string,
  replyToMessageId?: string | null,
  onProgress?: (progress: MessengerUploadProgress) => void,
  signal?: AbortSignal,
  noRefresh = false,
): Promise<MessengerMediaUploadResult> {
  if (signal?.aborted) throw new MessengerUploadCancelledError();
  const startedAt = Date.now();
  const requestId = messengerRequestId();
  const session = await loadMessengerSession();
  const form = new FormData();
  form.append("client_message_id", clientMessageId);
  form.append("original_name", file.name);
  if (caption?.trim()) form.append("caption", caption.trim());
  if (replyToMessageId) form.append("reply_to_message_id", replyToMessageId);
  form.append("files", new ExpoFile(file.uri) as unknown as Blob);

  const headers: Record<string, string> = {
    Accept: "application/json",
    "x-request-id": requestId,
    "x-upload-id": requestId,
  };
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }

  const controller = new AbortController();
  let timedOut = false;
  const handleAbort = () => controller.abort();
  signal?.addEventListener("abort", handleAbort, { once: true });
  const timeoutTimer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, EXPO_FETCH_MEDIA_UPLOAD_TIMEOUT_MS);
  const stopProgressPolling = startServerUploadProgressPolling(
    requestId,
    file.size_bytes ?? 0,
    session?.access_token,
    onProgress,
  );

  messengerLog("info", "api.media_buffered_upload.started", {
    request_id: requestId,
    room_id: roomId,
    file_type: file.type,
    file_size_bytes: file.size_bytes,
    upload_timeout_ms: EXPO_FETCH_MEDIA_UPLOAD_TIMEOUT_MS,
    preparation_duration_ms: Date.now() - startedAt,
  });

  try {
    const response = await expoFetch(
      `${MESSENGER_API_BASE_URL}/chat/rooms/${roomId}/media`,
      {
        method: "POST",
        headers,
        body: form,
        signal: controller.signal,
      },
    );
    const headersReceivedAt = Date.now();
    const body = await response.text();
    const serverRequestId = response.headers.get("x-request-id") || requestId;

    messengerLog(
      response.ok ? "info" : "warn",
      "api.media_buffered_upload.response",
      {
        request_id: serverRequestId,
        client_request_id:
          serverRequestId !== requestId ? requestId : undefined,
        room_id: roomId,
        status: response.status,
        headers_duration_ms: headersReceivedAt - startedAt,
        response_body_duration_ms: Date.now() - headersReceivedAt,
        duration_ms: Date.now() - startedAt,
      },
    );

    if (
      response.status === 401 &&
      !noRefresh &&
      Boolean(session?.refresh_token)
    ) {
      stopProgressPolling();
      await refreshMessengerSession();
      return sendBufferedSingleMessengerMedia(
        roomId,
        clientMessageId,
        file,
        caption,
        replyToMessageId,
        onProgress,
        signal,
        true,
      );
    }
    const result = parseUploadResponse<MessengerMediaUploadResult>(
      response.status,
      body,
    );
    const totalBytes = file.size_bytes ?? 0;
    stopProgressPolling();
    onProgress?.({
      sent_bytes: totalBytes,
      total_bytes: totalBytes,
      percent: 100,
    });
    return result;
  } catch (error) {
    const normalized =
      signal?.aborted || (!timedOut && controller.signal.aborted)
        ? new MessengerUploadCancelledError()
        : timedOut
          ? new Error("Загрузка превысила допустимые 15 минут", {
              cause: error,
            })
          : error;
    messengerLog(
      isMessengerUploadCancelledError(normalized) ? "info" : "warn",
      isMessengerUploadCancelledError(normalized)
        ? "api.media_buffered_upload.cancelled"
        : "api.media_buffered_upload.failure",
      {
        request_id: requestId,
        room_id: roomId,
        duration_ms: Date.now() - startedAt,
        message: messengerErrorMessage(normalized),
      },
    );
    throw normalized;
  } finally {
    stopProgressPolling();
    clearTimeout(timeoutTimer);
    signal?.removeEventListener("abort", handleAbort);
  }
}

async function sendSingleMessengerMedia(
  roomId: string,
  clientMessageId: string,
  file: MessengerMediaUploadFile,
  caption?: string,
  replyToMessageId?: string | null,
  onProgress?: (progress: MessengerUploadProgress) => void,
  signal?: AbortSignal,
  noRefresh = false,
): Promise<MessengerMediaUploadResult> {
  if (signal?.aborted) throw new MessengerUploadCancelledError();
  const startedAt = Date.now();
  const requestId = messengerRequestId();
  const session = await loadMessengerSession();
  const parameters: Record<string, string> = {
    client_message_id: clientMessageId,
    original_name: file.name,
  };
  if (caption?.trim()) parameters.caption = caption.trim();
  if (replyToMessageId) parameters.reply_to_message_id = replyToMessageId;

  const headers: Record<string, string> = {
    Accept: "application/json",
    "x-request-id": requestId,
  };
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }

  let lastPercent = -1;
  let lastProgressBytes = -1;
  let lastLoggedPercent = -10;
  let lastLoggedAt = startedAt;
  let cancellation: "navigation" | "stalled" | null = null;
  let stallTimer: ReturnType<typeof setTimeout> | null = null;
  let task: ReturnType<typeof FileSystem.createUploadTask>;
  const cancel = (reason: "navigation" | "stalled") => {
    if (cancellation) return;
    cancellation = reason;
    void task.cancelAsync().catch(() => undefined);
  };
  const armStallTimer = () => {
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = setTimeout(
      () => cancel("stalled"),
      MEDIA_UPLOAD_STALL_TIMEOUT_MS,
    );
  };
  const handleAbort = () => cancel("navigation");
  task = FileSystem.createUploadTask(
    `${MESSENGER_API_BASE_URL}/chat/rooms/${roomId}/media`,
    file.uri,
    {
      httpMethod: "POST",
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: "files",
      mimeType: file.type || "application/octet-stream",
      parameters,
      headers,
      // A messenger upload belongs to the visible send operation. An iOS
      // background session may silently retry a broken connection for a long
      // time and leave the bubble looking permanently pending.
      sessionType: FileSystem.FileSystemSessionType.FOREGROUND,
    },
    ({ totalBytesSent, totalBytesExpectedToSend }) => {
      const total = Math.max(totalBytesExpectedToSend, 1);
      const percent = Math.max(
        0,
        Math.min(100, Math.round((totalBytesSent / total) * 100)),
      );
      if (totalBytesSent > lastProgressBytes) {
        lastProgressBytes = totalBytesSent;
        armStallTimer();
      }
      if (percent === lastPercent) return;
      lastPercent = percent;
      const now = Date.now();
      if (
        percent === 100 ||
        percent >= lastLoggedPercent + 10 ||
        now - lastLoggedAt >= 15_000
      ) {
        lastLoggedPercent = percent;
        lastLoggedAt = now;
        const elapsedMs = Math.max(now - startedAt, 1);
        messengerLog("debug", "api.media_native_upload.progress", {
          request_id: requestId,
          room_id: roomId,
          percent,
          sent_bytes: totalBytesSent,
          total_bytes: totalBytesExpectedToSend,
          elapsed_ms: elapsedMs,
          average_kbps: Math.round((totalBytesSent * 8) / elapsedMs),
        });
      }
      onProgress?.({
        sent_bytes: totalBytesSent,
        total_bytes: totalBytesExpectedToSend,
        percent,
      });
    },
  );
  signal?.addEventListener("abort", handleAbort, { once: true });
  armStallTimer();

  try {
    messengerLog("info", "api.media_native_upload.started", {
      request_id: requestId,
      room_id: roomId,
      file_type: file.type,
    });
    const response = await task.uploadAsync();
    if (cancellation === "navigation" || signal?.aborted) {
      throw new MessengerUploadCancelledError();
    }
    if (cancellation === "stalled") {
      throw new Error(
        "Загрузка остановилась: три минуты не передавались данные",
      );
    }
    if (!response) throw new Error("Загрузка была прервана");
    const serverRequestId = Object.entries(response.headers).find(
      ([name]) => name.toLowerCase() === "x-request-id",
    )?.[1];

    messengerLog(
      response.status >= 200 && response.status < 300 ? "info" : "warn",
      "api.media_native_upload.response",
      {
        request_id: serverRequestId || requestId,
        client_request_id:
          serverRequestId && serverRequestId !== requestId
            ? requestId
            : undefined,
        room_id: roomId,
        status: response.status,
        duration_ms: Date.now() - startedAt,
      },
    );

    if (
      response.status === 401 &&
      !noRefresh &&
      Boolean(session?.refresh_token)
    ) {
      await refreshMessengerSession();
      return sendSingleMessengerMedia(
        roomId,
        clientMessageId,
        file,
        caption,
        replyToMessageId,
        onProgress,
        signal,
        true,
      );
    }
    return parseUploadResponse<MessengerMediaUploadResult>(
      response.status,
      response.body,
    );
  } catch (error) {
    const normalized =
      cancellation === "navigation" || signal?.aborted
        ? new MessengerUploadCancelledError()
        : cancellation === "stalled"
          ? new Error(
              "Загрузка остановилась: три минуты не передавались данные",
              { cause: error },
            )
          : error;
    messengerLog(
      isMessengerUploadCancelledError(normalized) ? "info" : "warn",
      isMessengerUploadCancelledError(normalized)
        ? "api.media_native_upload.cancelled"
        : "api.media_native_upload.failure",
      {
        request_id: requestId,
        room_id: roomId,
        duration_ms: Date.now() - startedAt,
        message: messengerErrorMessage(normalized),
      },
    );
    throw normalized;
  } finally {
    if (stallTimer) clearTimeout(stallTimer);
    signal?.removeEventListener("abort", handleAbort);
  }
}

export async function sendMessengerMedia(
  roomId: string,
  clientMessageId: string,
  files: MessengerMediaUploadFile[],
  caption?: string,
  replyToMessageId?: string | null,
  onProgress?: (progress: MessengerUploadProgress) => void,
  signal?: AbortSignal,
) {
  if (Platform.OS !== "web" && files.length === 1 && files[0]) {
    const useExpoFetch =
      Platform.OS === "ios" || shouldUseBufferedMediaUpload(files[0]);
    const transport = useExpoFetch
      ? "expo_fetch_buffered"
      : "legacy_native_progress";
    messengerLog("info", "api.media_upload.transport_selected", {
      room_id: roomId,
      platform: Platform.OS,
      transport,
      file_size_bytes: files[0].size_bytes,
      buffered_limit_bytes: BUFFERED_MEDIA_UPLOAD_MAX_BYTES,
    });
    if (transport === "expo_fetch_buffered") {
      return sendBufferedSingleMessengerMedia(
        roomId,
        clientMessageId,
        files[0],
        caption,
        replyToMessageId,
        onProgress,
        signal,
      );
    }
    return sendSingleMessengerMedia(
      roomId,
      clientMessageId,
      files[0],
      caption,
      replyToMessageId,
      onProgress,
      signal,
    );
  }
  const form = new FormData();
  form.append("client_message_id", clientMessageId);
  if (caption?.trim()) form.append("caption", caption.trim());
  if (replyToMessageId) form.append("reply_to_message_id", replyToMessageId);
  files.forEach((file) => form.append("files", file as unknown as Blob));
  if (Platform.OS === "web") {
    try {
      return await messengerRequest<MessengerMediaUploadResult>(
        `/chat/rooms/${roomId}/media`,
        { method: "POST", body: form, signal },
      );
    } catch (error) {
      if (signal?.aborted) throw new MessengerUploadCancelledError();
      throw error;
    }
  }

  const uploadId = messengerRequestId();
  const session = await loadMessengerSession();
  const totalBytes = files.reduce(
    (sum, file) => sum + Math.max(0, file.size_bytes ?? 0),
    0,
  );
  const stopProgressPolling = startServerUploadProgressPolling(
    uploadId,
    totalBytes,
    session?.access_token,
    onProgress,
  );
  try {
    const result = await messengerRequest<MessengerMediaUploadResult>(
      `/chat/rooms/${roomId}/media`,
      {
        method: "POST",
        body: form,
        signal,
        headers: { "x-upload-id": uploadId },
      },
    );
    stopProgressPolling();
    onProgress?.({
      sent_bytes: totalBytes,
      total_bytes: totalBytes,
      percent: 100,
    });
    return result;
  } catch (error) {
    if (signal?.aborted) throw new MessengerUploadCancelledError();
    throw error;
  } finally {
    stopProgressPolling();
  }
}

export function sendMessengerLocation(
  roomId: string,
  clientMessageId: string,
  location: {
    latitude: number;
    longitude: number;
    accuracy_meters?: number | null;
    label?: string | null;
  },
  replyToMessageId?: string | null,
) {
  return messengerRequest<{ message: MessengerMessage; created: boolean }>(
    `/chat/rooms/${roomId}/location`,
    {
      method: "POST",
      body: JSON.stringify({
        client_message_id: clientMessageId,
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy_meters: location.accuracy_meters ?? undefined,
        label: location.label?.trim() || undefined,
        reply_to_message_id: replyToMessageId || undefined,
      }),
    },
  );
}

export function setMessengerReaction(messageId: string, reaction: string) {
  return messengerRequest<{
    message_id: string;
    reactions: MessengerReaction[];
  }>(`/chat/messages/${messageId}/reaction`, {
    method: "PUT",
    body: JSON.stringify({ reaction }),
  });
}

export function removeMessengerReaction(messageId: string) {
  return messengerRequest<{
    message_id: string;
    reactions: MessengerReaction[];
  }>(`/chat/messages/${messageId}/reaction`, { method: "DELETE" });
}

export function forwardMessengerMessage(
  messageId: string,
  targetRoomId: string,
  clientMessageId: string,
) {
  return messengerRequest<{ message: MessengerMessage; created: boolean }>(
    `/chat/messages/${messageId}/forward`,
    {
      method: "POST",
      body: JSON.stringify({
        target_room_id: targetRoomId,
        client_message_id: clientMessageId,
      }),
    },
  );
}

export function getMessengerMessageReceipts(messageId: string) {
  return messengerRequest<{
    message_id: string;
    recipients: MessengerMessageReceipt[];
  }>(`/chat/messages/${messageId}/receipts`);
}

export function markMessengerDelivered(roomId: string, sequence: string) {
  return messengerRequest(`/chat/rooms/${roomId}/delivered`, {
    method: "POST",
    body: JSON.stringify({ last_delivered_sequence: sequence }),
  });
}

export function markMessengerRead(roomId: string, sequence: string) {
  return messengerRequest(`/chat/rooms/${roomId}/read`, {
    method: "POST",
    body: JSON.stringify({ last_read_sequence: sequence }),
  });
}

export function getMessengerPushRegistration() {
  return messengerRequest<MessengerPushRegistration | null>(
    "/push/registration",
  );
}

export function registerMessengerPushToken(
  expoPushToken: string,
  platform: "ios" | "android",
) {
  return messengerRequest<MessengerPushRegistration>("/push/registration", {
    method: "PUT",
    body: JSON.stringify({
      expo_push_token: expoPushToken,
      platform,
    }),
  });
}

export function unregisterMessengerPushToken() {
  return messengerRequest<{ unregistered: true }>("/push/registration", {
    method: "DELETE",
  });
}
