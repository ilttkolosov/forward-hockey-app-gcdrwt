import { useSQLiteContext } from "expo-sqlite";
import { useEffect } from "react";
import { AppState } from "react-native";
import { useMessengerAuth } from "../../contexts/MessengerAuthContext";
import { cacheIncomingMessengerMessage } from "./repository";
import { flushMessengerReadReceipts } from "../../services/messengerReadSync";
import { subscribeMessengerRealtime } from "../../services/messengerRealtime";
import { messengerLog } from "../../services/messengerLogger";

/**
 * Keeps the messenger SQLite cache alive independently from any screen. A
 * room no longer needs to be open for its realtime/push messages to be stored.
 */
export default function MessengerPersistenceBridge() {
  const db = useSQLiteContext();
  const { session, isAuthenticated } = useMessengerAuth();

  useEffect(() => {
    if (!isAuthenticated || !session) return;
    const persistRealtimeMessage = (
      message: Parameters<typeof cacheIncomingMessengerMessage>[1],
    ) => {
      void cacheIncomingMessengerMessage(db, message, session.user.id).catch(
        (error) =>
          messengerLog("warn", "realtime.message.cache_failed", {
            room_id: message.room_id,
            message_id: message.id,
            message: error instanceof Error ? error.message : String(error),
          }),
      );
    };
    const unsubscribeRealtime = subscribeMessengerRealtime((event) => {
      if (event.type === "message.created") {
        persistRealtimeMessage(event.message);
      } else if (
        event.type === "connection.ready" ||
        event.type === "sync.required"
      ) {
        void flushMessengerReadReceipts(db);
      }
    });
    const appStateSubscription = AppState.addEventListener(
      "change",
      (state) => {
        if (state === "active") void flushMessengerReadReceipts(db);
      },
    );
    return () => {
      unsubscribeRealtime();
      appStateSubscription.remove();
    };
  }, [db, isAuthenticated, session]);

  return null;
}
