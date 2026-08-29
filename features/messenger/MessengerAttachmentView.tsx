import { Image, type ImageLoadEventData } from "expo-image";
import * as Sharing from "expo-sharing";
import * as ScreenOrientation from "expo-screen-orientation";
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
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "../../components/Icon";
import { messengerMediaUrl } from "../../services/messengerApi";
import {
  cacheMessengerMedia,
  formatMessengerBytes,
  getCachedMessengerMediaUri,
} from "../../services/messengerMediaCache";
import { messengerLog } from "../../services/messengerLogger";
import { tryPreviewMessengerFile } from "../../services/messengerNativeFilePreview";
import { saveMessengerMediaToDevice } from "../../services/messengerMediaSave";
import { colors } from "../../styles/commonStyles";
import { getMessengerFilePresentation } from "./filePresentation";
import MessengerLocationPreview from "./MessengerLocationPreview";
import MessengerVideoPlayer from "./MessengerVideoPlayer";
import MessengerZoomableMedia from "./MessengerZoomableMedia";
import type { MessengerLocation, MessengerMedia } from "./types";

interface MessengerAttachmentViewProps {
  media: MessengerMedia | null;
  mediaItems?: MessengerMedia[];
  location: MessengerLocation | null;
  accessToken: string;
  deferAutomaticCache?: boolean;
  playbackEnabled?: boolean;
  viewerTitle?: string;
  viewerSubtitle?: string;
  onShowInChat?: () => void;
  onReply?: () => void;
  onForward?: () => void;
  onDelete?: () => void;
}

const MAX_REMEMBERED_VIDEO_POSITIONS = 100;
const MAX_MEASURED_IMAGE_RENDERS = 500;
const rememberedVideoPositions = new Map<string, number>();
const measuredImageRenders = new Set<string>();

function rememberVideoPosition(mediaId: string, positionSeconds: number): void {
  if (!Number.isFinite(positionSeconds) || positionSeconds < 0) return;
  rememberedVideoPositions.delete(mediaId);
  rememberedVideoPositions.set(mediaId, positionSeconds);
  if (rememberedVideoPositions.size <= MAX_REMEMBERED_VIDEO_POSITIONS) return;
  const oldestMediaId = rememberedVideoPositions.keys().next().value;
  if (oldestMediaId) rememberedVideoPositions.delete(oldestMediaId);
}

function withoutValue(values: Set<string>, value: string): Set<string> {
  const next = new Set(values);
  next.delete(value);
  return next;
}

function rememberMeasuredImageRender(mediaId: string): void {
  measuredImageRenders.delete(mediaId);
  measuredImageRenders.add(mediaId);
  if (measuredImageRenders.size <= MAX_MEASURED_IMAGE_RENDERS) return;
  const oldestMediaId = measuredImageRenders.values().next().value;
  if (oldestMediaId) measuredImageRenders.delete(oldestMediaId);
}

