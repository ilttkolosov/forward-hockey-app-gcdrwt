import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
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
import type { MessengerContact } from "../../features/messenger/types";
import {
  createMessengerDirectRoom,
  getMessengerContacts,
  messengerErrorMessage,
} from "../../services/messengerApi";
import { colors } from "../../styles/commonStyles";

const ROLE_LABELS: Record<string, string> = {
  player: "Игрок",
  captain: "Капитан",
  assistant: "Ассистент",
  coaching_staff: "Тренерский штаб",
  parent: "Родитель",
  parent_committee: "Родительский комитет",
};

function contactKey(contact: MessengerContact): string {
  return `${contact.team_id}:${contact.id}`;
}

export default function MessengerContactsScreen() {
  const router = useRouter();
  const { session, isAuthenticated } = useMessengerAuth();
  const [contacts, setContacts] = useState<MessengerContact[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (refresh = false) => {
      if (!isAuthenticated) return;
      if (refresh) setRefreshing(true);
      setError(null);
      try {
        setContacts(await getMessengerContacts());
      } catch (loadError) {
        setError(
          messengerErrorMessage(loadError, "Не удалось загрузить контакты"),
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [isAuthenticated],
  );

  useFocusEffect(
    useCallback(() => {
      if (!isAuthenticated) {
        router.replace("/messenger/register");
        return;
      }
      void load();
    }, [isAuthenticated, load, router]),
  );

  const visibleContacts = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ru-RU");
    if (!needle) return contacts;
    return contacts.filter((contact) =>
      `${contact.display_name} ${contact.username} ${contact.team_name}`
        .toLocaleLowerCase("ru-RU")
        .includes(needle),
    );
  }, [contacts, query]);

  const openContact = async (contact: MessengerContact) => {
    const key = contactKey(contact);
    if (opening) return;
    setOpening(key);
    setError(null);
    try {
      const result = await createMessengerDirectRoom(
        contact.team_id,
        contact.id,
      );
      router.replace({
        pathname: "/messenger/room/[id]",
        params: {
          id: result.room.id,
          title: result.room.title,
          canWrite: String(result.room.can_write),
          canMedia: String(result.room.can_send_media),
          canReact: String(result.room.can_react),
          lastReadSequence: result.room.last_read_sequence,
          unreadCount: String(result.room.unread_count),
        },
      });
    } catch (openError) {
      setError(
        messengerErrorMessage(openError, "Не удалось открыть личный чат"),
      );
    } finally {
      setOpening(null);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => router.back()}
        >
          <Icon name="chevron-back" size={28} color={colors.primary} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title}>Новое сообщение</Text>
          <Text style={styles.subtitle}>Доступные контакты команды</Text>
        </View>
      </View>

      <View style={styles.searchShell}>
        <Icon name="search" size={20} color={colors.textSecondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          style={styles.searchInput}
          placeholder="Имя, логин или команда"
          autoCapitalize="none"
          returnKeyType="search"
        />
        {query ? (
          <TouchableOpacity
            onPress={() => setQuery("")}
            accessibilityLabel="Очистить поиск"
          >
            <Icon name="close-circle" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        ) : null}
      </View>

      {error ? (
        <TouchableOpacity
          style={styles.warning}
          onPress={() => void load(true)}
        >
          <Icon name="alert-circle-outline" size={20} color={colors.warning} />
          <Text style={styles.warningText}>
            {error}. Нажмите, чтобы повторить.
          </Text>
        </TouchableOpacity>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={visibleContacts}
          keyExtractor={contactKey}
          contentContainerStyle={
            visibleContacts.length ? styles.list : styles.emptyList
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load(true)}
            />
          }
          renderItem={({ item }) => {
            const busy = opening === contactKey(item);
            return (
              <TouchableOpacity
                style={styles.contact}
                onPress={() => void openContact(item)}
                disabled={Boolean(opening)}
                accessibilityLabel={`Написать ${item.display_name}`}
              >
                <AuthenticatedAvatar
                  displayName={item.display_name}
                  avatarUrl={item.avatar_url}
                  accessToken={session?.access_token}
                  size={50}
                />
                <View style={styles.contactText}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name} numberOfLines={1}>
                      {item.display_name}
                    </Text>
                    {item.family_link ? (
                      <View style={styles.familyBadge}>
                        <Text style={styles.familyBadgeText}>Семья</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.roles} numberOfLines={1}>
                    {item.roles
                      .map((role) => ROLE_LABELS[role] || role)
                      .join(" · ")}
                  </Text>
                  <Text style={styles.team} numberOfLines={1}>
                    {item.team_name}
                  </Text>
                </View>
                {busy ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Icon
                    name={
                      item.direct_room_id ? "chatbubble" : "chatbubble-outline"
                    }
                    size={23}
                    color={colors.primary}
                  />
                )}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Icon
                name="people-outline"
                size={58}
                color={colors.textSecondary}
              />
              <Text style={styles.emptyTitle}>
                {query ? "Ничего не найдено" : "Нет доступных контактов"}
              </Text>
              {!query ? (
                <Text style={styles.emptyText}>
                  Контакты появятся, когда у вас будут общие командные комнаты
                  или семейная связь игрока с родителем.
                </Text>
              ) : null}
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
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1, marginLeft: 8 },
  title: { color: colors.text, fontSize: 21, fontWeight: "800" },
  subtitle: { marginTop: 2, color: colors.textSecondary, fontSize: 12 },
  searchShell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    margin: 14,
    marginBottom: 4,
    minHeight: 46,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 15,
    backgroundColor: colors.surface,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 15 },
  warning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 14,
    marginTop: 10,
    padding: 11,
    borderRadius: 12,
    backgroundColor: "#FFF4E5",
  },
  warningText: { flex: 1, color: colors.text, fontSize: 13 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 14, paddingBottom: 32 },
  emptyList: { flexGrow: 1, justifyContent: "center" },
  contact: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 76,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  contactText: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  name: { flexShrink: 1, color: colors.text, fontSize: 16, fontWeight: "800" },
  roles: { marginTop: 4, color: colors.textSecondary, fontSize: 12 },
  team: {
    marginTop: 2,
    color: colors.primary,
    fontSize: 11,
    fontWeight: "700",
  },
  familyBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 9,
    backgroundColor: "#EAF3FF",
  },
  familyBadgeText: { color: colors.primary, fontSize: 10, fontWeight: "800" },
  empty: { alignItems: "center", padding: 36 },
  emptyTitle: {
    marginTop: 14,
    color: colors.text,
    fontSize: 19,
    fontWeight: "800",
  },
  emptyText: {
    marginTop: 8,
    color: colors.textSecondary,
    lineHeight: 19,
    textAlign: "center",
  },
});
