import { Platform } from "react-native";
import type {
  InvitationPreview,
  MessengerContact,
  MessengerMessageReceipt,
  MessengerMessage,
  MessengerReaction,
  MessengerRoom,
  MessengerRoomSettings,
  MessengerSession,
  MessengerUser,
} from "../features/messenger/types";
import {
  clearMessengerSession,
  getMessengerDeviceId,
  loadMessengerSession,
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
    const response = await fetch(`${MESSENGER_API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    try {
      const refreshed = await parseResponse<MessengerSession>(response);
      await saveMessengerSession(refreshed);
      return refreshed;
    } catch (error) {
      if (error instanceof MessengerApiError && error.status === 401) {
        await clearMessengerSession();
      }
      throw error;
    }
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
  const result = await messengerRequest<MessengerSession>("/auth/login", {
    public: true,
    method: "POST",
    body: JSON.stringify({ username, password, ...(await sessionContext()) }),
  });
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
  await saveMessengerSession(result);
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

export async function logoutFromMessenger(): Promise<void> {
  try {
    await messengerRequest("/auth/logout", { method: "POST" });
  } catch (error) {
    console.warn("[Messenger] Серверный выход не подтверждён:", error);
  } finally {
    await clearMessengerSession();
  }
}

export function getMessengerRooms() {
  return messengerRequest<MessengerRoom[]>("/chat/rooms");
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
  return messengerRequest<{
    items: MessengerMessage[];
    page: {
      direction: "latest" | "before" | "after";
      has_more: boolean;
      oldest_sequence: string | null;
      latest_sequence: string | null;
    };
  }>(`/chat/rooms/${roomId}/messages?${query.toString()}`);
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

export function sendMessengerMedia(
  roomId: string,
  clientMessageId: string,
  file: { uri: string; name: string; type: string },
  caption?: string,
  replyToMessageId?: string | null,
) {
  const form = new FormData();
  form.append("client_message_id", clientMessageId);
  if (caption?.trim()) form.append("caption", caption.trim());
  if (replyToMessageId) form.append("reply_to_message_id", replyToMessageId);
  form.append("file", file as unknown as Blob);
  return messengerRequest<{ message: MessengerMessage; created: boolean }>(
    `/chat/rooms/${roomId}/media`,
    { method: "POST", body: form },
  );
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
