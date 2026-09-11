import { Image } from "expo-image";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Icon from "../../components/Icon";
import {
  messengerMediaUrl,
  messengerErrorMessage,
} from "../../services/messengerApi";
import { cacheMessengerMedia } from "../../services/messengerMediaCache";
import { saveMessengerMediaToDevice } from "../../services/messengerMediaSave";
import { openMessengerFilePreview } from "../../services/messengerNativeFilePreview";
import { getMessengerRoomMediaPage } from "../../services/messengerProfileMedia";
import { colors } from "../../styles/commonStyles";
import MessengerMediaViewer from "./MessengerMediaViewer";
import type { MessengerMedia, MessengerMessage } from "./types";

interface MediaEntry {
  key: string;
  message: MessengerMessage;
  media: MessengerMedia;
}

interface MessengerProfileMediaTabProps {
  roomId: string;
  accessToken: string;
  onShowInChat: (message: MessengerMessage) => void;
  onForward: (message: MessengerMessage) => void;
}

function mergeMessages(
  current: MessengerMessage[],
  incoming: MessengerMessage[],
): MessengerMessage[] {
  const byId = new Map(
    current.map((message) => [message.id, message] as const),
  );
  for (const message of incoming) byId.set(message.id, message);
  return Array.from(byId.values());
}

