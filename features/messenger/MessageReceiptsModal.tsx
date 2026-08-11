import React, { useMemo } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
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

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={styles.sheet}
          onPress={(event) => event.stopPropagation()}
        >
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
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    padding: 14,
    backgroundColor: "rgba(16, 40, 68, 0.38)",
  },
  sheet: {
    maxHeight: "82%",
    padding: 16,
    paddingBottom: 10,
    borderRadius: 22,
    backgroundColor: colors.surface,
  },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  headerText: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: 18, fontWeight: "800" },
  subtitle: { marginTop: 3, color: colors.textSecondary, fontSize: 12 },
  closeButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  list: { flexGrow: 0 },
  listContent: { paddingBottom: 8 },
  group: { marginTop: 12 },
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
  state: {
    minHeight: 170,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 20,
  },
  error: { color: colors.text, textAlign: "center" },
  retry: { color: colors.primary, fontSize: 12, fontWeight: "700" },
  empty: { color: colors.textSecondary },
});
