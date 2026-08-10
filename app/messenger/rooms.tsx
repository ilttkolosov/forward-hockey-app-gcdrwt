import { useFocusEffect, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import React, { useCallback, useState } from "react";
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
import {
  cacheMessengerRooms,
  loadCachedMessengerRooms,
} from "../../features/messenger/repository";
import type { MessengerRoom } from "../../features/messenger/types";
import { getMessengerRooms } from "../../services/messengerApi";
import { colors } from "../../styles/commonStyles";

function lastMessageText(room: MessengerRoom): string {
  if (!room.last_message) return "Сообщений пока нет";
  if (room.last_message.kind === "image") return "Фото";
  if (room.last_message.kind === "video") return "Видео";
  return room.last_message.text;
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

  const loadRooms = useCallback(
    async (showRefresh = false) => {
      if (!isAuthenticated) return;
      if (showRefresh) setRefreshing(true);
      setError(null);
      try {
        const cached = await loadCachedMessengerRooms(db);
        if (cached.length) {
          setRooms(cached);
          setLoading(false);
        }
        const remote = await getMessengerRooms();
        setRooms(remote);
        await cacheMessengerRooms(db, remote);
        setOffline(false);
        console.log(`[Messenger] Загружено комнат: ${remote.length}`);
      } catch (loadError) {
        setOffline(true);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Не удалось обновить чаты",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [db, isAuthenticated],
  );

  useFocusEffect(
    useCallback(() => {
      if (status === "unauthenticated") {
        router.replace("/messenger/register");
        return;
      }
      if (status === "authenticated") void loadRooms();
    }, [loadRooms, router, status]),
  );

  const openRoom = (room: MessengerRoom) => {
    router.push({
      pathname: "/messenger/room/[id]",
      params: {
        id: room.id,
        title: room.title,
        canWrite: String(room.can_write),
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
        <TouchableOpacity style={styles.iconButton} onPress={handleLogout}>
          <Icon name="log-out-outline" size={25} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {error && (
        <TouchableOpacity
          style={styles.warning}
          onPress={() => void loadRooms(true)}
        >
          <Icon name="cloud-offline-outline" size={21} color={colors.warning} />
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
            onRefresh={() => loadRooms(true)}
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
