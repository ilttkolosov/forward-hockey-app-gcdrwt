import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import * as Notifications from "expo-notifications";
import NetInfo from "@react-native-community/netinfo";
import { useMessengerAuth } from "../../contexts/MessengerAuthContext";
import { replaceMessengerAliases } from "./aliases";
import { compareMessengerSequence } from "./feed";
import {
  cacheIncomingMessengerMessage,
  cacheMessengerDeliveryUpdates,
  cacheUpdatedMessengerMessage,
  cacheMessengerRooms,
  loadCachedMessengerRooms,
  removeMessengerOutboxItem,
} from "./repository";
import { warmMessengerRoomWindows } from "./cacheWarmup";
import { flushMessengerReadReceipts } from "../../services/messengerReadSync";
import {
  getMessengerActiveRoomId,
  subscribeMessengerRealtime,
} from "../../services/messengerRealtime";
import { messengerLog } from "../../services/messengerLogger";
import {
  hasLocalMessengerMediaUpload,
  prefetchMessengerMedia,
} from "../../services/messengerMediaCache";
import { warmMessengerMediaFileReader } from "../../services/messengerMediaUploadWarmup";
import {
  getMessengerContactAliases,
  getMessengerRooms,
  markMessengerDelivered,
} from "../../services/messengerApi";
import {
  syncMessengerPushRegistration,
  syncMessengerPushTokenRotation,
} from "../../services/messengerPush";
import { remotePushNotificationsSupported } from "../../services/runtimeEnvironment";
import {
  refreshMessengerUnreadFromCache,
  setMessengerUnreadCount,
  syncMessengerUnreadFromRooms,
} from "../../services/messengerUnread";
import { requestMessengerOutboxFlush } from "../../services/messengerOutbox";

const BACKGROUND_ROOMS_SYNC_DEBOUNCE_MS = 250;
const BACKGROUND_ROOMS_SYNC_MIN_INTERVAL_MS = 10_000;

/**
 * Keeps the messenger SQLite cache alive independently from any screen. A
 * room no longer needs to be open for its realtime/push messages to be stored.
 */