export default function MessengerProfileMediaTab({
  roomId,
  accessToken,
  onShowInChat,
  onForward,
}: MessengerProfileMediaTabProps) {
  const [messages, setMessages] = useState<MessengerMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [viewerSession, setViewerSession] = useState(0);
  const [localUris, setLocalUris] = useState<Record<string, string>>({});
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [mediaErrors, setMediaErrors] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const loadGeneration = useRef(0);

  const loadAll = useCallback(async () => {
    const generation = ++loadGeneration.current;
    setLoading(true);
    setError(null);
    setMessages([]);
    try {
      let cursor: string | null = null;
      let accumulated: MessengerMessage[] = [];
      const seenCursors = new Set<string>();
      do {
        const page = await getMessengerRoomMediaPage(roomId, cursor);
        if (generation !== loadGeneration.current) return;
        accumulated = mergeMessages(accumulated, page.items);
        setMessages(accumulated);
        const next = page.page.next_cursor;
        if (!page.page.has_more || !next || seenCursors.has(next)) break;
        seenCursors.add(next);
        cursor = next;
      } while (generation === loadGeneration.current);
    } catch (loadError) {
      if (generation !== loadGeneration.current) return;
      setError(
        messengerErrorMessage(loadError, "Не удалось загрузить вложения"),
      );
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    void loadAll();
    return () => {
      loadGeneration.current += 1;
    };
  }, [loadAll]);

  const entries = useMemo<MediaEntry[]>(
    () =>
      messages.flatMap((message) => {
        const items = message.media_items?.length
          ? message.media_items
          : message.media
            ? [message.media]
            : [];
        return items.map((media, index) => ({
          key: `${message.id}:${media.id}:${index}`,
          message,
          media,
        }));
      }),
    [messages],
  );

  const viewerEntries = useMemo(
    () => entries.filter((entry) => entry.media.type !== "file"),
    [entries],
  );
  const viewerItems = useMemo(
    () => viewerEntries.map((entry) => entry.media),
    [viewerEntries],
  );

  const ensureLocal = useCallback(
    async (media: MessengerMedia) => {
      const known = localUris[media.id];
      if (known) return known;
      setLoadingIds((current) => new Set(current).add(media.id));
      setMediaErrors((current) => {
        const next = { ...current };
        delete next[media.id];
        return next;
      });
      try {
        const uri = await cacheMessengerMedia(media, accessToken);
        setLocalUris((current) => ({ ...current, [media.id]: uri }));
        return uri;
      } catch (cacheError) {
        const message = messengerErrorMessage(
          cacheError,
          "Не удалось загрузить вложение",
        );
        setMediaErrors((current) => ({ ...current, [media.id]: message }));
        throw cacheError;
      } finally {
        setLoadingIds((current) => {
          const next = new Set(current);
          next.delete(media.id);
          return next;
        });
      }
    },
    [accessToken, localUris],
  );

  const save = useCallback(
    async (media: MessengerMedia) => {
      if (savingId) return;
      setSavingId(media.id);
      try {
        const target = await saveMessengerMediaToDevice(media, accessToken);
        Alert.alert(
          "Вложение сохранено",
          target === "media_library"
            ? "Файл добавлен в медиатеку устройства."
            : "Файл передан в выбранную папку.",
        );
      } catch (saveError) {
        Alert.alert(
          "Не удалось сохранить",
          messengerErrorMessage(saveError, "Повторите попытку позже"),
        );
      } finally {
        setSavingId(null);
      }
    },
    [accessToken, savingId],
  );

  const openEntry = useCallback(
    async (entry: MediaEntry) => {
      if (entry.media.type === "file") {
        try {
          const uri = await ensureLocal(entry.media);
          await openMessengerFilePreview(uri);
        } catch (openError) {
          Alert.alert(
            "Не удалось открыть файл",
            messengerErrorMessage(
              openError,
              "Можно сохранить файл на устройство",
            ),
            [
              { text: "Отмена", style: "cancel" },
              { text: "Сохранить", onPress: () => void save(entry.media) },
            ],
          );
        }
        return;
      }
      const index = viewerEntries.findIndex(
        (candidate) => candidate.key === entry.key,
      );
      if (index < 0) return;
      // Load inside the common viewer so closing is possible during download.
      setViewerSession((current) => current + 1);
      setViewerIndex(index);
    },
    [ensureLocal, save, viewerEntries],
  );

  const showActions = useCallback(
    (entry: MediaEntry) => {
      Alert.alert(entry.media.original_name || "Вложение", undefined, [
        { text: "Просмотреть", onPress: () => void openEntry(entry) },
        {
          text: "Показать в диалоге",
          onPress: () => onShowInChat(entry.message),
        },
        { text: "Переслать", onPress: () => onForward(entry.message) },
        { text: "Сохранить", onPress: () => void save(entry.media) },
        { text: "Отмена", style: "cancel" },
      ]);
    },
    [onForward, onShowInChat, openEntry, save],
  );

  const currentViewerEntry =
    viewerIndex === null ? null : (viewerEntries[viewerIndex] ?? null);

  if (loading && !entries.length) {
    return (
      <View style={styles.state}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.stateText}>Загружаем вложения…</Text>
      </View>
    );
  }

  if (error && !entries.length) {
    return (
      <TouchableOpacity style={styles.state} onPress={() => void loadAll()}>
        <Icon name="alert-circle-outline" size={34} color={colors.warning} />
        <Text style={styles.stateText}>{error}</Text>
        <Text style={styles.retry}>Нажмите, чтобы повторить</Text>
      </TouchableOpacity>
    );
  }

  if (!entries.length) {
    return (
      <View style={styles.state}>
        <Icon name="images-outline" size={38} color={colors.textSecondary} />
        <Text style={styles.stateText}>В этом чате пока нет вложений</Text>
      </View>
    );
  }

  return (
    <>
      <View style={styles.gallery}>
        {entries.map((entry) => {
          const uri = messengerMediaUrl(entry.media.url);
          return (
            <TouchableOpacity
              key={entry.key}
              style={styles.tile}
              activeOpacity={0.82}
              onPress={() => void openEntry(entry)}
              onLongPress={() => showActions(entry)}
              delayLongPress={360}
              accessibilityRole="button"
              accessibilityLabel={`Вложение ${entry.media.original_name}`}
            >
              {entry.media.type === "image" && uri ? (
                <Image
                  source={{
                    uri,
                    headers: { Authorization: `Bearer ${accessToken}` },
                  }}
                  style={styles.preview}
                  contentFit="cover"
                  transition={120}
                />
              ) : (
                <View style={styles.genericPreview}>
                  <Icon
                    name={
                      entry.media.type === "video"
                        ? "play-circle-outline"
                        : "document-outline"
                    }
                    size={34}
                    color={colors.primary}
                  />
                  <Text style={styles.fileName} numberOfLines={2}>
                    {entry.media.original_name}
                  </Text>
                </View>
              )}
              {entry.media.type === "video" ? (
                <View style={styles.videoBadge}>
                  <Icon name="videocam" size={14} color={colors.white} />
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>
      {loading ? (
        <View style={styles.backgroundLoading}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.backgroundLoadingText}>
            Загружаем старые вложения…
          </Text>
        </View>
      ) : null}
      {error ? <Text style={styles.inlineError}>{error}</Text> : null}

      <MessengerMediaViewer
        items={viewerItems}
        index={viewerIndex}
        session={viewerSession}
        localUris={localUris}
        loadingIds={loadingIds}
        errors={mediaErrors}
        savingId={savingId}
        title="Медиа"
        subtitle={currentViewerEntry?.media.original_name}
        onIndexChange={setViewerIndex}
        onClose={() => setViewerIndex(null)}
        onEnsureLocal={ensureLocal}
        onSave={save}
        onShowInChat={
          currentViewerEntry
            ? () => onShowInChat(currentViewerEntry.message)
            : undefined
        }
        onForward={
          currentViewerEntry
            ? () => onForward(currentViewerEntry.message)
            : undefined
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  gallery: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  tile: {
    width: "32%",
    aspectRatio: 1,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
  },
  preview: { width: "100%", height: "100%" },
  genericPreview: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    padding: 8,
    backgroundColor: colors.backgroundAlt,
  },
  fileName: {
    color: colors.textSecondary,
    fontSize: 10,
    lineHeight: 13,
    textAlign: "center",
  },
  videoBadge: {
    position: "absolute",
    right: 6,
    bottom: 6,
    width: 28,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.56)",
  },
  state: {
    minHeight: 210,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 24,
  },
  stateText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  retry: { color: colors.primary, fontSize: 12, fontWeight: "800" },
  backgroundLoading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
  },
  backgroundLoadingText: { color: colors.textSecondary, fontSize: 11 },
  inlineError: {
    marginTop: 10,
    color: colors.error,
    fontSize: 11,
    textAlign: "center",
  },
});
