import { io, type Socket } from "socket.io-client";
import { AppState, type NativeEventSubscription } from "react-native";
import type {
  MessengerMessage,
  MessengerMessageDeliveryUpdate,
} from "../features/messenger/types";
import { applyMessengerAliases } from "../features/messenger/aliases";
import { MESSENGER_SERVER_ORIGIN } from "./messengerApi";
import { messengerLog } from "./messengerLogger";
import { prioritizeMessengerForegroundTransport } from "./messengerTransport";

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
  | { type: "message.updated"; message: MessengerMessage }
  | { type: "room.updated"; room_id: string; deleted?: boolean }
  | {
      type: "message.receipt_updated";
      room_id: string;
      recipient_user_id: string;
      last_delivered_sequence: string;
      last_read_sequence: string | null;
      updates: MessengerMessageDeliveryUpdate[];
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
    }
  | {
      type: "typing.updated";
      room_id: string;
      user_id: string;
      display_name: string;
      original_display_name?: string;
      typing: boolean;
    };

type RealtimeListener = (event: MessengerRealtimeEvent) => void;

const listeners = new Set<RealtimeListener>();
const ACTIVE_ROOM_REFRESH_INTERVAL_MS = 20_000;
const PRESENCE_REFRESH_INTERVAL_MS = 25_000;
let socket: Socket | null = null;
let activeAccessToken: string | null = null;
let visibleRoomId: string | null = null;
let presenceRequested = false;
let activeRoomRefreshTimer: ReturnType<typeof setInterval> | null = null;
let presenceRefreshTimer: ReturnType<typeof setInterval> | null = null;
let appStateSubscription: NativeEventSubscription | null = null;
let socketReady = false;
let connectionRejected = false;

function activeRoomIdForServer(): string | null {
  return AppState.currentState === "active" ? visibleRoomId : null;
}

function announceActiveRoom(): void {
  if (!socket?.connected) return;
  socket.emit("room.focus", { room_id: activeRoomIdForServer() });
}

function presenceActiveForServer(): boolean {
  return AppState.currentState === "active" && presenceRequested;
}

function announcePresenceActivity(): void {
  if (!socket?.connected) return;
  socket.emit("presence.activity", { active: presenceActiveForServer() });
}

function stopActiveRoomRefresh(): void {
  if (!activeRoomRefreshTimer) return;
  clearInterval(activeRoomRefreshTimer);
  activeRoomRefreshTimer = null;
}

function stopPresenceRefresh(): void {
  if (!presenceRefreshTimer) return;
  clearInterval(presenceRefreshTimer);
  presenceRefreshTimer = null;
}

function synchronizeActiveRoomRefresh(): void {
  stopActiveRoomRefresh();
  if (!socket?.connected || !activeRoomIdForServer()) return;
  activeRoomRefreshTimer = setInterval(
    announceActiveRoom,
    ACTIVE_ROOM_REFRESH_INTERVAL_MS,
  );
}

function synchronizePresenceRefresh(): void {
  stopPresenceRefresh();
  if (!socket?.connected || !presenceActiveForServer()) return;
  presenceRefreshTimer = setInterval(
    announcePresenceActivity,
    PRESENCE_REFRESH_INTERVAL_MS,
  );
}

