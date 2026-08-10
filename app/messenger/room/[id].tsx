import * as Crypto from "expo-crypto";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import Svg, { Path } from "react-native-svg";
import Icon from "../../../components/Icon";
import { useMessengerAuth } from "../../../contexts/MessengerAuthContext";
import AuthenticatedAvatar from "../../../features/messenger/AuthenticatedAvatar";
import MessengerAttachmentView from "../../../features/messenger/MessengerAttachmentView";
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
  isMessengerConnectionError,
  markMessengerRead,
  messengerErrorMessage,
  removeMessengerReaction,
  sendMessengerLocation,
  sendMessengerMedia,
  sendMessengerText,
  setMessengerReaction,
} from "../../../services/messengerApi";
import { subscribeMessengerRealtime } from "../../../services/messengerRealtime";
import { messengerLog } from "../../../services/messengerLogger";
import {
  currentMessengerLocation,
  pickMessengerFile,
  pickMessengerMedia,
  takeMessengerPhoto,
  type MessengerUploadFile,
} from "../../../services/messengerAttachmentPicker";
import { seedMessengerMediaCache } from "../../../services/messengerMediaCache";
import { colors } from "../../../styles/commonStyles";

type MessengerAttachmentKind = "camera" | "library" | "file" | "location";

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
    location: null,
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

function MessageTail({ mine }: { mine: boolean }) {
  return (
    <Svg
      width={14}
      height={16}
      viewBox="0 0 14 16"
      style={mine ? styles.mineTail : styles.theirsTail}
      pointerEvents="none"
    >
      <Path
        d={
          mine
            ? "M1 0 C2 7 5 12 13 15 C8 15 3 13 0 10 Z"
            : "M13 0 C12 7 9 12 1 15 C6 15 11 13 14 10 Z"
        }
        fill={mine ? "#D9EBFB" : "#FCFEFF"}
      />
    </Svg>
  );
}

function isEmojiOnly(value: string): boolean {
  const compact = value.replace(/\s/g, "");
  if (!compact || compact.length > 32) return false;
  return (
    !/[A-Za-zА-Яа-яЁё0-9]/.test(compact) &&
    /\p{Extended_Pictographic}/u.test(compact)
  );
}

