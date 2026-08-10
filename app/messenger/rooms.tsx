import { useFocusEffect, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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
import { colors } from "../../styles/commonStyles";

function lastMessageText(room: MessengerRoom): string {
  if (!room.last_message) return "Сообщений пока нет";
  if (room.last_message.kind === "image") return "Фото";
  if (room.last_message.kind === "video") return "Видео";
  return room.last_message.text;
}

function sequenceIsNewer(candidate: string, current: string): boolean {
  const left = candidate.replace(/^0+/, "") || "0";
  const right = current.replace(/^0+/, "") || "0";
  return left.length !== right.length
    ? left.length > right.length
    : left.localeCompare(right) > 0;
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
  const realtimeSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadRooms = useCallback(
    async (showRefresh = false, includeCache = true) => {
      if (!isAuthenticated) return;
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
            setLoading(false);
          }
        }
        const remote = await getMessengerRooms();
        setRooms(remote);
        await cacheMessengerRooms(db, remote);
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
      }
    },
    [db, isAuthenticated],
  );

  const scheduleRealtimeSync = useCallback(
    (delay = 150) => {
      if (realtimeSyncTimer.current) clearTimeout(realtimeSyncTimer.current);
      realtimeSyncTimer.current = setTimeout(() => {
        realtimeSyncTimer.current = null;
        void loadRooms(false, false);
      }, delay);
    },
    [loadRooms],
  );

  useFocusEffect(
    useCallback(() => {
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
          setRooms((current) =>
            current.map((room) => {
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
                  media: message.media
                    ? {
                        id: message.media.id,
                        type: message.media.type,
                        url: message.media.url,
                      }
                    : null,
                  author: {
                    id: message.author.id,
                    display_name: message.author.display_name,
                    avatar_url: message.author.avatar_url,
                  },
                },
              };
            }),
          );
          scheduleRealtimeSync();
        } else if (
          event.type === "sync.required" ||
          event.type === "connection.ready"
        ) {
          scheduleRealtimeSync(0);
        }
      });
      return () => {
        unsubscribe();
        if (realtimeSyncTimer.current) {
          clearTimeout(realtimeSyncTimer.current);
          realtimeSyncTimer.current = null;
        }
      };
    }, [loadRooms, router, scheduleRealtimeSync, session?.user.id, status]),
  );

  const openRoom = (room: MessengerRoom) => {
    router.push({
      pathname: "/messenger/room/[id]",
      params: {
        id: room.id,
        title: room.title,
        canWrite: String(room.can_write),
        canReact: String(room.can_react),
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
          onPress={() => router.replace("/")}
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
        data={rooms}
        keyExtractor={(room) => room.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadRooms(true, false)}
          />
        }
        contentContainerStyle={rooms.length ? styles.list : styles.emptyList}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.roomCard}
            onPress={() => openRoom(item)}
          >
            <View style={styles.roomIcon}>
              <Icon name="chatbubbles" size={25} color={colors.primary} />
            </View>
            <View style={styles.roomContent}>
              <View style={styles.roomTitleRow}>
                <Text style={styles.roomTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                {item.unread_count > 0 && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadText}>{item.unread_count}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.teamName}>{item.team_name}</Text>
              <Text style={styles.preview} numberOfLines={1}>
                {item.last_message
                  ? `${item.last_message.author.display_name}: `
                  : ""}
                {lastMessageText(item)}
              </Text>
            </View>
            <Icon
              name="chevron-forward"
              size={20}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        )}
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
  list: { padding: 14, paddingBottom: 32 },
  emptyList: { flexGrow: 1, justifyContent: "center" },
  roomCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 92,
    marginBottom: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  roomIcon: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: "#EAF3FF",
  },
  roomContent: { flex: 1, minWidth: 0 },
  roomTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  roomTitle: { flex: 1, fontSize: 16, fontWeight: "800", color: colors.text },
  teamName: { marginTop: 2, fontSize: 12, color: colors.textSecondary },
  preview: { marginTop: 6, fontSize: 13, color: colors.textSecondary },
  unreadBadge: {
    minWidth: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 7,
    borderRadius: 12,
    backgroundColor: colors.accent,
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