function MessengerAttachmentView({
  media,
  mediaItems,
  location,
  accessToken,
  deferAutomaticCache = false,
  playbackEnabled = false,
  viewerTitle,
  viewerSubtitle,
  onShowInChat,
  onReply,
  onForward,
  onDelete,
}: MessengerAttachmentViewProps) {
  const insets = useSafeAreaInsets();
  const { width: viewerWidth, height: viewerHeight } = useWindowDimensions();
  const items = useMemo(
    () => (mediaItems?.length ? mediaItems : media ? [media] : []),
    [media, mediaItems],
  );
  const viewerItems = useMemo(
    () => items.filter((item) => item.type !== "file"),
    [items],
  );
  const itemIdentity = items.map((item) => item.id).join(":");
  const [localUris, setLocalUris] = useState<Record<string, string>>({});
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const viewerMedia =
    viewerIndex === null ? null : (viewerItems[viewerIndex] ?? null);
  const [viewerSession, setViewerSession] = useState(0);
  const [viewerMenuVisible, setViewerMenuVisible] = useState(false);
  const [viewerZoomed, setViewerZoomed] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [openingFileId, setOpeningFileId] = useState<string | null>(null);
  const openingFileRef = useRef<string | null>(null);
  const localUrisRef = useRef<Record<string, string>>({});
  const imageRenderStartedAt = useRef(new Map<string, number>());

  useEffect(() => {
    localUrisRef.current = {};
    setLocalUris({});
    setLoadingIds(new Set());
    setErrors({});
    setViewerIndex(null);
    setViewerMenuVisible(false);
    setViewerZoomed(false);
  }, [itemIdentity]);

  useEffect(() => {
    if (!playbackEnabled) {
      return;
    }
    const video =
      items.length === 1 && items[0]?.type === "video" ? items[0] : null;
    if (!video || localUris[video.id]) return;
    let active = true;
    void getCachedMessengerMediaUri(video).then((uri) => {
      if (!active || !uri) return;
      setLocalUris((current) => {
        const next = { ...current, [video.id]: uri };
        localUrisRef.current = next;
        return next;
      });
    });
    return () => {
      active = false;
    };
  }, [itemIdentity, items, localUris, playbackEnabled]);

  const ensureLocal = useCallback(
    async (item: MessengerMedia): Promise<string> => {
      const known = localUrisRef.current[item.id];
      if (known) return known;
      setLoadingIds((current) => new Set(current).add(item.id));
      setErrors((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      try {
        const uri = await cacheMessengerMedia(item, accessToken);
        setLocalUris((current) => {
          const next = { ...current, [item.id]: uri };
          localUrisRef.current = next;
          return next;
        });
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
    [accessToken],
  );

  const handleImageLoadStart = useCallback((mediaId: string) => {
    imageRenderStartedAt.current.set(mediaId, Date.now());
  }, []);

  const handleImageLoad = useCallback(
    (item: MessengerMedia, event: ImageLoadEventData) => {
      if (measuredImageRenders.has(item.id)) return;
      rememberMeasuredImageRender(item.id);
      const startedAt = imageRenderStartedAt.current.get(item.id);
      messengerLog("info", "media.image.rendered", {
        asset_id: item.id,
        render_duration_ms: startedAt ? Date.now() - startedAt : null,
        cache_type: event.cacheType,
        width: event.source.width,
        height: event.source.height,
        size_bytes: item.size_bytes,
      });
    },
    [],
  );

  useEffect(() => {
    if (deferAutomaticCache) return;
    items
      .filter((item) => item.type === "image" || item.type === "video")
      .forEach((item) => void ensureLocal(item).catch(() => undefined));
  }, [deferAutomaticCache, ensureLocal, itemIdentity, items]);

  useEffect(() => {
    if (viewerIndex === null) return;
    [viewerIndex - 1, viewerIndex, viewerIndex + 1].forEach((index) => {
      const item = viewerItems[index];
      if (item && (index === viewerIndex || item.type === "image")) {
        void ensureLocal(item).catch(() => undefined);
      }
    });
  }, [ensureLocal, viewerIndex, viewerItems]);

  useEffect(() => {
    if (Platform.OS === "web" || viewerMedia?.type !== "video") return;
    let active = true;
    const requestedLock =
      Platform.OS === "android"
        ? ScreenOrientation.OrientationLock.ALL
        : ScreenOrientation.OrientationLock.DEFAULT;
    void ScreenOrientation.supportsOrientationLockAsync(requestedLock)
      .then((supported) => {
        if (!active) return;
        return ScreenOrientation.lockAsync(
          supported ? requestedLock : ScreenOrientation.OrientationLock.DEFAULT,
        );
      })
      .then(() =>
        messengerLog("info", "media.video.orientation_enabled", {
          platform: Platform.OS,
          requested_lock: requestedLock,
        }),
      )
      .catch((error) =>
        messengerLog("warn", "media.video.orientation_unlock_failed", {
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    return () => {
      active = false;
      void ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.PORTRAIT_UP,
      ).catch((error) =>
        messengerLog("warn", "media.video.orientation_restore_failed", {
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    };
  }, [viewerMedia?.type]);

  if (location) return <MessengerLocationPreview location={location} />;
  if (!items.length) return null;

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

  const offerFileSave = (item: MessengerMedia) => {
    Alert.alert(
      "Просмотр недоступен",
      "На устройстве нет приложения для просмотра этого файла. Сохранить файл?",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Сохранить",
          onPress: () => void saveToDevice(item),
        },
      ],
    );
  };

  const openFile = async (item: MessengerMedia) => {
    if (openingFileRef.current) return;
    openingFileRef.current = item.id;
    setOpeningFileId(item.id);
    try {
      const uri = await ensureLocal(item);
      if (Platform.OS === "web") {
        window.open(uri, "_blank", "noopener,noreferrer");
        return;
      }
      if (await tryPreviewMessengerFile(uri)) return;

      if (!(await Sharing.isAvailableAsync())) {
        offerFileSave(item);
        return;
      }
      try {
        await Sharing.shareAsync(uri, {
          dialogTitle: item.original_name,
          mimeType: item.mime_type,
        });
      } catch {
        offerFileSave(item);
      }
    } catch {
      // The tile keeps a visible retry state when the download itself fails.
    } finally {
      openingFileRef.current = null;
      setOpeningFileId(null);
    }
  };

  const openItem = async (item: MessengerMedia) => {
    if (item.type === "file") {
      await openFile(item);
      return;
    }
    const index = viewerItems.findIndex(
      (candidate) => candidate.id === item.id,
    );
    if (index >= 0) {
      setViewerSession((current) => current + 1);
      setViewerIndex(index);
    }
    try {
      await ensureLocal(item);
    } catch {
      // The fullscreen viewer keeps a visible retry state.
    }
  };

  const closeViewer = () => {
    setViewerMenuVisible(false);
    setViewerZoomed(false);
    setViewerIndex(null);
  };

  const runViewerMessageAction = (action?: () => void) => {
    closeViewer();
    if (!action) return;
    setTimeout(action, Platform.OS === "ios" ? 420 : 120);
  };

  const renderAlbum = () => {
    const columns = items.length > 4 ? 3 : 2;
    const tileSize = columns === 3 ? 74 : 113;
    return (
      <View style={styles.albumGrid}>
        {items.map((item) => {
          const localUri = localUris[item.id];
          const loading = loadingIds.has(item.id) || openingFileId === item.id;
          const failed = Boolean(errors[item.id]);
          const filePresentation =
            item.type === "file" ? getMessengerFilePresentation(item) : null;
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
                  onLoadStart={() => handleImageLoadStart(item.id)}
                  onLoad={(event) => handleImageLoad(item, event)}
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
                            : (filePresentation?.icon ?? "document-text")
                      }
                      type={item.type === "file" ? "material-community" : "ion"}
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
  const singleLoading = single
    ? loadingIds.has(single.id) || openingFileId === single.id
    : false;
  const singleError = single ? errors[single.id] : null;
  const singleFilePresentation =
    single?.type === "file" ? getMessengerFilePresentation(single) : null;
  const singleVideoRemoteUri =
    single?.type === "video" ? messengerMediaUrl(single.url) : null;
  const viewerPageHeight = Math.max(1, viewerHeight);

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
              onLoadStart={() => handleImageLoadStart(single.id)}
              onLoad={(event) => handleImageLoad(single, event)}
            />
          ) : (
            <View style={styles.previewPlaceholder}>
              <ActivityIndicator color={colors.primary} />
            </View>
          )}
        </TouchableOpacity>
      ) : single.type === "video" && playbackEnabled && viewerIndex === null ? (
        <View style={styles.inlineVideoCard}>
          <View style={styles.inlineVideoStage}>
            {singleLocalUri ? (
              <>
                <MessengerVideoPlayer
                  uri={singleLocalUri}
                  active={playbackEnabled}
                  autoPlay
                  muted
                  loop
                  nativeControls={false}
                  initialPositionSeconds={
                    rememberedVideoPositions.get(single.id) || 0
                  }
                  onPositionChange={(positionSeconds) =>
                    rememberVideoPosition(single.id, positionSeconds)
                  }
                  style={styles.inlineVideo}
                  onFallback={() => void openFile(single)}
                />
              </>
            ) : singleVideoRemoteUri ? (
              <MessengerVideoPlayer
                uri={singleVideoRemoteUri}
                requestHeaders={{ Authorization: `Bearer ${accessToken}` }}
                active={playbackEnabled}
                muted
                nativeControls={false}
                previewOnly
                style={styles.inlineVideo}
                onFallback={() => void ensureLocal(single)}
              />
            ) : (
              <View style={styles.inlineVideoFallback} />
            )}
            {!singleLocalUri && (
              <View style={styles.inlineVideoDownload} pointerEvents="none">
                {singleError ? (
                  <Icon
                    name="alert-circle-outline"
                    size={24}
                    color={colors.white}
                  />
                ) : (
                  <ActivityIndicator color={colors.white} />
                )}
                <Text style={styles.inlineVideoDownloadText}>
                  {singleError ? "Ошибка загрузки" : "Загрузка видео…"}
                </Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.inlineVideoTap}
              activeOpacity={1}
              onPress={() => void openItem(single)}
              accessibilityRole="button"
              accessibilityLabel="Открыть видео на весь экран"
            />
          </View>
          <View style={styles.inlineVideoFooter}>
            <View style={styles.inlineVideoText}>
              <Text style={styles.attachmentTitle} numberOfLines={1}>
                {single.original_name || "Видео"}
              </Text>
              <Text style={styles.attachmentSubtitle}>
                {singleError
                  ? "Повторите загрузку"
                  : singleLocalUri
                    ? "Готово"
                    : "Загружается"}{" "}
                · {formatMessengerBytes(single.size_bytes)}
              </Text>
            </View>
          </View>
        </View>
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
                  name={
                    single.type === "video"
                      ? "play"
                      : (singleFilePresentation?.icon ?? "document-text")
                  }
                  type={single.type === "file" ? "material-community" : "ion"}
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
                {singleFilePresentation
                  ? `${singleFilePresentation.label} · `
                  : ""}
                {formatMessengerBytes(single.size_bytes)} ·{" "}
                {single.type === "video"
                  ? "Нажмите для воспроизведения"
                  : "Нажмите для открытия"}
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
        visible={viewerIndex !== null}
        animationType="none"
        presentationStyle="fullScreen"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={closeViewer}
      >
        <View style={styles.viewer}>
          <View
            style={[
              styles.viewerHeader,
              {
                top: Math.max(insets.top, 8),
                left: Math.max(insets.left, 8),
                right: Math.max(insets.right, 8),
              },
            ]}
          >
            <TouchableOpacity
              style={styles.closeButton}
              onPress={closeViewer}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
              accessibilityLabel="Закрыть просмотр"
            >
              <Icon name="chevron-back" size={30} color={colors.white} />
            </TouchableOpacity>
            <View style={styles.viewerHeading}>
              <Text style={styles.viewerTitle} numberOfLines={1}>
                {viewerTitle ||
                  viewerMedia?.original_name ||
                  (viewerMedia?.type === "image" ? "Фотография" : "Видео")}
              </Text>
              {(viewerSubtitle || (viewerTitle && viewerMedia)) && (
                <Text style={styles.viewerSubtitle} numberOfLines={1}>
                  {viewerSubtitle || viewerMedia?.original_name}
                </Text>
              )}
            </View>
            {viewerIndex !== null && viewerItems.length > 1 && (
              <Text style={styles.viewerCounter}>
                {viewerIndex + 1} из {viewerItems.length}
              </Text>
            )}
            <TouchableOpacity
              style={[
                styles.viewerActionButton,
                { marginRight: Math.max(insets.right, 8) },
              ]}
              onPress={() => setViewerMenuVisible((current) => !current)}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
              accessibilityLabel="Действия с видео"
            >
              <Icon name="ellipsis-horizontal" size={28} color={colors.white} />
            </TouchableOpacity>
          </View>
          {viewerMenuVisible && viewerMedia && (
            <Pressable
              style={styles.viewerMenuBackdrop}
              onPress={() => setViewerMenuVisible(false)}
            >
              <Pressable
                style={[
                  styles.viewerMenu,
                  {
                    top: Math.max(insets.top, 12) + 58,
                    right: Math.max(insets.right, 14),
                  },
                ]}
                onPress={(event) => event.stopPropagation()}
              >
                <TouchableOpacity
                  style={styles.viewerMenuAction}
                  onPress={() => void saveToDevice(viewerMedia)}
                  disabled={savingId === viewerMedia.id}
                >
                  {savingId === viewerMedia.id ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Icon
                      name="download-outline"
                      size={23}
                      color={colors.white}
                    />
                  )}
                  <Text style={styles.viewerMenuText}>Сохранить в галерею</Text>
                </TouchableOpacity>
                {onShowInChat && (
                  <TouchableOpacity
                    style={styles.viewerMenuAction}
                    onPress={() => runViewerMessageAction(onShowInChat)}
                  >
                    <Icon
                      name="return-down-back-outline"
                      size={23}
                      color={colors.white}
                    />
                    <Text style={styles.viewerMenuText}>Показать в чате</Text>
                  </TouchableOpacity>
                )}
                {onReply && (
                  <TouchableOpacity
                    style={styles.viewerMenuAction}
                    onPress={() => runViewerMessageAction(onReply)}
                  >
                    <Icon name="arrow-undo" size={23} color={colors.white} />
                    <Text style={styles.viewerMenuText}>Ответить</Text>
                  </TouchableOpacity>
                )}
                {onForward && (
                  <TouchableOpacity
                    style={styles.viewerMenuAction}
                    onPress={() => runViewerMessageAction(onForward)}
                  >
                    <Icon name="arrow-redo" size={23} color={colors.white} />
                    <Text style={styles.viewerMenuText}>Переслать</Text>
                  </TouchableOpacity>
                )}
                {onDelete && (
                  <TouchableOpacity
                    style={[styles.viewerMenuAction, styles.viewerMenuDanger]}
                    onPress={() => runViewerMessageAction(onDelete)}
                  >
                    <Icon name="trash-outline" size={23} color="#FF5D5D" />
                    <Text
                      style={[
                        styles.viewerMenuText,
                        styles.viewerMenuDangerText,
                      ]}
                    >
                      Удалить
                    </Text>
                  </TouchableOpacity>
                )}
              </Pressable>
            </Pressable>
          )}
          {viewerIndex !== null && (
            <FlatList
              key={`attachment-viewer-${viewerSession}`}
              style={styles.viewerPager}
              data={viewerItems}
              keyExtractor={(item) => item.id}
              horizontal
              pagingEnabled
              scrollEnabled={!viewerZoomed}
              bounces={false}
              showsHorizontalScrollIndicator={false}
              removeClippedSubviews={false}
              initialScrollIndex={viewerIndex}
              getItemLayout={(_data, index) => ({
                length: viewerWidth,
                offset: viewerWidth * index,
                index,
              })}
              onMomentumScrollEnd={(event) => {
                const nextIndex = Math.round(
                  event.nativeEvent.contentOffset.x / viewerWidth,
                );
                if (viewerItems[nextIndex]) setViewerIndex(nextIndex);
                setViewerZoomed(false);
              }}
              renderItem={({ item, index }) => {
                const localUri = localUris[item.id];
                const loading = loadingIds.has(item.id);
                const error = errors[item.id];
                return (
                  <View
                    style={[
                      styles.viewerPage,
                      { width: viewerWidth, height: viewerPageHeight },
                    ]}
                  >
                    {localUri && item.type === "image" && (
                      <MessengerZoomableMedia
                        width={viewerWidth}
                        height={viewerPageHeight}
                        resetKey={`${viewerSession}:${item.id}`}
                        onZoomChange={setViewerZoomed}
                      >
                        <Image
                          source={localUri}
                          style={{
                            width: viewerWidth,
                            height: viewerPageHeight,
                          }}
                          contentFit="contain"
                          onLoadStart={() => handleImageLoadStart(item.id)}
                          onLoad={(event) => handleImageLoad(item, event)}
                        />
                      </MessengerZoomableMedia>
                    )}
                    {localUri && item.type === "video" && (
                      <MessengerZoomableMedia
                        width={viewerWidth}
                        height={viewerPageHeight}
                        resetKey={`${viewerSession}:${item.id}`}
                        onZoomChange={setViewerZoomed}
                      >
                        <MessengerVideoPlayer
                          uri={localUri}
                          style={styles.fullVideo}
                          active={playbackEnabled && index === viewerIndex}
                          autoPlay
                          fullscreenEnabled={false}
                          onFallback={() => void openFile(item)}
                        />
                      </MessengerZoomableMedia>
                    )}
                    {!localUri && (
                      <TouchableOpacity
                        style={styles.viewerLoading}
                        onPress={() =>
                          void ensureLocal(item).catch(() => undefined)
                        }
                        disabled={loading}
                      >
                        {loading ? (
                          <ActivityIndicator
                            color={colors.white}
                            size="large"
                          />
                        ) : (
                          <>
                            <Icon
                              name="refresh-outline"
                              size={34}
                              color={colors.white}
                            />
                            <Text style={styles.viewerErrorText}>
                              {error || "Нажмите, чтобы загрузить"}
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                );
              }}
            />
          )}
        </View>
      </Modal>
    </>
  );
}

// Media previews are the heaviest part of a chat row. Message objects that
// were already in the feed keep stable media references, so shallow memoizing
// here lets an optimistic append render only the new bubble instead of
// rebuilding every visible image/video subtree.
export default React.memo(MessengerAttachmentView);

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
  inlineVideoCard: {
    width: 235,
    marginHorizontal: -7,
    marginTop: -3,
    marginBottom: 5,
    overflow: "hidden",
    borderRadius: 13,
    backgroundColor: "rgba(255, 255, 255, 0.54)",
  },
  inlineVideoStage: { width: "100%", height: 158 },
  inlineVideo: { width: "100%", height: 158 },
  inlineVideoFallback: {
    width: "100%",
    height: 158,
    backgroundColor: "#08121E",
  },
  inlineVideoDownload: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: "rgba(8, 18, 30, 0.3)",
  },
  inlineVideoDownloadText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: "700",
  },
  inlineVideoTap: { ...StyleSheet.absoluteFillObject },
  inlineVideoFooter: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 11,
  },
  inlineVideoText: { flex: 1, minWidth: 0 },
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
    position: "absolute",
    zIndex: 10,
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 8,
    borderRadius: 28,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(8,18,30,0.72)",
  },
  viewerHeading: { flex: 1, minWidth: 0, alignItems: "center" },
  viewerTitle: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
  },
  viewerSubtitle: {
    marginTop: 2,
    color: "rgba(255,255,255,0.58)",
    fontSize: 11,
    textAlign: "center",
  },
  viewerCounter: {
    marginHorizontal: 8,
    color: "rgba(255,255,255,0.72)",
    fontSize: 12,
    fontWeight: "700",
  },
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
  viewerMenuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    backgroundColor: "rgba(0,0,0,0.08)",
  },
  viewerMenu: {
    position: "absolute",
    width: 270,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: 22,
    backgroundColor: "rgba(24,24,25,0.96)",
  },
  viewerMenuAction: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.14)",
  },
  viewerMenuDanger: { borderBottomWidth: 0 },
  viewerMenuText: { color: colors.white, fontSize: 16, fontWeight: "500" },
  viewerMenuDangerText: { color: "#FF5D5D" },
  viewerPager: { flex: 1 },
  viewerPage: { flex: 1, alignItems: "center", justifyContent: "center" },
  viewerLoading: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 28,
  },
  viewerErrorText: {
    color: colors.white,
    fontSize: 13,
    textAlign: "center",
  },
  fullVideo: { width: "100%", height: "100%" },
});
