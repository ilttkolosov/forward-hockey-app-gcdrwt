import { Image } from "expo-image";
import * as ScreenOrientation from "expo-screen-orientation";
import { StatusBar } from "expo-status-bar";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type ViewToken,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "../../components/Icon";
import { messengerLog } from "../../services/messengerLogger";
import { colors } from "../../styles/commonStyles";
import MessengerVideoPlayer from "./MessengerVideoPlayer";
import MessengerZoomableMedia from "./MessengerZoomableMedia";
import { useMediaViewerLoading } from "./useMediaViewerLoading";
import type { MessengerMedia } from "./types";

// Serialize native orientation changes: a slow unlock must never overtake the
// portrait restore on close, or the unlock belonging to a newly opened viewer.
let orientationQueue: Promise<void> = Promise.resolve();
let orientationRevision = 0;
let orientationOwner: symbol | null = null;
function queueOrientation(
  operation: (isCurrent: () => boolean) => Promise<void>,
): Promise<void> {
  const revision = ++orientationRevision;
  const isCurrent = () => revision === orientationRevision;
  const result = orientationQueue.then(async () => {
    if (isCurrent()) await operation(isCurrent);
  });
  orientationQueue = result.catch(() => undefined);
  return result;
}

export interface MediaLightboxProps {
  items: MessengerMedia[];
  index: number | null;
  session: number;
  localUris: Record<string, string>;
  loadingIds: Set<string>;
  errors: Record<string, string>;
  savingId: string | null;
  title?: string;
  subtitle?: string;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onEnsureLocal: (item: MessengerMedia) => Promise<string>;
  onSave: (item: MessengerMedia) => Promise<void>;
  onShowInChat?: () => void;
  onReply?: () => void;
  onForward?: () => void;
  onDelete?: () => void;
}

