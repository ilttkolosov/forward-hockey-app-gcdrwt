import * as Crypto from "expo-crypto";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "../../components/Icon";
import { useMessengerAuth } from "../../contexts/MessengerAuthContext";
import AuthenticatedAvatar from "../../features/messenger/AuthenticatedAvatar";
import type { MessengerContact, MessengerRoom } from "../../features/messenger/types";
import {
  createMessengerDirectRoom,
  forwardMessengerMessage,
  getMessengerContacts,
  getMessengerRooms,
  messengerErrorMessage,
} from "../../services/messengerApi";
import { colors } from "../../styles/commonStyles";

type ForwardTarget =
  | { key: string; kind: "room"; room: MessengerRoom }
  | { key: string; kind: "contact"; contact: MessengerContact };

export default function MessengerForwardScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ messageId?: string }>();
  const { session, isAuthenticated } = useMessengerAuth();
  const [rooms, setRooms] = useState<MessengerRoom[]>([]);
  const [contacts, setContacts] = useState<MessengerContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      const [nextRooms, nextContacts] = await Promise.all([
        getMessengerRooms({ priority: "foreground" }),
        getMessengerContacts(),
      ]);
      setRooms(nextRooms.filter((room) => room.can_write));
      setContacts(nextContacts);
    } catch (loadError) {
      setError(messengerErrorMessage(loadError, "Не удалось загрузить получателей"));
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/messenger/register");
      return;
    }
    void load();
  }, [isAuthenticated, load, router]);

  const targets = useMemo<ForwardTarget[]>(() => {
    const directUserIds = new Set(
      rooms
        .filter((room) => room.room_type === "direct" && room.peer)
        .map((room) => room.peer!.id),
    );
    const all: ForwardTarget[] = [
      ...rooms.map((room) => ({
        key: `room:${room.id}`,
        kind: "room" as const,
        room,
      })),
      ...contacts
        .filter((contact) => !directUserIds.has(contact.id))
        .map((contact) => ({
          key: `contact:${contact.team_id}:${contact.id}`,
          kind: "contact" as const,
          contact,
        })),
    ];
    const normalized = query.trim().toLocaleLowerCase("ru-RU");
    if (!normalized) return all;
    return all.filter((target) => {
      const title =
        target.kind === "room" ? target.room.title : target.contact.display_name;
      const subtitle =
        target.kind === "room"
          ? target.room.team_name
          : target.contact.team_name;
      return `${title} ${subtitle}`.toLocaleLowerCase("ru-RU").includes(normalized);
    });
  }, [contacts, query, rooms]);

  const forward = async (target: ForwardTarget) => {
    const messageId = params.messageId?.trim();
    if (!messageId || busyKey) return;
    setBusyKey(target.key);
    setError(null);
    try {
      const room =
        target.kind === "room"
          ? target.room
          : (
              await createMessengerDirectRoom(
                target.contact.team_id,
                target.contact.id,
              )
            ).room;
      await forwardMessengerMessage(messageId, room.id, Crypto.randomUUID());
      router.back();
    } catch (forwardError) {
      setError(messengerErrorMessage(forwardError, "Не удалось переслать сообщение"));
    } finally {
      setBusyKey(null);
    }
  };

  if (!session) return null;

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={() => router.back()}>
          <Icon name="chevron-back" size={28} color={colors.primary} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title}>Переслать</Text>
          <Text style={styles.subtitle}>Выберите получателя</Text>
        </View>
        <View style={styles.headerButton} />
      </View>

      <View style={styles.searchBox}>
        <Icon name="search-outline" size={20} color={colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Чат или пользователь"
          placeholderTextColor={colors.textSecondary}
        />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <View style={styles.state}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={targets}
          keyExtractor={(item) => item.key}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const room = item.kind === "room" ? item.room : null;
            const contact = item.kind === "contact" ? item.contact : null;
            const title = room?.title || contact?.display_name || "";
            const subtitle = room?.team_name || contact?.team_name || "";
            const avatarUrl =
              room?.room_type === "direct"
                ? room.peer?.avatar_url || room.avatar_url
                : room?.avatar_url || contact?.avatar_url || null;
            const identityKey = room?.peer?.id || room?.id || contact?.id || null;
            return (
              <TouchableOpacity
                style={styles.row}
                onPress={() => void forward(item)}
                disabled={Boolean(busyKey)}
              >
                <AuthenticatedAvatar
                  displayName={title}
                  avatarUrl={avatarUrl}
                  accessToken={session.access_token}
                  identityKey={identityKey}
                  size={48}
                />
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
                  <Text style={styles.rowSubtitle} numberOfLines={1}>{subtitle}</Text>
                </View>
                {busyKey === item.key ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Icon name="arrow-redo" size={21} color={colors.primary} />
                )}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.state}>
              <Text style={styles.empty}>Получатели не найдены</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  header: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerButton: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1, alignItems: "center" },
  title: { color: colors.text, fontSize: 20, fontWeight: "800" },
  subtitle: { marginTop: 2, color: colors.textSecondary, fontSize: 12 },
  searchBox: {
    height: 46,
    margin: 14,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.backgroundAlt,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 15 },
  listContent: { paddingHorizontal: 14, paddingBottom: 20 },
  row: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
  rowSubtitle: { marginTop: 3, color: colors.textSecondary, fontSize: 11 },
  state: { flex: 1, minHeight: 160, alignItems: "center", justifyContent: "center" },
  empty: { color: colors.textSecondary },
  error: { marginHorizontal: 16, marginBottom: 8, color: colors.error, fontSize: 12 },
});
