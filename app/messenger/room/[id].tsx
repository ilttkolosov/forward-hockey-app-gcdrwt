import * as Crypto from "expo-crypto";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
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
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  type KeyboardEvent,
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
  pendingMessengerAttachmentMessage,
  pendingMessengerMessage,
  prependMessengerMessages,
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
  loadCachedMessengerMessageContext,
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
  MessengerPendingAttachment,
  MessengerReply,
  MessengerRoom,
  MessengerRoomMember,
} from "../../../features/messenger/types";
import {
  createMessengerDirectRoom,
  forwardMessengerMessage,
  getMessengerMessage,
  getMessengerContacts,
  getMessengerMessageReceipts,
  getMessengerMessages,
  getMessengerRoomMembers,
  getMessengerRooms,
  isMessengerConnectionError,
  isMessengerUploadCancelledError,
  messengerErrorMessage,
  removeMessengerReaction,
  sendMessengerLocation,
  sendMessengerMedia,
  sendMessengerText,
  setMessengerReaction,
} from "../../../services/messengerApi";
import { queueMessengerReadReceipt } from "../../../services/messengerReadSync";
import {
  getMessengerRealtimeConnectionState,
  setMessengerActiveRoom,
  subscribeMessengerRealtime,
} from "../../../services/messengerRealtime";
import { messengerLog } from "../../../services/messengerLogger";
import {
  assertMessengerUploadLimits,
  currentMessengerLocation,
  MAX_MESSENGER_MEDIA_SELECTION,
  pickMessengerFile,
  pickMessengerMedia,
  takeMessengerPhoto,
  type MessengerUploadFile,
} from "../../../services/messengerAttachmentPicker";
import { seedMessengerMediaCache } from "../../../services/messengerMediaCache";
import { saveMessengerMediaToDevice } from "../../../services/messengerMediaSave";
import { colors } from "../../../styles/commonStyles";
import { refreshMessengerUnreadFromCache } from "../../../services/messengerUnread";

type MessengerAttachmentKind = "camera" | "library" | "file" | "location";
type InitialAnchorMode = "read_anchor" | "unread_fallback" | "latest";

interface PendingAttachmentRequest {
  kind: MessengerAttachmentKind;
}

interface AttachmentDraft {
  source: Exclude<MessengerAttachmentKind, "location">;
  files: MessengerUploadFile[];
}

interface MediaUploadRequest extends AttachmentDraft {
  clientMessageId: string;
  caption: string;
  replyTarget: MessengerMessage | null;
}

function SwipeableMessage({
  children,
  enabled,
  animateEntry,
  onReply,
  onLongPress,
}: {
  children: React.ReactNode;
  enabled: boolean;
  animateEntry?: boolean;
  onReply: () => void;
  onLongPress: () => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const entryProgress = useRef(
    new Animated.Value(animateEntry ? 0 : 1),
  ).current;
  const entryTranslateY = entryProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [14, 0],
  });
  useEffect(() => {
    if (!animateEntry) return;
    Animated.timing(entryProgress, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [animateEntry, entryProgress]);
  const resetPosition = useCallback(() => {
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      speed: 24,
      bounciness: 5,
    }).start();
  }, [translateX]);
  const messageGesture = useMemo(() => {
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
  }, [enabled, onLongPress, onReply, resetPosition, translateX]);

  return (
    <View style={styles.swipeShell}>
      <GestureDetector gesture={messageGesture}>
        <Animated.View
          style={{
            opacity: entryProgress,
            transform: [{ translateX }, { translateY: entryTranslateY }],
          }}
        >
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

function incrementMessengerSequence(value: string): string {
  const digits = value.split("");
  let carry = 1;
  for (let index = digits.length - 1; index >= 0 && carry; index -= 1) {
    const next = Number(digits[index]) + carry;
    digits[index] = String(next % 10);
    carry = next >= 10 ? 1 : 0;
  }
  if (carry) digits.unshift("1");
  return digits.join("");
}

function participantCountText(count: number | null): string {
  if (count === null) return "Участники загружаются";
  const absolute = Math.abs(count);
  const lastTwo = absolute % 100;
  const last = absolute % 10;
  const noun =
    lastTwo >= 11 && lastTwo <= 14
      ? "участников"
      : last === 1
        ? "участник"
        : last >= 2 && last <= 4
          ? "участника"
          : "участников";
  return `${count} ${noun}`;
}

function lastSeenText(value: string | null): string {
  if (!value) return "Не в сети";
  const seen = new Date(value);
  if (Number.isNaN(seen.getTime())) return "Не в сети";
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startOfSeen = new Date(
    seen.getFullYear(),
    seen.getMonth(),
    seen.getDate(),
  );
  const dayDifference = Math.round(
    (startOfToday.getTime() - startOfSeen.getTime()) / 86_400_000,
  );
  const time = seen.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (dayDifference === 0) return `Последний раз в сети сегодня в ${time}`;
  if (dayDifference === 1) return `Последний раз в сети вчера в ${time}`;
  const date = seen.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    ...(seen.getFullYear() === now.getFullYear()
      ? {}
      : { year: "numeric" as const }),
  });
  return `Последний раз в сети ${date} в ${time}`;
}

/**
 * Gives every participant a stable muted color derived from the immutable
 * user id. The color therefore stays the same across renders, app launches
 * and devices without storing presentation state on the server.
 */
