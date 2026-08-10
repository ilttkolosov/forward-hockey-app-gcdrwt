import * as Crypto from "expo-crypto";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ImageBackground,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
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
import {
  cacheMessengerMessages,
  enqueueMessengerText,
  loadCachedMessengerMessages,
  loadMessengerOutbox,
  markMessengerOutboxFailure,
  removeMessengerOutboxItem,
} from "../../../features/messenger/repository";
import type {
  MessengerMessage,
  MessengerOutboxItem,
  MessengerReply,
  MessengerUser,
} from "../../../features/messenger/types";
import {
  getMessengerMessages,
  markMessengerDelivered,
  markMessengerRead,
  removeMessengerReaction,
  sendMessengerText,
  setMessengerReaction,
} from "../../../services/messengerApi";
import { subscribeMessengerRealtime } from "../../../services/messengerRealtime";
import { colors } from "../../../styles/commonStyles";

function pendingMessage(
  item: MessengerOutboxItem,
  currentUser: MessengerUser,
  replyTarget?: MessengerMessage,
): MessengerMessage {
  return {
    id: `pending-${item.client_message_id}`,
    sequence: "0",
    room_id: item.room_id,
    client_message_id: item.client_message_id,
    kind: "text",
    text: item.text,
    created_at: item.created_at,
    edited_at: null,
    deleted_at: null,
    author: {
      id: currentUser.id,
      username: currentUser.username,
      display_name: currentUser.display_name,
      avatar_url: currentUser.avatar_url,
    },
    media: null,
    reply_to: replyTarget
      ? {
          id: replyTarget.id,
          kind: replyTarget.kind,
          text: replyTarget.text,
          deleted_at: replyTarget.deleted_at,
          author: {
            id: replyTarget.author.id,
            display_name: replyTarget.author.display_name,
          },
        }
      : null,
    reactions: [],
    delivery: {
      status: "sent",
      recipient_count: 0,
      delivered_count: 0,
      read_count: 0,
    },
    pending: true,
  };
}

function DeliveryChecks({ message }: { message: MessengerMessage }) {
  if (message.pending) {
    return (
      <Text
        style={[styles.pendingCheck, { color: colors.textSecondary }]}
        accessibilityLabel="Ожидает отправки"
      >
        ◷
      </Text>
    );
  }
  const read = message.delivery.status === "read";
  const double = message.delivery.status !== "sent";
  const label = read ? "Прочитано" : double ? "Доставлено" : "Отправлено";
  const color = read ? colors.accent : colors.textSecondary;
  return (
    <View style={styles.checkPair} accessibilityLabel={label}>
      <Text style={[styles.checkMark, styles.checkOne, { color }]}>✓</Text>
      {double && (
        <Text style={[styles.checkMark, styles.checkTwo, { color }]}>✓</Text>
      )}
    </View>
  );
}

