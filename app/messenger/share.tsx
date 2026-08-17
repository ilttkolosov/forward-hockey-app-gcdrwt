import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";
import { useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import {
  type ShareIntentFile,
  useShareIntentContext,
} from "expo-share-intent";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Platform,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "../../components/Icon";
import { useMessengerAuth } from "../../contexts/MessengerAuthContext";
import AuthenticatedAvatar from "../../features/messenger/AuthenticatedAvatar";
import {
  cacheIncomingMessengerMessage,
  cacheMessengerRooms,
  loadCachedMessengerRooms,
} from "../../features/messenger/repository";
import type {
  MessengerContact,
  MessengerRoom,
} from "../../features/messenger/types";
import {
  createMessengerDirectRoom,
  getMessengerContacts,
  getMessengerRooms,
  isMessengerConnectionError,
  messengerErrorMessage,
  sendMessengerMedia,
  sendMessengerText,
} from "../../services/messengerApi";
import {
  MAX_MESSENGER_MEDIA_SELECTION,
  prepareMessengerSharedFiles,
  type MessengerSharedFile,
} from "../../services/messengerAttachmentPicker";
import { messengerLog } from "../../services/messengerLogger";
import {
  beginLocalMessengerMediaUpload,
  endLocalMessengerMediaUpload,
  seedMessengerMediaCache,
} from "../../services/messengerMediaCache";
import { runManagedMessengerMediaUpload } from "../../services/messengerMediaUploadManager";
import { warmMessengerBufferedUploadFiles } from "../../services/messengerMediaUploadWarmup";
import { prioritizeMessengerForegroundTransport } from "../../services/messengerTransport";
import { colors } from "../../styles/commonStyles";

type ShareTarget =
  | {
      key: string;
      kind: "room";
      title: string;
      subtitle: string;
      avatarUrl: string | null;
      room: MessengerRoom;
    }
  | {
      key: string;
      kind: "contact";
      title: string;
      subtitle: string;
      avatarUrl: string | null;
      contact: MessengerContact;
    };

interface TargetSection {
  title: string;
  data: ShareTarget[];
}

type SendPhase = "idle" | "preparing" | "uploading" | "sent";

function normalizedShareText(
  text: string | null | undefined,
  webUrl: string | null | undefined,
): string {
  const body = text?.trim() || "";
  const url = webUrl?.trim() || "";
  if (!url || body.includes(url)) return body || url;
  return body ? `${body}\n${url}` : url;
}

function fileTitle(file: ShareIntentFile, index: number): string {
  return file.fileName?.trim() || `Вложение ${index + 1}`;
}

function targetMatches(target: ShareTarget, query: string): boolean {
  if (!query) return true;
  return `${target.title} ${target.subtitle}`
    .toLocaleLowerCase("ru")
    .includes(query);
}

function roomSubtitle(room: MessengerRoom): string {
  if (room.room_type === "saved") return "Ваше избранное";
  if (room.room_type === "direct") return "Личный чат";
  if (room.room_type === "private_group") {
    return typeof room.member_count === "number"
      ? `Группа · ${room.member_count} участников`
      : "Группа";
  }
  return room.team_name || "Командный чат";
}

function shareFileToMessengerFile(file: ShareIntentFile): MessengerSharedFile {
  return {
    uri: file.path,
    name: file.fileName,
    mime_type: file.mimeType,
    size_bytes: file.size,
    width: file.width,
    height: file.height,
    duration_ms: file.duration,
  };
}

async function cleanupIosShareFiles(files: readonly ShareIntentFile[]) {
  if (Platform.OS !== "ios") return;
  await Promise.all(
    files.map(async (file) => {
      const path = file.path || "";
      if (!path.includes("/Shared/AppGroup/")) return;
      const uri = path.startsWith("file://") ? path : `file://${path}`;
      await FileSystem.deleteAsync(uri, { idempotent: true }).catch(
        () => undefined,
      );
    }),
  );
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export default function MessengerShareScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { status, session } = useMessengerAuth();
  const {
    isReady: shareIntentReady,
    hasShareIntent,
    shareIntent,
    error: shareIntentError,
    resetShareIntent,
  } = useShareIntentContext();
  const sharedFiles = useMemo(
    () => shareIntent.files ?? [],
    [shareIntent.files],
  );
  const hasFiles = sharedFiles.length > 0;
  const textLimit = hasFiles ? 1000 : 4000;
  const shareSignature = useMemo(
    () =>
      JSON.stringify({
        text: shareIntent.text,
        webUrl: shareIntent.webUrl,
        files: sharedFiles.map((file) => [file.path, file.size]),
      }),
    [shareIntent.text, shareIntent.webUrl, sharedFiles],
  );
  const [message, setMessage] = useState("");
  const [rooms, setRooms] = useState<MessengerRoom[]>([]);
  const [contacts, setContacts] = useState<MessengerContact[]>([]);
  const [loadingTargets, setLoadingTargets] = useState(true);
  const [targetsError, setTargetsError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [sendPhase, setSendPhase] = useState<SendPhase>("idle");
  const [progress, setProgress] = useState<number | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  // Keep the controls locked after the server response too. Without this the
  // short success confirmation window allowed a second tap to start a second
  // message before the share flow was closed.
  const sending = sendPhase !== "idle";
  const transferInProgress =
    sendPhase === "preparing" || sendPhase === "uploading";

  useEffect(() => {
    const initial = normalizedShareText(
      shareIntent.text,
      shareIntent.webUrl,
    );
    setMessage(initial.slice(0, hasFiles ? 1000 : 4000));
    setSelectedKey(null);
    setSendError(null);
    setSendPhase("idle");
    setProgress(null);
  }, [hasFiles, shareIntent.text, shareIntent.webUrl, shareSignature]);

  const loadTargets = useCallback(async () => {
    if (status !== "authenticated") {
      setLoadingTargets(false);
      return;
    }
    setLoadingTargets(true);
    setTargetsError(null);
    let cached: MessengerRoom[] = [];
    try {
      cached = await loadCachedMessengerRooms(db);
      if (cached.length) setRooms(cached);
    } catch (cacheError) {
      messengerLog("debug", "share_targets.cache_failed", {
        message: messengerErrorMessage(cacheError),
      });
    }

    const [roomsResult, contactsResult] = await Promise.allSettled([
      getMessengerRooms({ priority: "foreground" }),
      getMessengerContacts(),
    ]);
    let firstError: unknown = null;
    if (roomsResult.status === "fulfilled") {
      const reconciled = await cacheMessengerRooms(db, roomsResult.value).catch(
        () => roomsResult.value,
      );
      setRooms(reconciled);
    } else {
      firstError = roomsResult.reason;
    }
    if (contactsResult.status === "fulfilled") {
      setContacts(contactsResult.value);
    } else {
      firstError ??= contactsResult.reason;
    }
    if (firstError && !cached.length) {
      setTargetsError(
        messengerErrorMessage(firstError, "Не удалось загрузить получателей"),
      );
    }
    setLoadingTargets(false);
  }, [db, status]);

  useEffect(() => {
    void loadTargets();
  }, [loadTargets]);

  useEffect(() => {
    if (status !== "password_change_required") return;
    router.replace({
      pathname: "/messenger/change-password",
      params: { sharePending: "1" },
    });
  }, [router, status]);

  const sections = useMemo<TargetSection[]>(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ru");
    const writableRooms = rooms
      .filter(
        (room) =>
          room.can_write && (!hasFiles || room.can_send_media),
      )
      .map<ShareTarget>((room) => ({
        key: `room:${room.id}`,
        kind: "room",
        title: room.title,
        subtitle: roomSubtitle(room),
        avatarUrl:
          room.room_type === "direct"
            ? room.peer?.avatar_url || room.avatar_url
            : room.avatar_url,
        room,
      }))
      .filter((target) => targetMatches(target, normalizedQuery));

    const representedPeople = new Set(
      rooms
        .filter((room) => room.room_type === "direct" && room.peer)
        .map((room) => `${room.team_id}:${room.peer?.id}`),
    );
    const availableContacts = contacts
      .filter(
        (contact) =>
          !representedPeople.has(`${contact.team_id}:${contact.id}`),
      )
      .map<ShareTarget>((contact) => ({
        key: `contact:${contact.team_id}:${contact.id}`,
        kind: "contact",
        title: contact.display_name,
        subtitle: contact.team_name || "Личное сообщение",
        avatarUrl: contact.avatar_url,
        contact,
      }))
      .filter((target) => targetMatches(target, normalizedQuery));

    const next: TargetSection[] = [];
    if (writableRooms.length) next.push({ title: "Чаты", data: writableRooms });
    if (availableContacts.length) {
      next.push({ title: "Новый личный чат", data: availableContacts });
    }
    return next;
  }, [contacts, hasFiles, query, rooms]);

  const selectedTarget = useMemo(
    () =>
      sections
        .flatMap((section) => section.data)
        .find((target) => target.key === selectedKey) || null,
    [sections, selectedKey],
  );

  const finishShare = useCallback(async () => {
    resetShareIntent();
    await cleanupIosShareFiles(sharedFiles);
    if (Platform.OS === "android") {
      await wait(80);
      BackHandler.exitApp();
      return;
    }
    router.replace("/messenger/rooms");
  }, [resetShareIntent, router, sharedFiles]);

  const cancelShare = useCallback(() => {
    if (sending) return;
    void finishShare();
  }, [finishShare, sending]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (!sending) void finishShare();
        return true;
      },
    );
    return () => subscription.remove();
  }, [finishShare, sending]);

  const resolveRoom = useCallback(
    async (target: ShareTarget): Promise<MessengerRoom | { id: string }> => {
      if (target.kind === "room") return target.room;
      const knownRoom = target.contact.direct_room_id;
      if (knownRoom) {
        return rooms.find((room) => room.id === knownRoom) || { id: knownRoom };
      }
      const result = await createMessengerDirectRoom(
        target.contact.team_id,
        target.contact.id,
      );
      if (hasFiles && !result.room.can_send_media) {
        throw new Error("В этот чат нельзя отправлять файлы и медиа");
      }
      const nextRooms = rooms.some((room) => room.id === result.room.id)
        ? rooms
        : [...rooms, result.room];
      setRooms(nextRooms);
      await cacheMessengerRooms(db, nextRooms).catch((cacheError) => {
        messengerLog("warn", "share_targets.direct_room_cache_failed", {
          room_id: result.room.id,
          message: messengerErrorMessage(cacheError),
        });
      });
      return result.room;
    },
    [db, hasFiles, rooms],
  );

  const send = useCallback(async () => {
    if (!selectedTarget || !session || sending) return;
    const body = message.trim();
    if (!hasFiles && !body) {
      setSendError("Нет текста или вложения для отправки");
      return;
    }
    if (sharedFiles.length > MAX_MESSENGER_MEDIA_SELECTION) {
      setSendError(
        `Можно отправить не более ${MAX_MESSENGER_MEDIA_SELECTION} вложений за один раз`,
      );
      return;
    }

    setSendError(null);
    setProgress(null);
    prioritizeMessengerForegroundTransport();
    const clientMessageId = Crypto.randomUUID();
    try {
      const targetRoom = await resolveRoom(selectedTarget);
      const roomId = targetRoom.id;
      messengerLog("info", "share_send.started", {
        room_id: roomId,
        client_message_id: clientMessageId,
        content_type: shareIntent.type,
        file_count: sharedFiles.length,
        has_text: Boolean(body),
      });

      let sentMessage;
      if (hasFiles) {
        beginLocalMessengerMediaUpload(clientMessageId);
        try {
          setSendPhase("preparing");
          const files = await prepareMessengerSharedFiles(
            sharedFiles.map(shareFileToMessengerFile),
            ({ item, total, percent }) => {
              const completed = (item - 1 + percent / 100) / total;
              setProgress(Math.round(completed * 100));
            },
          );
          await warmMessengerBufferedUploadFiles(files);
          setSendPhase("uploading");
          setProgress(0);
          const result = await runManagedMessengerMediaUpload({
            roomId,
            clientMessageId,
            run: (signal) =>
              sendMessengerMedia(
                roomId,
                clientMessageId,
                files,
                body || undefined,
                null,
                ({ percent }) => setProgress(percent),
                signal,
              ),
          });
          sentMessage = result.message;
          const confirmedMedia = sentMessage.media_items?.length
            ? sentMessage.media_items
            : sentMessage.media
              ? [sentMessage.media]
              : [];
          for (const [index, media] of confirmedMedia.entries()) {
            const source = files[index];
            if (!source) continue;
            await seedMessengerMediaCache(media, source.uri).catch(
              (cacheError) => {
                messengerLog("warn", "share_send.media_cache_seed_failed", {
                  asset_id: media.id,
                  message: messengerErrorMessage(cacheError),
                });
              },
            );
          }
        } finally {
          endLocalMessengerMediaUpload(clientMessageId);
        }
      } else {
        setSendPhase("uploading");
        const result = await sendMessengerText(
          roomId,
          clientMessageId,
          body,
        );
        sentMessage = result.message;
      }

      await cacheIncomingMessengerMessage(
        db,
        sentMessage,
        session.user.id,
      ).catch((cacheError) => {
        messengerLog("warn", "share_send.cache_failed", {
          room_id: roomId,
          message: messengerErrorMessage(cacheError),
        });
      });
      setSendPhase("sent");
      setProgress(100);
      messengerLog("info", "share_send.completed", {
        room_id: roomId,
        client_message_id: clientMessageId,
        message_id: sentMessage.id,
      });
      await wait(500);
      await finishShare();
    } catch (error) {
      const messageText = messengerErrorMessage(
        error,
        "Не удалось отправить выбранный материал",
      );
      setSendPhase("idle");
      setProgress(null);
      setSendError(messageText);
      messengerLog("warn", "share_send.failed", {
        category: isMessengerConnectionError(error) ? "connection" : "server",
        message: messageText,
      });
    }
  }, [
    db,
    finishShare,
    hasFiles,
    message,
    resolveRoom,
    selectedTarget,
    sending,
    session,
    shareIntent.type,
    sharedFiles,
  ]);

  const firstImage = sharedFiles.find((file) =>
    file.mimeType?.startsWith("image/"),
  );
  const contentError =
    (shareIntentError
      ? "Не удалось получить материал из системного меню"
      : null) ||
    (shareIntentReady && !hasShareIntent
      ? "Материал для отправки больше недоступен"
      : null);
  const sendDisabled =
    !selectedTarget ||
    sending ||
    !hasShareIntent ||
    Boolean(contentError) ||
    (!hasFiles && !message.trim());

  if (status === "loading") {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.centeredText}>Проверяем учётную запись…</Text>
      </SafeAreaView>
    );
  }

  if (status !== "authenticated" || !session) {
    return (
      <SafeAreaView style={styles.centered}>
        <Icon name="lock-closed-outline" size={54} color={colors.primary} />
        <Text style={styles.centeredTitle}>Нужно войти в мессенджер</Text>
        <Text style={styles.centeredText}>
          Материал сохранён. После входа можно будет выбрать получателя.
        </Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() =>
            router.push({
              pathname: "/messenger/register",
              params: { sharePending: "1" },
            })
          }
        >
          <Text style={styles.primaryButtonText}>Войти</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={cancelShare}>
          <Text style={styles.secondaryButtonText}>Отменить</Text>
        </TouchableOpacity>
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
            style={styles.headerButton}
            onPress={cancelShare}
            disabled={sending}
            accessibilityLabel="Отменить отправку"
          >
            <Icon name="close" size={27} color={colors.primary} />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.title}>Поделиться</Text>
            <Text style={styles.subtitle}>Выберите получателя</Text>
          </View>
          <View style={styles.headerButton} />
        </View>

        <SectionList
          sections={sections}
          keyExtractor={(item) => item.key}
          keyboardShouldPersistTaps="handled"
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <>
              <View style={styles.sharedCard}>
                {firstImage ? (
                  <Image
                    source={{ uri: firstImage.path }}
                    style={styles.sharedPreview}
                    resizeMode="cover"
                  />
                ) : hasFiles ? (
                  <View style={styles.sharedFileIcon}>
                    <Icon
                      name={
                        sharedFiles.some((file) =>
                          file.mimeType?.startsWith("video/"),
                        )
                          ? "videocam-outline"
                          : "document-attach-outline"
                      }
                      size={34}
                      color={colors.primary}
                    />
                  </View>
                ) : (
                  <View style={styles.sharedFileIcon}>
                    <Icon
                      name="link-outline"
                      size={34}
                      color={colors.primary}
                    />
                  </View>
                )}
                <View style={styles.sharedContent}>
                  <Text style={styles.sharedTitle} numberOfLines={1}>
                    {hasFiles
                      ? sharedFiles.length === 1
                        ? fileTitle(sharedFiles[0], 0)
                        : `${sharedFiles.length} вложений`
                      : "Текст или ссылка"}
                  </Text>
                  {hasFiles && sharedFiles.length > 1 && (
                    <Text style={styles.sharedNames} numberOfLines={2}>
                      {sharedFiles
                        .slice(0, 3)
                        .map(fileTitle)
                        .join(", ")}
                    </Text>
                  )}
                </View>
              </View>

              <View style={styles.messageCard}>
                <Text style={styles.inputLabel}>
                  {hasFiles ? "Подпись" : "Сообщение"}
                </Text>
                <TextInput
                  style={styles.messageInput}
                  value={message}
                  onChangeText={setMessage}
                  maxLength={textLimit}
                  multiline
                  editable={!sending}
                  placeholder={hasFiles ? "Добавьте подпись" : "Текст"}
                  placeholderTextColor={colors.textSecondary}
                  textAlignVertical="top"
                />
                <Text style={styles.characterCount}>
                  {message.length}/{textLimit}
                </Text>
              </View>

              <View style={styles.searchBox}>
                <Icon
                  name="search-outline"
                  size={20}
                  color={colors.textSecondary}
                />
                <TextInput
                  style={styles.searchInput}
                  value={query}
                  onChangeText={setQuery}
                  editable={!sending}
                  placeholder="Поиск чата или пользователя"
                  placeholderTextColor={colors.textSecondary}
                  autoCapitalize="none"
                />
              </View>

              {(contentError || targetsError || sendError) && (
                <View style={styles.errorCard}>
                  <Icon
                    name="alert-circle-outline"
                    size={21}
                    color={colors.error}
                  />
                  <Text style={styles.errorText}>
                    {contentError || targetsError || sendError}
                  </Text>
                </View>
              )}
              {targetsError && (
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={() => void loadTargets()}
                >
                  <Text style={styles.retryText}>Повторить загрузку</Text>
                </TouchableOpacity>
              )}
            </>
          }
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionTitle}>{section.title}</Text>
          )}
          renderItem={({ item }) => {
            const selected = item.key === selectedKey;
            return (
              <TouchableOpacity
                style={[styles.targetRow, selected && styles.targetRowSelected]}
                onPress={() => setSelectedKey(item.key)}
                disabled={sending}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
              >
                <AuthenticatedAvatar
                  displayName={item.title}
                  avatarUrl={item.avatarUrl}
                  accessToken={session.access_token}
                  size={50}
                />
                <View style={styles.targetText}>
                  <Text style={styles.targetTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.targetSubtitle} numberOfLines={1}>
                    {item.subtitle}
                  </Text>
                </View>
                <View
                  style={[
                    styles.selectionCircle,
                    selected && styles.selectionCircleSelected,
                  ]}
                >
                  {selected && (
                    <Icon name="checkmark" size={17} color={colors.white} />
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            loadingTargets ? (
              <View style={styles.listStatus}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.listStatusText}>Загружаем получателей…</Text>
              </View>
            ) : (
              <View style={styles.listStatus}>
                <Text style={styles.listStatusText}>
                  {query.trim()
                    ? "Ничего не найдено"
                    : hasFiles
                      ? "Нет чатов, в которые разрешена отправка файлов"
                      : "Нет доступных получателей"}
                </Text>
              </View>
            )
          }
        />

        <View style={styles.sendBar}>
          {transferInProgress && (
            <View style={styles.progressRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.progressText}>
                {sendPhase === "preparing"
                  ? `Подготовка${progress === null ? "…" : `: ${progress}%`}`
                  : `Отправка${progress === null ? "…" : `: ${progress}%`}`}
              </Text>
            </View>
          )}
          {sendPhase === "sent" && (
            <View style={styles.progressRow}>
              <Icon
                name="checkmark-circle"
                size={22}
                color={colors.success}
              />
              <Text style={[styles.progressText, styles.sentText]}>
                Отправлено
              </Text>
            </View>
          )}
          <TouchableOpacity
            style={[
              styles.sendButton,
              sendDisabled && styles.sendButtonDisabled,
            ]}
            onPress={() => void send()}
            disabled={sendDisabled}
          >
            <Icon name="send" size={21} color={colors.white} />
            <Text style={styles.sendButtonText}>Отправить</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: colors.backgroundAlt },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    backgroundColor: colors.background,
  },
  centeredTitle: {
    marginTop: 18,
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
  },
  centeredText: {
    marginTop: 10,
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 21,
    textAlign: "center",
  },
  primaryButton: {
    marginTop: 24,
    minWidth: 190,
    borderRadius: 14,
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryButtonText: { color: colors.white, fontSize: 16, fontWeight: "800" },
  secondaryButton: { marginTop: 10, padding: 12 },
  secondaryButtonText: { color: colors.primary, fontSize: 15, fontWeight: "700" },
  header: {
    minHeight: 74,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1, alignItems: "center" },
  title: { color: colors.text, fontSize: 21, fontWeight: "800" },
  subtitle: { marginTop: 2, color: colors.textSecondary, fontSize: 13 },
  listContent: { padding: 14, paddingBottom: 24 },
  sharedCard: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 82,
    padding: 12,
    borderRadius: 16,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sharedPreview: { width: 58, height: 58, borderRadius: 11 },
  sharedFileIcon: {
    width: 58,
    height: 58,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EAF2FD",
  },
  sharedContent: { flex: 1, marginLeft: 12 },
  sharedTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  sharedNames: {
    marginTop: 4,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  messageCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputLabel: { color: colors.text, fontSize: 13, fontWeight: "800" },
  messageInput: {
    minHeight: 54,
    maxHeight: 112,
    marginTop: 6,
    padding: 0,
    color: colors.text,
    fontSize: 15,
    lineHeight: 20,
  },
  characterCount: {
    alignSelf: "flex-end",
    color: colors.textSecondary,
    fontSize: 11,
  },
  searchBox: {
    marginTop: 12,
    height: 46,
    paddingHorizontal: 13,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, marginLeft: 8, color: colors.text, fontSize: 15 },
  errorCard: {
    marginTop: 10,
    padding: 11,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FDEDEC",
  },
  errorText: { flex: 1, marginLeft: 8, color: colors.error, fontSize: 13 },
  retryButton: { alignSelf: "center", padding: 10 },
  retryText: { color: colors.primary, fontWeight: "700" },
  sectionTitle: {
    marginTop: 18,
    marginBottom: 7,
    marginHorizontal: 4,
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  targetRow: {
    minHeight: 68,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  targetRowSelected: { backgroundColor: "#EAF2FD" },
  targetText: { flex: 1, marginLeft: 11 },
  targetTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  targetSubtitle: { marginTop: 3, color: colors.textSecondary, fontSize: 12 },
  selectionCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  selectionCircleSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  listStatus: { alignItems: "center", paddingVertical: 30 },
  listStatusText: {
    marginTop: 9,
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: "center",
  },
  sendBar: {
    paddingHorizontal: 14,
    paddingTop: 9,
    paddingBottom: 6,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  progressRow: {
    minHeight: 26,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  progressText: { marginLeft: 8, color: colors.textSecondary, fontSize: 13 },
  sentText: { color: colors.success, fontWeight: "800" },
  sendButton: {
    height: 50,
    borderRadius: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  sendButtonDisabled: { opacity: 0.42 },
  sendButtonText: {
    marginLeft: 8,
    color: colors.white,
    fontSize: 16,
    fontWeight: "800",
  },
});
