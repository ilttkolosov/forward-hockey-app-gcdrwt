import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
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
  processMessengerPushPayload,
  syncMessengerPushRegistration,
  syncMessengerPushTokenRotation,
  syncMessengerUnreadFromPresentedNotifications,
} from "../../services/messengerPush";
import { remotePushNotificationsSupported } from "../../services/runtimeEnvironment";
import {
  beginMessengerUnreadSession,
  clearMessengerUnreadSession,
  hydrateMessengerUnreadSession,
  incrementMessengerUnreadForMessage,
  refreshMessengerUnreadFromCache,
  syncMessengerUnreadFromRooms,
} from "../../services/messengerUnread";
import { messengerUnreadAuthAction } from "../../services/messengerUnreadPolicy";
import { requestMessengerOutboxFlush } from "../../services/messengerOutbox";
import { setMessengerMutedRooms } from "../../services/messengerSounds";
import { waitForAppInteractive } from "../../services/appInteractive";

const BACKGROUND_ROOMS_SYNC_DEBOUNCE_MS = 1_500;
const BACKGROUND_ROOMS_SYNC_MIN_INTERVAL_MS = 10_000;
const INITIAL_HISTORY_WARMUP_DELAY_MS = 20_000;
const BACKGROUND_ALIASES_SYNC_MIN_INTERVAL_MS = 5 * 60_000;
const FOREGROUND_UNREAD_RECOVERY_DELAYS_MS = [350, 1_200] as const;

/**
 * Keeps the messenger SQLite cache alive independently from any screen. A
 * room no longer needs to be open for its realtime/push messages to be stored.
 */
