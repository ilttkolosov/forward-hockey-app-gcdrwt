import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
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
import MessengerAvatarViewer from "../../../features/messenger/MessengerAvatarViewer";
import type { MessengerContactProfile } from "../../../features/messenger/types";
import {
  getMessengerRoomMemberProfile,
  getMessengerRoomMembers,
  messengerErrorMessage,
  setMessengerRoomMemberAlias,
} from "../../../services/messengerApi";
import { subscribeMessengerRealtime } from "../../../services/messengerRealtime";
import { colors } from "../../../styles/commonStyles";

const ROLE_LABELS: Record<string, string> = {
  player: "Игрок",
  captain: "Капитан",
  assistant: "Ассистент капитана",
  coaching_staff: "Тренерский штаб",
  parent: "Родитель",
  parent_committee: "Родительский комитет",
  administrator: "Администратор",
};

function lastSeenText(value: string | null): string {
  if (!value) return "Не в сети";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Не в сети";
  return `Был(а) в сети ${date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export default function MessengerContactProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; roomId?: string }>();
  const { session, isAuthenticated } = useMessengerAuth();
  const roomId = params.roomId || "";
  const scrollRef = useRef<ScrollView>(null);
  const [profile, setProfile] = useState<MessengerContactProfile | null>(null);
  const [alias, setAlias] = useState("");
  const [online, setOnline] = useState(false);
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [avatarVisible, setAvatarVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isAuthenticated || !roomId) return;
    setError(null);
    try {
      const [nextProfile, members] = await Promise.all([
        getMessengerRoomMemberProfile(roomId, params.id),
        getMessengerRoomMembers(roomId),
      ]);
      if (nextProfile.id !== params.id) {
        throw new Error(
          "Пользователь не является участником этого личного чата",
        );
      }
      const presence = members.find((member) => member.id === nextProfile.id);
      setProfile(nextProfile);
      setAlias(nextProfile.alias || "");
      setOnline(presence?.online ?? false);
      setLastSeenAt(presence?.last_seen_at ?? nextProfile.last_seen_at);
      setSaved(false);
    } catch (loadError) {
      setError(
        messengerErrorMessage(loadError, "Не удалось загрузить профиль"),
      );
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, params.id, roomId]);

  useFocusEffect(
    useCallback(() => {
      if (!isAuthenticated) {
        router.replace("/messenger/register");
        return;
      }
      void load();
      const unsubscribe = subscribeMessengerRealtime((event) => {
        if (event.type !== "presence.updated" || event.user_id !== params.id) {
          return;
        }
        setOnline(event.online);
        if (event.last_seen_at) setLastSeenAt(event.last_seen_at);
      });
      return unsubscribe;
    }, [isAuthenticated, load, params.id, router]),
  );

  useEffect(() => {
    const subscription = Keyboard.addListener("keyboardDidShow", () => {
      requestAnimationFrame(() =>
        scrollRef.current?.scrollToEnd({ animated: true }),
      );
    });
    return () => subscription.remove();
  }, []);

  const normalizedAlias = alias.trim();
  const aliasChanged = normalizedAlias !== (profile?.alias || "");
  const canSave = Boolean(profile && aliasChanged && !saving);
  const roleLabels = useMemo(
    () => (profile?.roles || []).map((role) => ROLE_LABELS[role] || role),
    [profile?.roles],
  );

  const saveAlias = async () => {
    if (!profile || !session || !canSave) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await setMessengerRoomMemberAlias(
        roomId,
        profile.id,
        session.user.id,
        normalizedAlias,
      );
      setProfile(updated);
      setAlias(updated.alias || "");
      setSaved(true);
    } catch (saveError) {
      setError(
        messengerErrorMessage(saveError, "Не удалось сохранить псевдоним"),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => router.back()}
          accessibilityLabel="Вернуться в чат"
        >
          <Icon name="chevron-back" size={28} color={colors.primary} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Профиль пользователя</Text>
          <Text style={styles.headerSubtitle}>Личные настройки контакта</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : profile && session ? (
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={
              Platform.OS === "ios" ? "interactive" : "on-drag"
            }
          >
            <View style={styles.profileCard}>
              <TouchableOpacity
                onPress={() => setAvatarVisible(true)}
                disabled={!profile.avatar_url}
                activeOpacity={0.86}
                accessibilityRole={profile.avatar_url ? "button" : undefined}
                accessibilityLabel={`Фотография ${profile.display_name}`}
                accessibilityHint={
                  profile.avatar_url
                    ? "Открывает фотографию на весь экран"
                    : undefined
                }
              >
                <AuthenticatedAvatar
                  displayName={profile.display_name}
                  avatarUrl={profile.avatar_url}
                  accessToken={session.access_token}
                  size={132}
                />
              </TouchableOpacity>
              <Text style={styles.name}>{profile.display_name}</Text>
              {profile.alias ? (
                <Text style={styles.originalName}>
                  Настоящее имя: {profile.original_display_name}
                </Text>
              ) : null}
              <Text style={styles.username}>@{profile.username}</Text>
              <View style={styles.statusRow}>
                <View
                  style={[
                    styles.statusDot,
                    online ? styles.statusDotOnline : styles.statusDotOffline,
                  ]}
                />
                <Text style={styles.statusText}>
                  {online ? "В сети" : lastSeenText(lastSeenAt)}
                </Text>
              </View>
              <Text style={styles.team}>{profile.team_name}</Text>
              <View style={styles.roles}>
                {roleLabels.length ? (
                  roleLabels.map((role) => (
                    <View key={role} style={styles.roleChip}>
                      <Text style={styles.roleText}>{role}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.noRoles}>
                    Роли в этой команде не назначены
                  </Text>
                )}
              </View>
            </View>

            <View style={styles.aliasCard}>
              <Text style={styles.sectionTitle}>Псевдоним</Text>
              <Text style={styles.helper}>
                Он виден только вам и заменяет имя этого пользователя во всех
                чатах, группах и меню.
              </Text>
              <TextInput
                style={styles.input}
                value={alias}
                onChangeText={(value) => {
                  setAlias(value);
                  setSaved(false);
                  setError(null);
                }}
                maxLength={80}
                placeholder={profile.original_display_name}
                autoCapitalize="words"
                returnKeyType="done"
                onFocus={() =>
                  requestAnimationFrame(() =>
                    scrollRef.current?.scrollToEnd({ animated: true }),
                  )
                }
                onSubmitEditing={() => void saveAlias()}
              />
              <Text style={styles.inputHint}>
                Оставьте поле пустым, чтобы снова показывать настоящее имя.
              </Text>
              {saved ? (
                <Text style={styles.saved}>Псевдоним сохранён</Text>
              ) : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <TouchableOpacity
                style={[styles.saveButton, !canSave && styles.disabled]}
                onPress={() => void saveAlias()}
                disabled={!canSave}
              >
                {saving ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.saveText}>
                    {normalizedAlias
                      ? "Сохранить псевдоним"
                      : "Удалить псевдоним"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        ) : (
          <View style={styles.center}>
            <Icon
              name="person-circle-outline"
              size={64}
              color={colors.textSecondary}
            />
            <Text style={styles.error}>{error || "Профиль не найден"}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => void load()}
            >
              <Text style={styles.retryText}>Повторить</Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
      {profile && session ? (
        <MessengerAvatarViewer
          visible={avatarVisible}
          title={profile.display_name}
          avatarUrl={profile.avatar_url}
          accessToken={session.access_token}
          onClose={() => setAvatarVisible(false)}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.backgroundAlt },
  body: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1, marginLeft: 6 },
  headerTitle: { color: colors.text, fontSize: 22, fontWeight: "800" },
  headerSubtitle: { marginTop: 2, color: colors.textSecondary, fontSize: 12 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    padding: 24,
  },
  content: { flexGrow: 1, padding: 18, paddingBottom: 30, gap: 14 },
  profileCard: {
    alignItems: "center",
    padding: 22,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    backgroundColor: colors.surface,
  },
  name: {
    marginTop: 14,
    color: colors.text,
    fontSize: 25,
    fontWeight: "800",
    textAlign: "center",
  },
  originalName: {
    marginTop: 5,
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: "center",
  },
  username: { marginTop: 5, color: colors.textSecondary, fontSize: 13 },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 12,
  },
  statusDot: { width: 9, height: 9, borderRadius: 5 },
  statusDotOnline: { backgroundColor: "#2FA84F" },
  statusDotOffline: { backgroundColor: colors.textSecondary },
  statusText: { color: colors.textSecondary, fontSize: 12 },
  team: { marginTop: 10, color: colors.text, fontSize: 13, fontWeight: "700" },
  roles: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 7,
    marginTop: 12,
  },
  roleChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: "#EAF3FF",
  },
  roleText: { color: colors.primary, fontSize: 11, fontWeight: "800" },
  noRoles: { color: colors.textSecondary, fontSize: 12 },
  aliasCard: {
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    backgroundColor: colors.surface,
  },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  helper: {
    marginTop: 5,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  input: {
    minHeight: 48,
    marginTop: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.background,
    color: colors.text,
    fontSize: 16,
  },
  inputHint: { marginTop: 7, color: colors.textSecondary, fontSize: 11 },
  saved: { marginTop: 10, color: "#258641", fontSize: 12, fontWeight: "700" },
  error: {
    marginTop: 10,
    color: colors.error,
    fontSize: 12,
    textAlign: "center",
  },
  saveButton: {
    minHeight: 48,
    marginTop: 14,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: colors.primary,
  },
  disabled: { opacity: 0.45 },
  saveText: { color: colors.white, fontSize: 14, fontWeight: "800" },
  retryButton: {
    minHeight: 44,
    paddingHorizontal: 22,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: colors.primary,
  },
  retryText: { color: colors.white, fontWeight: "800" },
});
