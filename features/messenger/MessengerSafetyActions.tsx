import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Icon from "../../components/Icon";
import {
  blockMessengerUser,
  getMessengerUserSafetyState,
  MESSENGER_REPORT_REASONS,
  MESSENGER_REPORT_REASON_LABELS,
  reportMessengerUser,
  type MessengerReportReason,
  unblockMessengerUser,
} from "../../services/messengerModeration";
import {
  reportAnalyticsError,
  trackMessengerAction,
} from "../../services/analyticsService";
import { messengerErrorMessage } from "../../services/messengerApi";
import { colors } from "../../styles/commonStyles";

interface MessengerReportDialogProps {
  visible: boolean;
  targetUserId: string;
  targetDisplayName: string;
  roomId?: string;
  messageId?: string;
  onClose: () => void;
  onSubmitted?: () => void;
}

export function MessengerReportDialog({
  visible,
  targetUserId,
  targetDisplayName,
  roomId,
  messageId,
  onClose,
  onSubmitted,
}: MessengerReportDialogProps) {
  const [reason, setReason] = useState<MessengerReportReason>("harassment");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setReason("harassment");
    setDetails("");
    setError(null);
    setSubmitting(false);
  }, [visible]);

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await reportMessengerUser({
        reportedUserId: targetUserId,
        reason,
        details,
        roomId,
        messageId,
      });
      trackMessengerAction("report_submitted", {
        target_type: messageId ? "message" : "user",
        reason,
        result: "success",
      });
      onSubmitted?.();
      onClose();
      Alert.alert(
        "Жалоба отправлена",
        "Администраторы клуба получили обращение и смогут проверить его и принять меры.",
      );
    } catch (submitError) {
      trackMessengerAction("report_submitted", {
        target_type: messageId ? "message" : "user",
        reason,
        result: "failed",
      });
      reportAnalyticsError("messenger.report.submit", submitError);
      setError(
        messengerErrorMessage(submitError, "Не удалось отправить жалобу"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.modalBackdrop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.reportSheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeaderText}>
              <Text style={styles.sheetTitle}>
                {messageId
                  ? "Пожаловаться на сообщение"
                  : "Пожаловаться на пользователя"}
              </Text>
              <Text style={styles.sheetSubtitle} numberOfLines={2}>
                {targetDisplayName}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              accessibilityLabel="Закрыть форму жалобы"
            >
              <Icon name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.reportScroll}
            contentContainerStyle={styles.reportContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.explanation}>
              Жалоба будет передана администраторам клуба. Пользователь не
              увидит, кто её отправил.
            </Text>
            <Text style={styles.fieldTitle}>Причина</Text>
            <View style={styles.reasonList}>
              {MESSENGER_REPORT_REASONS.map((item) => {
                const selected = reason === item;
                return (
                  <TouchableOpacity
                    key={item}
                    style={[
                      styles.reasonButton,
                      selected && styles.reasonButtonSelected,
                    ]}
                    onPress={() => setReason(item)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                  >
                    <View
                      style={[
                        styles.radio,
                        selected && styles.radioSelected,
                      ]}
                    >
                      {selected ? <View style={styles.radioDot} /> : null}
                    </View>
                    <Text
                      style={[
                        styles.reasonText,
                        selected && styles.reasonTextSelected,
                      ]}
                    >
                      {MESSENGER_REPORT_REASON_LABELS[item]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.fieldTitle}>Комментарий — необязательно</Text>
            <TextInput
              style={styles.detailsInput}
              value={details}
              onChangeText={setDetails}
              multiline
              maxLength={1200}
              textAlignVertical="top"
              placeholder="Кратко опишите, что произошло. Не вставляйте личные данные."
              placeholderTextColor={colors.textSecondary}
            />
            <Text style={styles.counter}>{details.length}/1200</Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </ScrollView>

          <View style={styles.sheetFooter}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onClose}
              disabled={submitting}
            >
              <Text style={styles.cancelText}>Отмена</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.reportButton}
              onPress={() => void submit()}
              disabled={submitting}
              accessibilityLabel="Отправить жалобу администраторам"
            >
              {submitting ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.reportButtonText}>Отправить жалобу</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

interface MessengerSafetyActionsProps {
  targetUserId: string;
  targetDisplayName: string;
  roomId?: string;
  onBlockedChange?: (blocked: boolean) => void;
}

export default function MessengerSafetyActions({
  targetUserId,
  targetDisplayName,
  roomId,
  onBlockedChange,
}: MessengerSafetyActionsProps) {
  const [blocked, setBlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [changingBlock, setChangingBlock] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadState = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const state = await getMessengerUserSafetyState(targetUserId);
      setBlocked(state.blocked_by_me);
    } catch (loadError) {
      setError(
        messengerErrorMessage(
          loadError,
          "Не удалось загрузить настройки безопасности",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [targetUserId]);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  const applyBlockState = async (nextBlocked: boolean) => {
    if (changingBlock) return;
    setChangingBlock(true);
    setError(null);
    try {
      const state = nextBlocked
        ? await blockMessengerUser(targetUserId)
        : await unblockMessengerUser(targetUserId);
      setBlocked(state.blocked_by_me);
      onBlockedChange?.(state.blocked_by_me);
      trackMessengerAction("user_block_changed", {
        blocked: state.blocked_by_me,
        result: "success",
      });
      Alert.alert(
        state.blocked_by_me ? "Пользователь заблокирован" : "Блокировка снята",
        state.blocked_by_me
          ? "Новые сообщения в личном чате между вами больше не будут отправляться."
          : "Личная переписка снова доступна.",
      );
    } catch (blockError) {
      trackMessengerAction("user_block_changed", {
        blocked: nextBlocked,
        result: "failed",
      });
      reportAnalyticsError("messenger.user_block.change", blockError);
      setError(
        messengerErrorMessage(
          blockError,
          nextBlocked
            ? "Не удалось заблокировать пользователя"
            : "Не удалось снять блокировку",
        ),
      );
    } finally {
      setChangingBlock(false);
    }
  };

  const confirmBlockChange = () => {
    if (blocked) {
      Alert.alert(
        "Снять блокировку?",
        `После этого ${targetDisplayName} снова сможет обмениваться с вами личными сообщениями.`,
        [
          { text: "Отмена", style: "cancel" },
          {
            text: "Разблокировать",
            onPress: () => void applyBlockState(false),
          },
        ],
      );
      return;
    }
    Alert.alert(
      "Заблокировать пользователя?",
      "Ни вы, ни этот пользователь не сможете отправлять новые сообщения в личном чате. Жалобу при необходимости отправьте отдельно.",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Заблокировать",
          style: "destructive",
          onPress: () => void applyBlockState(true),
        },
      ],
    );
  };

  return (
    <View style={styles.safetyCard}>
      <View style={styles.safetyHeading}>
        <Icon name="shield-checkmark-outline" size={23} color={colors.primary} />
        <View style={styles.safetyHeadingText}>
          <Text style={styles.safetyTitle}>Безопасность</Text>
          <Text style={styles.safetyDescription}>
            Жалобы рассматриваются администраторами клуба. Блокировка сразу
            прекращает новые личные сообщения.
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.safetyLoading}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.safetyLoadingText}>Проверка настроек…</Text>
        </View>
      ) : (
        <View style={styles.safetyButtons}>
          <TouchableOpacity
            style={styles.safetySecondaryButton}
            onPress={() => setReportVisible(true)}
            accessibilityLabel={`Пожаловаться на ${targetDisplayName}`}
          >
            <Icon name="flag-outline" size={20} color={colors.error} />
            <Text style={styles.safetyReportText}>Пожаловаться</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.safetyBlockButton,
              blocked && styles.safetyUnblockButton,
              changingBlock && styles.disabled,
            ]}
            onPress={confirmBlockChange}
            disabled={changingBlock}
            accessibilityLabel={
              blocked
                ? `Разблокировать ${targetDisplayName}`
                : `Заблокировать ${targetDisplayName}`
            }
          >
            {changingBlock ? (
              <ActivityIndicator
                color={blocked ? colors.primary : colors.white}
              />
            ) : (
              <>
                <Icon
                  name={blocked ? "person-add-outline" : "ban-outline"}
                  size={20}
                  color={blocked ? colors.primary : colors.white}
                />
                <Text
                  style={[
                    styles.safetyBlockText,
                    blocked && styles.safetyUnblockText,
                  ]}
                >
                  {blocked ? "Разблокировать" : "Заблокировать"}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
      {blocked ? (
        <View style={styles.blockedNotice}>
          <Icon name="information-circle-outline" size={18} color="#8A5B00" />
          <Text style={styles.blockedNoticeText}>
            Пользователь заблокирован. Новые личные сообщения не отправляются.
          </Text>
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <MessengerReportDialog
        visible={reportVisible}
        targetUserId={targetUserId}
        targetDisplayName={targetDisplayName}
        roomId={roomId}
        onClose={() => setReportVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safetyCard: {
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    backgroundColor: colors.surface,
  },
  safetyHeading: { flexDirection: "row", alignItems: "flex-start", gap: 11 },
  safetyHeadingText: { flex: 1 },
  safetyTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  safetyDescription: {
    marginTop: 5,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  safetyLoading: {
    minHeight: 48,
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  safetyLoadingText: { color: colors.textSecondary, fontSize: 12 },
  safetyButtons: { marginTop: 15, gap: 10 },
  safetySecondaryButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#F0B5B0",
    borderRadius: 14,
    backgroundColor: "#FFF6F5",
  },
  safetyReportText: { color: colors.error, fontSize: 14, fontWeight: "800" },
  safetyBlockButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    backgroundColor: colors.error,
  },
  safetyUnblockButton: {
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.background,
  },
  safetyBlockText: { color: colors.white, fontSize: 14, fontWeight: "800" },
  safetyUnblockText: { color: colors.primary },
  blockedNotice: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 11,
    borderRadius: 12,
    backgroundColor: "#FFF6DB",
  },
  blockedNoticeText: { flex: 1, color: "#725000", fontSize: 12, lineHeight: 17 },
  disabled: { opacity: 0.5 },
  error: { marginTop: 10, color: colors.error, fontSize: 12, textAlign: "center" },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.38)",
  },
  reportSheet: {
    maxHeight: "91%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: colors.background,
    overflow: "hidden",
  },
  sheetHandle: {
    width: 44,
    height: 5,
    marginTop: 9,
    alignSelf: "center",
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sheetHeaderText: { flex: 1, paddingRight: 10 },
  sheetTitle: { color: colors.text, fontSize: 20, fontWeight: "800" },
  sheetSubtitle: { marginTop: 3, color: colors.textSecondary, fontSize: 13 },
  closeButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  reportScroll: { flexGrow: 0 },
  reportContent: { padding: 18, paddingBottom: 10 },
  explanation: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
  fieldTitle: {
    marginTop: 17,
    marginBottom: 9,
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  reasonList: { gap: 7 },
  reasonButton: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 13,
    backgroundColor: colors.surface,
  },
  reasonButtonSelected: { borderColor: colors.primary, backgroundColor: "#EAF3FF" },
  radio: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 10,
  },
  radioSelected: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  reasonText: { flex: 1, color: colors.text, fontSize: 13, fontWeight: "600" },
  reasonTextSelected: { color: colors.primary },
  detailsInput: {
    minHeight: 104,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 14,
    lineHeight: 19,
  },
  counter: { marginTop: 5, color: colors.textSecondary, fontSize: 11, textAlign: "right" },
  sheetFooter: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 28 : 18,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  cancelButton: {
    minHeight: 48,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.surface,
  },
  cancelText: { color: colors.text, fontSize: 14, fontWeight: "700" },
  reportButton: {
    minHeight: 48,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: colors.error,
  },
  reportButtonText: { color: colors.white, fontSize: 14, fontWeight: "800" },
});
