import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
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
import Icon from "../../../components/Icon";
import { useMessengerAuth } from "../../../contexts/MessengerAuthContext";
import AuthenticatedAvatar from "../../../features/messenger/AuthenticatedAvatar";
import type { MessengerContact } from "../../../features/messenger/types";
import {
  createMessengerPrivateRoom,
  getMessengerContacts,
  messengerErrorMessage,
} from "../../../services/messengerApi";
import { colors } from "../../../styles/commonStyles";

interface TeamOption {
  id: string;
  name: string;
}

export default function CreateMessengerGroupScreen() {
  const router = useRouter();
  const { session, isAuthenticated } = useMessengerAuth();
  const [contacts, setContacts] = useState<MessengerContact[]>([]);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isAuthenticated) return;
    setError(null);
    try {
      const next = await getMessengerContacts();
      setContacts(next);
      setTeamId((current) => current || next[0]?.team_id || null);
    } catch (loadError) {
      setError(
        messengerErrorMessage(loadError, "Не удалось загрузить контакты"),
      );
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useFocusEffect(
    useCallback(() => {
      if (!isAuthenticated) {
        router.replace("/messenger/register");
        return;
      }
      void load();
    }, [isAuthenticated, load, router]),
  );

  const teams = useMemo<TeamOption[]>(() => {
    const values = new Map<string, string>();
    contacts.forEach((contact) =>
      values.set(contact.team_id, contact.team_name),
    );
    return [...values].map(([id, name]) => ({ id, name }));
  }, [contacts]);

  const teamContacts = useMemo(
    () => contacts.filter((contact) => contact.team_id === teamId),
    [contacts, teamId],
  );

  const chooseTeam = (nextTeamId: string) => {
    if (nextTeamId === teamId) return;
    setTeamId(nextTeamId);
    setSelected(new Set());
  };

  const toggleContact = (userId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const create = async () => {
    const name = title.trim();
    if (!teamId || name.length < 2 || selected.size < 2 || creating) return;
    setCreating(true);
    setError(null);
    try {
      const result = await createMessengerPrivateRoom(teamId, name, [
        ...selected,
      ]);
      const room = result.room;
      router.replace({
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
        },
      });
    } catch (createError) {
      setError(messengerErrorMessage(createError, "Не удалось создать группу"));
    } finally {
      setCreating(false);
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
          <Text style={styles.title}>Новая мини-группа</Text>
          <Text style={styles.subtitle}>Вы будете её администратором</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={teamContacts}
          keyExtractor={(contact) => contact.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
          ListHeaderComponent={
            <View>
              <Text style={styles.label}>Название группы</Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder="Например, Подготовка к турниру"
                maxLength={80}
              />
              {teams.length > 1 ? (
                <View style={styles.teamSelector}>
                  {teams.map((team) => (
                    <TouchableOpacity
                      key={team.id}
                      style={[
                        styles.teamChip,
                        team.id === teamId && styles.teamChipSelected,
                      ]}
                      onPress={() => chooseTeam(team.id)}
                    >
                      <Text
                        style={[
                          styles.teamChipText,
                          team.id === teamId && styles.teamChipTextSelected,
                        ]}
                      >
                        {team.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
              <View style={styles.memberHeading}>
                <Text style={styles.label}>Участники</Text>
                <Text style={styles.counter}>
                  В группе: {selected.size + 1}
                </Text>
              </View>
              <Text style={styles.hint}>
                Выберите минимум двух пользователей. В группу также
                автоматически войдёте вы.
              </Text>
              {error ? (
                <TouchableOpacity
                  style={styles.warning}
                  onPress={() => void load()}
                >
                  <Icon
                    name="alert-circle-outline"
                    size={20}
                    color={colors.warning}
                  />
                  <Text style={styles.warningText}>{error}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          }
          renderItem={({ item }) => {
            const checked = selected.has(item.id);
            return (
              <TouchableOpacity
                style={styles.contact}
                onPress={() => toggleContact(item.id)}
              >
                <AuthenticatedAvatar
                  displayName={item.display_name}
                  avatarUrl={item.avatar_url}
                  accessToken={session?.access_token}
                  size={48}
                />
                <View style={styles.contactText}>
                  <Text style={styles.contactName} numberOfLines={1}>
                    {item.display_name}
                  </Text>
                  <Text style={styles.contactMeta} numberOfLines={1}>
                    {item.team_name}
                  </Text>
                </View>
                <Icon
                  name={checked ? "checkmark-circle" : "ellipse-outline"}
                  size={26}
                  color={checked ? colors.primary : colors.textSecondary}
                />
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                Недостаточно доступных контактов для группы.
              </Text>
            </View>
          }
          ListFooterComponent={<View style={styles.footerSpace} />}
        />
      )}

      {!loading ? (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.createButton,
              (title.trim().length < 2 || selected.size < 2 || creating) &&
                styles.disabled,
            ]}
            onPress={() => void create()}
            disabled={title.trim().length < 2 || selected.size < 2 || creating}
          >
            {creating ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.createText}>Создать группу</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : null}
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
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 16, paddingBottom: 4 },
  label: { color: colors.text, fontSize: 14, fontWeight: "800" },
  input: {
    minHeight: 48,
    marginTop: 7,
    marginBottom: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    color: colors.text,
    backgroundColor: colors.surface,
    fontSize: 15,
  },
  teamSelector: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  teamChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.surface,
  },
  teamChipSelected: { borderColor: colors.primary, backgroundColor: "#EAF3FF" },
  teamChipText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  teamChipTextSelected: { color: colors.primary },
  memberHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  counter: { color: colors.primary, fontSize: 12, fontWeight: "800" },
  hint: {
    marginTop: 5,
    marginBottom: 8,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  warning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginVertical: 8,
    padding: 11,
    borderRadius: 12,
    backgroundColor: "#FFF4E5",
  },
  warningText: { flex: 1, color: colors.text, fontSize: 12 },
  contact: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 72,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  contactText: { flex: 1, minWidth: 0 },
  contactName: { color: colors.text, fontSize: 15, fontWeight: "800" },
  contactMeta: { marginTop: 3, color: colors.textSecondary, fontSize: 11 },
  empty: { alignItems: "center", paddingVertical: 34 },
  emptyText: { color: colors.textSecondary, textAlign: "center" },
  footerSpace: { height: 96 },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  createButton: {
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: colors.primary,
  },
  disabled: { opacity: 0.45 },
  createText: { color: colors.white, fontSize: 16, fontWeight: "800" },
});