export default function MessengerPersistenceBridge() {
  const db = useSQLiteContext();
  const { session, isAuthenticated } = useMessengerAuth();
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (!isAuthenticated || !userId) {
      void setMessengerUnreadCount(0);
      return;
    }
    let active = true;
    let roomsSyncRunning = false;
    let roomsSyncQueued = false;
    let roomsSyncTimer: ReturnType<typeof setTimeout> | null = null;
    let lastRoomsSyncStartedAt = 0;
    const synchronizeAliases = async () => {
      try {
        const remoteAliases = await getMessengerContactAliases({
          priority: "background",
        });
        if (active) {
          await replaceMessengerAliases(userId, remoteAliases);
        }
      } catch (error) {
        messengerLog("debug", "aliases.background_sync.deferred", {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    };
    const synchronizeRooms = async () => {
      if (roomsSyncRunning) {
        roomsSyncQueued = true;
        return;
      }
      roomsSyncRunning = true;
      lastRoomsSyncStartedAt = Date.now();
      try {
        void synchronizeAliases();
        const rooms = await getMessengerRooms({ priority: "background" });
        for (const room of rooms) {
          const latest = room.last_message;
          if (
            latest &&
            latest.author.id !== userId &&
            compareMessengerSequence(
              latest.sequence,
              room.last_delivered_sequence,
            ) > 0
          ) {
            void markMessengerDelivered(room.id, latest.sequence).catch(
              (error) =>
                messengerLog("debug", "delivery.background_sync.deferred", {
                  room_id: room.id,
                  sequence: latest.sequence,
                  message:
                    error instanceof Error ? error.message : String(error),
                }),
            );
          }
        }
        prefetchMessengerMedia(
          rooms.flatMap((room) => {
            const latest = room.last_message;
            if (!latest || latest.author.id === userId) return [];
            return latest.media_items?.length
              ? latest.media_items
              : latest.media
                ? [latest.media]
                : [];
          }),
          sessionRef.current?.access_token ?? "",
        );
        const reconciled = await cacheMessengerRooms(db, rooms);
        if (active) await syncMessengerUnreadFromRooms(reconciled);
        void warmMessengerRoomWindows(db, reconciled);
      } catch (error) {
        messengerLog("debug", "rooms.background_sync.deferred", {
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        roomsSyncRunning = false;
        if (roomsSyncQueued && active) {
          roomsSyncQueued = false;
          scheduleRoomsSynchronization(true);
        }
      }
    };
    const scheduleRoomsSynchronization = (force = false) => {
      if (!active) return;
      if (roomsSyncRunning) {
        // `connection.ready` and `sync.required` are emitted together. A
        // synchronization already in progress covers both invalidations; only
        // an actual room mutation must schedule a follow-up pass.
        if (force) roomsSyncQueued = true;
        return;
      }
      const elapsed = Date.now() - lastRoomsSyncStartedAt;
      const minimumDelay = force
        ? 0
        : Math.max(0, BACKGROUND_ROOMS_SYNC_MIN_INTERVAL_MS - elapsed);
      const activeRoomDelay =
        !force && getMessengerActiveRoomId()
          ? BACKGROUND_ROOMS_SYNC_MIN_INTERVAL_MS
          : 0;
      const delay = Math.max(
        BACKGROUND_ROOMS_SYNC_DEBOUNCE_MS,
        minimumDelay,
        activeRoomDelay,
      );
      if (roomsSyncTimer) {
        if (!force) return;
        clearTimeout(roomsSyncTimer);
      }
      roomsSyncTimer = setTimeout(() => {
        roomsSyncTimer = null;
        void synchronizeRooms();
      }, delay);
    };
    void loadCachedMessengerRooms(db)
      .then(async (cached) => {
        if (active) await syncMessengerUnreadFromRooms(cached);
        void warmMessengerRoomWindows(db, cached);
      })
      .catch((error) =>
        messengerLog("debug", "rooms.cached_sync.deferred", {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    void warmMessengerMediaFileReader();
    requestMessengerOutboxFlush(db);
    scheduleRoomsSynchronization();
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
      const preserveLocalMedia = hasLocalMessengerMediaUpload(
        message.client_message_id,
      );
      void cacheIncomingMessengerMessage(db, message, userId)
        .then(() => {
          if (message.author.id === userId) {
            void removeMessengerOutboxItem(
              db,
              message.client_message_id,
            ).catch(() => undefined);
          }
          void refreshMessengerUnreadFromCache(db);
          if (message.author.id !== userId) {
            void markMessengerDelivered(message.room_id, message.sequence)
              .then(() =>
                messengerLog("info", "delivery.acknowledged", {
                  room_id: message.room_id,
                  message_id: message.id,
                  sequence: message.sequence,
                }),
              )
              .catch((error) =>
                messengerLog("debug", "delivery.ack_deferred", {
                  room_id: message.room_id,
                  message_id: message.id,
                  sequence: message.sequence,
                  message:
                    error instanceof Error ? error.message : String(error),
                }),
              );
          }
          if (!preserveLocalMedia) {
            prefetchMessengerMedia(
              message.media_items?.length
                ? message.media_items
                : message.media
                  ? [message.media]
                  : [],
              sessionRef.current?.access_token ?? "",
            );
          } else {
            messengerLog("debug", "media.cache.local_upload_preserved", {
              room_id: message.room_id,
              message_id: message.id,
              client_message_id: message.client_message_id,
            });
          }
        })
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
          .then(() => {
            void refreshMessengerUnreadFromCache(db);
            if (event.message.author.id !== userId) {
              prefetchMessengerMedia(
                event.message.media_items?.length
                  ? event.message.media_items
                  : event.message.media
                    ? [event.message.media]
                    : [],
                sessionRef.current?.access_token ?? "",
              );
            }
          })
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
        requestMessengerOutboxFlush(db);
        scheduleRoomsSynchronization();
      } else if (event.type === "room.updated") {
        scheduleRoomsSynchronization(true);
      }
    });
    const appStateSubscription = AppState.addEventListener(
      "change",
      (state) => {
        // Start or keep the durable send pipeline alive before the OS gets a
        // chance to suspend JavaScript. A native request already in flight is
        // not tied to the room component.
        requestMessengerOutboxFlush(db);
        if (state === "active") {
          void warmMessengerMediaFileReader();
          void flushMessengerReadReceipts(db);
          scheduleRoomsSynchronization();
          if (remotePushNotificationsSupported) {
            void syncMessengerPushRegistration().catch(() => undefined);
          }
        }
      },
    );
    const networkSubscription = NetInfo.addEventListener((network) => {
      if (
        network.isConnected !== false &&
        network.isInternetReachable !== false
      ) {
        requestMessengerOutboxFlush(db);
      }
    });
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
      if (roomsSyncTimer) clearTimeout(roomsSyncTimer);
      unsubscribeRealtime();
      appStateSubscription.remove();
      networkSubscription();
      tokenSubscription?.remove();
    };
  }, [db, isAuthenticated, userId]);

  return null;
}
