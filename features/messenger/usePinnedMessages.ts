import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { MessengerApiError } from "../../services/messengerApi";
import {
  getMessengerPins,
  setMessengerMessagePinned,
} from "../../services/messengerPins";
import { subscribeMessengerRealtime } from "../../services/messengerRealtime";
import { orderedMessengerPins, type MessengerPin } from "./pins";

interface PinSnapshot {
  key: string;
  items: MessengerPin[];
  canPin: boolean;
}
const empty: MessengerPin[] = [];

/** Shared pins belong to the server; the selected banner is local to this screen. */
export function usePinnedMessages(
  roomId: string,
  userId: string | undefined,
  active: boolean,
) {
  const key = `${userId ?? ""}:${roomId}`;
  const [snapshot, setSnapshot] = useState<PinSnapshot>({
    key: "",
    items: [],
    canPin: false,
  });
  const [mutation, setMutation] = useState<{ key: string; id: string } | null>(
    null,
  );
  const mutationToken = useRef<symbol | null>(null);
  const identity = useRef(key);
  identity.current = key;
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const pinIds = useRef(new Set<string>());
  const items = snapshot.key === key ? snapshot.items : empty;
  const canPin = snapshot.key === key && snapshot.canPin;
  pinIds.current = new Set(items.map((pin) => pin.message.id));

  useEffect(() => {
    if (!active || !userId || !roomId) return;
    let cancelled = false;
    let dirty = false;
    let running: Promise<void> | null = null;
    const refresh = (): Promise<void> => {
      dirty = true;
      if (running) return running;
      running = (async () => {
        do {
          dirty = false;
          try {
            const result = await getMessengerPins(roomId);
            // An invalidation during GET requires a fresh snapshot, not the stale response.
            if (!cancelled && !dirty)
              setSnapshot({
                key,
                items: orderedMessengerPins(result.items),
                canPin: result.can_pin,
              });
          } catch (error) {
            if (
              !cancelled &&
              error instanceof MessengerApiError &&
              [401, 403, 404].includes(error.status)
            ) {
              // 404 also supports rolling deployment against the older server.
              setSnapshot({ key, items: [], canPin: false });
            }
            // Temporary connection failures retain the last known list.
          }
        } while (!cancelled && dirty);
      })().finally(() => {
        running = null;
      });
      return running;
    };
    refreshRef.current = refresh;
    void refresh();
    const unsubscribe = subscribeMessengerRealtime((event) => {
      if (
        event.type === "connection.ready" ||
        event.type === "sync.required" ||
        (event.type === "connection.state" && event.connected) ||
        ((event.type === "room.pins_updated" ||
          event.type === "room.updated") &&
          event.room_id === roomId) ||
        ((event.type === "message.created" ||
          event.type === "message.updated") &&
          event.message.room_id === roomId &&
          (event.message.kind === "system" ||
            pinIds.current.has(event.message.id)))
      ) {
        void refresh();
      }
    });
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    // Repairs missed invalidations, including pins removed by moderation.
    const timer = setInterval(() => {
      if (AppState.currentState === "active" || AppState.currentState == null)
        void refresh();
    }, 30_000);
    return () => {
      cancelled = true;
      unsubscribe();
      appState.remove();
      clearInterval(timer);
      if (refreshRef.current === refresh) refreshRef.current = async () => {};
    };
  }, [active, key, roomId, userId]);

  const setPinned = useCallback(
    async (messageId: string, pinned: boolean) => {
      if (mutationToken.current) return;
      if (!active || !canPin)
        throw new MessengerApiError(
          "Нет права закреплять сообщения в этом чате",
          403,
          "chat_write_denied",
        );
      const token = Symbol();
      mutationToken.current = token;
      setMutation({ key, id: messageId });
      try {
        await setMessengerMessagePinned(roomId, messageId, pinned);
        if (identity.current === key) await refreshRef.current();
      } finally {
        if (mutationToken.current === token) {
          mutationToken.current = null;
          setMutation(null);
        }
      }
    },
    [active, canPin, key, roomId],
  );

  const refresh = useCallback(() => refreshRef.current(), []);
  return { items, canPin, busy: mutation?.key === key, setPinned, refresh };
}
