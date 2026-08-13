import { useSQLiteContext } from "expo-sqlite";
import { useEffect } from "react";
import { AppState } from "react-native";
import * as Notifications from "expo-notifications";
import { useMessengerAuth } from "../../contexts/MessengerAuthContext";
import { replaceMessengerAliases } from "./aliases";
import {
  cacheIncomingMessengerMessage,
  cacheMessengerDeliveryUpdates,
  cacheUpdatedMessengerMessage,
  cacheMessengerRooms,
  loadCachedMessengerRooms,
} from "./repository";
import { warmMessengerRoomWindows } from "./cacheWarmup";
import { flushMessengerReadReceipts } from "../../services/messengerReadSync";
import { subscribeMessengerRealtime } from "../../services/messengerRealtime";
import { messengerLog } from "../../services/messengerLogger";
import {
  getMessengerContactAliases,
  getMessengerRooms,
} from "../../services/messengerApi";
import {
  syncMessengerPushRegistration,
  syncMessengerPushTokenRotation,
} from "../../services/messengerPush";
import { remotePushNotificationsSupported } from "../../services/runtimeEnvironment";
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
    const synchronizeAliases = async () => {
      try {
        const remoteAliases = await getMessengerContactAliases();
        if (active) {
          await replaceMessengerAliases(session.user.id, remoteAliases);
        }
      } catch (error) {
        messengerLog("debug", "aliases.background_sync.deferred", {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    };
    const synchronizeRooms = async (remote: boolean) => {
      if (roomsSyncRunning) return;
      roomsSyncRunning = true;
      try {
        const cached = await loadCachedMessengerRooms(db);
        if (active) await syncMessengerUnreadFromRooms(cached);
        void warmMessengerRoomWindows(db, cached);
        if (!remote) return;
        const rooms = await getMessengerRooms();
        const reconciled = await cacheMessengerRooms(db, rooms);
        if (active) await syncMessengerUnreadFromRooms(reconciled);
        void warmMessengerRoomWindows(db, reconciled);
      } catch (error) {
        messengerLog("debug", "rooms.background_sync.deferred", {
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        roomsSyncRunning = false;
      }
    };
    void synchronizeAliases().then(() => synchronizeRooms(true));
    if (remotePushNotificationsSupported) {
      void syncMessengerPushRegistration().catch((error) =>
        messengerLog("debug", "push.registration.sync_deferred", {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
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
      } else if (event.type === "message.updated") {
        void cacheUpdatedMessengerMessage(db, event.message)
          .then(() => synchronizeRooms(false))
          .catch((error) =>
            messengerLog("warn", "realtime.message_update.cache_failed", {
              room_id: event.message.room_id,
              message_id: event.message.id,
              message: error instanceof Error ? error.message : String(error),
            }),
          );
      } else if (event.type === "message.receipt_updated") {
        void cacheMessengerDeliveryUpdates(db, event.updates).catch((error) =>
          messengerLog("warn", "realtime.delivery.cache_failed", {
            room_id: event.room_id,
            message: error instanceof Error ? error.message : String(error),
          }),
        );
      } else if (
        event.type === "connection.ready" ||
        event.type === "sync.required"
      ) {
        void flushMessengerReadReceipts(db);
        void synchronizeAliases().then(() => synchronizeRooms(true));
      } else if (event.type === "room.updated") {
        void synchronizeRooms(true);
      }
    });
    const appStateSubscription = AppState.addEventListener(
      "change",
      (state) => {
        if (state === "active") {
          void flushMessengerReadReceipts(db);
          void synchronizeAliases().then(() => synchronizeRooms(true));
          if (remotePushNotificationsSupported) {
            void syncMessengerPushRegistration().catch(() => undefined);
          }
        }
      },
    );
    const tokenSubscription = remotePushNotificationsSupported
      ? Notifications.addPushTokenListener((token) => {
          void syncMessengerPushTokenRotation(token).catch((error) =>
            messengerLog("warn", "push.token.rotation_deferred", {
              message: error instanceof Error ? error.message : String(error),
            }),
          );
        })
      : null;
    return () => {
      active = false;
      unsubscribeRealtime();
      appStateSubscription.remove();
      tokenSubscription?.remove();
    };
  }, [db, isAuthenticated, session]);

  return null;
}
