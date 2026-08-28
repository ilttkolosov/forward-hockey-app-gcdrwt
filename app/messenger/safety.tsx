import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "../../components/Icon";
import { usePersistentBottomNavigationInset } from "../../components/PersistentBottomNavigation";
import { useMessengerAuth } from "../../contexts/MessengerAuthContext";
import AuthenticatedAvatar from "../../features/messenger/AuthenticatedAvatar";
import {
  reportAnalyticsError,
  trackMessengerAction,
  trackScreenView,
} from "../../services/analyticsService";
import { messengerErrorMessage } from "../../services/messengerApi";
import {
  getMessengerBlockedUsers,
  type MessengerBlockedUser,
  unblockMessengerUser,
} from "../../services/messengerModeration";
import { colors } from "../../styles/commonStyles";

const SUPPORT_EMAIL = "ilttkolosov@gmail.com";
const SUPPORT_URL = "https://www.hc-forward.com";

const COMMUNITY_RULES = [
  "Не публикуйте угрозы, травлю, оскорбления и материалы, разжигающие ненависть.",
  "Запрещены материалы сексуального характера, особенно затрагивающие несовершеннолетних.",
  "Не размещайте чужие персональные данные, переписку или фотографии без законного основания.",
  "Не используйте мессенджер для спама, мошенничества и выдачи себя за другого человека.",
  "Сообщайте администраторам о нарушениях через меню конкретного сообщения или карточку пользователя.",
] as const;

