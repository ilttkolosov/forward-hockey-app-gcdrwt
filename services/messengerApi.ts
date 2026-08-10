import { Platform } from "react-native";
import type {
  InvitationPreview,
  MessengerMessage,
  MessengerReaction,
  MessengerRoom,
  MessengerSession,
  MessengerUser,
} from "../features/messenger/types";
import {
  clearMessengerSession,
  getMessengerDeviceId,
  loadMessengerSession,
  saveMessengerSession,
} from "./messengerSession";

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
  const session = await loadMessengerSession();
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (!options.public && session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  const response = await fetch(`${MESSENGER_API_BASE_URL}${path}`, {
    ...options,
    headers,
  });
  if (
    response.status === 401 &&
    !options.public &&
    !options.noRefresh &&
    Boolean(session?.refresh_token)
  ) {
    await refreshMessengerSession();
    return messengerRequest<T>(path, { ...options, noRefresh: true });
  }
  return parseResponse<T>(response);
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

export function getMessengerMessages(roomId: string) {
  return messengerRequest<{
    items: MessengerMessage[];
    page: { latest_sequence: string | null };
  }>(`/chat/rooms/${roomId}/messages?limit=100`);
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
