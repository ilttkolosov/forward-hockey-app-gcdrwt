import React, { useMemo } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "../../components/Icon";
import { colors } from "../../styles/commonStyles";
import AuthenticatedAvatar from "./AuthenticatedAvatar";
import type { MessengerMessage, MessengerMessageReceipt } from "./types";

interface MessageReceiptsModalProps {
  visible: boolean;
  message: MessengerMessage | null;
  recipients: MessengerMessageReceipt[];
  accessToken?: string;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onRetry: () => void;
}

function receiptTime(value: string | null): string {
  if (!value) return "";
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function RecipientGroup({
  title,
  icon,
  recipients,
  accessToken,
}: {
  title: string;
  icon: React.ComponentProps<typeof Icon>["name"];
  recipients: MessengerMessageReceipt[];
  accessToken?: string;
}) {
  if (!recipients.length) return null;
  return (
    <View style={styles.group}>
      <View style={styles.groupHeader}>
        <Icon name={icon} size={18} color={colors.primary} />
        <Text style={styles.groupTitle}>{title}</Text>
        <Text style={styles.groupCount}>{recipients.length}</Text>
      </View>
      {recipients.map((recipient) => (
        <View key={recipient.user_id} style={styles.recipient}>
          <AuthenticatedAvatar
            displayName={recipient.display_name}
            avatarUrl={recipient.avatar_url}
            accessToken={accessToken}
            identityKey={recipient.user_id}
            size={40}
          />
          <View style={styles.recipientText}>
            <Text style={styles.recipientName} numberOfLines={1}>
              {recipient.display_name}
            </Text>
            <Text style={styles.recipientTime}>
              {receiptTime(recipient.read_at || recipient.delivered_at)}
            </Text>
          </View>
          {recipient.reaction ? (
            <Text
              style={styles.recipientReaction}
              accessibilityLabel={`Реакция ${recipient.reaction}`}
            >
              {recipient.reaction}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

export default function MessageReceiptsModal({
  visible,
  message,
  recipients,
  accessToken,
  loading,
  error,
  onClose,
  onRetry,
}: MessageReceiptsModalProps) {
  const { height: viewportHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const groups = useMemo(
    () => ({
      read: recipients.filter((recipient) => recipient.status === "read"),
      delivered: recipients.filter(
        (recipient) => recipient.status === "delivered",
      ),
      sent: recipients.filter((recipient) => recipient.status === "sent"),
    }),
    [recipients],
  );
  const populatedGroups = [groups.read, groups.delivered, groups.sent].filter(
    (group) => group.length > 0,
  ).length;
  const naturalHeight =
    loading || error || recipients.length === 0
      ? 220
      : 82 +
        recipients.length * 56 +
        populatedGroups * 35 +
        Math.max(insets.bottom, 10);
  const sheetHeight = Math.min(
    Math.max(170, naturalHeight),
    Math.max(260, viewportHeight * 0.78),
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="Закрыть статусы сообщения"
        />
        <View
          style={[
            styles.sheet,
            { height: sheetHeight, paddingBottom: Math.max(insets.bottom, 10) },
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>Статусы сообщения</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {message?.text || "Вложение"}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              accessibilityLabel="Закрыть статусы"
            >
              <Icon name="close" size={23} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.state}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : error ? (
            <TouchableOpacity style={styles.state} onPress={onRetry}>
              <Icon
                name="alert-circle-outline"
                size={28}
                color={colors.warning}
              />
              <Text style={styles.error}>{error}</Text>
              <Text style={styles.retry}>Нажмите, чтобы повторить</Text>
            </TouchableOpacity>
          ) : recipients.length ? (
            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
              alwaysBounceVertical={false}
            >
              <RecipientGroup
                title="Просмотрели"
                icon="checkmark-done"
                recipients={groups.read}
                accessToken={accessToken}
              />
              <RecipientGroup
                title="Получили"
                icon="checkmark"
                recipients={groups.delivered}
                accessToken={accessToken}
              />
              <RecipientGroup
                title="Ожидают доставки"
                icon="time-outline"
                recipients={groups.sent}
                accessToken={accessToken}
              />
            </ScrollView>
          ) : (
            <View style={styles.state}>
              <Icon
                name="person-outline"
                size={34}
                color={colors.textSecondary}
              />
              <Text style={styles.empty}>У сообщения нет получателей</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: 10,
    paddingBottom: 6,
    backgroundColor: "rgba(16, 40, 68, 0.38)",
  },
  sheet: {
    maxHeight: "78%",
    paddingHorizontal: 16,
    paddingTop: 8,
    borderRadius: 22,
    backgroundColor: colors.surface,
  },
  handle: {
    width: 38,
    height: 4,
    alignSelf: "center",
    marginBottom: 7,
    borderRadius: 2,
    backgroundColor: "#CBD2D9",
  },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  headerText: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: 18, fontWeight: "800" },
  subtitle: { marginTop: 3, color: colors.textSecondary, fontSize: 12 },
  closeButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  list: { flex: 1, minHeight: 0 },
  listContent: { paddingBottom: 8 },
  group: { marginTop: 8 },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 5,
  },
  groupTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
  groupCount: {
    minWidth: 24,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    color: colors.primary,
    fontSize: 11,
    fontWeight: "800",
    textAlign: "center",
    backgroundColor: "#EAF3FF",
  },
  recipient: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  recipientText: { flex: 1, minWidth: 0 },
  recipientName: { color: colors.text, fontSize: 14, fontWeight: "700" },
  recipientTime: { marginTop: 2, color: colors.textSecondary, fontSize: 11 },
  recipientReaction: {
    minWidth: 36,
    marginLeft: 4,
    fontSize: 24,
    textAlign: "center",
  },
  state: {
    flex: 1,
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 20,
  },
  error: { color: colors.text, textAlign: "center" },
  retry: { color: colors.primary, fontSize: 12, fontWeight: "700" },
  empty: { color: colors.textSecondary },
});