export default function MessengerPersistenceBridge() {
  const db = useSQLiteContext();
  const { status, session } = useMessengerAuth();
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const userId = session?.user.id ?? null;
  const unreadAuthAction = messengerUnreadAuthAction(status, userId);

  useEffect(() => {
    if (unreadAuthAction === "wait") return;
    if (unreadAuthAction === "clear") {
      void clearMessengerUnreadSession();
      return;
    }
    if (!userId) return;
    beginMessengerUnreadSession(userId);
    let active = true;
    let roomsSyncRunning = false;
    let roomsSyncQueued = false;
    let roomsSyncTimer: ReturnType<typeof setTimeout> | null = null;
    let historyWarmupTimer: ReturnType<typeof setTimeout> | null = null;
    const unreadRecoveryTimers = new Set<ReturnType<typeof setTimeout>>();
    let lastRoomsSyncStartedAt = 0;
    let lastAliasesSyncStartedAt = 0;
    const recoverUnreadFromDevice = async (reason: string) => {
      const results = await Promise.allSettled([
        hydrateMessengerUnreadSession(userId),
        syncMessengerUnreadFromPresentedNotifications(),
      ]);
      if (!active) return [];
      const cached = await loadCachedMessengerRooms(db);
      if (!active) return cached;
      setMessengerMutedRooms(cached);
      await syncMessengerUnreadFromRooms(cached, "cache");
      const rejected = results.filter(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected",
      );
      if (rejected.length) {
        messengerLog("debug", "badge.foreground_recovery.partial", {
          reason,
          failure_count: rejected.length,
          message: rejected
            .map((result) =>
              result.reason instanceof Error
                ? result.reason.message
                : String(result.reason),
            )
            .join(" | "),
        });
      }
      return cached;
    };
    const requestUnreadRecovery = (reason: string) => {
      void recoverUnreadFromDevice(reason).catch((error) =>
        messengerLog("debug", "badge.foreground_recovery.deferred", {
          reason,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    };
    const unreadHydration = recoverUnreadFromDevice("session-start");
    const scheduleHistoryWarmup = (
      rooms: Parameters<typeof warmMessengerRoomWindows>[1],
      delay = INITIAL_HISTORY_WARMUP_DELAY_MS,
    ) => {
      if (historyWarmupTimer) clearTimeout(historyWarmupTimer);
      historyWarmupTimer = setTimeout(() => {
        historyWarmupTimer = null;
        if (active && AppState.currentState === "active") {
          void warmMessengerRoomWindows(db, rooms);
        }
      }, delay);
    };
    const synchronizeAliases = async () => {
      if (
        Date.now() - lastAliasesSyncStartedAt <
        BACKGROUND_ALIASES_SYNC_MIN_INTERVAL_MS
      ) {
        return;
      }
      lastAliasesSyncStartedAt = Date.now();
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
    const synchronizeRooms = async (
      forceNetwork = false,
      startupUnreadPriority = false,
    ) => {
      if (roomsSyncRunning) {
        roomsSyncQueued = true;
        return;
      }
      roomsSyncRunning = true;
      lastRoomsSyncStartedAt = Date.now();
      try {
        const rooms = await getMessengerRooms({
          priority: startupUnreadPriority ? "foreground" : "background",
          force: forceNetwork,
        });
        if (active) {
          // The response already contains the authoritative unread total.
          // Publish it before delivery acknowledgements and SQLite writes so
          // a cold Android start never waits for the database write queue.
          await syncMessengerUnreadFromRooms(rooms, "authoritative");
        }
        void synchronizeAliases();
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
        if (active) {
          setMessengerMutedRooms(reconciled);
          // A newer local read cursor may legitimately reduce the server
          // snapshot after it has been cached on this device.
          await syncMessengerUnreadFromRooms(reconciled, "authoritative");
          // Android can have newer still-present notifications than a room
          // request which was already travelling when the PUSH arrived.
          // Re-apply their per-room floor after every server reconciliation.
          if (Platform.OS === "android") {
            await syncMessengerUnreadFromPresentedNotifications();
          }
        }
        scheduleHistoryWarmup(reconciled);
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
      if (!active || AppState.currentState !== "active") return;
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
      const delay = force
        ? 0
        : Math.max(
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
        void synchronizeRooms(force);
      }, delay);
    };
    // Unread is part of the first home screen, unlike aliases, media and
    // history warm-up. Start its authoritative request as soon as the restored
    // session mounts this bridge, without waiting for InteractionManager.
    void synchronizeRooms(true, true);
    void unreadHydration
      .then(async (cached) => {
        await waitForAppInteractive();
        if (!active) return;
        scheduleHistoryWarmup(cached);
      })
      .catch((error) =>
        messengerLog("debug", "rooms.cached_sync.deferred", {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    void waitForAppInteractive().then(() => {
      if (!active) return;
      requestUnreadRecovery("interactive");
      for (const delay of FOREGROUND_UNREAD_RECOVERY_DELAYS_MS) {
        const timer = setTimeout(() => {
          unreadRecoveryTimers.delete(timer);
          if (active) requestUnreadRecovery(`interactive+${delay}`);
        }, delay);
        unreadRecoveryTimers.add(timer);
      }
      void warmMessengerMediaFileReader();
      requestMessengerOutboxFlush(db);
      scheduleRoomsSynchronization(true);
      if (remotePushNotificationsSupported) {
        void syncMessengerPushRegistration().catch((error) =>
          messengerLog("debug", "push.registration.sync_deferred", {
            message: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    });
    const persistRealtimeMessage = (
      message: Parameters<typeof cacheIncomingMessengerMessage>[1],
    ) => {
      const preserveLocalMedia = hasLocalMessengerMediaUpload(
        message.client_message_id,
      );
      void cacheIncomingMessengerMessage(db, message, userId)
        .then((cacheResult) => {
          if (message.author.id === userId) {
            void removeMessengerOutboxItem(
              db,
              message.client_message_id,
            ).catch(() => undefined);
          }
          if (cacheResult.unreadIncremented) {
            void incrementMessengerUnreadForMessage(message.id);
          }
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
          requestUnreadRecovery("app-active");
          scheduleRoomsSynchronization(true);
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
    const notificationSubscription = remotePushNotificationsSupported
      ? Notifications.addNotificationReceivedListener((notification) => {
          void processMessengerPushPayload(
            notification.request.content.data,
          ).catch((error) =>
            messengerLog("warn", "push.foreground.processing_deferred", {
              message: error instanceof Error ? error.message : String(error),
            }),
          );
        })
      : null;
    return () => {
      active = false;
      if (roomsSyncTimer) clearTimeout(roomsSyncTimer);
      if (historyWarmupTimer) clearTimeout(historyWarmupTimer);
      unreadRecoveryTimers.forEach(clearTimeout);
      unreadRecoveryTimers.clear();
      unsubscribeRealtime();
      appStateSubscription.remove();
      networkSubscription();
      tokenSubscription?.remove();
      notificationSubscription?.remove();
    };
  }, [db, unreadAuthAction, userId]);

  return null;
}