function messengerAuthorColor(userId: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < userId.length; index += 1) {
    hash ^= userId.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  const unsignedHash = hash >>> 0;
  const hue = unsignedHash % 360;
  const saturation = 30 + ((unsignedHash >>> 9) % 8);
  const lightness = 38 + ((unsignedHash >>> 17) % 6);
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

type DirectPeerPresence = Pick<
  MessengerRoomMember,
  "id" | "online" | "last_seen_at"
>;

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

function pendingAttachmentSize(sizeBytes: number | null): string | null {
  if (sizeBytes === null) return null;
  if (sizeBytes < 1024) return `${sizeBytes} Б`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(0)} КБ`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function PendingAttachmentView({
  message,
  pending,
}: {
  message: MessengerMessage;
  pending: MessengerPendingAttachment;
}) {
  const failed = pending.stage === "failed";
  const fileSize = pendingAttachmentSize(pending.size_bytes);
  const pendingItems = pending.items?.length
    ? pending.items
    : pending.local_uri && pending.file_name
      ? [
          {
            kind:
              message.kind === "video"
                ? "video"
                : message.kind === "file"
                  ? "file"
                  : "image",
            local_uri: pending.local_uri,
            file_name: pending.file_name,
            size_bytes: pending.size_bytes,
          } as const,
        ]
      : [];
  const albumColumns = pendingItems.length > 4 ? 3 : 2;
  const albumTileSize = albumColumns === 3 ? 72 : 110;
  return (
    <View style={styles.pendingAttachment}>
      {pendingItems.length > 1 ? (
        <View style={styles.pendingAttachmentAlbum}>
          {pendingItems.map((item, index) => (
            <View
              key={`${item.local_uri}:${index}`}
              style={[
                styles.pendingAttachmentAlbumTile,
                { width: albumTileSize, height: albumTileSize },
              ]}
            >
              {item.kind === "image" ? (
                <Image
                  source={item.local_uri}
                  style={styles.pendingAttachmentAlbumImage}
                  contentFit="cover"
                />
              ) : (
                <Icon
                  name={item.kind === "video" ? "play-circle" : "document-text"}
                  size={28}
                  color={colors.primary}
                />
              )}
            </View>
          ))}
        </View>
      ) : message.kind === "image" && pending.local_uri ? (
        <Image
          source={pending.local_uri}
          style={styles.pendingAttachmentImage}
          contentFit="cover"
          transition={120}
        />
      ) : null}
      <View style={styles.pendingAttachmentStatus}>
        {failed ? (
          <Icon name="alert-circle-outline" size={21} color={colors.error} />
        ) : (
          <ActivityIndicator size="small" color={colors.primary} />
        )}
        <View style={styles.pendingAttachmentText}>
          <Text
            style={[
              styles.pendingAttachmentLabel,
              failed && styles.pendingAttachmentLabelFailed,
            ]}
            accessibilityLiveRegion="polite"
          >
            {pending.label}
          </Text>
          {pending.file_name || fileSize ? (
            <Text style={styles.pendingAttachmentDetails} numberOfLines={1}>
              {pendingItems.length > 1
                ? `${pendingItems.length} вложений`
                : [pending.file_name, fileSize].filter(Boolean).join(" · ")}
            </Text>
          ) : null}
        </View>
      </View>
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
    canManage?: string;
    roomType?: string;
    teamId?: string;
    avatarUrl?: string;
    lastReadSequence?: string;
    latestSequence?: string;
    unreadCount?: string;
    pushMessageId?: string;
    pushSequence?: string;
    memberCount?: string;
    peerId?: string;
    peerLastSeenAt?: string;
    openedAt?: string;
  }>();
  const { session, isAuthenticated } = useMessengerAuth();
  const roomId = params.id;
  const canWrite = params.canWrite !== "false";
  const canMedia = params.canMedia !== "false";
  const canReact = params.canReact !== "false";
  const [roomTitle, setRoomTitle] = useState(params.title || "Чат");
  const [roomAvatarUrl, setRoomAvatarUrl] = useState(params.avatarUrl || null);
  const [roomType, setRoomType] = useState(params.roomType || "group");
  const [roomTeamId, setRoomTeamId] = useState(params.teamId || "");
  const [roomMemberCount, setRoomMemberCount] = useState<number | null>(() => {
    const initial = Number(params.memberCount);
    return params.memberCount && Number.isFinite(initial) ? initial : null;
  });
  const [peerPresence, setPeerPresence] = useState<DirectPeerPresence | null>(
    () =>
      params.peerId
        ? {
            id: params.peerId,
            online: false,
            last_seen_at: params.peerLastSeenAt || null,
          }
        : null,
  );
  const [messages, setMessages] = useState<MessengerMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [offline, setOffline] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [roomDetailsReady, setRoomDetailsReady] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(
    getMessengerRealtimeConnectionState,
  );
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
  const [attachmentDraft, setAttachmentDraft] =
    useState<AttachmentDraft | null>(null);
  const [attachmentPreparationLabel, setAttachmentPreparationLabel] =
    useState<string | null>(null);
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
  const [highlightedMessageId, setHighlightedMessageId] = useState<
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
  const pendingAttachmentRequest = useRef<PendingAttachmentRequest | null>(
    null,
  );
  const activeMediaUpload = useRef<AbortController | null>(null);
  const activeMediaUploadClientId = useRef<string | null>(null);
  const keyboardScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const keyboardScrollPending = useRef(false);
  const actionDismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingMessageAction = useRef<
    | { type: "forward"; message: MessengerMessage }
    | { type: "receipts"; message: MessengerMessage }
    | null
  >(null);
  const pendingScrollAnimation = useRef<boolean | null>(null);
  const pendingScrollFallbackTimer = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const pendingInitialPosition = useRef(false);
  const initialPositionConfigured = useRef(false);
  const initialPositionAttempts = useRef(0);
  const initialAnchorClientId = useRef<string | null>(null);
  const initialAnchorMode = useRef<InitialAnchorMode>("latest");
  const initialAnchorSettling = useRef(false);
  const initialPositionStartedAt = useRef(0);
  const initialPositionRetryTimer = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const initialPositionFallbackTimer = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const nearLatest = useRef(true);
  const latestVisibleSequence = useRef<string | null>(null);
  const initialReadSequence = useRef(params.lastReadSequence || "0");
  const initialUnreadBoundarySequence = useRef(params.lastReadSequence || "0");
  const initialUnreadTailSequence = useRef<string | null>(null);
  const initialUnreadExpectedRef = useRef(false);
  const initialReadAcknowledged = useRef(false);
  const latestKnownSequence = useRef<string | null>(null);
  const acknowledgedRead = useRef<{
    room_id: string;
    sequence: string;
  } | null>(null);
  const roomFocusCount = useRef(0);
  const pushMessageNavigationHandled = useRef<string | null>(null);
  const messageNavigationTarget = useRef<{
    messageId: string;
    attempts: number;
  } | null>(null);
  const messageNavigationTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const openedAt = useRef(
    (() => {
      const value = Number(params.openedAt);
      return Number.isFinite(value) && value > 0 ? value : Date.now();
    })(),
  ).current;

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    void loadQuickMessengerReactions().then(setQuickReactions);
  }, []);

  const clearPendingLatestScroll = useCallback(() => {
    pendingScrollAnimation.current = null;
    if (pendingScrollFallbackTimer.current) {
      clearTimeout(pendingScrollFallbackTimer.current);
      pendingScrollFallbackTimer.current = null;
    }
  }, []);

  const scrollToLatest = useCallback((animated: boolean) => {
    pendingScrollAnimation.current = animated;
    if (pendingScrollFallbackTimer.current) {
      clearTimeout(pendingScrollFallbackTimer.current);
    }
    // A content-size fallback is useful while React commits a newly sent
    // bubble, but it must expire. Otherwise a much later reaction or modal
    // transition can consume the stale intent and pull the reader down.
    pendingScrollFallbackTimer.current = setTimeout(() => {
      pendingScrollAnimation.current = null;
      pendingScrollFallbackTimer.current = null;
    }, 700);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated })),
    );
  }, []);

  const beginManualFeedNavigation = useCallback(() => {
    nearLatest.current = false;
    keyboardScrollPending.current = false;
    clearPendingLatestScroll();
    if (keyboardScrollTimer.current) {
      clearTimeout(keyboardScrollTimer.current);
      keyboardScrollTimer.current = null;
    }
  }, [clearPendingLatestScroll]);

  const positionMessageNavigationTarget = useCallback(() => {
    const target = messageNavigationTarget.current;
    if (!target) return;
    const index = messagesRef.current.findIndex(
      (message) => message.id === target.messageId,
    );
    if (index < 0) return;
    listRef.current?.scrollToIndex({
      index,
      animated: true,
      viewPosition: 0.45,
      viewOffset: 0,
    });
    setHighlightedMessageId(target.messageId);
    if (messageNavigationTimer.current) {
      clearTimeout(messageNavigationTimer.current);
    }
    messageNavigationTimer.current = setTimeout(() => {
      messageNavigationTarget.current = null;
      messageNavigationTimer.current = null;
      setHighlightedMessageId(null);
    }, 1_200);
  }, []);

  const navigateToRepliedMessage = useCallback(
    async (reply: Pick<MessengerReply, "id" | "sequence">) => {
      beginManualFeedNavigation();
      try {
        let sequence = reply.sequence;
        let context = sequence
          ? await loadCachedMessengerMessageContext(db, roomId, sequence, 30)
          : [];
        let target =
          messagesRef.current.find((message) => message.id === reply.id) ||
          context.find((message) => message.id === reply.id);
        if (!target) {
          target = await getMessengerMessage(reply.id);
          sequence = target.sequence;
          const [before, after] = await Promise.all([
            getMessengerMessages(roomId, {
              cursor: incrementMessengerSequence(sequence),
              direction: "before",
              limit: 15,
            }),
            getMessengerMessages(roomId, {
              cursor: sequence,
              direction: "after",
              limit: 15,
            }),
          ]);
          context = mergeMessengerMessages(
            before.items,
            [target, ...after.items],
            reactionMutationIds.current,
          );
          await cacheMessengerMessages(db, context);
        }
        if (context.length) {
          setMessages((current) => {
            const merged = mergeMessengerMessages(
              current,
              context,
              reactionMutationIds.current,
            );
            messagesRef.current = merged;
            return merged;
          });
        }
        messageNavigationTarget.current = {
          messageId: target.id,
          attempts: 0,
        };
        requestAnimationFrame(() =>
          requestAnimationFrame(positionMessageNavigationTarget),
        );
      } catch (error) {
        setSyncError(
          messengerErrorMessage(error, "Не удалось открыть исходное сообщение"),
        );
      }
    },
    [beginManualFeedNavigation, db, positionMessageNavigationTarget, roomId],
  );

  useEffect(() => {
    if (
      !listReady ||
      pushMessageNavigationHandled.current === params.pushMessageId ||
      !params.pushMessageId
    ) {
      return;
    }
    pushMessageNavigationHandled.current = params.pushMessageId;
    void navigateToRepliedMessage({
      id: params.pushMessageId,
      sequence: params.pushSequence || undefined,
    });
  }, [
    listReady,
    navigateToRepliedMessage,
    params.pushMessageId,
    params.pushSequence,
  ]);

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSubscription = Keyboard.addListener(
      showEvent,
      (event: KeyboardEvent) => {
        if (Platform.OS === "ios") Keyboard.scheduleLayoutAnimation(event);
        if (!nearLatest.current) return;
        keyboardScrollPending.current = true;
        scrollToLatest(true);
        if (keyboardScrollTimer.current) {
          clearTimeout(keyboardScrollTimer.current);
        }
        keyboardScrollTimer.current = setTimeout(
          () => {
            if (nearLatest.current) scrollToLatest(true);
            keyboardScrollPending.current = false;
            keyboardScrollTimer.current = null;
          },
          Math.max(120, (event.duration || 250) + 80),
        );
      },
    );
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      if (keyboardScrollTimer.current) {
        clearTimeout(keyboardScrollTimer.current);
        keyboardScrollTimer.current = null;
      }
      keyboardScrollPending.current = false;
      if (nearLatest.current) scrollToLatest(false);
    });
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
      if (keyboardScrollTimer.current) {
        clearTimeout(keyboardScrollTimer.current);
        keyboardScrollTimer.current = null;
      }
      clearPendingLatestScroll();
    };
  }, [clearPendingLatestScroll, scrollToLatest]);

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
              sequence: result.message.sequence,
              created_at: result.message.created_at,
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

  const clearInitialUnreadIfCovered = useCallback(
    (sequence: string) => {
      const unreadTail = initialUnreadTailSequence.current;
      if (!unreadTail || compareMessengerSequence(sequence, unreadTail) < 0) {
        return;
      }
      initialUnreadTailSequence.current = null;
      initialUnreadExpectedRef.current = false;
      setInitialUnreadExpected(false);
      setUnreadMarkerClientId(null);
      messengerLog("info", "room.unread_block.completed", {
        room_id: roomId,
        read_sequence: sequence,
        unread_tail_sequence: unreadTail,
      });
    },
    [roomId],
  );

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
        clearInitialUnreadIfCovered(sequence);
        await refreshMessengerUnreadFromCache(db);
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
    [clearInitialUnreadIfCovered, db, roomId, session?.user.id],
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
          prependMessengerMessages(
            current,
            cached,
            reactionMutationIds.current,
          ),
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
          prependMessengerMessages(
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
      let localSnapshotReady = false;
      let localReadStateFallback: string | null = null;
      let expectedUnreadCount = Number(params.unreadCount || 0);
      if (!Number.isFinite(expectedUnreadCount)) expectedUnreadCount = 0;
      try {
        if (initial && session) {
          const cacheStartedAt = Date.now();
          // Read the room/read cursor first. The previous implementation also
          // normalised this value through the global SQLite write queue, so a
          // first frame could wait behind unrelated room-card or receipt
          // transactions even though all visible messages were already local.
          const cachedRoom = await loadCachedMessengerRoom(db, roomId);
          const roomStateLoadedAt = Date.now();
          const routeReadSequence = params.lastReadSequence || "0";
          const cachedReadSequence = cachedRoom?.last_read_sequence || "0";
          const localReadSequence =
            compareMessengerSequence(routeReadSequence, cachedReadSequence) >= 0
              ? routeReadSequence
              : cachedReadSequence;
          initialReadSequence.current = localReadSequence;
          initialUnreadBoundarySequence.current = localReadSequence;
          localReadStateFallback = localReadSequence;
          if (params.unreadCount === undefined && cachedRoom) {
            expectedUnreadCount = cachedRoom.unread_count;
          }
          const expectedLatestCandidates = [
            params.latestSequence,
            cachedRoom?.last_message?.sequence,
          ].filter((sequence): sequence is string => Boolean(sequence));
          let expectedLatestSequence = expectedLatestCandidates.reduce<
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
          initialUnreadTailSequence.current =
            expectedUnreadCount > 0 ? expectedLatestSequence : null;
          const windowStartedAt = Date.now();
          const [cached, pending] = await Promise.all([
            loadCachedMessengerMessageWindow(db, roomId, {
              anchorSequence: initialUnreadBoundarySequence.current,
              hasUnread: expectedUnreadCount > 0,
              limit: 20,
            }),
            loadMessengerOutbox(db, roomId),
          ]);
          const windowLoadedAt = Date.now();
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
            localSnapshotReady = true;
          }
          const localConfirmed = local.filter((message) => !message.pending);
          localLatestSequence = localConfirmed.at(-1)?.sequence ?? null;
          messengerLog("info", "room.cache.first_window_ready", {
            room_id: roomId,
            window_message_count: cached.length,
            pending_count: pendingMessages.length,
            room_state_duration_ms: roomStateLoadedAt - cacheStartedAt,
            window_duration_ms: windowLoadedAt - windowStartedAt,
            total_duration_ms: windowLoadedAt - cacheStartedAt,
            elapsed_since_tap_ms: windowLoadedAt - openedAt,
          });

          // Bounds and the complete-history marker are reconciliation
          // metadata. They must be read only after the first local viewport
          // has been handed to React.
          const metadataStartedAt = Date.now();
          const [historyComplete, cachedBounds] = await Promise.all([
            isMessengerRoomHistoryComplete(db, roomId),
            loadCachedMessengerMessageBounds(db, roomId),
          ]);
          cachedLatestSequence = cachedBounds.latest_sequence;
          if (
            cachedLatestSequence &&
            (!expectedLatestSequence ||
              compareMessengerSequence(
                cachedLatestSequence,
                expectedLatestSequence,
              ) > 0)
          ) {
            expectedLatestSequence = cachedLatestSequence;
            if (expectedUnreadCount > 0) {
              initialUnreadTailSequence.current = expectedLatestSequence;
            }
          }
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
            metadata_duration_ms: Date.now() - metadataStartedAt,
            total_duration_ms: Date.now() - cacheStartedAt,
          });
        }
        if (initial && localSnapshotReady) {
          // Give React two frames to commit and position the SQLite viewport
          // before any outbox or REST reconciliation work is started.
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          );
        }
        if (initial && localReadStateFallback) {
          // Normalisation is still persisted, but it is deliberately detached
          // from the critical first-frame path.
          void loadMessengerLocalReadState(
            db,
            roomId,
            localReadStateFallback,
          ).catch((error) =>
            messengerLog("debug", "room.read_state.normalization_deferred", {
              room_id: roomId,
              message: messengerErrorMessage(error),
            }),
          );
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
          : messagesRef.current.filter((message) => !message.pending).at(-1)
              ?.sequence;
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
          await applyRemoteMessages(page.items, remoteIsContiguousWithFeed);
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
      openedAt,
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
      elapsed_since_tap_ms: Date.now() - openedAt,
    });
    if (initialReadAcknowledged.current) return;
    initialReadAcknowledged.current = true;
    const visibleSequence = latestVisibleSequence.current;
    if (
      visibleSequence &&
      compareMessengerSequence(visibleSequence, initialReadSequence.current) > 0
    ) {
      initialReadSequence.current = visibleSequence;
      void acknowledgeLatest(visibleSequence).catch((error) =>
        console.warn(
          "[Messenger] Не удалось локально отметить видимые сообщения:",
          error,
        ),
      );
    }
  }, [acknowledgeLatest, clearInitialPositionTimers, openedAt, roomId]);

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
      const navigationTarget = messageNavigationTarget.current;
      if (navigationTarget) {
        navigationTarget.attempts += 1;
        listRef.current?.scrollToOffset({
          offset: Math.max(0, (info.averageItemLength || 72) * info.index),
          animated: false,
        });
        setTimeout(
          positionMessageNavigationTarget,
          Math.min(100 + navigationTarget.attempts * 40, 320),
        );
        return;
      }
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
    [positionInitialMessages, positionMessageNavigationTarget],
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

  const refreshRoomMembers = useCallback(async () => {
    if (!roomId || !session) return;
    try {
      const members = await getMessengerRoomMembers(roomId);
      if (roomType === "direct") {
        const peer = members.find((member) => member.id !== session.user.id);
        if (peer) {
          setPeerPresence({
            id: peer.id,
            online: peer.online,
            last_seen_at: peer.last_seen_at,
          });
        }
      } else {
        setRoomMemberCount(members.length);
      }
      setOffline(false);
    } catch (membersError) {
      if (isMessengerConnectionError(membersError)) setOffline(true);
      messengerLog("warn", "room.members.sync_failed", {
        room_id: roomId,
        message: messengerErrorMessage(membersError),
      });
    } finally {
      setRoomDetailsReady(true);
    }
  }, [roomId, roomType, session]);

  const refreshRoomIdentity = useCallback(async () => {
    try {
      const room = (await getMessengerRooms()).find(
        (candidate) => candidate.id === roomId,
      );
      if (!room) {
        router.replace("/messenger/rooms");
        return;
      }
      setRoomTitle(room.title);
      setRoomAvatarUrl(room.avatar_url);
      setRoomType(room.room_type);
      setRoomTeamId(room.team_id);
      if (typeof room.member_count === "number") {
        setRoomMemberCount(room.member_count);
      }
      if (room.peer) {
        setPeerPresence((current) => ({
          id: room.peer!.id,
          online: current?.id === room.peer!.id ? current.online : false,
          last_seen_at:
            current?.id === room.peer!.id
              ? current.last_seen_at
              : room.peer!.last_seen_at,
        }));
      }
    } catch (identityError) {
      messengerLog("warn", "room.identity.sync_failed", {
        room_id: roomId,
        message: messengerErrorMessage(identityError),
      });
    }
  }, [roomId, router]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        const controller = activeMediaUpload.current;
        const clientMessageId = activeMediaUploadClientId.current;
        activeMediaUpload.current = null;
        activeMediaUploadClientId.current = null;
        if (!controller) return;
        controller.abort();
        messengerLog("info", "media.upload.cancelled_on_blur", {
          room_id: roomId,
          client_message_id: clientMessageId,
        });
      };
    }, [roomId]),
  );

  useFocusEffect(
    useCallback(() => {
      if (!isAuthenticated) {
        router.replace("/messenger/register");
        return;
      }
      messengerLog("info", "room.screen.focused", {
        room_id: roomId,
        elapsed_since_tap_ms: Date.now() - openedAt,
      });
      setMessengerActiveRoom(roomId);
      const returningToRoom = roomFocusCount.current > 0;
      roomFocusCount.current += 1;
      void loadMessages(true);
      const roomDetailsFrame = requestAnimationFrame(() => {
        if (returningToRoom) void refreshRoomIdentity();
        void refreshRoomMembers();
      });
      const unsubscribe = subscribeMessengerRealtime((event) => {
        if (event.type === "connection.state") {
          setRealtimeConnected(event.connected);
          if (event.connected) {
            setOffline(false);
            scheduleConnectionSync();
          }
        } else if (event.type === "presence.updated") {
          setPeerPresence((current) =>
            current?.id === event.user_id
              ? {
                  id: current.id,
                  online: event.online,
                  last_seen_at: event.last_seen_at,
                }
              : current,
          );
        } else if (
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
          if (nearLatest.current) {
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
          if (event.type === "connection.ready") setRealtimeConnected(true);
          // A weak connection may emit several reconnect/ready pairs in quick
          // succession. The live events already update the feed, so one REST
          // reconciliation per ten seconds is sufficient and prevents the
          // request cascade visible in the diagnostic log.
          scheduleConnectionSync();
        } else if (event.type === "room.updated" && event.room_id === roomId) {
          if (event.deleted) router.replace("/messenger/rooms");
          else {
            void refreshRoomIdentity();
            void refreshRoomMembers();
          }
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
        cancelAnimationFrame(roomDetailsFrame);
        setMessengerActiveRoom(null);
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
        if (messageNavigationTimer.current) {
          clearTimeout(messageNavigationTimer.current);
          messageNavigationTimer.current = null;
        }
        messageNavigationTarget.current = null;
        clearInitialPositionTimers();
        pendingMessageAction.current = null;
        pendingAttachmentRequest.current = null;
      };
    }, [
      db,
      acknowledgeLatest,
      clearInitialPositionTimers,
      isAuthenticated,
      loadMessages,
      openedAt,
      roomId,
      refreshRoomIdentity,
      refreshRoomMembers,
      router,
      scheduleConnectionSync,
      scrollToLatest,
    ]),
  );

  const sendText = () => {
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

  const updatePendingAttachment = useCallback(
    (
      clientMessageId: string,
      update: (message: MessengerMessage) => MessengerMessage,
    ) => {
      setMessages((current) =>
        current.map((message) =>
          message.client_message_id === clientMessageId
            ? update(message)
            : message,
        ),
      );
    },
    [],
  );

  const sendUpload = useCallback(
    async (request: MediaUploadRequest, signal: AbortSignal) => {
      assertMessengerUploadLimits(request.files);
      const totalUploadBytes = request.files.reduce(
        (total, file) => total + (file.size_bytes ?? 0),
        0,
      );
      const uploadStartedAt = Date.now();
      messengerLog("info", "media.upload.started", {
        room_id: roomId,
        client_message_id: request.clientMessageId,
        media_count: request.files.length,
        media_types: request.files.map((file) => file.kind).join(","),
        upload_size_bytes: totalUploadBytes,
        upload_size_kb: Math.round(totalUploadBytes / 1024),
        has_caption: Boolean(request.caption),
      });
      let lastShownPercent = -1;
      const result = await sendMessengerMedia(
        roomId,
        request.clientMessageId,
        request.files,
        request.caption,
        request.replyTarget?.id,
        ({ percent }) => {
          if (signal.aborted) return;
          if (
            percent !== 100 &&
            lastShownPercent >= 0 &&
            percent < lastShownPercent + 5
          ) {
            return;
          }
          lastShownPercent = percent;
          updatePendingAttachment(request.clientMessageId, (message) => ({
            ...message,
            pending_attachment: message.pending_attachment
              ? {
                  ...message.pending_attachment,
                  label: `Загрузка: ${percent}%`,
                }
              : null,
          }));
        },
        signal,
      );
      const serverAcceptedAt = Date.now();
      messengerLog("info", "media.upload.server_accepted", {
        room_id: roomId,
        message_id: result.message.id,
        duration_ms: serverAcceptedAt - uploadStartedAt,
      });
      const confirmedMedia = result.message.media_items?.length
        ? result.message.media_items
        : result.message.media
          ? [result.message.media]
          : [];
      for (const [index, media] of confirmedMedia.entries()) {
        const file = request.files[index];
        if (!file) continue;
        try {
          // Seed before exposing the confirmed attachment. Otherwise the
          // attachment view starts an unnecessary download of the same file.
          await seedMessengerMediaCache(media, file.uri);
        } catch (cacheError) {
          messengerLog("warn", "media.cache.seed_failed", {
            asset_id: media.id,
            message:
              cacheError instanceof Error
                ? cacheError.message
                : "Не удалось сохранить локальную копию",
          });
        }
      }
      await storeSentMessage(result.message);
      messengerLog("info", "media.upload.completed", {
        room_id: roomId,
        message_id: result.message.id,
        media_count: confirmedMedia.length,
        stored_size_bytes: confirmedMedia.reduce(
          (total, media) => total + media.size_bytes,
          0,
        ),
        cache_seed_duration_ms: Date.now() - serverAcceptedAt,
      });
    },
    [roomId, storeSentMessage, updatePendingAttachment],
  );

  const chooseAttachment = useCallback(
    async (request: PendingAttachmentRequest) => {
      const { kind } = request;
      let contentPrepared = false;
      let clientMessageId: string | null = null;
      const preparationStartedAt = Date.now();
      messengerLog("debug", "attachment.action.started", {
        kind,
        room_id: roomId,
      });
      try {
        if (kind === "location") {
          if (!session) return;
          clientMessageId = Crypto.randomUUID();
          const replyTarget = replyingTo;
          const optimistic = pendingMessengerAttachmentMessage(
            roomId,
            clientMessageId,
            kind,
            "",
            session.user,
            replyTarget ?? undefined,
          );
          if (replyTarget) setReplyingTo(null);
          setMessages((current) =>
            mergeMessengerMessages(current, [optimistic]),
          );
          nearLatest.current = true;
          scrollToLatest(true);
          const location = await currentMessengerLocation();
          contentPrepared = true;
          updatePendingAttachment(clientMessageId, (message) => ({
            ...message,
            kind: "location",
            location,
            pending_attachment: message.pending_attachment
              ? {
                  ...message.pending_attachment,
                  stage: "uploading",
                  label: "Отправляем геопозицию…",
                }
              : null,
          }));
          if (nearLatest.current) scrollToLatest(true);
          messengerLog("info", "location.send.started", {
            room_id: roomId,
            client_message_id: clientMessageId,
            preparation_duration_ms: Date.now() - preparationStartedAt,
          });
          const result = await sendMessengerLocation(
            roomId,
            clientMessageId,
            location,
            replyTarget?.id,
          );
          await storeSentMessage(result.message);
          messengerLog("info", "location.send.completed", {
            room_id: roomId,
            message_id: result.message.id,
            latitude: result.message.location?.latitude,
            longitude: result.message.location?.longitude,
          });
          setOffline(false);
          setSyncError(null);
          return;
        }
        const files =
          kind === "camera"
            ? [await takeMessengerPhoto()].filter(
                (file): file is MessengerUploadFile => file !== null,
              )
            : kind === "library"
              ? await pickMessengerMedia(({ item, total, percent }) => {
                  setAttachmentPreparationLabel(
                    total > 1
                      ? `Подготовка видео ${item} из ${total}: ${percent}%`
                      : `Подготовка видео: ${percent}%`,
                  );
                })
              : [await pickMessengerFile()].filter(
                  (file): file is MessengerUploadFile => file !== null,
                );
        if (!files.length) {
          messengerLog("debug", "attachment.action.canceled", {
            kind,
            room_id: roomId,
          });
          return;
        }
        contentPrepared = true;
        setAttachmentDraft({ source: kind, files });
        messengerLog("debug", "attachment.action.prepared", {
          kind,
          room_id: roomId,
          media_count: files.length,
          media_types: files.map((file) => file.kind).join(","),
          preparation_duration_ms: Date.now() - preparationStartedAt,
        });
        setOffline(false);
        setSyncError(null);
      } catch (error) {
        const message = messengerErrorMessage(
          error,
          kind === "location"
            ? "Не удалось отправить геопозицию"
            : contentPrepared
              ? "Не удалось отправить вложение"
              : "Не удалось подготовить вложение",
        );
        if (contentPrepared) setOffline(isMessengerConnectionError(error));
        setSyncError(message);
        if (clientMessageId) {
          setReplyingTo((current) => current ?? replyingTo);
          updatePendingAttachment(clientMessageId, (pendingMessage) => ({
            ...pendingMessage,
            send_error: message,
            pending_attachment: pendingMessage.pending_attachment
              ? {
                  ...pendingMessage.pending_attachment,
                  stage: "failed",
                  label: "Геопозиция не отправлена",
                }
              : null,
          }));
        }
        messengerLog("warn", "attachment.action.failed", {
          kind,
          room_id: roomId,
          client_message_id: clientMessageId,
          content_prepared: contentPrepared,
          duration_ms: Date.now() - preparationStartedAt,
          message,
        });
        Alert.alert(
          kind === "location" ? "Геопозиция не отправлена" : "Ошибка вложения",
          message,
        );
      } finally {
        setAttachmentPreparationLabel(null);
        setSending(false);
      }
    },
    [
      replyingTo,
      roomId,
      scrollToLatest,
      session,
      storeSentMessage,
      updatePendingAttachment,
    ],
  );

  const runPendingAttachment = useCallback(() => {
    if (attachmentLaunchTimer.current) {
      clearTimeout(attachmentLaunchTimer.current);
      attachmentLaunchTimer.current = null;
    }
    const request = pendingAttachmentRequest.current;
    if (!request) return;
    pendingAttachmentRequest.current = null;
    void chooseAttachment(request);
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
      if (!roomId || !session || !canMedia) return;
      const request: PendingAttachmentRequest = { kind };
      pendingAttachmentRequest.current = request;
      setSending(true);
      messengerLog("debug", "attachment.action.queued", {
        kind,
        room_id: roomId,
      });
      setAttachmentMenuVisible(false);
      if (Platform.OS === "web") {
        pendingAttachmentRequest.current = null;
        void chooseAttachment(request);
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
    [
      canMedia,
      chooseAttachment,
      roomId,
      runPendingAttachment,
      sending,
      session,
    ],
  );

  const sendAttachmentDraft = useCallback(() => {
    if (!attachmentDraft || !roomId || !session || sending) return;
    const clientMessageId = Crypto.randomUUID();
    const caption = text.trim();
    const replyTarget = replyingTo;
    const request: MediaUploadRequest = {
      ...attachmentDraft,
      clientMessageId,
      caption,
      replyTarget,
    };
    const uploadController = new AbortController();
    activeMediaUpload.current?.abort();
    activeMediaUpload.current = uploadController;
    activeMediaUploadClientId.current = clientMessageId;
    const optimistic = pendingMessengerAttachmentMessage(
      roomId,
      clientMessageId,
      attachmentDraft.source,
      caption,
      session.user,
      replyTarget ?? undefined,
      attachmentDraft.files,
    );
    const uploadLabel =
      attachmentDraft.files.length > 1
        ? `Отправляем ${attachmentDraft.files.length} вложений…`
        : attachmentDraft.files[0]?.kind === "image"
          ? "Отправляем фотографию…"
          : attachmentDraft.files[0]?.kind === "video"
            ? "Отправляем видео…"
            : "Отправляем файл…";
    optimistic.pending_attachment = optimistic.pending_attachment
      ? {
          ...optimistic.pending_attachment,
          stage: "uploading",
          label: uploadLabel,
        }
      : null;
    setText("");
    setReplyingTo(null);
    setAttachmentDraft(null);
    setSending(true);
    setMessages((current) => mergeMessengerMessages(current, [optimistic]));
    nearLatest.current = true;
    scrollToLatest(true);
    requestAnimationFrame(() => {
      void sendUpload(request, uploadController.signal)
        .then(() => {
          setOffline(false);
          setSyncError(null);
        })
        .catch((error) => {
          if (isMessengerUploadCancelledError(error)) return;
          const message = messengerErrorMessage(
            error,
            "Не удалось отправить вложение",
          );
          setOffline(isMessengerConnectionError(error));
          setSyncError(message);
          updatePendingAttachment(clientMessageId, (pendingMessage) => ({
            ...pendingMessage,
            send_error: message,
            pending_attachment: pendingMessage.pending_attachment
              ? {
                  ...pendingMessage.pending_attachment,
                  stage: "failed",
                  label: "Вложения не отправлены",
                }
              : null,
          }));
          messengerLog("warn", "media.upload.failed", {
            room_id: roomId,
            client_message_id: clientMessageId,
            media_count: request.files.length,
            message,
          });
          Alert.alert("Ошибка вложения", message);
        })
        .finally(() => {
          if (activeMediaUpload.current !== uploadController) return;
          activeMediaUpload.current = null;
          activeMediaUploadClientId.current = null;
          setSending(false);
        });
    });
  }, [
    attachmentDraft,
    replyingTo,
    roomId,
    scrollToLatest,
    sendUpload,
    sending,
    session,
    text,
    updatePendingAttachment,
  ]);

  const send = () => {
    if (attachmentDraft) {
      sendAttachmentDraft();
      return;
    }
    sendText();
  };

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
      // Replying is an explicit transition back to the composer. Unlike
      // reactions, receipts and incoming events, it may reveal the newest
      // message and move the feed to the bottom.
      nearLatest.current = true;
      scrollToLatest(true);
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    [canWrite, scrollToLatest],
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

  const roomSubtitle =
    !initialDataReady || !roomDetailsReady
      ? "Обновление"
      : offline || !realtimeConnected
        ? "Нет соединения с сервером"
        : syncError
          ? "Ошибка синхронизации"
          : roomType === "direct"
            ? peerPresence?.online
              ? "В сети"
              : lastSeenText(peerPresence?.last_seen_at ?? null)
            : participantCountText(roomMemberCount);

  const openGroupSettings = () => {
    if (roomType === "direct") return;
    router.push({
      pathname: "/messenger/group/[id]",
      params: {
        id: roomId,
        title: roomTitle,
        roomType,
        teamId: roomTeamId,
        avatarUrl: roomAvatarUrl || "",
      },
    });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        // Android is resized by windowSoftInputMode=adjustResize from
        // app.config.js. Applying a second JS height correction here can
        // double-shrink the feed on devices where adjustResize works.
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => router.dismissTo("/messenger/rooms")}
            accessibilityLabel="Вернуться к списку чатов"
          >
            <Icon name="chevron-back" size={28} color={colors.primary} />
          </TouchableOpacity>
          {roomType !== "direct" ? (
            <TouchableOpacity
              style={styles.groupHeaderTarget}
              onPress={openGroupSettings}
              accessibilityRole="button"
              accessibilityLabel="Открыть информацию и настройки группы"
            >
              <AuthenticatedAvatar
                displayName={roomTitle}
                avatarUrl={roomAvatarUrl}
                accessToken={session?.access_token}
                size={42}
              />
              <View style={styles.headerText}>
                <Text style={styles.title} numberOfLines={1}>
                  {roomTitle}
                </Text>
                <Text style={styles.subtitle} numberOfLines={1}>
                  {roomSubtitle}
                </Text>
              </View>
            </TouchableOpacity>
          ) : (
            <View style={styles.headerText}>
              <Text style={styles.title} numberOfLines={1}>
                {roomTitle}
              </Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {roomSubtitle}
              </Text>
            </View>
          )}
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
              if (keyboardScrollPending.current) {
                scrollToLatest(true);
              }
            }}
            initialNumToRender={18}
            maxToRenderPerBatch={14}
            windowSize={9}
            keyboardDismissMode={
              Platform.OS === "ios" ? "interactive" : "on-drag"
            }
            keyboardShouldPersistTaps="handled"
            maintainVisibleContentPosition={
              listReady ? { minIndexForVisible: 0 } : undefined
            }
            onScroll={handleListScroll}
            onScrollBeginDrag={beginManualFeedNavigation}
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
              clearPendingLatestScroll();
              if (!nearLatest.current) return;
              listRef.current?.scrollToEnd({ animated });
            }}
            renderItem={({ item }) => {
              const mine = item.author.id === session?.user.id;
              const media = item.deleted_at ? null : (item.media ?? null);
              const mediaItems = item.deleted_at
                ? []
                : item.media_items?.length
                  ? item.media_items
                  : media
                    ? [media]
                    : [];
              const location = item.deleted_at ? null : (item.location ?? null);
              const pendingAttachment = item.deleted_at
                ? null
                : (item.pending_attachment ?? null);
              const body = item.deleted_at
                ? "Сообщение удалено"
                : item.text ||
                  (!mediaItems.length && !location && !pendingAttachment
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
              if (item.kind === "system") {
                return (
                  <View collapsable={false}>
                    {item.client_message_id === unreadMarkerClientId && (
                      <UnreadDivider />
                    )}
                    <View style={styles.systemMessageRow}>
                      <View style={styles.systemMessage}>
                        <Text style={styles.systemMessageText}>{body}</Text>
                        <Text style={styles.systemMessageTime}>
                          {new Date(item.created_at).toLocaleTimeString("ru-RU", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              }
              return (
                <View collapsable={false}>
                  {item.client_message_id === unreadMarkerClientId && (
                    <UnreadDivider />
                  )}
                  <SwipeableMessage
                    enabled={canWrite && !item.pending && !item.deleted_at}
                    animateEntry={Boolean(item.pending && mine)}
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
                            highlightedMessageId === item.id &&
                              styles.highlightedMessage,
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
                                <Text
                                  style={
                                    roomType === "direct"
                                      ? undefined
                                      : {
                                          color: messengerAuthorColor(
                                            item.forwarded_from.author.id,
                                          ),
                                        }
                                  }
                                >
                                  {item.forwarded_from.author.display_name}
                                </Text>
                              </Text>
                            </View>
                          )}
                          {item.reply_to && (
                            <Pressable
                              style={styles.replyQuote}
                              onPress={() =>
                                void navigateToRepliedMessage(item.reply_to!)
                              }
                              accessibilityRole="button"
                              accessibilityLabel="Перейти к исходному сообщению"
                            >
                              <Text
                                style={[
                                  styles.replyAuthor,
                                  roomType !== "direct" && {
                                    color: messengerAuthorColor(
                                      item.reply_to.author.id,
                                    ),
                                  },
                                ]}
                                numberOfLines={1}
                              >
                                {item.reply_to.author.display_name}
                              </Text>
                              <Text style={styles.replyText} numberOfLines={1}>
                                {replyPreview(item.reply_to)}
                              </Text>
                            </Pressable>
                          )}
                          {!mine && (
                            <Text
                              style={[
                                styles.author,
                                roomType !== "direct" && {
                                  color: messengerAuthorColor(item.author.id),
                                },
                              ]}
                              numberOfLines={1}
                            >
                              {item.author.display_name}
                            </Text>
                          )}
                          {(mediaItems.length > 0 || location) &&
                            session?.access_token && (
                              <MessengerAttachmentView
                                media={media}
                                mediaItems={mediaItems}
                                location={location}
                                accessToken={session.access_token}
                                deferAutomaticCache={
                                  !listReady ||
                                  (mine &&
                                    activeMediaUploadClientId.current ===
                                      item.client_message_id)
                                }
                              />
                            )}
                          {pendingAttachment ? (
                            <PendingAttachmentView
                              message={item}
                              pending={pendingAttachment}
                            />
                          ) : null}
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
                          <View style={styles.messageFooter}>
                            {item.reactions.length > 0 && (
                              <ScrollView
                                horizontal
                                nestedScrollEnabled
                                showsHorizontalScrollIndicator={false}
                                style={styles.reactionScroller}
                                contentContainerStyle={styles.reactionSummary}
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
                                      void toggleReaction(
                                        item,
                                        reaction.reaction,
                                      )
                                    }
                                    disabled={
                                      !canReact || reactionBusyIds.has(item.id)
                                    }
                                    accessibilityLabel={`${reaction.reaction}, реакций: ${reaction.count}`}
                                  >
                                    <Text style={styles.reactionText}>
                                      {reaction.reaction}
                                      {reaction.count >= 2
                                        ? ` ${reaction.count}`
                                        : ""}
                                    </Text>
                                  </TouchableOpacity>
                                ))}
                              </ScrollView>
                            )}
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
                        </View>
                      </View>
                    </View>
                  </SwipeableMessage>
                </View>
              );
            }}
            ListEmptyComponent={
              loading ? (
                <View style={styles.empty}>
                  <ActivityIndicator size="large" color={colors.primary} />
                </View>
              ) : (
                <View style={styles.empty}>
                  <Icon
                    name="chatbox-ellipses-outline"
                    size={56}
                    color={colors.textSecondary}
                  />
                  <Text style={styles.emptyTitle}>Начните общение</Text>
                </View>
              )
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
              {actionMessage?.media &&
              (actionMessage.media_items?.length ?? 1) <= 1 ? (
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
                  style={styles.messageAction}
                  onPress={() => queueMessageAction("forward", actionMessage)}
                >
                  <Icon name="arrow-redo" size={21} color={colors.primary} />
                  <Text style={styles.messageActionText}>Переслать</Text>
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
                В медиатеке можно выбрать до {MAX_MESSENGER_MEDIA_SELECTION}{" "}
                фото и видео. Медиа автоматически сжимаются перед отправкой.
                Максимальный размер файла или всех вложений сообщения — 50 МБ.
              </Text>
            </Pressable>
          </Pressable>
        </Modal>

        {canWrite ? (
          <View style={styles.composerShell}>
            {attachmentPreparationLabel && (
              <View style={styles.attachmentPreparation}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.attachmentPreparationText}>
                  {attachmentPreparationLabel}
                </Text>
              </View>
            )}
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
            {attachmentDraft && (
              <View style={styles.attachmentDraft}>
                <ScrollView
                  style={styles.attachmentDraftScroll}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.attachmentDraftItems}
                >
                  {attachmentDraft.files.map((file, index) => (
                    <View
                      key={`${file.uri}:${index}`}
                      style={styles.attachmentDraftTile}
                    >
                      {file.kind === "image" ? (
                        <Image
                          source={file.uri}
                          style={styles.attachmentDraftImage}
                          contentFit="cover"
                        />
                      ) : (
                        <View style={styles.attachmentDraftFile}>
                          <Icon
                            name={
                              file.kind === "video"
                                ? "play-circle"
                                : "document-text"
                            }
                            size={27}
                            color={colors.primary}
                          />
                        </View>
                      )}
                      {attachmentDraft.files.length > 1 && (
                        <View style={styles.attachmentDraftIndex}>
                          <Text style={styles.attachmentDraftIndexText}>
                            {index + 1}
                          </Text>
                        </View>
                      )}
                    </View>
                  ))}
                </ScrollView>
                <View style={styles.attachmentDraftSummary}>
                  <Text style={styles.attachmentDraftTitle} numberOfLines={1}>
                    {attachmentDraft.files.length === 1
                      ? attachmentDraft.files[0]?.name
                      : `${attachmentDraft.files.length} вложений`}
                  </Text>
                  <Text style={styles.attachmentDraftHint}>
                    Добавьте подпись в поле сообщения
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.cancelAttachmentDraft}
                  onPress={() => setAttachmentDraft(null)}
                  disabled={sending}
                  accessibilityLabel="Убрать выбранные вложения"
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
                  disabled={sending || Boolean(attachmentDraft)}
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
                placeholder={attachmentDraft ? "Подпись" : "Сообщение"}
                multiline
                maxLength={attachmentDraft ? 1000 : 4000}
                onFocus={() => {
                  if (!nearLatest.current) return;
                  keyboardScrollPending.current = true;
                  scrollToLatest(true);
                }}
              />
              <TouchableOpacity
                style={[
                  styles.sendButton,
                  !text.trim() && !attachmentDraft && styles.sendButtonDisabled,
                ]}
                onPress={send}
                disabled={sending || (!text.trim() && !attachmentDraft)}
              >
                {sending ? (
                  <ActivityIndicator size="small" color={colors.white} />
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
  groupHeaderTarget: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
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
  systemMessageRow: {
    width: "100%",
    alignItems: "center",
    marginBottom: 10,
  },
  systemMessage: {
    maxWidth: "88%",
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.22)",
    borderRadius: 13,
    backgroundColor: "rgba(234, 243, 255, 0.9)",
  },
  systemMessageText: {
    flexShrink: 1,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
    textAlign: "center",
  },
  systemMessageTime: { color: colors.textSecondary, fontSize: 9 },
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
  highlightedMessage: {
    borderWidth: 2,
    borderColor: colors.accent,
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
  pendingAttachment: {
    minWidth: 190,
    maxWidth: 248,
  },
  pendingAttachmentImage: {
    width: 224,
    height: 164,
    marginBottom: 7,
    borderRadius: 11,
    backgroundColor: "rgba(255, 255, 255, 0.55)",
  },
  pendingAttachmentAlbum: {
    width: 224,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginBottom: 7,
  },
  pendingAttachmentAlbumTile: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: 9,
    backgroundColor: "rgba(255, 255, 255, 0.62)",
  },
  pendingAttachmentAlbumImage: { width: "100%", height: "100%" },
  pendingAttachmentStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    minHeight: 36,
  },
  pendingAttachmentText: { flex: 1, minWidth: 0 },
  pendingAttachmentLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  pendingAttachmentLabelFailed: { color: colors.error },
  pendingAttachmentDetails: {
    marginTop: 2,
    color: colors.textSecondary,
    fontSize: 10,
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
  messageFooter: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 5,
  },
  messageMeta: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginLeft: "auto",
    minHeight: 28,
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
    gap: 4,
    alignItems: "center",
  },
  reactionScroller: { flexGrow: 0, flexShrink: 1 },
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
  attachmentPreparation: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 14,
    paddingTop: 8,
  },
  attachmentPreparationText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  attachmentDraft: {
    minHeight: 82,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginHorizontal: 10,
    marginTop: 8,
    padding: 7,
    borderWidth: 1,
    borderColor: "#C7DBF3",
    borderRadius: 14,
    backgroundColor: "#EAF3FF",
  },
  attachmentDraftItems: { gap: 5 },
  attachmentDraftScroll: { maxWidth: 132, flexGrow: 0 },
  attachmentDraftTile: {
    width: 62,
    height: 62,
    overflow: "hidden",
    borderRadius: 10,
    backgroundColor: colors.backgroundAlt,
  },
  attachmentDraftImage: { width: "100%", height: "100%" },
  attachmentDraftFile: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  attachmentDraftIndex: {
    position: "absolute",
    right: 4,
    bottom: 4,
    minWidth: 19,
    height: 19,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: "rgba(27, 54, 93, 0.82)",
  },
  attachmentDraftIndexText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: "800",
  },
  attachmentDraftSummary: { flex: 1, minWidth: 90 },
  attachmentDraftTitle: { color: colors.text, fontSize: 12, fontWeight: "800" },
  attachmentDraftHint: {
    marginTop: 3,
    color: colors.textSecondary,
    fontSize: 10,
    lineHeight: 13,
  },
  cancelAttachmentDraft: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
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