export default function MediaLightbox({
  items,
  index,
  session,
  localUris,
  loadingIds,
  errors,
  savingId,
  title,
  subtitle,
  onIndexChange,
  onClose,
  onEnsureLocal,
  onSave,
  onShowInChat,
  onReply,
  onForward,
  onDelete,
}: MediaLightboxProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [menuVisible, setMenuVisible] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const closing = useRef(false);
  const pagerGesture = useMemo(() => Gesture.Native(), []);
  useMediaViewerLoading(items, index, session, onEnsureLocal);
  const visible = index !== null;
  const media = index === null ? null : (items[index] ?? null);
  const headerTop = Math.max(insets.top, 8);
  const videoTop = headerTop + 66;
  const videoBottom = Math.max(insets.bottom, 8);
  const videoHeight = Math.max(1, height - videoTop - videoBottom);

  useEffect(() => {
    if (!visible || Platform.OS === "web") return;
    const owner = Symbol("media-lightbox");
    orientationOwner = owner;
    const requestedLock = ScreenOrientation.OrientationLock.ALL;
    void queueOrientation(async (isCurrent) => {
      const supported =
        await ScreenOrientation.supportsOrientationLockAsync(requestedLock);
      if (!isCurrent()) return;
      await ScreenOrientation.lockAsync(
        supported ? requestedLock : ScreenOrientation.OrientationLock.DEFAULT,
      );
      if (!isCurrent()) return;
      const appliedLock = await ScreenOrientation.getOrientationLockAsync();
      if (!isCurrent()) return;
      messengerLog("info", "media.viewer.orientation_unlocked", {
        applied_lock: appliedLock,
        platform: Platform.OS,
        requested_lock: requestedLock,
        supported,
      });
    }).catch((error) =>
      messengerLog("warn", "media.viewer.orientation_unlock_failed", {
        error: error instanceof Error ? error.message : String(error),
        platform: Platform.OS,
      }),
    );

    return () => {
      // An older modal must not reset the orientation of a newer one.
      if (orientationOwner !== owner) return;
      orientationOwner = null;
      void queueOrientation(async () => {
        await ScreenOrientation.lockAsync(
          ScreenOrientation.OrientationLock.PORTRAIT_UP,
        );
      }).catch((error) =>
        messengerLog("warn", "media.viewer.orientation_restore_failed", {
          error: error instanceof Error ? error.message : String(error),
          platform: Platform.OS,
        }),
      );
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      setMenuVisible(false);
      setZoomed(false);
    }
  }, [visible]);

  useEffect(() => {
    closing.current = false;
    setZoomed(false);
  }, [visible, session, index]);
  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    setMenuVisible(false);
    setZoomed(false);
    closeRef.current();
  }, []);

  const selection = useRef({ items, index, onIndexChange });
  selection.current = { items, index, onIndexChange };
  const selectedIndex = useRef(index);
  useEffect(() => {
    selectedIndex.current = index;
  }, [index, session]);
  const selectPage = useCallback((nextIndex: number) => {
    const current = selection.current;
    if (
      current.index === null ||
      closing.current ||
      !Number.isInteger(nextIndex) ||
      !current.items[nextIndex] ||
      selectedIndex.current === nextIndex
    )
      return;
    selectedIndex.current = nextIndex;
    setZoomed(false);
    current.onIndexChange(nextIndex);
  }, []);
  // Not every native/web drag emits momentum-end. A fully visible page is also
  // authoritative; ignore partially visible neighbors and deduplicate events.
  const viewabilityConfig = useRef({
    waitForInteraction: true,
    itemVisiblePercentThreshold: 98,
    minimumViewTime: 80,
  }).current;
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<MessengerMedia>[] }) => {
      const page = viewableItems.find((item) => item.isViewable);
      if (page?.index != null) selectPage(page.index);
    },
    [selectPage],
  );

  const runMessageAction = (action?: () => void) => {
    close();
    if (!action) return;
    setTimeout(action, Platform.OS === "ios" ? 420 : 120);
  };

  const renderPage = (item: MessengerMedia, itemIndex: number) => {
    const localUri = localUris[item.id];
    const loading = loadingIds.has(item.id);
    const error = errors[item.id];
    const active = visible && itemIndex === index;
    return (
      <MessengerZoomableMedia
        width={width}
        height={height}
        resetKey={`${session}:${itemIndex}:${item.id}`}
        active={active}
        zoomEnabled={Boolean(localUri)}
        nativeChild={item.type === "video"}
        pagerGesture={items.length > 1 ? pagerGesture : undefined}
        onDismiss={close}
        onZoomChange={(value) => {
          if (active) setZoomed(value);
        }}
      >
        <View style={[styles.page, { width, height }]}>
          {localUri && item.type === "image" && (
            <Image
              testID={`viewer-image-${item.id}`}
              source={localUri}
              style={{ width, height }}
              contentFit="contain"
            />
          )}
          {localUri && item.type === "video" && active && (
            <View
              testID={`viewer-video-${item.id}`}
              style={[
                styles.videoStage,
                { top: videoTop, width, height: videoHeight },
              ]}
            >
              <MessengerVideoPlayer
                uri={localUri}
                style={{ width, height: videoHeight }}
                active={active}
                autoPlay
                fullscreenEnabled={false}
                onFallback={() =>
                  void onEnsureLocal(item).catch(() => undefined)
                }
              />
            </View>
          )}
          {!localUri && (
            <TouchableOpacity
              style={styles.loading}
              onPress={() => void onEnsureLocal(item).catch(() => undefined)}
              disabled={loading || !error}
              accessibilityLabel={
                error ? "Повторить загрузку вложения" : "Загрузка вложения"
              }
            >
              {loading || !error ? (
                <ActivityIndicator color={colors.white} size="large" />
              ) : (
                <>
                  <Icon name="refresh-outline" size={34} color={colors.white} />
                  <Text style={styles.errorText}>{error}</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </MessengerZoomableMedia>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={close}
    >
      <GestureHandlerRootView style={styles.root}>
        <StatusBar style="light" backgroundColor="#000000" />
        {index !== null &&
          (items.length === 1 ? (
            renderPage(items[0], 0)
          ) : (
            <GestureDetector gesture={pagerGesture}>
              <FlatList
                key={`media-viewer-${session}-${width}-${height}`}
                testID="media-viewer-pager"
                data={items}
                horizontal
                pagingEnabled
                scrollEnabled={!zoomed && !menuVisible}
                bounces={false}
                showsHorizontalScrollIndicator={false}
                removeClippedSubviews={false}
                initialScrollIndex={index}
                initialNumToRender={3}
                maxToRenderPerBatch={3}
                windowSize={3}
                keyExtractor={(item, itemIndex) => `${itemIndex}:${item.id}`}
                getItemLayout={(_data, itemIndex) => ({
                  length: width,
                  offset: width * itemIndex,
                  index: itemIndex,
                })}
                viewabilityConfig={viewabilityConfig}
                onViewableItemsChanged={onViewableItemsChanged}
                onScrollEndDrag={(event) => {
                  const page = event.nativeEvent.contentOffset.x / width;
                  // The release can precede the page snap; don't select halfway.
                  if (Math.abs(page - Math.round(page)) < 0.01)
                    selectPage(Math.round(page));
                }}
                onMomentumScrollEnd={(event) => {
                  const nextIndex = Math.round(
                    event.nativeEvent.contentOffset.x / width,
                  );
                  selectPage(nextIndex);
                }}
                renderItem={({ item, index: itemIndex }) =>
                  renderPage(item, itemIndex)
                }
              />
            </GestureDetector>
          ))}

        <View
          style={[
            styles.header,
            {
              top: headerTop,
              left: Math.max(insets.left, 8),
              right: Math.max(insets.right, 8),
            },
          ]}
          pointerEvents="box-none"
        >
          <TouchableOpacity
            style={styles.headerButton}
            onPress={close}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            testID="media-viewer-close"
            accessibilityLabel="Закрыть просмотр"
          >
            <Icon name="chevron-back" size={30} color={colors.white} />
          </TouchableOpacity>
          <View style={styles.heading}>
            <Text style={styles.title} numberOfLines={1}>
              {title ||
                media?.original_name ||
                (media?.type === "image" ? "Фотография" : "Видео")}
            </Text>
            {(subtitle || (title && media)) && (
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle || media?.original_name}
              </Text>
            )}
          </View>
          {index !== null && items.length > 1 && (
            <Text style={styles.counter}>
              {index + 1} из {items.length}
            </Text>
          )}
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => setMenuVisible((current) => !current)}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            accessibilityLabel="Действия с вложением"
          >
            <Icon name="ellipsis-horizontal" size={28} color={colors.white} />
          </TouchableOpacity>
        </View>

        {menuVisible && media && (
          <Pressable
            style={styles.menuBackdrop}
            onPress={() => setMenuVisible(false)}
          >
            <Pressable
              style={[
                styles.menu,
                {
                  top: Math.max(insets.top, 12) + 58,
                  right: Math.max(insets.right, 14),
                },
              ]}
              onPress={(event) => event.stopPropagation()}
            >
              <TouchableOpacity
                style={styles.menuAction}
                onPress={() => void onSave(media)}
                disabled={savingId === media.id}
              >
                {savingId === media.id ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Icon
                    name="download-outline"
                    size={23}
                    color={colors.white}
                  />
                )}
                <Text style={styles.menuText}>Сохранить в галерею</Text>
              </TouchableOpacity>
              {onShowInChat && (
                <TouchableOpacity
                  style={styles.menuAction}
                  onPress={() => runMessageAction(onShowInChat)}
                >
                  <Icon
                    name="return-down-back-outline"
                    size={23}
                    color={colors.white}
                  />
                  <Text style={styles.menuText}>Показать в чате</Text>
                </TouchableOpacity>
              )}
              {onReply && (
                <TouchableOpacity
                  style={styles.menuAction}
                  onPress={() => runMessageAction(onReply)}
                >
                  <Icon name="arrow-undo" size={23} color={colors.white} />
                  <Text style={styles.menuText}>Ответить</Text>
                </TouchableOpacity>
              )}
              {onForward && (
                <TouchableOpacity
                  style={styles.menuAction}
                  onPress={() => runMessageAction(onForward)}
                >
                  <Icon name="arrow-redo" size={23} color={colors.white} />
                  <Text style={styles.menuText}>Переслать</Text>
                </TouchableOpacity>
              )}
              {onDelete && (
                <TouchableOpacity
                  style={[styles.menuAction, styles.menuLastAction]}
                  onPress={() => runMessageAction(onDelete)}
                >
                  <Icon name="trash-outline" size={23} color="#FF5D5D" />
                  <Text style={[styles.menuText, styles.menuDangerText]}>
                    Удалить
                  </Text>
                </TouchableOpacity>
              )}
            </Pressable>
          </Pressable>
        )}
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000000" },
  page: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000000",
  },
  videoStage: {
    position: "absolute",
    left: 0,
    overflow: "hidden",
    backgroundColor: "#000000",
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  errorText: { color: colors.white, fontSize: 14, fontWeight: "600" },
  header: {
    position: "absolute",
    zIndex: 20,
    height: 58,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
    borderRadius: 29,
    backgroundColor: "rgba(22, 22, 22, 0.78)",
  },
  headerButton: {
    width: 50,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 25,
  },
  heading: { flex: 1, minWidth: 0, alignItems: "center" },
  title: {
    color: colors.white,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "800",
  },
  subtitle: {
    marginTop: 1,
    color: "rgba(255,255,255,0.58)",
    fontSize: 12,
    lineHeight: 15,
  },
  counter: {
    marginLeft: 8,
    color: "rgba(255,255,255,0.76)",
    fontSize: 13,
    fontWeight: "700",
  },
  menuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  menu: {
    position: "absolute",
    width: 262,
    overflow: "hidden",
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(24,24,24,0.94)",
  },
  menuAction: {
    minHeight: 55,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingHorizontal: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.14)",
  },
  menuLastAction: { borderBottomWidth: 0 },
  menuText: { color: colors.white, fontSize: 16, fontWeight: "500" },
  menuDangerText: { color: "#FF5D5D" },
});
