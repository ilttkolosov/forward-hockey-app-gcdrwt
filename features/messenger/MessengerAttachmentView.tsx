import { ResizeMode, Video } from "expo-av";
import { Image } from "expo-image";
import * as Sharing from "expo-sharing";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "../../components/Icon";
import {
  cacheMessengerMedia,
  formatMessengerBytes,
} from "../../services/messengerMediaCache";
import { saveMessengerMediaToDevice } from "../../services/messengerMediaSave";
import { colors } from "../../styles/commonStyles";
import MessengerLocationPreview from "./MessengerLocationPreview";
import type { MessengerLocation, MessengerMedia } from "./types";

interface MessengerAttachmentViewProps {
  media: MessengerMedia | null;
  mediaItems?: MessengerMedia[];
  location: MessengerLocation | null;
  accessToken: string;
}

function withoutValue(values: Set<string>, value: string): Set<string> {
  const next = new Set(values);
  next.delete(value);
  return next;
}

export default function MessengerAttachmentView({
  media,
  mediaItems,
  location,
  accessToken,
}: MessengerAttachmentViewProps) {
  const insets = useSafeAreaInsets();
  const items = useMemo(
    () => (mediaItems?.length ? mediaItems : media ? [media] : []),
    [media, mediaItems],
  );
  const itemIdentity = items.map((item) => item.id).join(":");
  const [localUris, setLocalUris] = useState<Record<string, string>>({});
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [viewerMedia, setViewerMedia] = useState<MessengerMedia | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    setLocalUris({});
    setLoadingIds(new Set());
    setErrors({});
    setViewerMedia(null);
  }, [itemIdentity]);

  const ensureLocal = useCallback(
    async (item: MessengerMedia): Promise<string> => {
      const known = localUris[item.id];
      if (known) return known;
      setLoadingIds((current) => new Set(current).add(item.id));
      setErrors((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      try {
        const uri = await cacheMessengerMedia(item, accessToken);
        setLocalUris((current) => ({ ...current, [item.id]: uri }));
        return uri;
      } catch (cacheError) {
        const message =
          cacheError instanceof Error
            ? cacheError.message
            : "Не удалось загрузить вложение";
        setErrors((current) => ({ ...current, [item.id]: message }));
        throw cacheError;
      } finally {
        setLoadingIds((current) => withoutValue(current, item.id));
      }
    },
    [accessToken, localUris],
  );

  useEffect(() => {
    items
      .filter((item) => item.type === "image")
      .forEach((item) => void ensureLocal(item).catch(() => undefined));
  }, [ensureLocal, itemIdentity, items]);

  if (location) return <MessengerLocationPreview location={location} />;
  if (!items.length) return null;

  const openFile = async (item: MessengerMedia) => {
    try {
      const uri = await ensureLocal(item);
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert(
          "Файл сохранён",
          "На этом устройстве нет обработчика для открытия файла.",
        );
        return;
      }
      await Sharing.shareAsync(uri, {
        dialogTitle: item.original_name,
        mimeType: item.mime_type,
      });
    } catch {
      // The tile keeps a visible retry state.
    }
  };

  const openItem = async (item: MessengerMedia) => {
    if (item.type === "file") {
      await openFile(item);
      return;
    }
    try {
      await ensureLocal(item);
      setViewerMedia(item);
    } catch {
      // The tile keeps a visible retry state.
    }
  };

  const saveToDevice = async (item: MessengerMedia) => {
    if (savingId) return;
    setSavingId(item.id);
    try {
      const target = await saveMessengerMediaToDevice(item, accessToken);
      Alert.alert(
        "Вложение сохранено",
        target === "media_library"
          ? "Файл добавлен в медиатеку устройства."
          : "Файл передан в выбранную папку.",
      );
    } catch (saveError) {
      Alert.alert(
        "Не удалось сохранить",
        saveError instanceof Error
          ? saveError.message
          : "Повторите попытку позже.",
      );
    } finally {
      setSavingId(null);
    }
  };

  const renderAlbum = () => {
    const columns = items.length > 4 ? 3 : 2;
    const tileSize = columns === 3 ? 74 : 113;
    return (
      <View style={styles.albumGrid}>
        {items.map((item) => {
          const localUri = localUris[item.id];
          const loading = loadingIds.has(item.id);
          const failed = Boolean(errors[item.id]);
          return (
            <TouchableOpacity
              key={item.id}
              style={[styles.albumTile, { width: tileSize, height: tileSize }]}
              activeOpacity={0.88}
              onPress={() => void openItem(item)}
              accessibilityLabel={`Открыть ${item.original_name}`}
            >
              {item.type === "image" && localUri ? (
                <Image
                  source={localUri}
                  style={styles.albumImage}
                  contentFit="cover"
                  transition={120}
                />
              ) : (
                <View style={styles.albumPlaceholder}>
                  {loading ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <Icon
                      name={
                        failed
                          ? "alert-circle-outline"
                          : item.type === "video"
                            ? "play-circle"
                            : "document-text"
                      }
                      size={item.type === "video" ? 34 : 29}
                      color={failed ? colors.error : colors.primary}
                    />
                  )}
                  {item.type !== "image" && (
                    <Text style={styles.albumFileName} numberOfLines={2}>
                      {item.original_name}
                    </Text>
                  )}
                </View>
              )}
              {item.type === "video" && !loading && (
                <View style={styles.albumTypeBadge}>
                  <Icon name="videocam" size={13} color={colors.white} />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const single = items[0];
  const singleLocalUri = single ? localUris[single.id] : null;
  const singleLoading = single ? loadingIds.has(single.id) : false;
  const singleError = single ? errors[single.id] : null;
  const viewerUri = viewerMedia ? localUris[viewerMedia.id] : null;

  return (
    <>
      {items.length > 1 ? (
        renderAlbum()
      ) : single.type === "image" ? (
        <TouchableOpacity
          style={styles.imageFrame}
          activeOpacity={0.9}
          onPress={() => void openItem(single)}
        >
          {singleLocalUri ? (
            <Image
              source={singleLocalUri}
              style={styles.previewImage}
              contentFit="cover"
              transition={140}
            />
          ) : (
            <View style={styles.previewPlaceholder}>
              <ActivityIndicator color={colors.primary} />
            </View>
          )}
        </TouchableOpacity>
      ) : (
        <View style={styles.fileCard}>
          <TouchableOpacity
            style={styles.fileOpenAction}
            activeOpacity={0.84}
            onPress={() => void openItem(single)}
            disabled={singleLoading}
          >
            <View style={styles.fileIcon}>
              {singleLoading ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Icon
                  name={single.type === "video" ? "play" : "document-text"}
                  size={23}
                  color={colors.white}
                />
              )}
            </View>
            <View style={styles.attachmentText}>
              <Text style={styles.attachmentTitle} numberOfLines={2}>
                {single.original_name ||
                  (single.type === "video" ? "Видео" : "Файл")}
              </Text>
              <Text style={styles.attachmentSubtitle}>
                {formatMessengerBytes(single.size_bytes)} · Нажмите для
                просмотра
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.inlineSaveButton}
            onPress={() => void saveToDevice(single)}
            disabled={Boolean(savingId)}
            accessibilityLabel="Сохранить вложение"
          >
            {savingId === single.id ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Icon name="download-outline" size={21} color={colors.primary} />
            )}
          </TouchableOpacity>
        </View>
      )}

      {singleError && items.length === 1 && (
        <TouchableOpacity onPress={() => void openItem(single)}>
          <Text style={styles.errorText}>Не удалось загрузить · повторить</Text>
        </TouchableOpacity>
      )}

      <Modal
        visible={Boolean(viewerMedia)}
        animationType="fade"
        presentationStyle="fullScreen"
        statusBarTranslucent={false}
        onRequestClose={() => setViewerMedia(null)}
      >
        <View
          style={[
            styles.viewer,
            {
              paddingTop: Math.max(insets.top, 12),
              paddingBottom: insets.bottom,
            },
          ]}
        >
          <View style={styles.viewerHeader}>
            <Text style={styles.viewerTitle} numberOfLines={1}>
              {viewerMedia?.original_name ||
                (viewerMedia?.type === "image" ? "Фотография" : "Видео")}
            </Text>
            {viewerMedia && (
              <TouchableOpacity
                style={styles.viewerActionButton}
                onPress={() => void saveToDevice(viewerMedia)}
                disabled={Boolean(savingId)}
                accessibilityLabel="Сохранить вложение"
              >
                {savingId === viewerMedia.id ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Icon
                    name="download-outline"
                    size={24}
                    color={colors.white}
                  />
                )}
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[
                styles.closeButton,
                { marginRight: Math.max(insets.right, 8) },
              ]}
              onPress={() => setViewerMedia(null)}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
              accessibilityLabel="Закрыть просмотр"
            >
              <Icon name="close" size={28} color={colors.white} />
            </TouchableOpacity>
          </View>
          <View style={styles.viewerContent}>
            {viewerUri && viewerMedia?.type === "image" && (
              <ScrollView
                style={styles.zoomContainer}
                contentContainerStyle={styles.zoomContent}
                minimumZoomScale={1}
                maximumZoomScale={4}
                centerContent
              >
                <Image
                  source={viewerUri}
                  style={styles.fullImage}
                  contentFit="contain"
                />
              </ScrollView>
            )}
            {viewerUri && viewerMedia?.type === "video" && (
              <Video
                source={{ uri: viewerUri }}
                style={styles.fullVideo}
                useNativeControls
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay
              />
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  imageFrame: {
    width: 230,
    height: 172,
    marginHorizontal: -7,
    marginTop: -3,
    marginBottom: 5,
    overflow: "hidden",
    borderRadius: 13,
    backgroundColor: "rgba(23, 52, 87, 0.08)",
  },
  previewImage: { width: "100%", height: "100%" },
  previewPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  albumGrid: {
    width: 230,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 3,
    marginHorizontal: -7,
    marginTop: -3,
    marginBottom: 5,
    overflow: "hidden",
    borderRadius: 13,
  },
  albumTile: {
    overflow: "hidden",
    borderRadius: 5,
    backgroundColor: "rgba(255, 255, 255, 0.56)",
  },
  albumImage: { width: "100%", height: "100%" },
  albumPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 6,
  },
  albumFileName: {
    marginTop: 4,
    color: colors.textSecondary,
    fontSize: 9,
    lineHeight: 11,
    textAlign: "center",
  },
  albumTypeBadge: {
    position: "absolute",
    right: 5,
    bottom: 5,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "rgba(27, 54, 93, 0.78)",
  },
  fileCard: {
    width: 235,
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
    borderRadius: 13,
    backgroundColor: "rgba(255, 255, 255, 0.54)",
  },
  fileOpenAction: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 9,
  },
  inlineSaveButton: {
    width: 44,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 3,
  },
  fileIcon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: colors.primary,
  },
  attachmentText: { flex: 1, minWidth: 0 },
  attachmentTitle: { color: colors.text, fontSize: 13, fontWeight: "800" },
  attachmentSubtitle: {
    marginTop: 3,
    color: colors.textSecondary,
    fontSize: 10,
    lineHeight: 14,
  },
  errorText: {
    marginBottom: 4,
    color: colors.error,
    fontSize: 11,
    fontWeight: "700",
  },
  viewer: { flex: 1, backgroundColor: "#08121E" },
  viewerHeader: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.2)",
  },
  viewerTitle: { flex: 1, color: colors.white, fontWeight: "700" },
  viewerActionButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
  },
  closeButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  viewerContent: { flex: 1, alignItems: "center", justifyContent: "center" },
  zoomContainer: { width: "100%", height: "100%" },
  zoomContent: { flexGrow: 1, alignItems: "center", justifyContent: "center" },
  fullImage: { width: "100%", height: "100%", minHeight: 500 },
  fullVideo: { width: "100%", height: "100%" },
});
