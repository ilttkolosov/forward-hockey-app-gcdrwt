import * as Crypto from "expo-crypto";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "../../../components/Icon";
import { useMessengerAuth } from "../../../contexts/MessengerAuthContext";
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
  MessengerUser,
} from "../../../features/messenger/types";
import {
  getMessengerMessages,
  markMessengerDelivered,
  markMessengerRead,
  sendMessengerText,
} from "../../../services/messengerApi";
import { subscribeMessengerRealtime } from "../../../services/messengerRealtime";
import { colors } from "../../../styles/commonStyles";

function pendingMessage(
  item: MessengerOutboxItem,
  currentUser: MessengerUser,
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

export default function MessengerRoomScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{
    id: string;
    title?: string;
    canWrite?: string;
  }>();
  const { session, isAuthenticated } = useMessengerAuth();
  const roomId = params.id;
  const canWrite = params.canWrite !== "false";
  const [messages, setMessages] = useState<MessengerMessage[]>([]);
  const [outbox, setOutbox] = useState<MessengerOutboxItem[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [offline, setOffline] = useState(false);
  const listRef = useRef<FlatList<MessengerMessage>>(null);
  const refreshRunning = useRef(false);
  const flushRunning = useRef(false);
  const realtimeSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const visibleMessages = useMemo(() => {
    const pending = session
      ? outbox.map((item) => pendingMessage(item, session.user))
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
      if (realtimeSyncTimer.current)
        clearTimeout(realtimeSyncTimer.current);
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
    }, [db, isAuthenticated, loadMessages, roomId, router, scheduleRealtimeSync]),
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
        created_at: createdAt,
      });
      setText("");
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

  const deliveryLabel = (message: MessengerMessage) => {
    if (message.pending)
      return {
        symbol: "◷",
        color: colors.textSecondary,
        label: "Ожидает отправки",
      };
    if (message.delivery.status === "read")
      return { symbol: "✓✓", color: colors.accent, label: "Прочитано" };
    if (message.delivery.status === "delivered")
      return { symbol: "✓✓", color: colors.textSecondary, label: "Доставлено" };
    return { symbol: "✓", color: colors.textSecondary, label: "Отправлено" };
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
            const delivery = deliveryLabel(item);
            return (
              <View
                style={[styles.message, mine ? styles.mine : styles.theirs]}
              >
                {!mine && (
                  <Text style={styles.author}>{item.author.display_name}</Text>
                )}
                <Text style={styles.messageText}>
                  {item.deleted_at ? "Сообщение удалено" : item.text}
                </Text>
                <View style={styles.messageMeta}>
                  <Text style={styles.time}>
                    {new Date(item.created_at).toLocaleTimeString("ru-RU", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                  {mine && (
                    <Text
                      style={[styles.checks, { color: delivery.color }]}
                      accessibilityLabel={delivery.label}
                    >
                      {delivery.symbol}
                    </Text>
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

        {canWrite ? (
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
  message: {
    maxWidth: "82%",
    marginBottom: 8,
    paddingHorizontal: 13,
    paddingTop: 9,
    paddingBottom: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mine: {
    alignSelf: "flex-end",
    borderRadius: 16,
    borderBottomRightRadius: 4,
    backgroundColor: "#EAF3FF",
  },
  theirs: {
    alignSelf: "flex-start",
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    backgroundColor: colors.surface,
  },
  author: {
    marginBottom: 3,
    color: colors.accent,
    fontSize: 12,
    fontWeight: "800",
  },
  messageText: { color: colors.text, fontSize: 15, lineHeight: 20 },
  messageMeta: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  time: { color: colors.textSecondary, fontSize: 10 },
  checks: { fontSize: 12, fontWeight: "800" },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
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