export default function MessengerRoomScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{
    id: string;
    title?: string;
    canWrite?: string;
    canReact?: string;
  }>();
  const { session, isAuthenticated } = useMessengerAuth();
  const roomId = params.id;
  const canWrite = params.canWrite !== "false";
  const canReact = params.canReact !== "false";
  const [messages, setMessages] = useState<MessengerMessage[]>([]);
  const [outbox, setOutbox] = useState<MessengerOutboxItem[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [offline, setOffline] = useState(false);
  const [replyingTo, setReplyingTo] = useState<MessengerMessage | null>(null);
  const [actionMessage, setActionMessage] = useState<MessengerMessage | null>(
    null,
  );
  const [reactionBusy, setReactionBusy] = useState(false);
  const listRef = useRef<FlatList<MessengerMessage>>(null);
  const refreshRunning = useRef(false);
  const flushRunning = useRef(false);
  const realtimeSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const visibleMessages = useMemo(() => {
    const pending = session
      ? outbox.map((item) =>
          pendingMessage(
            item,
            session.user,
            messages.find((message) => message.id === item.reply_to_message_id),
          ),
        )
      : [];
    return [...messages, ...pending].sort(
      (left, right) =>
        new Date(left.created_at).getTime() -
        new Date(right.created_at).getTime(),
    );
  }, [messages, outbox, session]);

  const refreshOutbox = useCallback(async () => {
    if (!roomId) return;
    setOutbox(await loadMessengerOutbox(db, roomId));
  }, [db, roomId]);

  const flushOutbox = useCallback(async () => {
    if (flushRunning.current || !isAuthenticated) return;
    flushRunning.current = true;
    try {
      const pending = await loadMessengerOutbox(db, roomId);
      for (const item of pending) {
        try {
          const result = await sendMessengerText(
            item.room_id,
            item.client_message_id,
            item.text,
            item.reply_to_message_id,
          );
          await cacheMessengerMessages(db, [result.message]);
          await removeMessengerOutboxItem(db, item.client_message_id);
          console.log(
            `[Messenger] Сообщение ${item.client_message_id} отправлено из outbox`,
          );
        } catch (error) {
          await markMessengerOutboxFailure(db, item.client_message_id, error);
          throw error;
        }
      }
      await refreshOutbox();
    } finally {
      flushRunning.current = false;
    }
  }, [db, isAuthenticated, refreshOutbox, roomId]);

  const loadMessages = useCallback(
    async (scroll = false) => {
      if (!roomId || refreshRunning.current || !isAuthenticated) return;
      refreshRunning.current = true;
      try {
        const cached = await loadCachedMessengerMessages(db, roomId);
        if (cached.length) {
          setMessages(cached);
          setLoading(false);
        }
        await refreshOutbox();
        await flushOutbox();
        const remote = await getMessengerMessages(roomId);
        setMessages(remote.items);
        await cacheMessengerMessages(db, remote.items);
        const latestSequence = remote.page.latest_sequence;
        if (latestSequence) {
          await Promise.all([
            markMessengerDelivered(roomId, latestSequence),
            markMessengerRead(roomId, latestSequence),
          ]);
        }
        setOffline(false);
        if (scroll)
          requestAnimationFrame(() =>
            listRef.current?.scrollToEnd({ animated: false }),
          );
      } catch (error) {
        setOffline(true);
        console.warn("[Messenger] Показан локальный кэш комнаты:", error);
      } finally {
        setLoading(false);
        refreshRunning.current = false;
      }
    },
    [db, flushOutbox, isAuthenticated, refreshOutbox, roomId],
  );

  const scheduleRealtimeSync = useCallback(
    (delay = 150) => {
      if (realtimeSyncTimer.current) clearTimeout(realtimeSyncTimer.current);
      realtimeSyncTimer.current = setTimeout(() => {
        realtimeSyncTimer.current = null;
        void loadMessages(false);
      }, delay);
    },
    [loadMessages],
  );

  useFocusEffect(
    useCallback(() => {
      if (!isAuthenticated) {
        router.replace("/messenger/register");
        return;
      }
      void loadMessages(true);
      const unsubscribe = subscribeMessengerRealtime((event) => {
        if (
          event.type === "message.created" &&
          event.message.room_id === roomId
        ) {
          const message = event.message;
          setMessages((current) => {
            const withoutDuplicate = current.filter(
              (item) =>
                item.id !== message.id &&
                item.client_message_id !== message.client_message_id,
            );
            return [...withoutDuplicate, message].sort(
              (left, right) =>
                new Date(left.created_at).getTime() -
                new Date(right.created_at).getTime(),
            );
          });
          void cacheMessengerMessages(db, [message]);
          void Promise.all([
            markMessengerDelivered(roomId, message.sequence),
            markMessengerRead(roomId, message.sequence),
          ]).catch((error) =>
            console.warn(
              "[Messenger realtime] Не удалось подтвердить сообщение:",
              error,
            ),
          );
          scheduleRealtimeSync();
          requestAnimationFrame(() =>
            listRef.current?.scrollToEnd({ animated: true }),
          );
        } else if (
          event.type === "sync.required" ||
          event.type === "connection.ready" ||
          ((event.type === "message.receipt_updated" ||
            event.type === "message.reaction_updated") &&
            event.room_id === roomId)
        ) {
          scheduleRealtimeSync(0);
        }
      });
      // Reconciliation is intentionally infrequent: Socket.IO performs normal
      // foreground delivery, while this timer protects against a lost event.
      const timer = setInterval(() => void loadMessages(false), 30_000);
      return () => {
        unsubscribe();
        clearInterval(timer);
        if (realtimeSyncTimer.current) {
          clearTimeout(realtimeSyncTimer.current);
          realtimeSyncTimer.current = null;
        }
      };
    }, [
      db,
      isAuthenticated,
      loadMessages,
      roomId,
      router,
      scheduleRealtimeSync,
    ]),
  );

  const send = async () => {
    const body = text.trim();
    if (!body || !roomId || !session || sending) return;
    setSending(true);
    const clientMessageId = Crypto.randomUUID();
    const createdAt = new Date().toISOString();
    try {
      await enqueueMessengerText(db, {
        client_message_id: clientMessageId,
        room_id: roomId,
        text: body,
        reply_to_message_id: replyingTo?.id || null,
        created_at: createdAt,
      });
      setText("");
      setReplyingTo(null);
      await refreshOutbox();
      requestAnimationFrame(() =>
        listRef.current?.scrollToEnd({ animated: true }),
      );
      try {
        await flushOutbox();
        await loadMessages(true);
      } catch {
        setOffline(true);
      }
    } finally {
      setSending(false);
    }
  };

  const toggleReaction = async (
    message: MessengerMessage,
    reaction: string,
  ) => {
    if (!canReact || message.pending || reactionBusy) return;
    setReactionBusy(true);
    try {
      const selected = message.reactions.some(
        (item) => item.reaction === reaction && item.reacted_by_me,
      );
      const result = selected
        ? await removeMessengerReaction(message.id)
        : await setMessengerReaction(message.id, reaction);
      setMessages((current) =>
        current.map((item) =>
          item.id === message.id
            ? { ...item, reactions: result.reactions }
            : item,
        ),
      );
      setActionMessage(null);
    } catch (error) {
      console.warn("[Messenger] Не удалось изменить реакцию:", error);
    } finally {
      setReactionBusy(false);
    }
  };

  const beginReply = (message: MessengerMessage) => {
    if (!canWrite || message.pending) return;
    setReplyingTo(message);
    setActionMessage(null);
  };

  const replyPreview = (reply: MessengerReply): string => {
    if (reply.deleted_at) return "Сообщение удалено";
    if (reply.text) return reply.text;
    if (reply.kind === "image") return "Фото";
    if (reply.kind === "video") return "Видео";
    return "Сообщение";
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => router.back()}
          >
            <Icon name="chevron-back" size={28} color={colors.primary} />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.title} numberOfLines={1}>
              {params.title || "Чат"}
            </Text>
            <Text style={styles.subtitle}>
              {offline ? "Нет сети · сообщения сохранены" : "В сети"}
            </Text>
          </View>
        </View>

        <ImageBackground
          source={require("../../../assets/messenger/ice-chat-background.jpg")}
          style={styles.iceBackground}
          imageStyle={styles.iceBackgroundImage}
          resizeMode="cover"
        >
          <FlatList
            ref={listRef}
            data={visibleMessages}
            keyExtractor={(message) => message.id}
            contentContainerStyle={
              visibleMessages.length ? styles.messageList : styles.emptyList
            }
            onContentSizeChange={() => {
              if (visibleMessages.length)
                listRef.current?.scrollToEnd({ animated: false });
            }}
            renderItem={({ item }) => {
              const mine = item.author.id === session?.user.id;
              const body = item.deleted_at
                ? "Сообщение удалено"
                : item.text ||
                  (item.kind === "image"
                    ? "Фото"
                    : item.kind === "video"
                      ? "Видео"
                      : "");
              return (
                <View
                  style={[
                    styles.messageRow,
                    mine ? styles.messageRowMine : styles.messageRowTheirs,
                  ]}
                >
                  {!mine && (
                    <AuthenticatedAvatar
                      displayName={item.author.display_name}
                      avatarUrl={item.author.avatar_url}
                      accessToken={session?.access_token}
                      size={34}
                    />
                  )}
                  <View
                    style={[
                      styles.messageColumn,
                      mine && styles.messageColumnMine,
                    ]}
                  >
                    <TouchableOpacity
                      activeOpacity={0.94}
                      delayLongPress={250}
                      onLongPress={() =>
                        !item.pending && setActionMessage(item)
                      }
                      style={[
                        styles.message,
                        mine ? styles.mine : styles.theirs,
                      ]}
                      accessibilityHint="Удерживайте, чтобы ответить или поставить реакцию"
                    >
                      <View
                        style={mine ? styles.mineTail : styles.theirsTail}
                      />
                      {item.reply_to && (
                        <View style={styles.replyQuote}>
                          <Text style={styles.replyAuthor} numberOfLines={1}>
                            {item.reply_to.author.display_name}
                          </Text>
                          <Text style={styles.replyText} numberOfLines={1}>
                            {replyPreview(item.reply_to)}
                          </Text>
                        </View>
                      )}
                      {!mine && (
                        <Text style={styles.author} numberOfLines={1}>
                          {item.author.display_name}
                        </Text>
                      )}
                      <Text style={styles.messageText}>{body}</Text>
                      <View style={styles.messageMeta}>
                        <Text style={styles.time}>
                          {new Date(item.created_at).toLocaleTimeString(
                            "ru-RU",
                            { hour: "2-digit", minute: "2-digit" },
                          )}
                        </Text>
                        {mine && <DeliveryChecks message={item} />}
                      </View>
                    </TouchableOpacity>
                    {item.reactions.length > 0 && (
                      <View
                        style={[
                          styles.reactionSummary,
                          mine && styles.reactionSummaryMine,
                        ]}
                      >
                        {item.reactions.map((reaction) => (
                          <TouchableOpacity
                            key={reaction.reaction}
                            style={[
                              styles.reactionChip,
                              reaction.reacted_by_me &&
                                styles.reactionChipSelected,
                            ]}
                            onPress={() =>
                              void toggleReaction(item, reaction.reaction)
                            }
                            disabled={!canReact || reactionBusy}
                          >
                            <Text style={styles.reactionText}>
                              {reaction.reaction} {reaction.count}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Icon
                  name="chatbox-ellipses-outline"
                  size={56}
                  color={colors.textSecondary}
                />
                <Text style={styles.emptyTitle}>Начните общение</Text>
              </View>
            }
          />
        </ImageBackground>

        <Modal
          visible={Boolean(actionMessage)}
          transparent
          animationType="fade"
          onRequestClose={() => setActionMessage(null)}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setActionMessage(null)}
          >
            <Pressable
              style={styles.actionSheet}
              onPress={(event) => event.stopPropagation()}
            >
              <Text style={styles.actionTitle}>Действия с сообщением</Text>
              {canReact && actionMessage && (
                <View style={styles.reactionPicker}>
                  {["👍", "❤️", "😂", "😮", "😢", "👏", "🏒"].map(
                    (reaction) => (
                      <TouchableOpacity
                        key={reaction}
                        style={styles.reactionButton}
                        onPress={() =>
                          void toggleReaction(actionMessage, reaction)
                        }
                        disabled={reactionBusy}
                      >
                        <Text style={styles.reactionButtonText}>
                          {reaction}
                        </Text>
                      </TouchableOpacity>
                    ),
                  )}
                </View>
              )}
              {canWrite && actionMessage && (
                <TouchableOpacity
                  style={styles.replyAction}
                  onPress={() => beginReply(actionMessage)}
                >
                  <Icon name="arrow-undo" size={21} color={colors.primary} />
                  <Text style={styles.replyActionText}>Ответить</Text>
                </TouchableOpacity>
              )}
            </Pressable>
          </Pressable>
        </Modal>

        {canWrite ? (
          <View style={styles.composerShell}>
            {replyingTo && (
              <View style={styles.replyComposer}>
                <View style={styles.replyComposerText}>
                  <Text style={styles.replyAuthor} numberOfLines={1}>
                    {replyingTo.author.display_name}
                  </Text>
                  <Text style={styles.replyText} numberOfLines={1}>
                    {replyingTo.deleted_at
                      ? "Сообщение удалено"
                      : replyingTo.text || "Сообщение"}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.cancelReply}
                  onPress={() => setReplyingTo(null)}
                  accessibilityLabel="Отменить ответ"
                >
                  <Icon name="close" size={21} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            )}
            <View style={styles.composer}>
              <TextInput
                style={styles.input}
                value={text}
                onChangeText={setText}
                placeholder="Сообщение"
                multiline
                maxLength={4000}
              />
              <TouchableOpacity
                style={[
                  styles.sendButton,
                  (!text.trim() || sending) && styles.sendButtonDisabled,
                ]}
                onPress={send}
                disabled={!text.trim() || sending}
              >
                {sending ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Icon name="send" size={23} color={colors.white} />
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.readOnly}>
            <Text style={styles.readOnlyText}>
              В этом чате вы можете только читать сообщения
            </Text>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.backgroundAlt },
  flex: { flex: 1 },
  iceBackground: { flex: 1 },
  iceBackgroundImage: { opacity: 0.86 },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
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
  title: { fontSize: 19, fontWeight: "800", color: colors.text },
  subtitle: { marginTop: 2, fontSize: 12, color: colors.textSecondary },
  messageList: { padding: 14, paddingBottom: 20 },
  emptyList: { flexGrow: 1, justifyContent: "center" },
  messageRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 7,
    marginBottom: 9,
  },
  messageRowMine: { justifyContent: "flex-end" },
  messageRowTheirs: { justifyContent: "flex-start" },
  messageColumn: { maxWidth: "79%", alignItems: "flex-start" },
  messageColumnMine: { alignItems: "flex-end" },
  message: {
    position: "relative",
    paddingHorizontal: 13,
    paddingTop: 9,
    paddingBottom: 6,
    borderWidth: 1,
  },
  mine: {
    borderRadius: 16,
    borderBottomRightRadius: 4,
    borderColor: "#B8D3EC",
    backgroundColor: "#D9EBFB",
  },
  theirs: {
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    borderColor: "#D5E1E9",
    backgroundColor: "#FCFEFF",
  },
  mineTail: {
    position: "absolute",
    right: -8,
    bottom: -1,
    width: 0,
    height: 0,
    borderStyle: "solid",
    borderTopWidth: 9,
    borderBottomWidth: 0,
    borderLeftWidth: 8,
    borderRightWidth: 0,
    borderTopColor: "#D9EBFB",
    borderLeftColor: "transparent",
  },
  theirsTail: {
    position: "absolute",
    left: -8,
    bottom: -1,
    width: 0,
    height: 0,
    borderStyle: "solid",
    borderTopWidth: 9,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: 8,
    borderTopColor: "#FCFEFF",
    borderRightColor: "transparent",
  },
  author: {
    marginBottom: 3,
    color: colors.accent,
    fontSize: 12,
    fontWeight: "800",
  },
  messageText: { color: colors.text, fontSize: 15, lineHeight: 20 },
  replyQuote: {
    minWidth: 130,
    marginBottom: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    borderRadius: 6,
    backgroundColor: "rgba(74, 144, 226, 0.10)",
  },
  replyAuthor: { color: colors.accent, fontSize: 12, fontWeight: "800" },
  replyText: { color: colors.textSecondary, fontSize: 12 },
  messageMeta: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  time: { color: colors.textSecondary, fontSize: 10 },
  pendingCheck: { fontSize: 12, fontWeight: "800" },
  checkPair: { position: "relative", width: 15, height: 13 },
  checkMark: {
    position: "absolute",
    top: -1,
    fontSize: 12,
    fontWeight: "900",
  },
  checkOne: { left: 0 },
  checkTwo: { left: 5 },
  reactionSummary: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 4,
  },
  reactionSummaryMine: { justifyContent: "flex-end" },
  reactionChip: {
    minHeight: 28,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#C7DBF3",
    borderRadius: 14,
    backgroundColor: "rgba(255, 255, 255, 0.94)",
  },
  reactionChipSelected: {
    borderColor: colors.accent,
    backgroundColor: "#D9EBFB",
  },
  reactionText: { color: colors.text, fontSize: 12, fontWeight: "700" },
  composerShell: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    padding: 10,
  },
  replyComposer: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 10,
    marginTop: 8,
    paddingVertical: 7,
    paddingLeft: 10,
    paddingRight: 5,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    borderRadius: 8,
    backgroundColor: "#EAF3FF",
  },
  replyComposerText: { flex: 1, minWidth: 0 },
  cancelReply: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 46,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    color: colors.text,
    backgroundColor: colors.backgroundAlt,
  },
  sendButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
    backgroundColor: colors.primary,
  },
  sendButtonDisabled: { opacity: 0.45 },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    padding: 14,
    backgroundColor: "rgba(16, 40, 68, 0.38)",
  },
  actionSheet: {
    padding: 16,
    borderRadius: 20,
    backgroundColor: colors.surface,
  },
  actionTitle: {
    marginBottom: 13,
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  reactionPicker: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 4,
    marginBottom: 12,
  },
  reactionButton: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: colors.backgroundAlt,
  },
  reactionButtonText: { fontSize: 23 },
  replyAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    minHeight: 46,
    paddingHorizontal: 12,
    borderRadius: 13,
    backgroundColor: "#EAF3FF",
  },
  replyActionText: { color: colors.primary, fontWeight: "800" },
  readOnly: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  readOnlyText: { color: colors.textSecondary, textAlign: "center" },
  empty: { alignItems: "center", padding: 32 },
  emptyTitle: {
    marginTop: 14,
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
});
