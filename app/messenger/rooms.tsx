import { useFocusEffect, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  InteractionManager,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "../../components/Icon";
import { useMessengerAuth } from "../../contexts/MessengerAuthContext";
import AuthenticatedAvatar from "../../features/messenger/AuthenticatedAvatar";
import LocalRoomAvatar from "../../features/messenger/LocalRoomAvatar";
import SavedMessagesAvatar from "../../features/messenger/SavedMessagesAvatar";
import {
  cacheMessengerRooms,
  loadCachedMessengerRooms,
} from "../../features/messenger/repository";
import { mergeMessengerRoomReadState } from "../../features/messenger/roomListState";
import type { MessengerRoom } from "../../features/messenger/types";
import { useTypingDots } from "../../features/messenger/useTypingDots";
import {
  getMessengerRooms,
  isMessengerConnectionError,
  messengerErrorMessage,
  updateMessengerRoomNotifications,
  type MessengerRoomMuteDuration,
} from "../../services/messengerApi";
import { subscribeMessengerRealtime } from "../../services/messengerRealtime";
import { messengerLog } from "../../services/messengerLogger";
import { stripMessengerTextFormatting } from "../../services/messengerTextFormatting";
import { syncMessengerUnreadFromRooms } from "../../services/messengerUnread";
import { colors } from "../../styles/commonStyles";
import { setMessengerMutedRooms } from "../../services/messengerSounds";
import { trackMessengerAction } from "../../services/analyticsService";
import { isSQLiteBusyError } from "../../database/writeCoordinator";

function lastMessageText(room: MessengerRoom): string {
  if (!room.last_message) return "Сообщений пока нет";
  if (room.last_message.kind === "image") return "Фото";
  if (room.last_message.kind === "video") return "Видео";
  if (room.last_message.kind === "file")
    return room.last_message.media?.original_name || "Файл";
  if (room.last_message.kind === "location") return "Геопозиция";
  return stripMessengerTextFormatting(room.last_message.text);
}

function sequenceIsNewer(candidate: string, current: string): boolean {
  const left = candidate.replace(/^0+/, "") || "0";
  const right = current.replace(/^0+/, "") || "0";
  return left.length !== right.length
    ? left.length > right.length
    : left.localeCompare(right) > 0;
}

const BUILT_IN_ROOM_KINDS = new Set([
  "players",
  "coach_team",
  "parents",
  "coach_parents",
  "parent_committee",
  "coaching_staff",
  "fans",
]);

const MESSENGER_BOOTSTRAP_VERSION = 1;
const FOREGROUND_REFRESH_DELAY_MS = 800;

type MessengerPreparationState = {
  mode: "checking" | "preparing" | "ready" | "error";
  progress: number;
  message: string;
};

function messengerBootstrapKey(userId: string): string {
  return `@messenger/bootstrap/${MESSENGER_BOOTSTRAP_VERSION}/${userId}`;
}

function MessengerPreparationScreen({
  progress,
  message,
  error,
  onRetry,
}: {
  progress: number;
  message: string;
  error: boolean;
  onRetry: () => void;
}) {
  const normalizedProgress = Math.max(0, Math.min(100, Math.round(progress)));
  return (
    <SafeAreaView style={styles.preparationSafeArea} edges={["top", "bottom"]}>
      <View style={styles.preparationCard}>
        <Image
          source={require("../../assets/icons/myIcon.png")}
          style={styles.preparationLogo}
          resizeMode="contain"
        />
        <Text style={styles.preparationTitle}>Подготовка мессенджера</Text>
        <Text style={styles.preparationMessage}>{message}</Text>
        <Text style={styles.preparationPercent}>{normalizedProgress}%</Text>
        <View style={styles.preparationTrack}>
          <View
            style={[
              styles.preparationProgress,
              { width: `${normalizedProgress}%` },
              error && styles.preparationProgressError,
            ]}
          />
        </View>
        {error && (
          <TouchableOpacity style={styles.preparationRetry} onPress={onRetry}>
            <Text style={styles.preparationRetryText}>Повторить</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.preparationHint}>
          Полная подготовка выполняется только один раз после установки или для нового профиля.
        </Text>
      </View>
    </SafeAreaView>
  );
}

function isPresetRoom(room: MessengerRoom): boolean {
  return room.room_type === "group" && BUILT_IN_ROOM_KINDS.has(room.kind);
}

function isSameLocalDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

function formatRoomActivityTime(iso: string | undefined): string {
  if (!iso) return "";
  const activity = new Date(iso);
  if (Number.isNaN(activity.getTime())) return "";
  const now = new Date();
  if (isSameLocalDay(activity, now)) {
    return `${twoDigits(activity.getHours())}:${twoDigits(activity.getMinutes())}`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameLocalDay(activity, yesterday)) return "Вчера";
  const date = `${twoDigits(activity.getDate())}.${twoDigits(activity.getMonth() + 1)}`;
  return activity.getFullYear() === now.getFullYear()
    ? date
    : `${date}.${String(activity.getFullYear()).slice(-2)}`;
}

function typingLabel(
  names: readonly string[],
  showNames: boolean,
  dots: string,
): string {
  if (names.length === 0) return "";
  if (!showNames)
    return `${names.length > 1 ? "Печатают" : "Печатает"}${dots}`;
  if (names.length === 1) return `${names[0]} печатает${dots}`;
  if (names.length === 2) return `${names[0]} и ${names[1]} печатают${dots}`;
  return `${names[0]}, ${names[1]} и ещё ${names.length - 2} печатают${dots}`;
}

export default function MessengerRoomsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { status, session, isAuthenticated } = useMessengerAuth();
  const [rooms, setRooms] = useState<MessengerRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newChatVisible, setNewChatVisible] = useState(false);
  const [muteRoom, setMuteRoom] = useState<MessengerRoom | null>(null);
  const [muteSaving, setMuteSaving] = useState(false);
  const [preparation, setPreparation] = useState<MessengerPreparationState>({
    mode: "checking",
    progress: 0,
    message: "Проверяем локальные данные…",
  });
  const [preparationAttempt, setPreparationAttempt] = useState(0);
  const [typingByRoom, setTypingByRoom] = useState<
    Record<string, Record<string, string>>
  >({});
  const typingDots = useTypingDots(
    Object.values(typingByRoom).some(
      (roomTyping) => Object.keys(roomTyping).length > 0,
    ),
  );
  const typingTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const connectionSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const loadRoomsRunning = useRef(false);
  const hasLoadedOnce = useRef(false);
  const hasVisibleRooms = useRef(false);
  const lastRoomsSyncFinishedAt = useRef(0);

  const applyRooms = useCallback((
    nextRooms: MessengerRoom[],
    source: "cache" | "authoritative" = "authoritative",
  ) => {
    hasVisibleRooms.current = nextRooms.length > 0;
    setRooms(nextRooms);
    setMessengerMutedRooms(nextRooms);
    void syncMessengerUnreadFromRooms(nextRooms, source);
  }, []);

  const orderedRooms = useMemo(
    () =>
      [...rooms].sort((left, right) => {
        const leftPersonal =
          left.room_type === "direct" || left.room_type === "private_group";
        const rightPersonal =
          right.room_type === "direct" || right.room_type === "private_group";
        if (leftPersonal !== rightPersonal) return leftPersonal ? 1 : -1;
        if (!leftPersonal && left.sort_order !== right.sort_order) {
          return left.sort_order - right.sort_order;
        }
        if (leftPersonal) {
          const leftTime = left.last_message?.created_at || "";
          const rightTime = right.last_message?.created_at || "";
          if (leftTime !== rightTime) return rightTime.localeCompare(leftTime);
        }
        return left.title.localeCompare(right.title, "ru");
      }),
    [rooms],
  );

  const loadRooms = useCallback(
    async (showRefresh = false, includeCache = true, fetchRemote = true) => {
      if (!isAuthenticated || loadRoomsRunning.current) return;
      loadRoomsRunning.current = true;
      if (showRefresh) setRefreshing(true);
      setError(null);
      const startedAt = Date.now();
      let cachedRoomCount = 0;
      messengerLog("debug", "rooms.sync.started", {
        include_cache: includeCache,
        manual_refresh: showRefresh,
        fetch_remote: fetchRemote,
      });
      try {
        if (includeCache) {
          const cached = await loadCachedMessengerRooms(db);
          cachedRoomCount = cached.length;
          if (cached.length) {
            applyRooms(cached, "cache");
            setLoading(false);
          }
        }
        if (!fetchRemote) {
          messengerLog("debug", "rooms.cache.completed", {
            room_count: cachedRoomCount,
            duration_ms: Date.now() - startedAt,
          });
          return;
        }
        const remote = await getMessengerRooms();
        const reconciled = await cacheMessengerRooms(db, remote);
        applyRooms(reconciled);
        setOffline(false);
        console.log(`[Messenger] Загружено комнат: ${remote.length}`);
        messengerLog("info", "rooms.sync.completed", {
          room_count: remote.length,
          duration_ms: Date.now() - startedAt,
        });
      } catch (loadError) {
        if (fetchRemote) hasLoadedOnce.current = false;
        if (isSQLiteBusyError(loadError)) {
          setOffline(false);
          setError(null);
          messengerLog("debug", "rooms.sync.database_busy_retry", {
            duration_ms: Date.now() - startedAt,
          });
          if (!connectionSyncTimer.current) {
            connectionSyncTimer.current = setTimeout(() => {
              connectionSyncTimer.current = null;
              void loadRooms(false, false, true);
            }, 1_000);
          }
          return;
        }
        setOffline(isMessengerConnectionError(loadError));
        setError(messengerErrorMessage(loadError, "Не удалось обновить чаты"));
        messengerLog("warn", "rooms.sync.failed", {
          category: isMessengerConnectionError(loadError)
            ? "connection"
            : "server",
          message: messengerErrorMessage(loadError),
          duration_ms: Date.now() - startedAt,
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
        loadRoomsRunning.current = false;
        if (fetchRemote) lastRoomsSyncFinishedAt.current = Date.now();
      }
    },
    [applyRooms, db, isAuthenticated],
  );

  const scheduleConnectionSync = useCallback(
    (minimumInterval = 10_000) => {
      if (connectionSyncTimer.current) return;
      const run = (): void => {
        const elapsed = Date.now() - lastRoomsSyncFinishedAt.current;
        const remaining = minimumInterval - elapsed;
        if (lastRoomsSyncFinishedAt.current > 0 && remaining > 0) {
          connectionSyncTimer.current = setTimeout(run, remaining);
          return;
        }
        connectionSyncTimer.current = null;
        void loadRooms(false, false);
      };
      connectionSyncTimer.current = setTimeout(run, 250);
    },
    [loadRooms],
  );

  useFocusEffect(
    useCallback(() => {
      if (status === "password_change_required") {
        router.replace("/messenger/change-password");
        return;
      }
      if (status === "unauthenticated") {
        router.replace("/messenger/register");
        return;
      }
      if (status !== "authenticated") return;
      let active = true;
      let refreshTimer: ReturnType<typeof setTimeout> | null = null;
      let interactionTask: ReturnType<
        typeof InteractionManager.runAfterInteractions
      > | null = null;
      const fetchRemote = !hasLoadedOnce.current;
      hasLoadedOnce.current = true;
      const prepareRooms = async () => {
        const userId = session?.user.id;
        if (!userId) return;

        // Stack screens stay mounted during a room visit. Replacing every row
        // from SQLite here makes avatars briefly fall back during the iOS back
        // gesture. Merge only a newer local read cursor and its unread count;
        // every other rendered room object remains stable.
        if (hasVisibleRooms.current) {
          try {
            const cached = await loadCachedMessengerRooms(db);
            if (!active) return;
            setRooms((current) =>
              mergeMessengerRoomReadState(current, cached),
            );
          } catch (cacheError) {
            messengerLog("debug", "rooms.read_state.refresh_deferred", {
              message: messengerErrorMessage(cacheError),
            });
          }
          if (!active) return;
          setLoading(false);
          setPreparation({ mode: "ready", progress: 100, message: "Готово" });
          return;
        }

        setPreparation({
          mode: "checking",
          progress: 5,
          message:
            preparationAttempt > 0
              ? "Повторно проверяем локальные данные…"
              : "Проверяем локальные данные…",
        });
        let cached: MessengerRoom[] = [];
        let preparedBefore = false;
        try {
          const [localRooms, marker] = await Promise.all([
            loadCachedMessengerRooms(db),
            AsyncStorage.getItem(messengerBootstrapKey(userId)),
          ]);
          cached = localRooms;
          preparedBefore = marker === "ready";
        } catch (cacheError) {
          messengerLog("warn", "rooms.bootstrap.cache_failed", {
            message: messengerErrorMessage(cacheError),
          });
        }
        if (!active) return;

        // Existing installations already have a usable cache. Backfill the
        // marker silently so the one-time preparation screen is reserved for
        // a genuinely empty installation/new messenger profile.
        if (cached.length > 0 || preparedBefore) {
          applyRooms(cached, "cache");
          setLoading(false);
          setPreparation({ mode: "ready", progress: 100, message: "Готово" });
          if (cached.length > 0 && !preparedBefore) {
            void AsyncStorage.setItem(messengerBootstrapKey(userId), "ready");
          }
          if (fetchRemote) {
            interactionTask = InteractionManager.runAfterInteractions(() => {
              refreshTimer = setTimeout(() => {
                refreshTimer = null;
                if (active) void loadRooms(false, false, true);
              }, FOREGROUND_REFRESH_DELAY_MS);
            });
          }
          return;
        }

        setPreparation({
          mode: "preparing",
          progress: 20,
          message: "Подключаемся к серверу…",
        });
        try {
          const remote = await getMessengerRooms();
          if (!active) return;
          setPreparation({
            mode: "preparing",
            progress: 68,
            message: "Сохраняем список чатов…",
          });
          const reconciled = await cacheMessengerRooms(db, remote);
          if (!active) return;
          applyRooms(reconciled);
          setPreparation({
            mode: "preparing",
            progress: 92,
            message: "Завершаем подготовку…",
          });
          await AsyncStorage.setItem(messengerBootstrapKey(userId), "ready");
          if (!active) return;
          setOffline(false);
          setError(null);
          setLoading(false);
          setPreparation({ mode: "ready", progress: 100, message: "Готово" });
          lastRoomsSyncFinishedAt.current = Date.now();
          messengerLog("info", "rooms.bootstrap.completed", {
            room_count: reconciled.length,
          });
        } catch (bootstrapError) {
          if (!active) return;
          hasLoadedOnce.current = false;
          if (isSQLiteBusyError(bootstrapError)) {
            setOffline(false);
            setError(null);
            setLoading(true);
            setPreparation({
              mode: "preparing",
              progress: 88,
              message: "Завершаем подготовку локальных данных…",
            });
            messengerLog("debug", "rooms.bootstrap.database_busy_retry", {});
            refreshTimer = setTimeout(() => {
              refreshTimer = null;
              if (active) setPreparationAttempt((current) => current + 1);
            }, 1_000);
            return;
          }
          setOffline(isMessengerConnectionError(bootstrapError));
          setLoading(false);
          setPreparation({
            mode: "error",
            progress: 20,
            message: messengerErrorMessage(
              bootstrapError,
              "Не удалось подготовить мессенджер. Проверьте подключение и повторите попытку",
            ),
          });
          messengerLog("warn", "rooms.bootstrap.failed", {
            message: messengerErrorMessage(bootstrapError),
          });
        }
      };
      void prepareRooms();
      const unsubscribe = subscribeMessengerRealtime((event) => {
        if (event.type === "message.created") {
          const message = event.message;
          const typingKey = `${message.room_id}:${message.author.id}`;
          const typingTimer = typingTimers.current.get(typingKey);
          if (typingTimer) clearTimeout(typingTimer);
          typingTimers.current.delete(typingKey);
          setTypingByRoom((current) => {
            const roomTyping = current[message.room_id];
            if (!roomTyping?.[message.author.id]) return current;
            const nextRoomTyping = { ...roomTyping };
            delete nextRoomTyping[message.author.id];
            const next = { ...current };
            if (Object.keys(nextRoomTyping).length)
              next[message.room_id] = nextRoomTyping;
            else delete next[message.room_id];
            return next;
          });
          // Update the visible card immediately; REST below remains the source
          // of truth and corrects unread counters after reconnect/duplicates.
          setRooms((current) => {
            const next = current.map((room) => {
              if (
                room.id !== message.room_id ||
                !sequenceIsNewer(
                  message.sequence,
                  room.last_message?.sequence || "0",
                )
              )
                return room;
              const alreadyShown = room.last_message?.id === message.id;
              const unread =
                message.author.id !== session?.user.id &&
                sequenceIsNewer(message.sequence, room.last_read_sequence) &&
                !alreadyShown;
              return {
                ...room,
                unread_count: room.unread_count + (unread ? 1 : 0),
                last_message: {
                  id: message.id,
                  sequence: message.sequence,
                  kind: message.kind,
                  text: message.text,
                  created_at: message.created_at,
                  media: message.media,
                  media_items: message.media_items,
                  location: message.location,
                  author: {
                    id: message.author.id,
                    display_name: message.author.display_name,
                    avatar_url: message.author.avatar_url,
                  },
                },
              };
            });
            void syncMessengerUnreadFromRooms(next, "realtime");
            return next;
          });
        } else if (event.type === "message.updated") {
          const message = event.message;
          setRooms((current) =>
            current.map((room) =>
              room.id === message.room_id &&
              room.last_message?.id === message.id
                ? {
                    ...room,
                    last_message: {
                      ...room.last_message,
                      kind: message.kind,
                      text: message.deleted_at
                        ? "Сообщение удалено"
                        : message.text,
                      media: message.deleted_at ? null : message.media,
                      media_items: message.deleted_at
                        ? []
                        : message.media_items,
                      location: message.deleted_at ? null : message.location,
                    },
                  }
                : room,
            ),
          );
        } else if (event.type === "typing.updated") {
          const key = `${event.room_id}:${event.user_id}`;
          const previous = typingTimers.current.get(key);
          if (previous) clearTimeout(previous);
          const removeTyping = () => {
            typingTimers.current.delete(key);
            setTypingByRoom((current) => {
              const roomTyping = current[event.room_id];
              if (!roomTyping?.[event.user_id]) return current;
              const nextRoomTyping = { ...roomTyping };
              delete nextRoomTyping[event.user_id];
              const next = { ...current };
              if (Object.keys(nextRoomTyping).length)
                next[event.room_id] = nextRoomTyping;
              else delete next[event.room_id];
              return next;
            });
          };
          if (event.typing) {
            setTypingByRoom((current) => ({
              ...current,
              [event.room_id]: {
                ...current[event.room_id],
                [event.user_id]: event.display_name,
              },
            }));
            typingTimers.current.set(key, setTimeout(removeTyping, 6_000));
          } else {
            removeTyping();
          }
        } else if (event.type === "room.updated") {
          scheduleConnectionSync(0);
        } else if (
          event.type === "sync.required" ||
          event.type === "connection.ready"
        ) {
          scheduleConnectionSync();
        }
      });
      return () => {
        active = false;
        interactionTask?.cancel();
        if (refreshTimer) clearTimeout(refreshTimer);
        unsubscribe();
        typingTimers.current.forEach(clearTimeout);
        typingTimers.current.clear();
        setTypingByRoom({});
        if (connectionSyncTimer.current) {
          clearTimeout(connectionSyncTimer.current);
          connectionSyncTimer.current = null;
        }
      };
    }, [
      applyRooms,
      db,
      loadRooms,
      preparationAttempt,
      router,
      scheduleConnectionSync,
      session?.user.id,
      status,
    ]),
  );

  const openRoom = (room: MessengerRoom) => {
    const openedAt = Date.now();
    messengerLog("info", "room.open.requested", {
      room_id: room.id,
      cached_latest_sequence: room.last_message?.sequence || null,
      unread_count: room.unread_count,
    });
    trackMessengerAction("chat_opened", {
      room_type: room.room_type,
      preset: isPresetRoom(room),
      has_unread: room.unread_count > 0,
      source: "room_list",
    });
    router.push({
      pathname: "/messenger/room/[id]",
      params: {
        id: room.id,
        title: room.title,
        canWrite: String(room.can_write),
        canMedia: String(room.can_send_media),
        canReact: String(room.can_react),
        canManage: String(room.can_manage),
        roomType: room.room_type,
        teamId: room.team_id,
        avatarUrl: room.avatar_url || "",
        lastReadSequence: room.last_read_sequence,
        latestSequence: room.last_message?.sequence || "",
        unreadCount: String(room.unread_count),
        memberCount:
          typeof room.member_count === "number"
            ? String(room.member_count)
            : "",
        peerId: room.peer?.id || "",
        peerLastSeenAt: room.peer?.last_seen_at || "",
        peerNotificationsMuted: String(Boolean(room.peer?.notifications_muted)),
        openedAt: String(openedAt),
      },
    });
  };

  const changeRoomMute = async (duration: MessengerRoomMuteDuration) => {
    if (!muteRoom || muteSaving) return;
    setMuteSaving(true);
    try {
      const result = await updateMessengerRoomNotifications(muteRoom.id, duration);
      const nextRooms = rooms.map((room) =>
        room.id === muteRoom.id
          ? {
              ...room,
              notifications_muted: result.notifications_muted,
              muted_until: result.muted_until,
            }
          : room,
      );
      setRooms(nextRooms);
      setMessengerMutedRooms(nextRooms);
      if (nextRooms.length) void cacheMessengerRooms(db, nextRooms);
      trackMessengerAction("notifications_changed", {
        operation: duration === "unmute" ? "enabled" : "muted",
        mute_duration: duration,
        room_type: muteRoom.room_type,
      });
      setMuteRoom(null);
    } catch (muteError) {
      setError(messengerErrorMessage(muteError, "Не удалось изменить уведомления"));
    } finally {
      setMuteSaving(false);
    }
  };

  if (status === "authenticated" && preparation.mode !== "ready") {
    return (
      <MessengerPreparationScreen
        progress={preparation.progress}
        message={preparation.message}
        error={preparation.mode === "error"}
        onRetry={() => {
          setLoading(true);
          setPreparationAttempt((current) => current + 1);
        }}
      />
    );
  }

  if (loading || status === "loading") {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => router.dismissTo("/")}
          accessibilityRole="button"
          accessibilityLabel="Вернуться на главный экран"
        >
          <Icon name="chevron-back" size={28} color={colors.primary} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title}>Общение</Text>
          <Text style={styles.subtitle}>
            {offline
              ? "Сохранённые данные"
              : session?.user.display_name || "Командные чаты"}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => router.push("/messenger/search")}
          accessibilityLabel="Поиск сообщений"
        >
          <Icon name="search-outline" size={25} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => setNewChatVisible(true)}
          accessibilityLabel="Новое сообщение или группа"
        >
          <Icon name="create-outline" size={25} color={colors.primary} />
        </TouchableOpacity>
        {session && (
          <TouchableOpacity
            style={styles.profileButton}
            onPress={() => router.push("/messenger/profile")}
            accessibilityLabel="Открыть мой профиль"
          >
            <AuthenticatedAvatar
              displayName={session.user.display_name}
              avatarUrl={session.user.avatar_url}
              accessToken={session.access_token}
              identityKey={session.user.id}
              roles={session.user.roles.map((role) => role.code)}
              size={48}
            />
          </TouchableOpacity>
        )}
      </View>

      {error && (
        <TouchableOpacity
          style={styles.warning}
          onPress={() => void loadRooms(true)}
        >
          <Icon
            name={offline ? "cloud-offline-outline" : "alert-circle-outline"}
            size={21}
            color={colors.warning}
          />
          <Text style={styles.warningText}>
            {error}. Нажмите, чтобы повторить.
          </Text>
        </TouchableOpacity>
      )}

      <FlatList
        data={orderedRooms}
        keyExtractor={(room) => room.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadRooms(true, false, true)}
          />
        }
        contentContainerStyle={
          orderedRooms.length ? styles.list : styles.emptyList
        }
        renderItem={({ item, index }) => {
          const direct = item.room_type === "direct" || item.kind === "direct";
          const saved = item.room_type === "saved";
          const preset = isPresetRoom(item);
          const hasNextRoom = index < orderedRooms.length - 1;
          const nextRoom = orderedRooms[index + 1];
          const separatesPresetRooms =
            preset && nextRoom !== undefined && !isPresetRoom(nextRoom);
          const authorName = item.last_message
            ? item.last_message.author.id === session?.user.id
              ? "Вы"
              : item.last_message.author.display_name
            : "";
          const activityTime = formatRoomActivityTime(
            item.last_message?.created_at,
          );
          const typingNames = Object.values(typingByRoom[item.id] || {});
          const activeTypingLabel = typingLabel(
            typingNames,
            !direct && !saved && (item.member_count ?? 0) >= 3,
            typingDots,
          );
          return (
            <>
              <TouchableOpacity
                style={[styles.roomRow, preset && styles.presetRoomRow]}
                onPress={() => openRoom(item)}
                onLongPress={() => setMuteRoom(item)}
                delayLongPress={350}
                activeOpacity={0.68}
                accessibilityRole="button"
                accessibilityLabel={`${item.title}${
                  item.unread_count > 0
                    ? `, непрочитанных сообщений: ${item.unread_count}`
                    : ""
                }`}
              >
                {saved ? (
                  <SavedMessagesAvatar size={62} userId={session?.user.id} />
                ) : direct && item.peer ? (
                  <AuthenticatedAvatar
                    displayName={item.peer.display_name}
                    avatarUrl={item.peer.avatar_url}
                    accessToken={session?.access_token}
                    identityKey={item.peer.id}
                    size={62}
                  />
                ) : (
                  <LocalRoomAvatar
                    roomId={item.id}
                    userId={session?.user.id}
                    displayName={item.title}
                    avatarUrl={item.avatar_url}
                    accessToken={session?.access_token}
                    size={62}
                  />
                )}
                <View style={styles.roomContent}>
                  <View style={styles.roomTitleRow}>
                    <Text style={styles.roomTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                    {preset && (
                      <Image
                        source={require("../../assets/messenger/chat-pin.png")}
                        style={styles.presetPin}
                        resizeMode="contain"
                        accessibilityIgnoresInvertColors
                      />
                    )}
                  </View>
                  {!activeTypingLabel && !direct && item.last_message && (
                    <Text style={styles.messageAuthor} numberOfLines={1}>
                      {authorName}
                    </Text>
                  )}
                  <Text
                    style={[
                      styles.preview,
                      activeTypingLabel && styles.typingPreview,
                    ]}
                    numberOfLines={1}
                  >
                    {activeTypingLabel || lastMessageText(item)}
                  </Text>
                </View>
                <View style={styles.roomMeta}>
                  <Text style={styles.activityTime}>{activityTime}</Text>
                  <View style={styles.roomIndicators}>
                    {item.notifications_muted && (
                      <Icon
                        name="notifications-off"
                        size={18}
                        color="#9AA6AF"
                      />
                    )}
                    {item.unread_count > 0 && (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadText}>
                          {item.unread_count > 999 ? "999+" : item.unread_count}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
              {hasNextRoom && (
                <View
                  style={[
                    styles.roomSeparatorContainer,
                    preset && styles.presetRoomSeparatorContainer,
                  ]}
                >
                  <View
                    style={[
                      styles.roomSeparator,
                      separatesPresetRooms && styles.presetBoundarySeparator,
                    ]}
                  />
                </View>
              )}
            </>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Icon
              name="chatbubbles-outline"
              size={60}
              color={colors.textSecondary}
            />
            <Text style={styles.emptyTitle}>Нет доступных чатов</Text>
            <Text style={styles.emptyText}>
              Администратор ещё не назначил вам группу доступа.
            </Text>
          </View>
        }
      />

      <Modal
        visible={newChatVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setNewChatVisible(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setNewChatVisible(false)}
        >
          <Pressable
            style={styles.newChatSheet}
            onPress={(event) => event.stopPropagation()}
          >
            <Text style={styles.newChatTitle}>Начать общение</Text>
            <TouchableOpacity
              style={styles.newChatAction}
              onPress={() => {
                setNewChatVisible(false);
                router.push("/messenger/contacts");
              }}
            >
              <View style={styles.newChatIcon}>
                <Icon
                  name="person-add-outline"
                  size={23}
                  color={colors.primary}
                />
              </View>
              <View style={styles.newChatText}>
                <Text style={styles.newChatActionTitle}>Личное сообщение</Text>
                <Text style={styles.newChatActionSubtitle}>
                  Выбрать доступный контакт
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.newChatAction}
              onPress={() => {
                setNewChatVisible(false);
                router.push("/messenger/group/create");
              }}
            >
              <View style={styles.newChatIcon}>
                <Icon name="people-outline" size={24} color={colors.primary} />
              </View>
              <View style={styles.newChatText}>
                <Text style={styles.newChatActionTitle}>Новая мини-группа</Text>
                <Text style={styles.newChatActionSubtitle}>
                  От трёх участников вместе с вами
                </Text>
              </View>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={Boolean(muteRoom)}
        transparent
        animationType="fade"
        onRequestClose={() => !muteSaving && setMuteRoom(null)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => !muteSaving && setMuteRoom(null)}
        >
          <Pressable style={styles.muteSheet} onPress={(event) => event.stopPropagation()}>
            <View style={styles.muteTitleRow}>
              <Icon name="notifications-off-outline" size={23} color={colors.primary} />
              <Text style={styles.newChatTitle} numberOfLines={1}>
                {muteRoom?.title}
              </Text>
            </View>
            {muteRoom?.notifications_muted && (
              <TouchableOpacity
                style={styles.muteAction}
                disabled={muteSaving}
                onPress={() => void changeRoomMute("unmute")}
              >
                <Text style={styles.muteActionText}>Включить уведомления</Text>
              </TouchableOpacity>
            )}
            {(
              [
                ["1h", "Отключить на 1 час"],
                ["12h", "Отключить на 12 часов"],
                ["1d", "Отключить на 1 день"],
                ["1mo", "Отключить на 1 месяц"],
                ["forever", "Отключить навсегда"],
              ] as const
            ).map(([duration, label]) => (
              <TouchableOpacity
                key={duration}
                style={styles.muteAction}
                disabled={muteSaving}
                onPress={() => void changeRoomMute(duration)}
              >
                <Text style={styles.muteActionText}>{label}</Text>
              </TouchableOpacity>
            ))}
            {muteSaving && <ActivityIndicator style={styles.muteProgress} color={colors.primary} />}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  preparationSafeArea: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 28,
    backgroundColor: colors.background,
  },
  preparationCard: { alignItems: "center" },
  preparationLogo: { width: 132, height: 132, marginBottom: 26 },
  preparationTitle: {
    color: colors.text,
    fontSize: 23,
    fontWeight: "800",
    textAlign: "center",
  },
  preparationMessage: {
    minHeight: 44,
    marginTop: 12,
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 21,
    textAlign: "center",
  },
  preparationPercent: {
    marginTop: 18,
    color: colors.primary,
    fontSize: 30,
    fontWeight: "800",
  },
  preparationTrack: {
    width: "100%",
    height: 10,
    marginTop: 12,
    overflow: "hidden",
    borderRadius: 5,
    backgroundColor: colors.border,
  },
  preparationProgress: {
    height: "100%",
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  preparationProgressError: { backgroundColor: colors.error },
  preparationRetry: {
    minWidth: 150,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 22,
    paddingHorizontal: 22,
    borderRadius: 14,
    backgroundColor: colors.primary,
  },
  preparationRetryText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: "800",
  },
  preparationHint: {
    marginTop: 22,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  profileButton: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1, marginHorizontal: 8 },
  title: { fontSize: 26, fontWeight: "800", color: colors.text },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 1 },
  warning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    margin: 14,
    marginBottom: 0,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#FFF4E5",
  },
  warningText: { flex: 1, color: colors.text, fontSize: 13 },
  list: { paddingBottom: 32 },
  emptyList: { flexGrow: 1, justifyContent: "center" },
  roomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 78,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: colors.surface,
  },
  presetRoomRow: { backgroundColor: colors.backgroundAlt },
  roomSeparatorContainer: {
    height: 1,
    backgroundColor: colors.surface,
  },
  presetRoomSeparatorContainer: { backgroundColor: colors.backgroundAlt },
  roomSeparator: {
    flex: 1,
    marginLeft: 88,
    marginRight: 14,
    backgroundColor: "#D5DEE5",
  },
  presetBoundarySeparator: { marginLeft: 0, marginRight: 0 },
  roomContent: {
    flex: 1,
    minWidth: 0,
    alignSelf: "stretch",
    justifyContent: "center",
  },
  roomTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
  },
  roomTitle: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
  },
  presetPin: {
    width: 16,
    height: 16,
    marginLeft: 6,
    tintColor: "#96A4AF",
  },
  messageAuthor: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: "700",
    color: colors.primary,
  },
  preview: { marginTop: 3, fontSize: 13, color: colors.textSecondary },
  typingPreview: { color: colors.primary, fontStyle: "italic" },
  roomMeta: {
    minWidth: 48,
    alignSelf: "stretch",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingVertical: 1,
  },
  activityTime: {
    minHeight: 18,
    fontSize: 12,
    color: colors.textSecondary,
  },
  roomIndicators: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 7,
    minHeight: 26,
  },
  unreadBadge: {
    minWidth: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 7,
    borderRadius: 12,
    backgroundColor: colors.accent,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    padding: 14,
    backgroundColor: "rgba(16, 40, 68, 0.38)",
  },
  newChatSheet: {
    padding: 18,
    paddingBottom: 12,
    borderRadius: 22,
    backgroundColor: colors.surface,
  },
  muteSheet: {
    padding: 18,
    borderRadius: 22,
    backgroundColor: colors.surface,
  },
  muteTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  muteAction: {
    minHeight: 48,
    justifyContent: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  muteActionText: { color: colors.text, fontSize: 15, fontWeight: "600" },
  muteProgress: { marginTop: 12 },
  newChatTitle: {
    marginBottom: 8,
    color: colors.text,
    fontSize: 19,
    fontWeight: "800",
  },
  newChatAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 68,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  newChatIcon: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: "#EAF3FF",
  },
  newChatText: { flex: 1 },
  newChatActionTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  newChatActionSubtitle: {
    marginTop: 3,
    color: colors.textSecondary,
    fontSize: 12,
  },
  unreadText: { color: colors.white, fontSize: 12, fontWeight: "800" },
  empty: { alignItems: "center", padding: 36 },
  emptyTitle: {
    marginTop: 16,
    fontSize: 20,
    fontWeight: "800",
    color: colors.text,
  },
  emptyText: {
    marginTop: 8,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
});
