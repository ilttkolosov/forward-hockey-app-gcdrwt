import { io, type Socket } from "socket.io-client";
import type { MessengerMessage } from "../features/messenger/types";
import { MESSENGER_SERVER_ORIGIN } from "./messengerApi";

export type MessengerRealtimeEvent =
  | {
      type: "connection.ready";
      user_id: string;
      session_id: string;
      room_ids: string[];
    }
  | { type: "connection.state"; connected: boolean; reason?: string }
  | { type: "sync.required" }
  | { type: "message.created"; message: MessengerMessage }
  | { type: "room.updated"; room_id: string; deleted?: boolean }
  | {
      type: "message.receipt_updated";
      room_id: string;
      recipient_user_id: string;
      last_delivered_sequence: string;
      last_read_sequence: string | null;
    }
  | {
      type: "message.reaction_updated";
      room_id: string;
      message_id: string;
      reactions?: MessengerMessage["reactions"];
    }
  | {
      type: "presence.updated";
      user_id: string;
      online: boolean;
      last_seen_at: string | null;
    };

type RealtimeListener = (event: MessengerRealtimeEvent) => void;

const listeners = new Set<RealtimeListener>();
let socket: Socket | null = null;
let activeAccessToken: string | null = null;

function publish(event: MessengerRealtimeEvent): void {
  listeners.forEach((listener) => {
    try {
      listener(event);
    } catch (error) {
      console.warn("[Messenger realtime] Ошибка обработчика события:", error);
    }
  });
}

function closeSocket(reason: string): void {
  if (!socket) return;
  socket.removeAllListeners();
  socket.io.removeAllListeners();
  socket.disconnect();
  socket = null;
  publish({ type: "connection.state", connected: false, reason });
}

/**
 * Opens one authenticated Socket.IO connection for the whole application.
 * Screens use it only as an invalidation channel and still reconcile data via
 * REST/SQLite, so reconnects and duplicate events cannot corrupt local state.
 */
export function connectMessengerRealtime(accessToken: string): void {
  if (!accessToken) {
    disconnectMessengerRealtime();
    return;
  }
  if (socket && activeAccessToken === accessToken) {
    if (!socket.connected) socket.connect();
    return;
  }

  closeSocket("token_changed");
  activeAccessToken = accessToken;
  const nextSocket = io(`${MESSENGER_SERVER_ORIGIN}/messenger`, {
    path: "/socket.io",
    transports: ["websocket"],
    auth: { access_token: accessToken },
    autoConnect: true,
    forceNew: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 750,
    reconnectionDelayMax: 10_000,
    randomizationFactor: 0.4,
    timeout: 10_000,
  });
  socket = nextSocket;

  nextSocket.on("connect", () => {
    console.log("[Messenger realtime] Соединение установлено");
    publish({ type: "connection.state", connected: true });
  });
  nextSocket.on("disconnect", (reason) => {
    console.log(`[Messenger realtime] Соединение закрыто: ${reason}`);
    publish({ type: "connection.state", connected: false, reason });
  });
  nextSocket.on("connect_error", (error) => {
    // Never log the handshake or access token.
    console.warn(`[Messenger realtime] Ошибка подключения: ${error.message}`);
  });
  nextSocket.io.on("reconnect_attempt", () => {
    nextSocket.auth = { access_token: activeAccessToken };
  });
  nextSocket.io.on("reconnect", () => {
    publish({ type: "sync.required" });
  });
  nextSocket.on(
    "connection.ready",
    (payload: { user_id: string; session_id: string; room_ids: string[] }) => {
      publish({ type: "connection.ready", ...payload });
      publish({ type: "sync.required" });
    },
  );
  nextSocket.on("connection.rejected", (payload: { code?: string }) => {
    const reason = payload.code || "connection_rejected";
    console.warn(`[Messenger realtime] Сервер отклонил соединение: ${reason}`);
    publish({ type: "connection.state", connected: false, reason });
  });
  nextSocket.on(
    "message.created",
    (payload: { message?: MessengerMessage }) => {
      if (payload.message)
        publish({ type: "message.created", message: payload.message });
    },
  );
  nextSocket.on(
    "room.updated",
    (payload: { room_id: string; deleted?: boolean }) =>
      publish({ type: "room.updated", ...payload }),
  );
  nextSocket.on(
    "message.receipt_updated",
    (
      payload: Omit<
        Extract<MessengerRealtimeEvent, { type: "message.receipt_updated" }>,
        "type"
      >,
    ) => publish({ type: "message.receipt_updated", ...payload }),
  );
  nextSocket.on(
    "message.reaction_updated",
    (payload: {
      room_id: string;
      message_id: string;
      reactions?: MessengerMessage["reactions"];
    }) => publish({ type: "message.reaction_updated", ...payload }),
  );
  nextSocket.on(
    "presence.updated",
    (
      payload: Omit<
        Extract<MessengerRealtimeEvent, { type: "presence.updated" }>,
        "type"
      >,
    ) => publish({ type: "presence.updated", ...payload }),
  );
}

export function disconnectMessengerRealtime(): void {
  activeAccessToken = null;
  closeSocket("signed_out");
}

/** Called when React Native returns from the background. */
export function resumeMessengerRealtime(): void {
  if (!socket || !activeAccessToken) return;
  if (!socket.connected) socket.connect();
  else publish({ type: "sync.required" });
}

export function subscribeMessengerRealtime(
  listener: RealtimeListener,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
