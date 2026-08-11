import { useSQLiteContext } from "expo-sqlite";
import { useEffect } from "react";
import { AppState } from "react-native";
import * as Notifications from "expo-notifications";
import { useMessengerAuth } from "../../contexts/MessengerAuthContext";
import {
  cacheIncomingMessengerMessage,
  cacheMessengerRooms,
  loadCachedMessengerRooms,
} from "./repository";
import { flushMessengerReadReceipts } from "../../services/messengerReadSync";
import { subscribeMessengerRealtime } from "../../services/messengerRealtime";
import { messengerLog } from "../../services/messengerLogger";
import { getMessengerRooms } from "../../services/messengerApi";
import { syncMessengerPushRegistration } from "../../services/messengerPush";
import {
  setMessengerUnreadCount,
  syncMessengerUnreadFromRooms,
} from "../../services/messengerUnread";

/**
 * Keeps the messenger SQLite cache alive independently from any screen. A
 * room no longer needs to be open for its realtime/push messages to be stored.
 */
export default function MessengerPersistenceBridge() {
  const db = useSQLiteContext();
  const { session, isAuthenticated } = useMessengerAuth();

  useEffect(() => {
    if (!isAuthenticated || !session) {
      void setMessengerUnreadCount(0);
      return;
    }
    let active = true;
    let roomsSyncRunning = false;
    const synchronizeRooms = async (remote: boolean) => {
      if (roomsSyncRunning) return;
      roomsSyncRunning = true;
      try {
        const cached = await loadCachedMessengerRooms(db);
        if (active) await syncMessengerUnreadFromRooms(cached);
        if (!remote) return;
        const rooms = await getMessengerRooms();
        const reconciled = await cacheMessengerRooms(db, rooms);
        if (active) await syncMessengerUnreadFromRooms(reconciled);
      } catch (error) {
        messengerLog("debug", "rooms.background_sync.deferred", {
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        roomsSyncRunning = false;
      }
    };
    void synchronizeRooms(true);
    void syncMessengerPushRegistration().catch((error) =>
      messengerLog("debug", "push.registration.sync_deferred", {
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    const persistRealtimeMessage = (
      message: Parameters<typeof cacheIncomingMessengerMessage>[1],
    ) => {
      void cacheIncomingMessengerMessage(db, message, session.user.id)
        .then(() => synchronizeRooms(false))
        .catch((error) =>
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
        void synchronizeRooms(true);
      } else if (event.type === "room.updated") {
        void synchronizeRooms(true);
      }
    });
    const appStateSubscription = AppState.addEventListener(
      "change",
      (state) => {
        if (state === "active") {
          void flushMessengerReadReceipts(db);
          void synchronizeRooms(true);
          void syncMessengerPushRegistration().catch(() => undefined);
        }
      },
    );
    const tokenSubscription = Notifications.addPushTokenListener(() => {
      void syncMessengerPushRegistration().catch((error) =>
        messengerLog("warn", "push.token.rotation_deferred", {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    });
    return () => {
      active = false;
      unsubscribeRealtime();
      appStateSubscription.remove();
      tokenSubscription.remove();
    };
  }, [db, isAuthenticated, session]);

  return null;
}
