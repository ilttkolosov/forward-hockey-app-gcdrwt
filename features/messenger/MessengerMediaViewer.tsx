import { Image } from "expo-image";
import * as ScreenOrientation from "expo-screen-orientation";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
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
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "../../components/Icon";
import { messengerLog } from "../../services/messengerLogger";
import { colors } from "../../styles/commonStyles";
import MessengerVideoPlayer from "./MessengerVideoPlayer";
import MessengerZoomableMedia from "./MessengerZoomableMedia";
import type { MessengerMedia } from "./types";

interface MessengerMediaViewerProps {
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

export default function MessengerMediaViewer({
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
}: MessengerMediaViewerProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [menuVisible, setMenuVisible] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const visible = index !== null;
  const media = index === null ? null : (items[index] ?? null);
  const headerTop = Math.max(insets.top, 8);
  const videoTop = headerTop + 66;
  const videoBottom = Math.max(insets.bottom, 8);
  const videoHeight = Math.max(1, height - videoTop - videoBottom);

  useEffect(() => {
    if (!visible || Platform.OS === "web") return;
    let active = true;
    const requestedLock = ScreenOrientation.OrientationLock.ALL;
    void ScreenOrientation.supportsOrientationLockAsync(requestedLock)
      .then((supported) =>
        ScreenOrientation.lockAsync(
          supported
            ? requestedLock
            : ScreenOrientation.OrientationLock.DEFAULT,
        ).then(() => supported),
      )
      .then(async (supported) => {
        if (!active) return;
        const appliedLock = await ScreenOrientation.getOrientationLockAsync();
        messengerLog("info", "media.viewer.orientation_unlocked", {
          applied_lock: appliedLock,
          platform: Platform.OS,
          requested_lock: requestedLock,
          supported,
        });
      })
      .catch((error) =>
        messengerLog("warn", "media.viewer.orientation_unlock_failed", {
          error: error instanceof Error ? error.message : String(error),
          platform: Platform.OS,
        }),
      );

    return () => {
      active = false;
      void ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.PORTRAIT_UP,
      ).catch((error) =>
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

  const close = () => {
    setMenuVisible(false);
    setZoomed(false);
    onClose();
  };

  const runMessageAction = (action?: () => void) => {
    close();
    if (!action) return;
    setTimeout(action, Platform.OS === "ios" ? 420 : 120);
  };

  const renderPage = (item: MessengerMedia, itemIndex: number) => {
    const localUri = localUris[item.id];
    const loading = loadingIds.has(item.id);
    const error = errors[item.id];
    return (
      <View style={[styles.page, { width, height }]}>
        {localUri && item.type === "image" && (
          <MessengerZoomableMedia
            width={width}
            height={height}
            resetKey={`${session}:${item.id}`}
            onZoomChange={setZoomed}
          >
            <Image
              source={localUri}
              style={{ width, height }}
              contentFit="contain"
            />
          </MessengerZoomableMedia>
        )}
        {localUri && item.type === "video" && (
          <View
            style={[
              styles.videoStage,
              { top: videoTop, width, height: videoHeight },
            ]}
          >
            <MessengerZoomableMedia
              width={width}
              height={videoHeight}
              resetKey={`${session}:${item.id}`}
              nativeChild
              onZoomChange={setZoomed}
            >
              <MessengerVideoPlayer
                uri={localUri}
                style={{ width, height: videoHeight }}
                active={visible && itemIndex === index}
                autoPlay
                fullscreenEnabled={false}
                onFallback={() => void onEnsureLocal(item)}
              />
            </MessengerZoomableMedia>
          </View>
        )}
        {!localUri && (
          <TouchableOpacity
            style={styles.loading}
            onPress={() => void onEnsureLocal(item).catch(() => undefined)}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.white} size="large" />
            ) : (
              <>
                <Icon name="refresh-outline" size={34} color={colors.white} />
                <Text style={styles.errorText}>
                  {error || "Нажмите, чтобы загрузить"}
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
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
            <FlatList
              key={`media-viewer-${session}`}
              data={items}
              horizontal
              pagingEnabled
              scrollEnabled={!zoomed}
              bounces={false}
              showsHorizontalScrollIndicator={false}
              removeClippedSubviews={false}
              initialScrollIndex={index}
              keyExtractor={(item) => item.id}
              getItemLayout={(_data, itemIndex) => ({
                length: width,
                offset: width * itemIndex,
                index: itemIndex,
              })}
              onMomentumScrollEnd={(event) => {
                const nextIndex = Math.round(
                  event.nativeEvent.contentOffset.x / width,
                );
                if (!items[nextIndex]) return;
                setZoomed(false);
                onIndexChange(nextIndex);
              }}
              renderItem={({ item, index: itemIndex }) =>
                renderPage(item, itemIndex)
              }
            />
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