function blockedAtText(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Дата блокировки неизвестна";
  return `Заблокирован ${date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export default function MessengerSafetyScreen() {
  const router = useRouter();
  const bottomNavigationInset = usePersistentBottomNavigationInset();
  const { session, isAuthenticated } = useMessengerAuth();
  const [blockedUsers, setBlockedUsers] = useState<MessengerBlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      setBlockedUsers(await getMessengerBlockedUsers());
    } catch (loadError) {
      reportAnalyticsError("messenger.safety.load", loadError);
      setError(
        messengerErrorMessage(
          loadError,
          "Не удалось загрузить список заблокированных пользователей",
        ),
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
      trackScreenView("messenger_safety");
      trackMessengerAction("safety_center_opened");
      void load();
    }, [isAuthenticated, load, router]),
  );

  const unblock = (user: MessengerBlockedUser) => {
    Alert.alert(
      "Снять блокировку?",
      `${user.display_name} снова сможет обмениваться с вами личными сообщениями.`,
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Разблокировать",
          onPress: () => {
            setBusyUserId(user.user_id);
            setError(null);
            void unblockMessengerUser(user.user_id)
              .then(() => {
                setBlockedUsers((current) =>
                  current.filter((item) => item.user_id !== user.user_id),
                );
                trackMessengerAction("user_block_changed", {
                  blocked: false,
                  result: "success",
                  source: "safety_center",
                });
              })
              .catch((unblockError) => {
                reportAnalyticsError(
                  "messenger.safety.unblock",
                  unblockError,
                );
                setError(
                  messengerErrorMessage(
                    unblockError,
                    "Не удалось снять блокировку",
                  ),
                );
                trackMessengerAction("user_block_changed", {
                  blocked: false,
                  result: "failed",
                  source: "safety_center",
                });
              })
              .finally(() => setBusyUserId(null));
          },
        },
      ],
    );
  };

  const emailSupport = () => {
    const subject = encodeURIComponent("Безопасность Forward Messenger");
    void Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}`);
  };

  const openWebsite = () => {
    void Linking.openURL(SUPPORT_URL);
  };

  if (!session) return null;

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Назад"
        >
          <Icon name="chevron-back" size={28} color={colors.primary} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Безопасность</Text>
          <Text style={styles.headerSubtitle}>
            Правила, жалобы и блокировки
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomNavigationInset }]}
      >
        <View style={styles.card}>
          <View style={styles.cardHeading}>
            <Icon
              name="shield-checkmark-outline"
              size={25}
              color={colors.primary}
            />
            <Text style={styles.sectionTitle}>Правила сообщества</Text>
          </View>
          <Text style={styles.bodyText}>
            Мессенджер предназначен для общения участников хоккейного клуба.
            Используя его, пользователь соглашается соблюдать следующие
            правила:
          </Text>
          <View style={styles.rules}>
            {COMMUNITY_RULES.map((rule, index) => (
              <View key={rule} style={styles.ruleRow}>
                <View style={styles.ruleNumber}>
                  <Text style={styles.ruleNumberText}>{index + 1}</Text>
                </View>
                <Text style={styles.ruleText}>{rule}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.notice}>
            Администраторы могут удалить нарушающий правила материал,
            ограничить доступ пользователя и сохранить сведения о принятом
            решении. Заведомо ложные или массовые жалобы также могут быть
            рассмотрены как злоупотребление.
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeading}>
            <Icon name="flag-outline" size={24} color={colors.error} />
            <Text style={styles.sectionTitle}>Как сообщить о нарушении</Text>
          </View>
          <Text style={styles.bodyText}>
            Нажмите и удерживайте чужое сообщение, затем выберите
            «Пожаловаться». На пользователя целиком можно пожаловаться из его
            карточки. Жалоба передаётся администраторам клуба; автор обращения
            не раскрывается пользователю, на которого пожаловались.
          </Text>
          <Text style={styles.bodyText}>
            При непосредственной угрозе жизни или безопасности не ограничивайтесь
            жалобой в приложении — обратитесь в экстренные службы и к
            ответственным взрослым.
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeading}>
            <Icon name="ban-outline" size={24} color={colors.primary} />
            <Text style={styles.sectionTitle}>Заблокированные пользователи</Text>
          </View>
          <Text style={styles.bodyText}>
            Блокировка прекращает отправку новых сообщений в личном чате в обе
            стороны. Она не заменяет жалобу администраторам.
          </Text>
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.loadingText}>Загрузка списка…</Text>
            </View>
          ) : blockedUsers.length ? (
            <View style={styles.blockedList}>
              {blockedUsers.map((user) => (
                <View key={user.user_id} style={styles.blockedRow}>
                  <AuthenticatedAvatar
                    displayName={user.display_name}
                    avatarUrl={user.avatar_url}
                    accessToken={session.access_token}
                    size={48}
                  />
                  <View style={styles.blockedText}>
                    <Text style={styles.blockedName} numberOfLines={1}>
                      {user.display_name}
                    </Text>
                    <Text style={styles.blockedUsername} numberOfLines={1}>
                      @{user.username}
                    </Text>
                    <Text style={styles.blockedDate}>
                      {blockedAtText(user.blocked_at)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.unblockButton}
                    onPress={() => unblock(user)}
                    disabled={busyUserId === user.user_id}
                    accessibilityLabel={`Разблокировать ${user.display_name}`}
                  >
                    {busyUserId === user.user_id ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Text style={styles.unblockText}>Снять</Text>
                    )}
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Icon
                name="people-outline"
                size={32}
                color={colors.textSecondary}
              />
              <Text style={styles.emptyTitle}>Список пуст</Text>
              <Text style={styles.emptyText}>
                Вы пока никого не блокировали.
              </Text>
            </View>
          )}
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => void load()}
              >
                <Text style={styles.retryText}>Повторить</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeading}>
            <Icon name="help-circle-outline" size={24} color={colors.primary} />
            <Text style={styles.sectionTitle}>Поддержка и обжалование</Text>
          </View>
          <Text style={styles.bodyText}>
            По вопросам безопасности, ошибочной блокировки или обработки
            жалобы свяжитесь с разработчиком. Укажите логин в мессенджере,
            примерное время события и краткое описание, но не отправляйте
            пароль или код приглашения.
          </Text>
          <TouchableOpacity
            style={styles.supportButton}
            onPress={emailSupport}
            accessibilityRole="link"
            accessibilityLabel={`Написать в поддержку ${SUPPORT_EMAIL}`}
          >
            <Icon name="mail-outline" size={20} color={colors.white} />
            <Text style={styles.supportButtonText}>{SUPPORT_EMAIL}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.websiteButton}
            onPress={openWebsite}
            accessibilityRole="link"
            accessibilityLabel="Открыть сайт хоккейного клуба"
          >
            <Icon name="globe-outline" size={20} color={colors.primary} />
            <Text style={styles.websiteButtonText}>www.hc-forward.com</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.backgroundAlt },
  header: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
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
  headerText: { flex: 1, marginLeft: 6, paddingRight: 44 },
  headerTitle: { color: colors.text, fontSize: 22, fontWeight: "800" },
  headerSubtitle: { marginTop: 2, color: colors.textSecondary, fontSize: 12 },
  content: { padding: 16, paddingBottom: 32, gap: 14 },
  card: {
    padding: 17,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    backgroundColor: colors.surface,
  },
  cardHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 10,
  },
  sectionTitle: { flex: 1, color: colors.text, fontSize: 18, fontWeight: "800" },
  bodyText: { marginBottom: 8, color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  rules: { marginTop: 6, gap: 10 },
  ruleRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  ruleNumber: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#EAF3FF",
  },
  ruleNumberText: { color: colors.primary, fontSize: 12, fontWeight: "800" },
  ruleText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 19 },
  notice: {
    marginTop: 14,
    padding: 12,
    borderRadius: 13,
    backgroundColor: "#FFF6DB",
    color: "#725000",
    fontSize: 12,
    lineHeight: 18,
  },
  loadingRow: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  loadingText: { color: colors.textSecondary, fontSize: 12 },
  blockedList: { marginTop: 8, gap: 9 },
  blockedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 15,
    backgroundColor: colors.background,
  },
  blockedText: { flex: 1, minWidth: 0 },
  blockedName: { color: colors.text, fontSize: 14, fontWeight: "800" },
  blockedUsername: { marginTop: 1, color: colors.textSecondary, fontSize: 12 },
  blockedDate: { marginTop: 3, color: colors.textSecondary, fontSize: 10 },
  unblockButton: {
    minWidth: 58,
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 12,
  },
  unblockText: { color: colors.primary, fontSize: 12, fontWeight: "800" },
  emptyState: { alignItems: "center", paddingVertical: 20 },
  emptyTitle: { marginTop: 7, color: colors.text, fontSize: 14, fontWeight: "800" },
  emptyText: { marginTop: 3, color: colors.textSecondary, fontSize: 12 },
  errorBox: { marginTop: 10, alignItems: "center" },
  errorText: { color: colors.error, fontSize: 12, textAlign: "center" },
  retryButton: { marginTop: 8, paddingHorizontal: 14, paddingVertical: 8 },
  retryText: { color: colors.primary, fontSize: 12, fontWeight: "800" },
  supportButton: {
    minHeight: 48,
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    backgroundColor: colors.primary,
  },
  supportButtonText: { color: colors.white, fontSize: 14, fontWeight: "800" },
  websiteButton: {
    minHeight: 46,
    marginTop: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 14,
    backgroundColor: colors.background,
  },
  websiteButtonText: { color: colors.primary, fontSize: 14, fontWeight: "800" },
});
