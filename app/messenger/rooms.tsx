import { useFocusEffect, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "../../components/Icon";
import { useMessengerAuth } from "../../contexts/MessengerAuthContext";
import AuthenticatedAvatar from "../../features/messenger/AuthenticatedAvatar";
import {
  cacheMessengerRooms,
  loadCachedMessengerRooms,
} from "../../features/messenger/repository";
import type { MessengerRoom } from "../../features/messenger/types";
import {
  getMessengerRooms,
  isMessengerConnectionError,
  messengerErrorMessage,
} from "../../services/messengerApi";
import { subscribeMessengerRealtime } from "../../services/messengerRealtime";
import { messengerLog } from "../../services/messengerLogger";
import { syncMessengerUnreadFromRooms } from "../../services/messengerUnread";
import { colors } from "../../styles/commonStyles";

function lastMessageText(room: MessengerRoom): string {
  if (!room.last_message) return "Сообщений пока нет";
  if (room.last_message.kind === "image") return "Фото";
  if (room.last_message.kind === "video") return "Видео";
  if (room.last_message.kind === "file")
    return room.last_message.media?.original_name || "Файл";
  if (room.last_message.kind === "location") return "Геопозиция";
  return room.last_message.text;
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
]);

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

export default function MessengerRoomsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { status, session, isAuthenticated, logout } = useMessengerAuth();
  const [rooms, setRooms] = useState<MessengerRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newChatVisible, setNewChatVisible] = useState(false);
  const connectionSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const loadRoomsRunning = useRef(false);
  const lastRoomsSyncFinishedAt = useRef(0);

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
    async (showRefresh = false, includeCache = true) => {
      if (!isAuthenticated || loadRoomsRunning.current) return;
      loadRoomsRunning.current = true;
      if (showRefresh) setRefreshing(true);
      setError(null);
      const startedAt = Date.now();
      messengerLog("debug", "rooms.sync.started", {
        include_cache: includeCache,
        manual_refresh: showRefresh,
      });
      try {
        if (includeCache) {
          const cached = await loadCachedMessengerRooms(db);
          if (cached.length) {
            setRooms(cached);
            void syncMessengerUnreadFromRooms(cached);
            setLoading(false);
          }
        }
        const remote = await getMessengerRooms();
        const reconciled = await cacheMessengerRooms(db, remote);
        setRooms(reconciled);
        void syncMessengerUnreadFromRooms(reconciled);
        setOffline(false);
        console.log(`[Messenger] Загружено комнат: ${remote.length}`);
        messengerLog("info", "rooms.sync.completed", {
          room_count: remote.length,
          duration_ms: Date.now() - startedAt,
        });
      } catch (loadError) {
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
        lastRoomsSyncFinishedAt.current = Date.now();
      }
    },
    [db, isAuthenticated],
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
      void loadRooms();
      const unsubscribe = subscribeMessengerRealtime((event) => {
        if (event.type === "message.created") {
          const message = event.message;
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
            void syncMessengerUnreadFromRooms(next);
            return next;
          });
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
        unsubscribe();
        if (connectionSyncTimer.current) {
          clearTimeout(connectionSyncTimer.current);
          connectionSyncTimer.current = null;
        }
      };
    }, [loadRooms, router, scheduleConnectionSync, session?.user.id, status]),
  );

  const openRoom = (room: MessengerRoom) => {
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
      },
    });
  };

  const handleLogout = async () => {
    await logout();
    router.replace("/messenger/register");
  };

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
              size={36}
            />
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.iconButton} onPress={handleLogout}>
          <Icon name="log-out-outline" size={25} color={colors.textSecondary} />
        </TouchableOpacity>
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
        ItemSeparatorComponent={() => <View style={styles.roomSeparator} />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadRooms(true, false)}
          />
        }
        contentContainerStyle={
          orderedRooms.length ? styles.list : styles.emptyList
        }
        renderItem={({ item }) => {
          const direct = item.room_type === "direct" || item.kind === "direct";
          const preset =
            item.room_type === "group" && BUILT_IN_ROOM_KINDS.has(item.kind);
          const authorName = item.last_message
            ? item.last_message.author.id === session?.user.id
              ? "Вы"
              : item.last_message.author.display_name
            : "";
          const activityTime = formatRoomActivityTime(
            item.last_message?.created_at,
          );
          return (
            <TouchableOpacity
              style={styles.roomRow}
              onPress={() => openRoom(item)}
              activeOpacity={0.68}
              accessibilityRole="button"
              accessibilityLabel={`${item.title}${
                item.unread_count > 0
                  ? `, непрочитанных сообщений: ${item.unread_count}`
                  : ""
              }`}
            >
              {direct && item.peer ? (
                <AuthenticatedAvatar
                  displayName={item.peer.display_name}
                  avatarUrl={item.peer.avatar_url}
                  accessToken={session?.access_token}
                  size={62}
                />
              ) : (
                <AuthenticatedAvatar
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
                    <Icon
                      name="pin-outline"
                      type="material-community"
                      size={16}
                      color="#96A4AF"
                      style={styles.presetPin}
                    />
                  )}
                </View>
                {!direct && item.last_message && (
                  <Text style={styles.messageAuthor} numberOfLines={1}>
                    {authorName}
                  </Text>
                )}
                <Text style={styles.preview} numberOfLines={1}>
                  {lastMessageText(item)}
                </Text>
              </View>
              <View style={styles.roomMeta}>
                <Text style={styles.activityTime}>{activityTime}</Text>
                <View style={styles.roomIndicators}>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
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
    width: 44,
    height: 44,
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
    minHeight: 88,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.surface,
  },
  roomSeparator: {
    height: 1,
    marginLeft: 88,
    marginRight: 14,
    backgroundColor: "#D5DEE5",
  },
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
  presetPin: { marginLeft: 6 },
  messageAuthor: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: "700",
    color: colors.primary,
  },
  preview: { marginTop: 3, fontSize: 13, color: colors.textSecondary },
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
