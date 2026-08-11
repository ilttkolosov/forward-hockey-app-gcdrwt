import * as Crypto from "expo-crypto";
import * as Clipboard from "expo-clipboard";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Animated,
  Alert,
  FlatList,
  ImageBackground,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type ViewToken,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import Icon from "../../../components/Icon";
import { useMessengerAuth } from "../../../contexts/MessengerAuthContext";
import AuthenticatedAvatar from "../../../features/messenger/AuthenticatedAvatar";
import {
  applyOptimisticReaction,
  compareMessengerSequence,
  firstUnreadMessengerMessage,
  lastReadMessengerMessage,
  mergeMessengerMessages,
  pendingMessengerMessage,
} from "../../../features/messenger/feed";
import MessageReceiptsModal from "../../../features/messenger/MessageReceiptsModal";
import MessengerAttachmentView from "../../../features/messenger/MessengerAttachmentView";
import {
  DEFAULT_QUICK_REACTIONS,
  loadQuickMessengerReactions,
  rememberQuickMessengerReaction,
  STANDARD_MESSENGER_REACTIONS,
} from "../../../features/messenger/reactions";
import {
  cacheMessengerMessages,
  enqueueMessengerText,
  isMessengerRoomHistoryComplete,
  loadCachedMessengerMessageBounds,
  loadCachedMessengerMessageWindow,
  loadCachedMessengerMessagesAfter,
  loadCachedMessengerMessagesBefore,
  loadCachedMessengerRoom,
  loadMessengerLocalReadState,
  loadMessengerOutbox,
  markMessengerOutboxFailure,
  markMessengerRoomHistoryComplete,
  removeMessengerOutboxItem,
  removeMessengerOutboxItems,
} from "../../../features/messenger/repository";
import type {
  MessengerContact,
  MessengerMessage,
  MessengerMessageReceipt,
  MessengerOutboxItem,
  MessengerReply,
  MessengerRoom,
} from "../../../features/messenger/types";
import {
  createMessengerDirectRoom,
  forwardMessengerMessage,
  getMessengerContacts,
  getMessengerMessageReceipts,
  getMessengerMessages,
  getMessengerRooms,
  isMessengerConnectionError,
  messengerErrorMessage,
  removeMessengerReaction,
  sendMessengerLocation,
  sendMessengerMedia,
  sendMessengerText,
  setMessengerReaction,
} from "../../../services/messengerApi";
import { queueMessengerReadReceipt } from "../../../services/messengerReadSync";
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
import { saveMessengerMediaToDevice } from "../../../services/messengerMediaSave";
import { colors } from "../../../styles/commonStyles";

type MessengerAttachmentKind = "camera" | "library" | "file" | "location";
type InitialAnchorMode = "read_anchor" | "unread_fallback" | "latest";