function logMessageCacheFailure(
  message: MessengerMessage,
  error: unknown,
): void {
  const errorMessage =
    error instanceof Error ? error.message : "Не удалось записать сообщение";
  console.warn(
    `[Messenger] Сообщение ${message.id} доставлено, но не записано в локальный кэш:`,
    error,
  );
  messengerLog("warn", "message.cache.write_failed", {
    room_id: message.room_id,
    message_id: message.id,
    message: errorMessage,
  });
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
    canMedia?: string;
    canReact?: string;
  }>();
  const { session, isAuthenticated } = useMessengerAuth();
  const roomId = params.id;
  const canWrite = params.canWrite !== "false";
  const canMedia = params.canMedia !== "false";
  const canReact = params.canReact !== "false";
  const [messages, setMessages] = useState<MessengerMessage[]>([]);
  const [outbox, setOutbox] = useState<MessengerOutboxItem[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [offline, setOffline] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<MessengerMessage | null>(null);
  const [actionMessage, setActionMessage] = useState<MessengerMessage | null>(
    null,
  );
  const [reactionBusy, setReactionBusy] = useState(false);
  const [attachmentMenuVisible, setAttachmentMenuVisible] = useState(false);
  const listRef = useRef<FlatList<MessengerMessage>>(null);
  const refreshRunning = useRef(false);
  const flushRunning = useRef(false);
  const realtimeSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attachmentLaunchTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const pendingAttachmentKind = useRef<MessengerAttachmentKind | null>(null);
  const pendingScrollAnimation = useRef<boolean | null>(null);
  const acknowledgedRead = useRef<{
    room_id: string;
    sequence: string;
  } | null>(null);

  const scrollToLatest = useCallback((animated: boolean) => {
    pendingScrollAnimation.current = animated;
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated }));
  }, []);

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
    let firstError: unknown = null;
    try {
      const pending = await loadMessengerOutbox(db, roomId);
      messengerLog("debug", "outbox.flush.started", {
        room_id: roomId,
        pending_count: pending.length,
      });
      for (const item of pending) {
        try {
          messengerLog("debug", "outbox.item.sending", {
            room_id: item.room_id,
            client_message_id: item.client_message_id,
            attempts: item.attempts,
            has_reply: Boolean(item.reply_to_message_id),
          });
          const result = await sendMessengerText(
            item.room_id,
            item.client_message_id,
            item.text,
            item.reply_to_message_id,
          );
          try {
            await cacheMessengerMessages(db, [result.message]);
          } catch (cacheError) {
            logMessageCacheFailure(result.message, cacheError);
          }
          await removeMessengerOutboxItem(db, item.client_message_id);
          console.log(
            `[Messenger] Сообщение ${item.client_message_id} отправлено из outbox`,
          );
          messengerLog("info", "outbox.item.sent", {
            room_id: item.room_id,
            client_message_id: item.client_message_id,
            message_id: result.message.id,
            created: result.created,
          });
        } catch (error) {
          await markMessengerOutboxFailure(db, item.client_message_id, error);
          firstError ??= error;
          console.warn(
            `[Messenger] Не удалось отправить outbox ${item.client_message_id}:`,
            error,
          );
          messengerLog("warn", "outbox.item.failed", {
            room_id: item.room_id,
            client_message_id: item.client_message_id,
            category: isMessengerConnectionError(error)
              ? "connection"
              : "server",
            message: messengerErrorMessage(error),
          });
          // A rejected message must not block every message queued after it.
          // On a real connection failure further attempts would only add delay.
          if (isMessengerConnectionError(error)) break;
        }
      }
      await refreshOutbox();
      messengerLog(firstError ? "warn" : "debug", "outbox.flush.finished", {
        room_id: roomId,
        failed: Boolean(firstError),
      });
      if (firstError) throw firstError;
    } finally {
      flushRunning.current = false;
    }
  }, [db, isAuthenticated, refreshOutbox, roomId]);

  const acknowledgeLatest = useCallback(
    async (sequence: string) => {
      if (
        acknowledgedRead.current?.room_id === roomId &&
        acknowledgedRead.current.sequence === sequence
      ) {
        return;
      }
      acknowledgedRead.current = { room_id: roomId, sequence };
      try {
        // Reading a room also advances its delivered cursor on the server, so
        // a separate /delivered request would only duplicate the same work.
        await markMessengerRead(roomId, sequence);
      } catch (error) {
        if (
          acknowledgedRead.current?.room_id === roomId &&
          acknowledgedRead.current.sequence === sequence
        ) {
          acknowledgedRead.current = null;
        }
        throw error;
      }
    },
    [roomId],
  );

  const loadMessages = useCallback(
    async (scroll = false) => {
      if (!roomId || refreshRunning.current || !isAuthenticated) return;
      refreshRunning.current = true;
      const startedAt = Date.now();
      messengerLog("debug", "room.sync.started", {
        room_id: roomId,
        scroll,
      });
      try {
        const cached = await loadCachedMessengerMessages(db, roomId);
        if (cached.length) {
          if (scroll) pendingScrollAnimation.current = false;
          setMessages(cached);
          setLoading(false);
          messengerLog("debug", "room.cache.loaded", {
            room_id: roomId,
            message_count: cached.length,
          });
        }
        await refreshOutbox();
        let outboxError: unknown = null;
        try {
          await flushOutbox();
        } catch (error) {
          outboxError = error;
          setOffline(isMessengerConnectionError(error));
          setSyncError(
            messengerErrorMessage(error, "Не удалось отправить сообщение"),
          );
        }
        const remote = await getMessengerMessages(roomId);
        if (scroll) pendingScrollAnimation.current = false;
        setMessages(remote.items);
        await cacheMessengerMessages(db, remote.items);
        const latestSequence = remote.page.latest_sequence;
        if (latestSequence) {
          await acknowledgeLatest(latestSequence);
        }
        setOffline(false);
        if (!outboxError) setSyncError(null);
        messengerLog("info", "room.sync.completed", {
          room_id: roomId,
          message_count: remote.items.length,
          latest_sequence: latestSequence,
          outbox_error: Boolean(outboxError),
          duration_ms: Date.now() - startedAt,
        });
        if (scroll) scrollToLatest(false);
      } catch (error) {
        setOffline(isMessengerConnectionError(error));
        setSyncError(
          messengerErrorMessage(error, "Не удалось обновить сообщения"),
        );
        console.warn("[Messenger] Показан локальный кэш комнаты:", error);
        messengerLog("warn", "room.sync.failed", {
          room_id: roomId,
          category: isMessengerConnectionError(error) ? "connection" : "server",
          message: messengerErrorMessage(error),
          duration_ms: Date.now() - startedAt,
        });
      } finally {
        setLoading(false);
        refreshRunning.current = false;
      }
    },
    [
      acknowledgeLatest,
      db,
      flushOutbox,
      isAuthenticated,
      refreshOutbox,
      roomId,
      scrollToLatest,
    ],
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
          pendingScrollAnimation.current = true;
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
          void cacheMessengerMessages(db, [message]).catch((cacheError) =>
            logMessageCacheFailure(message, cacheError),
          );
          void acknowledgeLatest(message.sequence).catch((error) =>
            console.warn(
              "[Messenger realtime] Не удалось подтвердить сообщение:",
              error,
            ),
          );
          scheduleRealtimeSync();
          scrollToLatest(true);
        } else if (
          event.type === "message.receipt_updated" &&
          event.room_id === roomId
        ) {
          // Our own read acknowledgement is echoed through Socket.IO. It does
          // not change this screen and must not start a REST/realtime loop.
          if (event.recipient_user_id !== session?.user.id) {
            scheduleRealtimeSync(100);
          }
        } else if (
          event.type === "sync.required" ||
          event.type === "connection.ready" ||
          (event.type === "message.reaction_updated" &&
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
        if (attachmentLaunchTimer.current) {
          clearTimeout(attachmentLaunchTimer.current);
          attachmentLaunchTimer.current = null;
        }
        pendingAttachmentKind.current = null;
      };
    }, [
      db,
      acknowledgeLatest,
      isAuthenticated,
      loadMessages,
      roomId,
      router,
      scheduleRealtimeSync,
      session?.user.id,
      scrollToLatest,
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
      messengerLog("info", "message.queued", {
        room_id: roomId,
        client_message_id: clientMessageId,
        has_reply: Boolean(replyingTo?.id),
      });
      setText("");
      setReplyingTo(null);
      pendingScrollAnimation.current = true;
      await refreshOutbox();
      scrollToLatest(true);
      await loadMessages(false);
    } finally {
      setSending(false);
    }
  };

  const storeSentMessage = useCallback(
    async (message: MessengerMessage) => {
      pendingScrollAnimation.current = true;
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
      try {
        await cacheMessengerMessages(db, [message]);
      } catch (cacheError) {
        // The server has already accepted the message. A local cache failure
        // must not turn a successful send into a misleading error alert.
        logMessageCacheFailure(message, cacheError);
      }
      scrollToLatest(true);
    },
    [db, scrollToLatest],
  );

  const sendUpload = useCallback(
    async (file: MessengerUploadFile) => {
      if (!roomId || !session || sending || !canMedia) return;
      setSending(true);
      setAttachmentMenuVisible(false);
      const clientMessageId = Crypto.randomUUID();
      messengerLog("info", "media.upload.started", {
        room_id: roomId,
        client_message_id: clientMessageId,
        media_type: file.kind,
        mime_type: file.type,
        upload_size_bytes: file.size_bytes,
        upload_size_kb:
          file.size_bytes === null ? null : Math.round(file.size_bytes / 1024),
        original_size_bytes: file.original_size_bytes,
        image_width: file.width,
        image_height: file.height,
        has_caption: Boolean(text.trim()),
      });
      try {
        const result = await sendMessengerMedia(
          roomId,
          clientMessageId,
          file,
          text,
          replyingTo?.id,
        );
        await storeSentMessage(result.message);
        if (result.message.media) {
          void seedMessengerMediaCache(result.message.media, file.uri).catch(
            (cacheError) =>
              messengerLog("warn", "media.cache.seed_failed", {
                asset_id: result.message.media?.id,
                message:
                  cacheError instanceof Error
                    ? cacheError.message
                    : "Не удалось сохранить локальную копию",
              }),
          );
        }
        setText("");
        setReplyingTo(null);
        setOffline(false);
        setSyncError(null);
        messengerLog("info", "media.upload.completed", {
          room_id: roomId,
          message_id: result.message.id,
          media_type: result.message.media?.type,
          stored_size_bytes: result.message.media?.size_bytes,
          stored_size_kb: result.message.media?.size_bytes
            ? Math.round(result.message.media.size_bytes / 1024)
            : null,
        });
      } catch (error) {
        setOffline(isMessengerConnectionError(error));
        const message = messengerErrorMessage(
          error,
          "Не удалось отправить вложение",
        );
        setSyncError(message);
        messengerLog("warn", "media.upload.failed", {
          room_id: roomId,
          client_message_id: clientMessageId,
          media_type: file.kind,
          message,
        });
        Alert.alert("Вложение не отправлено", message);
      } finally {
        setSending(false);
      }
    },
    [
      canMedia,
      replyingTo?.id,
      roomId,
      sending,
      session,
      storeSentMessage,
      text,
    ],
  );

  const chooseAttachment = useCallback(
    async (kind: MessengerAttachmentKind) => {
      if (sending) {
        messengerLog("debug", "attachment.action.skipped", {
          kind,
          room_id: roomId,
          reason: "sending",
        });
        return;
      }
      let requestStarted = false;
      setAttachmentMenuVisible(false);
      messengerLog("debug", "attachment.action.started", {
        kind,
        room_id: roomId,
      });
      try {
        if (kind === "location") {
          setSending(true);
          const location = await currentMessengerLocation();
          const clientMessageId = Crypto.randomUUID();
          messengerLog("info", "location.send.started", {
            room_id: roomId,
            client_message_id: clientMessageId,
          });
          requestStarted = true;
          const result = await sendMessengerLocation(
            roomId,
            clientMessageId,
            location,
            replyingTo?.id,
          );
          await storeSentMessage(result.message);
          messengerLog("info", "location.send.completed", {
            room_id: roomId,
            message_id: result.message.id,
            latitude: result.message.location?.latitude,
            longitude: result.message.location?.longitude,
          });
          setReplyingTo(null);
          setOffline(false);
          setSyncError(null);
          return;
        }
        const file =
          kind === "camera"
            ? await takeMessengerPhoto()
            : kind === "library"
              ? await pickMessengerMedia()
              : await pickMessengerFile();
        if (file) {
          messengerLog("debug", "attachment.action.prepared", {
            kind,
            room_id: roomId,
            media_type: file.kind,
            size_bytes: file.size_bytes,
          });
          await sendUpload(file);
        } else {
          messengerLog("debug", "attachment.action.canceled", {
            kind,
            room_id: roomId,
          });
        }
      } catch (error) {
        const message = messengerErrorMessage(
          error,
          kind === "location"
            ? "Не удалось отправить геопозицию"
            : "Не удалось подготовить вложение",
        );
        if (requestStarted) setOffline(isMessengerConnectionError(error));
        setSyncError(message);
        messengerLog("warn", "attachment.action.failed", { kind, message });
        Alert.alert(
          kind === "location" ? "Геопозиция не отправлена" : "Ошибка вложения",
          message,
        );
      } finally {
        if (kind === "location") setSending(false);
      }
    },
    [replyingTo?.id, roomId, sendUpload, sending, storeSentMessage],
  );

  const runPendingAttachment = useCallback(() => {
    if (attachmentLaunchTimer.current) {
      clearTimeout(attachmentLaunchTimer.current);
      attachmentLaunchTimer.current = null;
    }
    const kind = pendingAttachmentKind.current;
    if (!kind) return;
    pendingAttachmentKind.current = null;
    void chooseAttachment(kind);
  }, [chooseAttachment]);

  const queueAttachment = useCallback(
    (kind: MessengerAttachmentKind) => {
      if (sending) {
        messengerLog("debug", "attachment.action.skipped", {
          kind,
          room_id: roomId,
          reason: "sending",
        });
        return;
      }
      pendingAttachmentKind.current = kind;
      messengerLog("debug", "attachment.action.queued", {
        kind,
        room_id: roomId,
      });
      setAttachmentMenuVisible(false);
      if (Platform.OS === "web") {
        pendingAttachmentKind.current = null;
        void chooseAttachment(kind);
        return;
      }
      if (attachmentLaunchTimer.current) {
        clearTimeout(attachmentLaunchTimer.current);
      }
      // onDismiss is exact on iOS. Android has no onDismiss callback, while
      // the timeout also protects against an interrupted iOS dismissal.
      attachmentLaunchTimer.current = setTimeout(
        runPendingAttachment,
        Platform.OS === "ios" ? 700 : 350,
      );
    },
    [chooseAttachment, roomId, runPendingAttachment, sending],
  );

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
    if (reply.kind === "file") return "Файл";
    if (reply.kind === "location") return "Геопозиция";
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
              {offline
                ? "Нет сети · сообщения сохранены"
                : syncError
                  ? `Ошибка синхронизации: ${syncError}`
                  : "В сети"}
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
              if (!visibleMessages.length) return;
              const animated = pendingScrollAnimation.current;
              if (animated === null) return;
              pendingScrollAnimation.current = null;
              listRef.current?.scrollToEnd({ animated });
            }}
            renderItem={({ item }) => {
              const mine = item.author.id === session?.user.id;
              const media = item.deleted_at ? null : (item.media ?? null);
              const location = item.deleted_at ? null : (item.location ?? null);
              const body = item.deleted_at
                ? "Сообщение удалено"
                : item.text ||
                  (!media && !location
                    ? item.kind === "image"
                      ? "Фото"
                      : item.kind === "video"
                        ? "Видео"
                        : item.kind === "file"
                          ? "Файл"
                          : item.kind === "location"
                            ? "Геопозиция"
                            : ""
                    : "");
              const emojiOnly =
                !item.deleted_at && item.kind === "text" && isEmojiOnly(body);
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
                      size={40}
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
                      <MessageTail mine={mine} />
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
                      {(media || location) && session?.access_token && (
                        <MessengerAttachmentView
                          media={media}
                          location={location}
                          accessToken={session.access_token}
                        />
                      )}
                      {body ? (
                        <Text
                          style={[
                            styles.messageText,
                            emojiOnly && styles.emojiOnlyText,
                          ]}
                        >
                          {body}
                        </Text>
                      ) : null}
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

        <Modal
          visible={attachmentMenuVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setAttachmentMenuVisible(false)}
          onDismiss={runPendingAttachment}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setAttachmentMenuVisible(false)}
          >
            <Pressable
              style={styles.attachmentSheet}
              onPress={(event) => event.stopPropagation()}
            >
              <View style={styles.attachmentSheetHeader}>
                <Text style={styles.actionTitle}>Добавить вложение</Text>
                <TouchableOpacity
                  style={styles.attachmentClose}
                  onPress={() => setAttachmentMenuVisible(false)}
                >
                  <Icon name="close" size={23} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <View style={styles.attachmentGrid}>
                <TouchableOpacity
                  style={styles.attachmentAction}
                  onPress={() => queueAttachment("camera")}
                  disabled={sending}
                >
                  <View style={styles.attachmentActionIcon}>
                    <Icon name="camera" size={27} color={colors.white} />
                  </View>
                  <Text style={styles.attachmentActionText}>Камера</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.attachmentAction}
                  onPress={() => queueAttachment("library")}
                  disabled={sending}
                >
                  <View style={styles.attachmentActionIcon}>
                    <Icon name="images" size={27} color={colors.white} />
                  </View>
                  <Text style={styles.attachmentActionText}>Медиатека</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.attachmentAction}
                  onPress={() => queueAttachment("file")}
                  disabled={sending}
                >
                  <View style={styles.attachmentActionIcon}>
                    <Icon name="document" size={27} color={colors.white} />
                  </View>
                  <Text style={styles.attachmentActionText}>Файл</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.attachmentAction}
                  onPress={() => queueAttachment("location")}
                  disabled={sending}
                >
                  <View style={styles.attachmentActionIcon}>
                    <Icon name="location" size={27} color={colors.white} />
                  </View>
                  <Text style={styles.attachmentActionText}>Геопозиция</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.attachmentHint}>
                Фотографии автоматически уменьшаются до 1600 px и сжимаются
                перед отправкой.
              </Text>
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
                    {replyPreview({
                      id: replyingTo.id,
                      kind: replyingTo.kind,
                      text: replyingTo.text,
                      deleted_at: replyingTo.deleted_at,
                      author: {
                        id: replyingTo.author.id,
                        display_name: replyingTo.author.display_name,
                      },
                    })}
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
              {canMedia && (
                <TouchableOpacity
                  style={styles.attachButton}
                  onPress={() => setAttachmentMenuVisible(true)}
                  disabled={sending}
                  accessibilityLabel="Добавить вложение"
                >
                  <Icon name="add" size={30} color={colors.primary} />
                </TouchableOpacity>
              )}
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
  messageColumn: { maxWidth: "82%", alignItems: "flex-start" },
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
    right: -10,
    bottom: 0,
  },
  theirsTail: {
    position: "absolute",
    left: -10,
    bottom: 0,
  },
  author: {
    marginBottom: 3,
    color: colors.accent,
    fontSize: 12,
    fontWeight: "800",
  },
  messageText: { color: colors.text, fontSize: 15, lineHeight: 20 },
  emojiOnlyText: { fontSize: 38, lineHeight: 46 },
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
  attachButton: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 23,
    backgroundColor: "#EAF3FF",
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
  attachmentSheet: {
    padding: 16,
    paddingBottom: 20,
    borderRadius: 22,
    backgroundColor: colors.surface,
  },
  attachmentSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  attachmentClose: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  attachmentGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  attachmentAction: {
    width: "48%",
    minHeight: 96,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 16,
    backgroundColor: colors.backgroundAlt,
  },
  attachmentActionIcon: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 26,
    backgroundColor: colors.primary,
  },
  attachmentActionText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  attachmentHint: {
    marginTop: 14,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
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