function ensureAppStateSubscription(): void {
  if (appStateSubscription) return;
  appStateSubscription = AppState.addEventListener("change", () => {
    // Clear the server marker before Android/iOS suspends the process. If the
    // event cannot leave the device, disconnect cleanup and the Redis TTL are
    // the remaining safeguards.
    announceActiveRoom();
    synchronizeActiveRoomRefresh();
    announcePresenceActivity();
    synchronizePresenceRefresh();
  });
}

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
  stopActiveRoomRefresh();
  stopPresenceRefresh();
  socket.removeAllListeners();
  socket.io.removeAllListeners();
  socket.disconnect();
  socket = null;
  socketReady = false;
  connectionRejected = false;
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
    else {
      announceActiveRoom();
      synchronizeActiveRoomRefresh();
      announcePresenceActivity();
      synchronizePresenceRefresh();
    }
    return;
  }

  closeSocket("token_changed");
  activeAccessToken = accessToken;
  ensureAppStateSubscription();
  const nextSocket = io(`${MESSENGER_SERVER_ORIGIN}/messenger`, {
    path: "/socket.io",
    transports: ["websocket"],
    auth: { access_token: accessToken, presence_managed: true },
    autoConnect: true,
    forceNew: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 250,
    reconnectionDelayMax: 3_000,
    randomizationFactor: 0.2,
    timeout: 6_000,
  });
  socket = nextSocket;

  nextSocket.on("connect", () => {
    socketReady = false;
    connectionRejected = false;
    console.log(
      "[Messenger realtime] Транспорт подключён, ожидается авторизация",
    );
    announceActiveRoom();
    synchronizeActiveRoomRefresh();
    announcePresenceActivity();
    synchronizePresenceRefresh();
    publish({
      type: "connection.state",
      connected: false,
      reason: "authenticating",
    });
  });
  nextSocket.on("disconnect", (reason) => {
    socketReady = false;
    stopActiveRoomRefresh();
    stopPresenceRefresh();
    console.log(`[Messenger realtime] Соединение закрыто: ${reason}`);
    publish({ type: "connection.state", connected: false, reason });
    if (
      reason === "io server disconnect" &&
      !connectionRejected &&
      activeAccessToken &&
      AppState.currentState === "active"
    ) {
      setTimeout(() => {
        if (socket === nextSocket && !nextSocket.connected) {
          nextSocket.connect();
        }
      }, 500);
    }
  });
  nextSocket.on("connect_error", (error) => {
    // Never log the handshake or access token.
    console.warn(`[Messenger realtime] Ошибка подключения: ${error.message}`);
    publish({
      type: "connection.state",
      connected: false,
      reason: error.message,
    });
  });
  nextSocket.io.on("reconnect_attempt", () => {
    nextSocket.auth = {
      access_token: activeAccessToken,
      presence_managed: true,
    };
  });
  nextSocket.io.on("reconnect", () => {
    publish({ type: "sync.required" });
  });
  nextSocket.on(
    "connection.ready",
    (payload: { user_id: string; session_id: string; room_ids: string[] }) => {
      socketReady = true;
      connectionRejected = false;
      // The server authenticates inside its connection handler. Re-announce
      // scoped state here so an event emitted immediately on the transport's
      // `connect` callback cannot arrive before authentication is ready.
      announceActiveRoom();
      announcePresenceActivity();
      synchronizeActiveRoomRefresh();
      synchronizePresenceRefresh();
      publish({ type: "connection.ready", ...payload });
      publish({ type: "connection.state", connected: true });
      publish({ type: "sync.required" });
    },
  );
  nextSocket.on(
    "connection.rejected",
    (payload: { code?: string; retry_after_ms?: number }) => {
      const reason = payload.code || "connection_rejected";
      socketReady = false;
      connectionRejected = true;
      console.warn(
        `[Messenger realtime] Сервер отклонил соединение: ${reason}`,
      );
      publish({ type: "connection.state", connected: false, reason });
      if (reason === "temporary_unavailable") {
        const retryAfterMs = Math.min(
          5_000,
          Math.max(250, payload.retry_after_ms ?? 1_000),
        );
        setTimeout(() => {
          if (
            socket === nextSocket &&
            !nextSocket.connected &&
            activeAccessToken &&
            AppState.currentState === "active"
          ) {
            connectionRejected = false;
            nextSocket.connect();
          }
        }, retryAfterMs);
      }
    },
  );
  nextSocket.on(
    "message.created",
    (payload: { message?: MessengerMessage }) => {
      if (payload.message)
        publish({
          type: "message.created",
          message: applyMessengerAliases(payload.message),
        });
    },
  );
  nextSocket.on(
    "message.updated",
    (payload: { message?: MessengerMessage }) => {
      if (payload.message)
        publish({
          type: "message.updated",
          message: applyMessengerAliases(payload.message),
        });
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
        "type" | "updates"
      > & {
        updates?: MessengerMessageDeliveryUpdate[];
      },
    ) => {
      messengerLog("info", "realtime.delivery.received", {
        room_id: payload.room_id,
        recipient_user_id: payload.recipient_user_id,
        update_count: payload.updates?.length ?? 0,
        last_delivered_sequence: payload.last_delivered_sequence,
        last_read_sequence: payload.last_read_sequence,
      });
      publish({
        type: "message.receipt_updated",
        ...payload,
        updates: payload.updates ?? [],
      });
    },
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
  nextSocket.on(
    "typing.updated",
    (
      payload: Omit<
        Extract<MessengerRealtimeEvent, { type: "typing.updated" }>,
        "type"
      >,
    ) =>
      publish({
        type: "typing.updated",
        ...applyMessengerAliases(payload),
      }),
  );
}

export function disconnectMessengerRealtime(): void {
  visibleRoomId = null;
  presenceRequested = false;
  announceActiveRoom();
  announcePresenceActivity();
  activeAccessToken = null;
  closeSocket("signed_out");
  appStateSubscription?.remove();
  appStateSubscription = null;
}

/** Called when React Native returns from the background. */
export function resumeMessengerRealtime(): void {
  if (!socket || !activeAccessToken) return;
  if (!socket.connected) {
    // A network transition must not inherit an old exponential-backoff wait.
    // `open()` asks the Manager to start a transport attempt immediately.
    socket.io.open();
    socket.connect();
  } else {
    announceActiveRoom();
    synchronizeActiveRoomRefresh();
    announcePresenceActivity();
    synchronizePresenceRefresh();
    publish({ type: "sync.required" });
  }
}

/** The room feed currently visible to the user on this device. */
export function getMessengerActiveRoomId(): string | null {
  return activeRoomIdForServer();
}

export function getMessengerRealtimeConnectionState(): boolean {
  return socket?.connected === true && socketReady;
}

/** Presence is true only while an authenticated user is inside «Общение». */
export function setMessengerPresenceActive(active: boolean): void {
  presenceRequested = active;
  ensureAppStateSubscription();
  announcePresenceActivity();
  synchronizePresenceRefresh();
}

/**
 * Publishes transient viewing context. It is used only to suppress a PUSH for
 * this exact device/session and never replaces message read receipts.
 */
export function setMessengerActiveRoom(roomId: string | null): void {
  visibleRoomId = roomId || null;
  if (visibleRoomId) {
    prioritizeMessengerForegroundTransport();
    resumeMessengerRealtime();
  }
  ensureAppStateSubscription();
  announceActiveRoom();
  synchronizeActiveRoomRefresh();
}

/** Emits an ephemeral composer state; it is never persisted or queued offline. */
export function sendMessengerTyping(roomId: string, typing: boolean): void {
  if (!socket?.connected || !socketReady || !roomId) return;
  socket.emit("typing.set", { room_id: roomId, typing });
}

export function subscribeMessengerRealtime(
  listener: RealtimeListener,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