function SwipeableMessage({
  children,
  enabled,
  onReply,
  onLongPress,
}: {
  children: React.ReactNode;
  enabled: boolean;
  onReply: () => void;
  onLongPress: () => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const resetPosition = useCallback(() => {
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      speed: 24,
      bounciness: 5,
    }).start();
  }, [translateX]);
  const messageGesture = useMemo(
    () => {
      const swipe = Gesture.Pan()
        .enabled(enabled)
        .activeOffsetX(-10)
        .failOffsetY([-18, 18])
        .onUpdate((event) => {
          translateX.setValue(Math.max(-76, Math.min(0, event.translationX)));
        })
        .onEnd((event) => {
          if (event.translationX <= -48) onReply();
        })
        .onFinalize(resetPosition)
        .runOnJS(true);
      const hold = Gesture.LongPress()
        .minDuration(320)
        .maxDistance(12)
        .onStart(onLongPress)
        .runOnJS(true);
      return Gesture.Race(swipe, hold);
    },
    [enabled, onLongPress, onReply, resetPosition, translateX],
  );

  return (
    <View style={styles.swipeShell}>
      <View style={styles.swipeReplyCue} pointerEvents="none">
        <Icon name="arrow-undo" size={24} color={colors.white} />
      </View>
      <GestureDetector gesture={messageGesture}>
        <Animated.View style={{ transform: [{ translateX }] }}>
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
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
        style={[
          styles.pendingCheck,
          { color: message.send_error ? colors.error : colors.textSecondary },
        ]}
        accessibilityLabel={
          message.send_error ? "Ошибка отправки" : "Ожидает отправки"
        }
      >
        {message.send_error ? "!" : "◷"}
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

function UnreadDivider() {
  return (
    <View style={styles.unreadDivider}>
      <View style={styles.unreadDividerLine} />
      <Text style={styles.unreadDividerText}>Непрочитанные сообщения</Text>
      <View style={styles.unreadDividerLine} />
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
    lastReadSequence?: string;
    latestSequence?: string;
    unreadCount?: string;
  }>();
  const { session, isAuthenticated } = useMessengerAuth();
  const roomId = params.id;
  const canWrite = params.canWrite !== "false";
  const canMedia = params.canMedia !== "false";
  const canReact = params.canReact !== "false";
  const [messages, setMessages] = useState<MessengerMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [offline, setOffline] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<MessengerMessage | null>(null);
  const [actionMessage, setActionMessage] = useState<MessengerMessage | null>(
    null,
  );
  const [reactionBusyIds, setReactionBusyIds] = useState<Set<string>>(
    new Set(),
  );
  const [quickReactions, setQuickReactions] = useState<string[]>([
    ...DEFAULT_QUICK_REACTIONS,
  ]);
  const [showAllReactions, setShowAllReactions] = useState(false);
  const [attachmentMenuVisible, setAttachmentMenuVisible] = useState(false);
  const [forwardingMessage, setForwardingMessage] =
    useState<MessengerMessage | null>(null);
  const [forwardRooms, setForwardRooms] = useState<MessengerRoom[]>([]);
  const [forwardContacts, setForwardContacts] = useState<MessengerContact[]>(
    [],
  );
  const [forwardLoading, setForwardLoading] = useState(false);
  const [forwardBusy, setForwardBusy] = useState<string | null>(null);
  const [forwardError, setForwardError] = useState<string | null>(null);
  const [receiptMessage, setReceiptMessage] = useState<MessengerMessage | null>(
    null,
  );
  const [receipts, setReceipts] = useState<MessengerMessageReceipt[]>([]);
  const [receiptsLoading, setReceiptsLoading] = useState(false);
  const [receiptsError, setReceiptsError] = useState<string | null>(null);
  const [savingMessageId, setSavingMessageId] = useState<string | null>(null);
  const [listReady, setListReady] = useState(false);
  const [initialDataReady, setInitialDataReady] = useState(false);
  const [initialUnreadExpected, setInitialUnreadExpected] = useState(false);
  const [unreadMarkerClientId, setUnreadMarkerClientId] = useState<
    string | null
  >(null);
  const [feedHeight, setFeedHeight] = useState(0);
  const listRef = useRef<FlatList<MessengerMessage>>(null);
  const inputRef = useRef<TextInput>(null);
  const messagesRef = useRef<MessengerMessage[]>([]);
  const refreshRunning = useRef(false);
  const flushRunning = useRef(false);
  const flushRequested = useRef(false);
  const flushOutboxRef = useRef<() => Promise<void>>(async () => undefined);
  const olderMessagesLoading = useRef(false);
  const newerCachedMessagesLoading = useRef(false);
  const remoteHasMoreNewerMessages = useRef(true);
  const reactionMutationIds = useRef<Set<string>>(new Set());
  const connectionSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const lastRoomSyncFinishedAt = useRef(0);
  const attachmentLaunchTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const pendingAttachmentKind = useRef<MessengerAttachmentKind | null>(null);
  const actionDismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingMessageAction = useRef<
    | { type: "forward"; message: MessengerMessage }
    | { type: "receipts"; message: MessengerMessage }
    | null
  >(null);
  const pendingScrollAnimation = useRef<boolean | null>(null);
  const pendingInitialPosition = useRef(false);
  const initialPositionConfigured = useRef(false);
  const initialPositionAttempts = useRef(0);
  const initialAnchorClientId = useRef<string | null>(null);
  const initialAnchorMode = useRef<InitialAnchorMode>("latest");
  const initialAnchorSettling = useRef(false);
  const initialPositionStartedAt = useRef(0);
  const initialPositionRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const initialPositionFallbackTimer = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const nearLatest = useRef(true);
  const latestVisibleSequence = useRef<string | null>(null);
  const initialReadSequence = useRef(params.lastReadSequence || "0");
  const initialUnreadBoundarySequence = useRef(
    params.lastReadSequence || "0",
  );
  const initialUnreadExpectedRef = useRef(false);
  const initialReadAcknowledged = useRef(false);
  const latestKnownSequence = useRef<string | null>(null);
  const acknowledgedRead = useRef<{
    room_id: string;
    sequence: string;
  } | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    void loadQuickMessengerReactions().then(setQuickReactions);
  }, []);

  const scrollToLatest = useCallback((animated: boolean) => {
    pendingScrollAnimation.current = animated;
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated }));
  }, []);

  const visibleMessages = messages;
  const waitingForInitialUnread =
    initialUnreadExpected && !unreadMarkerClientId;

  const flushOutbox = useCallback(async () => {
    if (!isAuthenticated) return;
    if (flushRunning.current) {
      flushRequested.current = true;
      return;
    }
    flushRunning.current = true;
    let firstError: unknown = null;
    try {
      const attempted = new Set<string>();
      let stopForConnection = false;
      while (!stopForConnection) {
        const pending = (await loadMessengerOutbox(db, roomId)).filter(
          (item) => !attempted.has(item.client_message_id),
        );
        if (!pending.length) break;
        messengerLog("debug", "outbox.flush.started", {
          room_id: roomId,
          pending_count: pending.length,
        });
        for (const item of pending) {
          attempted.add(item.client_message_id);
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
            setMessages((current) =>
              mergeMessengerMessages(
                current,
                [result.message],
                reactionMutationIds.current,
              ),
            );
            try {
              await cacheMessengerMessages(db, [result.message]);
            } catch (cacheError) {
              logMessageCacheFailure(result.message, cacheError);
            }
            await removeMessengerOutboxItem(db, item.client_message_id);
            messengerLog("info", "outbox.item.sent", {
              room_id: item.room_id,
              client_message_id: item.client_message_id,
              message_id: result.message.id,
              created: result.created,
            });
          } catch (error) {
            await markMessengerOutboxFailure(db, item.client_message_id, error);
            firstError ??= error;
            const message = messengerErrorMessage(
              error,
              "Не удалось отправить сообщение",
            );
            setMessages((current) =>
              current.map((currentMessage) =>
                currentMessage.client_message_id === item.client_message_id
                  ? { ...currentMessage, pending: true, send_error: message }
                  : currentMessage,
              ),
            );
            messengerLog("warn", "outbox.item.failed", {
              room_id: item.room_id,
              client_message_id: item.client_message_id,
              category: isMessengerConnectionError(error)
                ? "connection"
                : "server",
              message,
            });
            if (isMessengerConnectionError(error)) {
              stopForConnection = true;
              break;
            }
          }
        }
      }
      messengerLog(firstError ? "warn" : "debug", "outbox.flush.finished", {
        room_id: roomId,
        failed: Boolean(firstError),
      });
      if (firstError) throw firstError;
    } finally {
      flushRunning.current = false;
      if (flushRequested.current && !firstError) {
        flushRequested.current = false;
        setTimeout(() => void flushOutboxRef.current(), 0);
      }
    }
  }, [db, isAuthenticated, roomId]);

  useEffect(() => {
    flushOutboxRef.current = flushOutbox;
  }, [flushOutbox]);

  const acknowledgeLatest = useCallback(
    async (sequence: string) => {
      if (
        acknowledgedRead.current?.room_id === roomId &&
        compareMessengerSequence(acknowledgedRead.current.sequence, sequence) >=
          0
      ) {
        return;
      }
      acknowledgedRead.current = { room_id: roomId, sequence };
      try {
        await queueMessengerReadReceipt(db, roomId, sequence, session?.user.id);
      } catch (error) {
        if (
          acknowledgedRead.current?.room_id === roomId &&
          acknowledgedRead.current.sequence === sequence
        ) {
          acknowledgedRead.current = null;
        }
        messengerLog("warn", "room.read.local_failed", {
          room_id: roomId,
          sequence,
          message: messengerErrorMessage(error),
        });
        throw error;
      }
    },
    [db, roomId, session?.user.id],
  );

  const loadOlderMessages = useCallback(async () => {
    if (
      !listReady ||
      olderMessagesLoading.current ||
      !messagesRef.current.length
    )
      return;
    const oldest = messagesRef.current.find((message) => !message.pending);
    if (!oldest) return;
    olderMessagesLoading.current = true;
    try {
      const cached = await loadCachedMessengerMessagesBefore(
        db,
        roomId,
        oldest.sequence,
        20,
      );
      if (cached.length) {
        setMessages((current) =>
          mergeMessengerMessages(current, cached, reactionMutationIds.current),
        );
        return;
      }
      if (await isMessengerRoomHistoryComplete(db, roomId)) return;
      const remote = await getMessengerMessages(roomId, {
        cursor: oldest.sequence,
        direction: "before",
        limit: 20,
      });
      if (remote.items.length) {
        await cacheMessengerMessages(db, remote.items);
        setMessages((current) =>
          mergeMessengerMessages(
            current,
            remote.items,
            reactionMutationIds.current,
          ),
        );
      }
      if (!remote.page.has_more) {
        await markMessengerRoomHistoryComplete(db, roomId);
      }
    } catch (error) {
      messengerLog("warn", "room.history.page_failed", {
        room_id: roomId,
        message: messengerErrorMessage(error),
      });
    } finally {
      olderMessagesLoading.current = false;
    }
  }, [db, listReady, roomId]);

  const loadNewerMessages = useCallback(async () => {
    if (
      !listReady ||
      newerCachedMessagesLoading.current ||
      refreshRunning.current
    ) {
      return;
    }
    const latest = [...messagesRef.current]
      .reverse()
      .find((message) => !message.pending);
    if (!latest) return;
    newerCachedMessagesLoading.current = true;
    try {
      const cached = await loadCachedMessengerMessagesAfter(
        db,
        roomId,
        latest.sequence,
        20,
      );
      if (cached.length) {
        setMessages((current) =>
          mergeMessengerMessages(current, cached, reactionMutationIds.current),
        );
      }
      if (cached.length >= 20 || !remoteHasMoreNewerMessages.current) return;

      const cursor = cached.at(-1)?.sequence ?? latest.sequence;
      const remote = await getMessengerMessages(roomId, {
        cursor,
        direction: "after",
        limit: 20 - cached.length,
      });
      remoteHasMoreNewerMessages.current = remote.page.has_more;
      if (remote.page.latest_sequence) {
        latestKnownSequence.current = remote.page.latest_sequence;
      }
      if (remote.items.length) {
        await cacheMessengerMessages(db, remote.items);
        setMessages((current) =>
          mergeMessengerMessages(
            current,
            remote.items,
            reactionMutationIds.current,
          ),
        );
      }
    } catch (error) {
      messengerLog("warn", "room.newer_history.page_failed", {
        room_id: roomId,
        message: messengerErrorMessage(error),
      });
    } finally {
      newerCachedMessagesLoading.current = false;
    }
  }, [db, listReady, roomId]);

  const loadMessages = useCallback(
    async (initial = false) => {
      if (!roomId || refreshRunning.current || !isAuthenticated) return;
      refreshRunning.current = true;
      const startedAt = Date.now();
      messengerLog("debug", "room.sync.started", {
        room_id: roomId,
        initial,
      });
      let localLatestSequence: string | null = null;
      let cachedLatestSequence: string | null = null;
      let expectedUnreadCount = Number(params.unreadCount || 0);
      if (!Number.isFinite(expectedUnreadCount)) expectedUnreadCount = 0;
      try {
        if (initial && session) {
          const [pending, cachedRoom, historyComplete, cachedBounds] =
            await Promise.all([
              loadMessengerOutbox(db, roomId),
              loadCachedMessengerRoom(db, roomId),
              isMessengerRoomHistoryComplete(db, roomId),
              loadCachedMessengerMessageBounds(db, roomId),
            ]);
          const routeReadSequence = params.lastReadSequence || "0";
          const cachedReadSequence = cachedRoom?.last_read_sequence || "0";
          const serverReadSequence =
            compareMessengerSequence(routeReadSequence, cachedReadSequence) >= 0
              ? routeReadSequence
              : cachedReadSequence;
          const localReadState = await loadMessengerLocalReadState(
            db,
            roomId,
            serverReadSequence,
          );
          initialReadSequence.current = localReadState.local_read_sequence;
          initialUnreadBoundarySequence.current =
            localReadState.local_read_sequence;
          if (params.unreadCount === undefined && cachedRoom) {
            expectedUnreadCount = cachedRoom.unread_count;
          }
          const expectedLatestCandidates = [
            params.latestSequence,
            cachedRoom?.last_message?.sequence,
            cachedBounds.latest_sequence,
          ].filter((sequence): sequence is string => Boolean(sequence));
          const expectedLatestSequence = expectedLatestCandidates.reduce<
            string | null
          >(
            (latest, sequence) =>
              !latest || compareMessengerSequence(sequence, latest) > 0
                ? sequence
                : latest,
            null,
          );
          if (
            expectedLatestSequence &&
            compareMessengerSequence(
              initialReadSequence.current,
              expectedLatestSequence,
            ) >= 0
          ) {
            expectedUnreadCount = 0;
          }
          const cached = await loadCachedMessengerMessageWindow(db, roomId, {
            anchorSequence: initialUnreadBoundarySequence.current,
            hasUnread: expectedUnreadCount > 0,
            limit: 20,
          });
          const confirmedClientIds = new Set(
            cached.map((message) => message.client_message_id),
          );
          const staleOutboxIds = pending
            .filter((item) => confirmedClientIds.has(item.client_message_id))
            .map((item) => item.client_message_id);
          if (staleOutboxIds.length) {
            void removeMessengerOutboxItems(db, staleOutboxIds);
          }
          const pendingMessages = pending
            .filter((item) => !confirmedClientIds.has(item.client_message_id))
            .map((item) =>
              pendingMessengerMessage(
                item,
                session.user,
                cached.find(
                  (message) => message.id === item.reply_to_message_id,
                ),
              ),
            );
          const local = mergeMessengerMessages(cached, pendingMessages);
          if (local.length) {
            setMessages(local);
            setLoading(false);
          }
          initialUnreadExpectedRef.current = expectedUnreadCount > 0;
          setInitialUnreadExpected(expectedUnreadCount > 0);
          if (local.length) {
            // The first frame is positioned exclusively from SQLite. Network
            // reconciliation starts below, but can no longer hold the feed in
            // a hidden/loading state.
            setInitialDataReady(true);
          }
          const localConfirmed = local.filter((message) => !message.pending);
          localLatestSequence = localConfirmed.at(-1)?.sequence ?? null;
          cachedLatestSequence = cachedBounds.latest_sequence;
          messengerLog("debug", "room.cache.loaded", {
            room_id: roomId,
            window_message_count: cached.length,
            pending_count: pendingMessages.length,
            history_complete: historyComplete,
            last_read_sequence: initialUnreadBoundarySequence.current,
            expected_latest_sequence: expectedLatestSequence,
            local_latest_sequence: localLatestSequence,
            cache_latest_sequence: cachedLatestSequence,
            unread_count: expectedUnreadCount,
            position_ready: local.length > 0,
            position_source: local.length > 0 ? "sqlite" : "network",
          });
        }
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
        const applyRemoteMessages = async (
          items: MessengerMessage[],
          exposeInFeed: boolean,
        ) => {
          if (!items.length) return;
          if (exposeInFeed) {
            setMessages((current) =>
              mergeMessengerMessages(
                current,
                items,
                reactionMutationIds.current,
              ),
            );
          }
          await cacheMessengerMessages(db, items);
          void removeMessengerOutboxItems(
            db,
            items.map((message) => message.client_message_id),
          );
        };

        const reconciliationCursor = initial
          ? cachedLatestSequence
          : (await loadCachedMessengerMessageBounds(db, roomId))
              .latest_sequence || latestKnownSequence.current;
        const visibleConfirmedTail = initial
          ? localLatestSequence
          : messagesRef.current
              .filter((message) => !message.pending)
              .at(-1)?.sequence;
        const remoteIsContiguousWithFeed = Boolean(
          !visibleConfirmedTail ||
          !reconciliationCursor ||
          compareMessengerSequence(
            visibleConfirmedTail,
            reconciliationCursor,
          ) === 0,
        );
        let latestSequence = reconciliationCursor || localLatestSequence;
        let receivedMessageCount = 0;
        let syncDirection: "after" | "latest" = "latest";

        if (reconciliationCursor) {
          // Reconcile strictly after SQLite's newest confirmed sequence. One
          // small page is enough for this pass; subsequent realtime events or
          // reconnects continue from the advanced cursor without repainting
          // old cells.
          syncDirection = "after";
          const page = await getMessengerMessages(roomId, {
            cursor: reconciliationCursor,
            direction: "after",
            limit: 20,
          });
          receivedMessageCount = page.items.length;
          remoteHasMoreNewerMessages.current = page.page.has_more;
          await applyRemoteMessages(
            page.items,
            remoteIsContiguousWithFeed,
          );
          if (page.page.latest_sequence) {
            latestSequence = page.page.latest_sequence;
          }
        } else {
          const remote = await getMessengerMessages(roomId, { limit: 20 });
          receivedMessageCount = remote.items.length;
          latestSequence = remote.page.latest_sequence;
          // `latest` already returns the newest window. Its `has_more` flag
          // refers to older history, not messages below the visible tail.
          remoteHasMoreNewerMessages.current = false;
          await applyRemoteMessages(remote.items, true);
          if (initial) {
            if (!remote.page.has_more) {
              await markMessengerRoomHistoryComplete(db, roomId);
            }
          }
        }

        if (latestSequence) latestKnownSequence.current = latestSequence;
        if (
          initial &&
          !initialUnreadExpectedRef.current &&
          nearLatest.current
        ) {
          scrollToLatest(false);
        }
        setOffline(false);
        if (!outboxError) setSyncError(null);
        messengerLog("info", "room.sync.completed", {
          room_id: roomId,
          message_count: receivedMessageCount,
          latest_sequence: latestSequence,
          direction: syncDirection,
          outbox_error: Boolean(outboxError),
          duration_ms: Date.now() - startedAt,
        });
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
        if (initial) setInitialDataReady(true);
        setLoading(false);
        refreshRunning.current = false;
        lastRoomSyncFinishedAt.current = Date.now();
      }
    },
    [
      db,
      flushOutbox,
      isAuthenticated,
      params.lastReadSequence,
      params.latestSequence,
      params.unreadCount,
      roomId,
      scrollToLatest,
      session,
    ],
  );

  const clearInitialPositionTimers = useCallback(() => {
    if (initialPositionRetryTimer.current) {
      clearTimeout(initialPositionRetryTimer.current);
      initialPositionRetryTimer.current = null;
    }
    if (initialPositionFallbackTimer.current) {
      clearTimeout(initialPositionFallbackTimer.current);
      initialPositionFallbackTimer.current = null;
    }
  }, []);

  const finishInitialPosition = useCallback(() => {
    if (!pendingInitialPosition.current) return;
    pendingInitialPosition.current = false;
    initialAnchorSettling.current = false;
    clearInitialPositionTimers();
    setListReady(true);
    messengerLog("info", "room.initial_position.completed", {
      room_id: roomId,
      mode: initialAnchorMode.current,
      anchor_client_message_id: initialAnchorClientId.current,
      attempts: initialPositionAttempts.current,
      duration_ms: Date.now() - initialPositionStartedAt.current,
    });
    if (initialReadAcknowledged.current) return;
    initialReadAcknowledged.current = true;
    const visibleSequence = latestVisibleSequence.current;
    if (
      visibleSequence &&
      compareMessengerSequence(
        visibleSequence,
        initialReadSequence.current,
      ) > 0
    ) {
      initialReadSequence.current = visibleSequence;
      void acknowledgeLatest(visibleSequence).catch((error) =>
        console.warn(
          "[Messenger] Не удалось локально отметить видимые сообщения:",
          error,
        ),
      );
    }
  }, [acknowledgeLatest, clearInitialPositionTimers, roomId]);

  const positionInitialMessages = useCallback(() => {
    if (!pendingInitialPosition.current) return;
    const current = messagesRef.current;
    const anchorId = initialAnchorClientId.current;
    const index = current.findIndex(
      (message) => message.client_message_id === anchorId,
    );
    if (index < 0 || !current.length) {
      finishInitialPosition();
      return;
    }
    if (initialAnchorMode.current === "latest") {
      listRef.current?.scrollToEnd({ animated: false });
      return;
    }
    listRef.current?.scrollToIndex({
      index,
      animated: false,
      viewPosition: 0.5,
      viewOffset: 0,
    });
  }, [finishInitialPosition]);

  const settleInitialPosition = useCallback(() => {
    if (!pendingInitialPosition.current || initialAnchorSettling.current) {
      return;
    }
    initialAnchorSettling.current = true;
    requestAnimationFrame(() => {
      if (!pendingInitialPosition.current) return;
      const current = messagesRef.current;
      const index = current.findIndex(
        (message) =>
          message.client_message_id === initialAnchorClientId.current,
      );
      if (index < 0) {
        finishInitialPosition();
        return;
      }
      if (initialAnchorMode.current === "latest") {
        listRef.current?.scrollToEnd({ animated: false });
      } else {
        listRef.current?.scrollToIndex({
          index,
          animated: false,
          viewPosition: 0.5,
          // The message itself, rather than the unread divider attached to the
          // following item, is centred vertically.
          viewOffset: 0,
        });
      }
      initialPositionRetryTimer.current = setTimeout(
        finishInitialPosition,
        140,
      );
    });
  }, [finishInitialPosition]);

  const handleViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<MessengerMessage>[] }) => {
      const latestVisible = viewableItems
        .filter((token) => token.isViewable && !token.item.pending)
        .map((token) => token.item.sequence)
        .reduce<string | null>(
          (latest, sequence) =>
            !latest || compareMessengerSequence(sequence, latest) > 0
              ? sequence
              : latest,
          null,
        );
      latestVisibleSequence.current = latestVisible;
      if (
        pendingInitialPosition.current &&
        initialAnchorClientId.current &&
        viewableItems.some(
          (token) =>
            token.item.client_message_id === initialAnchorClientId.current,
        )
      ) {
        settleInitialPosition();
        return;
      }
      if (!initialReadAcknowledged.current) return;
      if (
        latestVisible &&
        compareMessengerSequence(latestVisible, initialReadSequence.current) > 0
      ) {
        initialReadSequence.current = latestVisible;
        void acknowledgeLatest(latestVisible).catch((error) =>
          console.warn(
            "[Messenger] Не удалось локально отметить видимые сообщения:",
            error,
          ),
        );
      }
    },
    [acknowledgeLatest, settleInitialPosition],
  );

  const initialViewabilityConfig = useMemo(
    () => ({ itemVisiblePercentThreshold: 1 }),
    [],
  );

  useEffect(() => {
    if (!initialUnreadExpected || unreadMarkerClientId || !session) return;
    const firstUnread = firstUnreadMessengerMessage(
      messages,
      initialUnreadBoundarySequence.current,
      session.user.id,
    );
    if (firstUnread) {
      setUnreadMarkerClientId(firstUnread.client_message_id);
    }
  }, [initialUnreadExpected, messages, session, unreadMarkerClientId]);

  useEffect(() => {
    if (!initialDataReady || initialPositionConfigured.current || !session) {
      return;
    }
    initialPositionConfigured.current = true;
    const current = messagesRef.current;
    if (!current.length) {
      setListReady(true);
      initialReadAcknowledged.current = true;
      return;
    }
    const firstUnread = firstUnreadMessengerMessage(
      current,
      initialUnreadBoundarySequence.current,
      session.user.id,
    );
    const readAnchor = lastReadMessengerMessage(
      current,
      initialUnreadBoundarySequence.current,
    );
    const shouldAnchorUnreadBoundary =
      initialUnreadExpectedRef.current || Boolean(firstUnread);
    const anchor = shouldAnchorUnreadBoundary
      ? readAnchor || firstUnread || current.at(-1) || null
      : current.at(-1) || null;
    setUnreadMarkerClientId(firstUnread?.client_message_id ?? null);
    initialAnchorClientId.current = anchor?.client_message_id ?? null;
    initialAnchorMode.current = shouldAnchorUnreadBoundary
      ? readAnchor
        ? "read_anchor"
        : "unread_fallback"
      : "latest";
    initialAnchorSettling.current = false;
    nearLatest.current = !shouldAnchorUnreadBoundary;
    pendingInitialPosition.current = true;
    initialPositionAttempts.current = 0;
    initialPositionStartedAt.current = Date.now();
    messengerLog("info", "room.initial_position.configured", {
      room_id: roomId,
      mode: initialAnchorMode.current,
      message_count: current.length,
      last_read_sequence: initialUnreadBoundarySequence.current,
      anchor_sequence: anchor?.sequence ?? null,
      unread_marker_sequence: firstUnread?.sequence ?? null,
      source: readAnchor ? "sqlite" : firstUnread ? "network" : "latest",
      anchor_index: current.findIndex(
        (message) =>
          message.client_message_id === initialAnchorClientId.current,
      ),
    });
    clearInitialPositionTimers();
    initialPositionFallbackTimer.current = setTimeout(() => {
      if (!pendingInitialPosition.current) return;
      messengerLog("warn", "room.initial_position.timeout", {
        room_id: roomId,
        mode: initialAnchorMode.current,
        attempts: initialPositionAttempts.current,
      });
      positionInitialMessages();
      initialPositionRetryTimer.current = setTimeout(
        finishInitialPosition,
        180,
      );
    }, 4_000);
    requestAnimationFrame(positionInitialMessages);
  }, [
    clearInitialPositionTimers,
    finishInitialPosition,
    initialDataReady,
    initialUnreadExpected,
    positionInitialMessages,
    roomId,
    session,
  ]);

  const handleScrollToIndexFailed = useCallback(
    (info: {
      index: number;
      highestMeasuredFrameIndex: number;
      averageItemLength: number;
    }) => {
      if (!pendingInitialPosition.current) return;
      initialPositionAttempts.current += 1;
      listRef.current?.scrollToOffset({
        offset: Math.max(0, (info.averageItemLength || 72) * info.index),
        animated: false,
      });
      if (initialPositionRetryTimer.current) {
        clearTimeout(initialPositionRetryTimer.current);
      }
      initialPositionRetryTimer.current = setTimeout(
        positionInitialMessages,
        Math.min(80 + initialPositionAttempts.current * 20, 240),
      );
    },
    [positionInitialMessages],
  );

  const handleListScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } =
        event.nativeEvent;
      nearLatest.current =
        contentOffset.y + layoutMeasurement.height >= contentSize.height - 120;
      if (!pendingInitialPosition.current && contentOffset.y <= 100) {
        void loadOlderMessages();
      }
      if (
        !pendingInitialPosition.current &&
        contentOffset.y + layoutMeasurement.height >= contentSize.height - 160
      ) {
        void loadNewerMessages();
      }
    },
    [loadNewerMessages, loadOlderMessages],
  );

  const scheduleConnectionSync = useCallback(() => {
    if (connectionSyncTimer.current) return;
    const run = (): void => {
      const elapsed = Date.now() - lastRoomSyncFinishedAt.current;
      const remaining = 10_000 - elapsed;
      if (lastRoomSyncFinishedAt.current > 0 && remaining > 0) {
        connectionSyncTimer.current = setTimeout(run, remaining);
        return;
      }
      connectionSyncTimer.current = null;
      void flushOutbox().catch(() => undefined);
      void loadMessages(false);
    };
    connectionSyncTimer.current = setTimeout(run, 250);
  }, [flushOutbox, loadMessages]);

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
          setMessages((current) =>
            mergeMessengerMessages(
              current,
              [message],
              reactionMutationIds.current,
            ),
          );
          void cacheMessengerMessages(db, [message]).catch((cacheError) =>
            logMessageCacheFailure(message, cacheError),
          );
          void removeMessengerOutboxItem(db, message.client_message_id);
          latestKnownSequence.current = message.sequence;
          if (initialReadAcknowledged.current && nearLatest.current) {
            void acknowledgeLatest(message.sequence).catch((error) =>
              console.warn(
                "[Messenger realtime] Не удалось подтвердить сообщение:",
                error,
              ),
            );
          }
          if (nearLatest.current || message.author.id === session?.user.id) {
            scrollToLatest(true);
          }
        } else if (
          event.type === "message.receipt_updated" &&
          event.room_id === roomId
        ) {
          // Receipt cursors belong to the delivery metadata layer. They must
          // never trigger a history fetch or replace the visible feed.
        } else if (
          event.type === "sync.required" ||
          event.type === "connection.ready"
        ) {
          // A weak connection may emit several reconnect/ready pairs in quick
          // succession. The live events already update the feed, so one REST
          // reconciliation per ten seconds is sufficient and prevents the
          // request cascade visible in the diagnostic log.
          scheduleConnectionSync();
        } else if (
          event.type === "message.reaction_updated" &&
          event.room_id === roomId &&
          !reactionMutationIds.current.has(event.message_id)
        ) {
          if (event.reactions) {
            setMessages((current) => {
              const next = current.map((message) =>
                message.id === event.message_id
                  ? { ...message, reactions: event.reactions || [] }
                  : message,
              );
              const updated = next.find(
                (message) => message.id === event.message_id,
              );
              if (updated) void cacheMessengerMessages(db, [updated]);
              return next;
            });
          }
        }
      });
      // Reconciliation is intentionally infrequent: Socket.IO performs normal
      // foreground delivery, while this timer protects against a lost event.
      const timer = setInterval(() => void loadMessages(false), 120_000);
      return () => {
        unsubscribe();
        clearInterval(timer);
        if (connectionSyncTimer.current) {
          clearTimeout(connectionSyncTimer.current);
          connectionSyncTimer.current = null;
        }
        if (attachmentLaunchTimer.current) {
          clearTimeout(attachmentLaunchTimer.current);
          attachmentLaunchTimer.current = null;
        }
        if (actionDismissTimer.current) {
          clearTimeout(actionDismissTimer.current);
          actionDismissTimer.current = null;
        }
        clearInitialPositionTimers();
        pendingMessageAction.current = null;
        pendingAttachmentKind.current = null;
      };
    }, [
      db,
      acknowledgeLatest,
      clearInitialPositionTimers,
      isAuthenticated,
      loadMessages,
      roomId,
      router,
      scheduleConnectionSync,
      session?.user.id,
      scrollToLatest,
    ]),
  );

  const send = () => {
    const body = text.trim();
    if (!body || !roomId || !session) return;
    const clientMessageId = Crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const replyTarget = replyingTo;
    const outboxItem: MessengerOutboxItem = {
      client_message_id: clientMessageId,
      room_id: roomId,
      text: body,
      reply_to_message_id: replyTarget?.id || null,
      created_at: createdAt,
      attempts: 0,
      last_error: null,
    };
    const optimistic = pendingMessengerMessage(
      outboxItem,
      session.user,
      replyTarget ?? undefined,
    );
    setText("");
    setReplyingTo(null);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setMessages((current) => mergeMessengerMessages(current, [optimistic]));
    nearLatest.current = true;
    scrollToLatest(true);
    // Let React commit and paint the new bubble before touching SQLite or the
    // network. Delivery metadata then changes independently on the same item.
    requestAnimationFrame(() => {
      void (async () => {
        try {
          await enqueueMessengerText(db, outboxItem);
          messengerLog("info", "message.queued", {
            room_id: roomId,
            client_message_id: clientMessageId,
            has_reply: Boolean(replyTarget?.id),
          });
          void flushOutbox().catch((error) => {
            setOffline(isMessengerConnectionError(error));
            setSyncError(
              messengerErrorMessage(error, "Не удалось отправить сообщение"),
            );
          });
        } catch (error) {
          const message = messengerErrorMessage(
            error,
            "Не удалось сохранить сообщение локально",
          );
          setMessages((current) =>
            current.map((item) =>
              item.client_message_id === clientMessageId
                ? { ...item, send_error: message }
                : item,
            ),
          );
          setSyncError(message);
        }
      })();
    });
  };

  const storeSentMessage = useCallback(
    async (message: MessengerMessage) => {
      setMessages((current) =>
        mergeMessengerMessages(current, [message], reactionMutationIds.current),
      );
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
    if (
      !canReact ||
      message.pending ||
      reactionMutationIds.current.has(message.id)
    ) {
      return;
    }
    const currentMessage =
      messagesRef.current.find((item) => item.id === message.id) ?? message;
    const previousReactions = currentMessage.reactions;
    const selected = previousReactions.some(
      (item) => item.reaction === reaction && item.reacted_by_me,
    );
    const nextReaction = selected ? null : reaction;
    const optimisticReactions = applyOptimisticReaction(
      previousReactions,
      nextReaction,
    );
    reactionMutationIds.current.add(message.id);
    setReactionBusyIds((current) => new Set(current).add(message.id));
    const optimisticMessage = {
      ...currentMessage,
      reactions: optimisticReactions,
    };
    setMessages((current) =>
      current.map((item) =>
        item.id === message.id ? optimisticMessage : item,
      ),
    );
    setActionMessage(null);
    setShowAllReactions(false);
    void cacheMessengerMessages(db, [optimisticMessage]).catch(() => undefined);
    if (nextReaction) {
      void rememberQuickMessengerReaction(nextReaction, quickReactions).then(
        setQuickReactions,
      );
    }
    try {
      const result = selected
        ? await removeMessengerReaction(message.id)
        : await setMessengerReaction(message.id, reaction);
      const confirmedMessage = {
        ...optimisticMessage,
        reactions: result.reactions,
      };
      setMessages((current) =>
        current.map((item) =>
          item.id === message.id ? confirmedMessage : item,
        ),
      );
      void cacheMessengerMessages(db, [confirmedMessage]).catch(
        () => undefined,
      );
    } catch (error) {
      const rolledBack = { ...currentMessage, reactions: previousReactions };
      setMessages((current) =>
        current.map((item) => (item.id === message.id ? rolledBack : item)),
      );
      void cacheMessengerMessages(db, [rolledBack]).catch(() => undefined);
      console.warn("[Messenger] Не удалось изменить реакцию:", error);
      Alert.alert(
        "Реакция не изменена",
        messengerErrorMessage(error, "Повторите попытку позже"),
      );
    } finally {
      reactionMutationIds.current.delete(message.id);
      setReactionBusyIds((current) => {
        const next = new Set(current);
        next.delete(message.id);
        return next;
      });
    }
  };

  const beginReply = useCallback(
    (message: MessengerMessage) => {
      if (!canWrite || message.pending) return;
      setReplyingTo(message);
      setActionMessage(null);
      setShowAllReactions(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    [canWrite],
  );

  const copyMessageText = useCallback(async (message: MessengerMessage) => {
    if (!message.text.trim()) return;
    await Clipboard.setStringAsync(message.text);
    setActionMessage(null);
    setShowAllReactions(false);
  }, []);

  const openForward = useCallback(async (message: MessengerMessage) => {
    setForwardingMessage(message);
    setForwardLoading(true);
    setForwardError(null);
    try {
      const [roomsResult, contactsResult] = await Promise.all([
        getMessengerRooms(),
        getMessengerContacts(),
      ]);
      setForwardRooms(
        roomsResult.filter((room) =>
          message.kind === "text" ? room.can_write : room.can_send_media,
        ),
      );
      setForwardContacts(contactsResult);
    } catch (error) {
      setForwardError(
        messengerErrorMessage(error, "Не удалось загрузить адресатов"),
      );
    } finally {
      setForwardLoading(false);
    }
  }, []);

  const openReceipts = useCallback(async (message: MessengerMessage) => {
    setReceiptMessage(message);
    setReceipts([]);
    setReceiptsLoading(true);
    setReceiptsError(null);
    try {
      const result = await getMessengerMessageReceipts(message.id);
      setReceipts(result.recipients);
    } catch (error) {
      setReceiptsError(
        messengerErrorMessage(error, "Не удалось загрузить статусы"),
      );
    } finally {
      setReceiptsLoading(false);
    }
  }, []);

  const runPendingMessageAction = useCallback(() => {
    if (actionDismissTimer.current) {
      clearTimeout(actionDismissTimer.current);
      actionDismissTimer.current = null;
    }
    const pending = pendingMessageAction.current;
    if (!pending) return;
    pendingMessageAction.current = null;
    if (pending.type === "forward") void openForward(pending.message);
    else void openReceipts(pending.message);
  }, [openForward, openReceipts]);

  const queueMessageAction = useCallback(
    (type: "forward" | "receipts", message: MessengerMessage) => {
      if (message.pending || message.deleted_at) return;
      pendingMessageAction.current = { type, message };
      setShowAllReactions(false);
      setActionMessage(null);
      if (actionDismissTimer.current) clearTimeout(actionDismissTimer.current);
      actionDismissTimer.current = setTimeout(
        runPendingMessageAction,
        Platform.OS === "ios" ? 650 : 260,
      );
    },
    [runPendingMessageAction],
  );

  const saveMessageAttachment = useCallback(
    async (message: MessengerMessage) => {
      if (!message.media || !session?.access_token || savingMessageId) return;
      setSavingMessageId(message.id);
      try {
        const target = await saveMessengerMediaToDevice(
          message.media,
          session.access_token,
        );
        setActionMessage(null);
        Alert.alert(
          "Вложение сохранено",
          target === "media_library"
            ? "Файл добавлен в медиатеку устройства."
            : "Файл передан в выбранную папку.",
        );
      } catch (error) {
        Alert.alert(
          "Не удалось сохранить",
          error instanceof Error ? error.message : "Повторите попытку позже.",
        );
      } finally {
        setSavingMessageId(null);
      }
    },
    [savingMessageId, session?.access_token],
  );

  const forwardTo = useCallback(
    async (busyKey: string, resolveTarget: () => Promise<MessengerRoom>) => {
      if (!forwardingMessage || forwardBusy) return;
      setForwardBusy(busyKey);
      setForwardError(null);
      try {
        const target = await resolveTarget();
        const result = await forwardMessengerMessage(
          forwardingMessage.id,
          target.id,
          Crypto.randomUUID(),
        );
        if (target.id === roomId) await storeSentMessage(result.message);
        setForwardingMessage(null);
        Alert.alert("Сообщение переслано", `Получатель: ${target.title}`);
      } catch (error) {
        setForwardError(
          messengerErrorMessage(error, "Не удалось переслать сообщение"),
        );
      } finally {
        setForwardBusy(null);
      }
    },
    [forwardBusy, forwardingMessage, roomId, storeSentMessage],
  );

  const newForwardContacts = useMemo(() => {
    const roomIds = new Set(forwardRooms.map((room) => room.id));
    return forwardContacts.filter(
      (contact) =>
        !contact.direct_room_id || !roomIds.has(contact.direct_room_id),
    );
  }, [forwardContacts, forwardRooms]);

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
            keyExtractor={(message) => message.client_message_id}
            style={[styles.messageFeed, !listReady && styles.messageFeedHidden]}
            contentContainerStyle={
              visibleMessages.length ? styles.messageList : styles.emptyList
            }
            onLayout={(event) => {
              const height = Math.round(event.nativeEvent.layout.height);
              if (height !== feedHeight) setFeedHeight(height);
            }}
            initialNumToRender={18}
            maxToRenderPerBatch={14}
            windowSize={9}
            maintainVisibleContentPosition={
              listReady ? { minIndexForVisible: 0 } : undefined
            }
            onScroll={handleListScroll}
            scrollEventThrottle={80}
            onScrollToIndexFailed={handleScrollToIndexFailed}
            onViewableItemsChanged={handleViewableItemsChanged}
            viewabilityConfig={initialViewabilityConfig}
            onContentSizeChange={() => {
              if (!visibleMessages.length) return;
              if (pendingInitialPosition.current) {
                positionInitialMessages();
                return;
              }
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
                <View collapsable={false}>
                  {item.client_message_id === unreadMarkerClientId && (
                    <UnreadDivider />
                  )}
                  <SwipeableMessage
                    enabled={canWrite && !item.pending && !item.deleted_at}
                    onReply={() => beginReply(item)}
                    onLongPress={() => {
                      if (!item.pending) {
                        setShowAllReactions(false);
                        setActionMessage(item);
                      }
                    }}
                  >
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
                        <View
                          style={[
                            styles.message,
                            mine ? styles.mine : styles.theirs,
                          ]}
                          accessibilityHint="Удерживайте для меню или смахните влево, чтобы ответить"
                        >
                          <MessageTail mine={mine} />
                          {item.forwarded_from && (
                            <View style={styles.forwardedHeader}>
                              <Icon
                                name="arrow-redo"
                                size={14}
                                color={colors.accent}
                              />
                              <Text
                                style={styles.forwardedText}
                                numberOfLines={1}
                              >
                                Переслано от{" "}
                                {item.forwarded_from.author.display_name}
                              </Text>
                            </View>
                          )}
                          {item.reply_to && (
                            <View style={styles.replyQuote}>
                              <Text
                                style={styles.replyAuthor}
                                numberOfLines={1}
                              >
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
                        </View>
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
                                disabled={
                                  !canReact || reactionBusyIds.has(item.id)
                                }
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
                  </SwipeableMessage>
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
            ListFooterComponent={
              waitingForInitialUnread ? (
                <View
                  style={[
                    styles.unreadTailPlaceholder,
                    { minHeight: Math.max(140, feedHeight * 0.55) },
                  ]}
                >
                  <UnreadDivider />
                  <View style={styles.unreadTailStatus}>
                    {!offline && <ActivityIndicator color={colors.primary} />}
                    <Text style={styles.unreadTailStatusText}>
                      {offline
                        ? "Новые сообщения появятся после восстановления сети"
                        : "Загружаем новые сообщения…"}
                    </Text>
                  </View>
                </View>
              ) : null
            }
          />
          {!listReady && visibleMessages.length > 0 && (
            <View style={styles.feedPositioning} pointerEvents="none">
              <ActivityIndicator color={colors.primary} />
            </View>
          )}
        </ImageBackground>

        <Modal
          visible={Boolean(actionMessage)}
          transparent
          animationType="fade"
          onRequestClose={() => {
            setShowAllReactions(false);
            setActionMessage(null);
          }}
          onDismiss={runPendingMessageAction}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => {
              setShowAllReactions(false);
              setActionMessage(null);
            }}
          >
            <Pressable
              style={styles.actionSheet}
              onPress={(event) => event.stopPropagation()}
            >
              {actionMessage && (
                <View style={styles.actionMessagePreview}>
                  <Text style={styles.actionPreviewAuthor} numberOfLines={1}>
                    {actionMessage.author.display_name}
                  </Text>
                  <Text style={styles.actionPreviewText} numberOfLines={2}>
                    {actionMessage.text ||
                      (actionMessage.kind === "image"
                        ? "Фото"
                        : actionMessage.kind === "video"
                          ? "Видео"
                          : actionMessage.kind === "file"
                            ? actionMessage.media?.original_name || "Файл"
                            : actionMessage.kind === "location"
                              ? "Геопозиция"
                              : "Сообщение")}
                  </Text>
                </View>
              )}
              {canReact && actionMessage && (
                <View>
                  <View style={styles.reactionPicker}>
                    {quickReactions.map((reaction) => (
                      <TouchableOpacity
                        key={reaction}
                        style={styles.reactionButton}
                        onPress={() =>
                          void toggleReaction(actionMessage, reaction)
                        }
                        disabled={reactionBusyIds.has(actionMessage.id)}
                      >
                        <Text style={styles.reactionButtonText}>
                          {reaction}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                      style={styles.reactionMoreButton}
                      onPress={() => setShowAllReactions((current) => !current)}
                      accessibilityLabel="Другие реакции"
                    >
                      <Icon
                        name={showAllReactions ? "chevron-up" : "add"}
                        size={22}
                        color={colors.primary}
                      />
                    </TouchableOpacity>
                  </View>
                  {showAllReactions && (
                    <View style={styles.reactionPalette}>
                      {STANDARD_MESSENGER_REACTIONS.map((reaction) => (
                        <TouchableOpacity
                          key={reaction}
                          style={styles.reactionPaletteButton}
                          onPress={() =>
                            void toggleReaction(actionMessage, reaction)
                          }
                          disabled={reactionBusyIds.has(actionMessage.id)}
                        >
                          <Text style={styles.reactionPaletteText}>
                            {reaction}
                          </Text>
                        </TouchableOpacity>
                      ))}
                      <Text style={styles.reactionPaletteHint}>
                        Выбранная реакция попадёт в быстрый набор
                      </Text>
                    </View>
                  )}
                </View>
              )}
              {canWrite && actionMessage && (
                <TouchableOpacity
                  style={styles.messageAction}
                  onPress={() => beginReply(actionMessage)}
                >
                  <Icon name="arrow-undo" size={21} color={colors.primary} />
                  <Text style={styles.messageActionText}>Ответить</Text>
                </TouchableOpacity>
              )}
              {actionMessage?.text.trim() ? (
                <TouchableOpacity
                  style={styles.messageAction}
                  onPress={() => void copyMessageText(actionMessage)}
                >
                  <Icon name="copy-outline" size={21} color={colors.primary} />
                  <Text style={styles.messageActionText}>
                    Скопировать текст
                  </Text>
                </TouchableOpacity>
              ) : null}
              {actionMessage?.media ? (
                <TouchableOpacity
                  style={styles.messageAction}
                  onPress={() => void saveMessageAttachment(actionMessage)}
                  disabled={savingMessageId === actionMessage.id}
                >
                  {savingMessageId === actionMessage.id ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <Icon
                      name="download-outline"
                      size={21}
                      color={colors.primary}
                    />
                  )}
                  <Text style={styles.messageActionText}>Сохранить</Text>
                </TouchableOpacity>
              ) : null}
              {actionMessage &&
              !actionMessage.pending &&
              actionMessage.author.id === session?.user.id ? (
                <TouchableOpacity
                  style={styles.messageAction}
                  onPress={() => queueMessageAction("receipts", actionMessage)}
                >
                  <Icon
                    name="checkmark-done"
                    size={21}
                    color={colors.primary}
                  />
                  <Text style={styles.messageActionText}>Статусы</Text>
                </TouchableOpacity>
              ) : null}
              {actionMessage && !actionMessage.deleted_at ? (
                <TouchableOpacity
                  style={[styles.messageAction, styles.messageActionSubtle]}
                  onPress={() => queueMessageAction("forward", actionMessage)}
                >
                  <Icon
                    name="arrow-redo"
                    size={19}
                    color={colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.messageActionText,
                      styles.messageActionTextSubtle,
                    ]}
                  >
                    Переслать
                  </Text>
                </TouchableOpacity>
              ) : null}
            </Pressable>
          </Pressable>
        </Modal>

        <Modal
          visible={Boolean(forwardingMessage)}
          transparent
          animationType="slide"
          onRequestClose={() => {
            if (!forwardBusy) setForwardingMessage(null);
          }}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => {
              if (!forwardBusy) setForwardingMessage(null);
            }}
          >
            <Pressable
              style={styles.forwardSheet}
              onPress={(event) => event.stopPropagation()}
            >
              <View style={styles.forwardHeader}>
                <View>
                  <Text style={styles.forwardTitle}>Переслать сообщение</Text>
                  <Text style={styles.forwardSubtitle}>
                    Выберите один чат или контакт
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.attachmentClose}
                  onPress={() => setForwardingMessage(null)}
                  disabled={Boolean(forwardBusy)}
                  accessibilityLabel="Закрыть выбор получателя"
                >
                  <Icon name="close" size={23} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {forwardLoading ? (
                <View style={styles.forwardLoading}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : (
                <ScrollView
                  style={styles.forwardList}
                  contentContainerStyle={styles.forwardListContent}
                  keyboardShouldPersistTaps="handled"
                >
                  {forwardError ? (
                    <TouchableOpacity
                      style={styles.forwardError}
                      onPress={() =>
                        forwardingMessage && void openForward(forwardingMessage)
                      }
                    >
                      <Icon
                        name="alert-circle-outline"
                        size={20}
                        color={colors.warning}
                      />
                      <Text style={styles.forwardErrorText}>
                        {forwardError}
                      </Text>
                    </TouchableOpacity>
                  ) : null}

                  {forwardRooms.length > 0 ? (
                    <Text style={styles.forwardSectionTitle}>Чаты</Text>
                  ) : null}
                  {forwardRooms.map((target) => {
                    const key = `room:${target.id}`;
                    const busy = forwardBusy === key;
                    return (
                      <TouchableOpacity
                        key={key}
                        style={styles.forwardTarget}
                        onPress={() =>
                          void forwardTo(key, () => Promise.resolve(target))
                        }
                        disabled={Boolean(forwardBusy)}
                      >
                        {target.room_type === "direct" && target.peer ? (
                          <AuthenticatedAvatar
                            displayName={target.peer.display_name}
                            avatarUrl={target.peer.avatar_url}
                            accessToken={session?.access_token}
                            size={44}
                          />
                        ) : (
                          <View style={styles.forwardTargetIcon}>
                            <Icon
                              name="people"
                              size={21}
                              color={colors.primary}
                            />
                          </View>
                        )}
                        <View style={styles.forwardTargetText}>
                          <Text
                            style={styles.forwardTargetTitle}
                            numberOfLines={1}
                          >
                            {target.title}
                          </Text>
                          <Text
                            style={styles.forwardTargetSubtitle}
                            numberOfLines={1}
                          >
                            {target.room_type === "direct"
                              ? "Личный чат"
                              : "Общий чат"}
                            {` · ${target.team_name}`}
                          </Text>
                        </View>
                        {busy ? (
                          <ActivityIndicator color={colors.primary} />
                        ) : (
                          <Icon
                            name="chevron-forward"
                            size={20}
                            color={colors.textSecondary}
                          />
                        )}
                      </TouchableOpacity>
                    );
                  })}

                  {newForwardContacts.length > 0 ? (
                    <Text style={styles.forwardSectionTitle}>
                      Новый личный чат
                    </Text>
                  ) : null}
                  {newForwardContacts.map((contact) => {
                    const key = `contact:${contact.team_id}:${contact.id}`;
                    const busy = forwardBusy === key;
                    return (
                      <TouchableOpacity
                        key={key}
                        style={styles.forwardTarget}
                        onPress={() =>
                          void forwardTo(key, async () => {
                            const result = await createMessengerDirectRoom(
                              contact.team_id,
                              contact.id,
                            );
                            return result.room;
                          })
                        }
                        disabled={Boolean(forwardBusy)}
                      >
                        <AuthenticatedAvatar
                          displayName={contact.display_name}
                          avatarUrl={contact.avatar_url}
                          accessToken={session?.access_token}
                          size={44}
                        />
                        <View style={styles.forwardTargetText}>
                          <Text
                            style={styles.forwardTargetTitle}
                            numberOfLines={1}
                          >
                            {contact.display_name}
                          </Text>
                          <Text
                            style={styles.forwardTargetSubtitle}
                            numberOfLines={1}
                          >
                            {contact.family_link
                              ? "Семейный контакт"
                              : "Контакт команды"}
                            {` · ${contact.team_name}`}
                          </Text>
                        </View>
                        {busy ? (
                          <ActivityIndicator color={colors.primary} />
                        ) : (
                          <Icon
                            name="person-add-outline"
                            size={20}
                            color={colors.primary}
                          />
                        )}
                      </TouchableOpacity>
                    );
                  })}

                  {!forwardError &&
                  forwardRooms.length === 0 &&
                  newForwardContacts.length === 0 ? (
                    <Text style={styles.forwardEmpty}>
                      Нет доступных получателей
                    </Text>
                  ) : null}
                </ScrollView>
              )}
            </Pressable>
          </Pressable>
        </Modal>

        <MessageReceiptsModal
          visible={Boolean(receiptMessage)}
          message={receiptMessage}
          recipients={receipts}
          accessToken={session?.access_token}
          loading={receiptsLoading}
          error={receiptsError}
          onClose={() => setReceiptMessage(null)}
          onRetry={() => {
            if (receiptMessage) void openReceipts(receiptMessage);
          }}
        />

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
                ref={inputRef}
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
                  !text.trim() && styles.sendButtonDisabled,
                ]}
                onPress={send}
                disabled={!text.trim()}
              >
                <Icon name="send" size={23} color={colors.white} />
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
  messageFeed: { flex: 1 },
  messageFeedHidden: { opacity: 0 },
  feedPositioning: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  messageList: { padding: 14, paddingBottom: 20 },
  emptyList: { flexGrow: 1, justifyContent: "center" },
  unreadDivider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
    marginBottom: 12,
  },
  unreadDividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.primary,
  },
  unreadDividerText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "800",
  },
  unreadTailPlaceholder: {
    paddingTop: 2,
  },
  unreadTailStatus: {
    alignItems: "center",
    gap: 8,
    paddingTop: 8,
  },
  unreadTailStatusText: {
    color: colors.textSecondary,
    fontSize: 12,
    textAlign: "center",
  },
  swipeShell: { position: "relative", width: "100%" },
  swipeReplyCue: {
    position: "absolute",
    right: 2,
    top: 8,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: colors.primary,
  },
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
  forwardedHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 5,
  },
  forwardedText: {
    flexShrink: 1,
    color: colors.accent,
    fontSize: 11,
    fontWeight: "800",
  },
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
    maxHeight: "88%",
    padding: 16,
    borderRadius: 20,
    backgroundColor: colors.surface,
  },
  actionMessagePreview: {
    marginBottom: 12,
    padding: 11,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    borderRadius: 10,
    backgroundColor: colors.backgroundAlt,
  },
  actionPreviewAuthor: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "800",
  },
  actionPreviewText: {
    marginTop: 3,
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
  },
  messageAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    minHeight: 48,
    paddingHorizontal: 12,
    marginTop: 4,
    borderRadius: 13,
    backgroundColor: "#EAF3FF",
  },
  messageActionText: { color: colors.primary, fontSize: 15, fontWeight: "800" },
  messageActionSubtle: {
    minHeight: 40,
    marginTop: 7,
    backgroundColor: "rgba(23, 52, 87, 0.055)",
  },
  messageActionTextSubtle: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "700",
  },
  forwardSheet: {
    maxHeight: "82%",
    padding: 16,
    paddingBottom: 10,
    borderRadius: 22,
    backgroundColor: colors.surface,
  },
  forwardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  forwardTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  forwardSubtitle: { marginTop: 2, color: colors.textSecondary, fontSize: 12 },
  forwardLoading: {
    minHeight: 160,
    alignItems: "center",
    justifyContent: "center",
  },
  forwardList: { flexGrow: 0 },
  forwardListContent: { paddingBottom: 12 },
  forwardSectionTitle: {
    marginTop: 12,
    marginBottom: 5,
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  forwardTarget: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    minHeight: 64,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  forwardTargetIcon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: "#EAF3FF",
  },
  forwardTargetText: { flex: 1, minWidth: 0 },
  forwardTargetTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  forwardTargetSubtitle: {
    marginTop: 3,
    color: colors.textSecondary,
    fontSize: 11,
  },
  forwardError: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginVertical: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#FFF4E5",
  },
  forwardErrorText: { flex: 1, color: colors.text, fontSize: 12 },
  forwardEmpty: {
    paddingVertical: 28,
    color: colors.textSecondary,
    textAlign: "center",
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
  reactionMoreButton: {
    width: 38,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#EAF3FF",
  },
  reactionPalette: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    marginTop: -5,
    marginBottom: 12,
    padding: 8,
    borderRadius: 14,
    backgroundColor: colors.backgroundAlt,
  },
  reactionPaletteButton: {
    width: "12.5%",
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  reactionPaletteText: { fontSize: 22 },
  reactionPaletteHint: {
    width: "100%",
    marginTop: 3,
    color: colors.textSecondary,
    fontSize: 10,
    textAlign: "center",
  },
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
