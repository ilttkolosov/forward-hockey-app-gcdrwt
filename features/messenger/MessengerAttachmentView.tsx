import { ResizeMode, Video } from "expo-av";
import { Image } from "expo-image";
import * as Sharing from "expo-sharing";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "../../components/Icon";
import type { MessengerLocation, MessengerMedia } from "./types";
import {
  cacheMessengerMedia,
  formatMessengerBytes,
} from "../../services/messengerMediaCache";
import { colors } from "../../styles/commonStyles";

interface MessengerAttachmentViewProps {
  media: MessengerMedia | null;
  location: MessengerLocation | null;
  accessToken: string;
}

export default function MessengerAttachmentView({
  media,
  location,
  accessToken,
}: MessengerAttachmentViewProps) {
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewerVisible, setViewerVisible] = useState(false);

  useEffect(() => {
    setLocalUri(null);
    setError(null);
    setViewerVisible(false);
  }, [media?.id]);

  const ensureLocal = useCallback(async (): Promise<string> => {
    if (!media) throw new Error("Вложение отсутствует");
    if (localUri) return localUri;
    setLoading(true);
    setError(null);
    try {
      const uri = await cacheMessengerMedia(media, accessToken);
      setLocalUri(uri);
      return uri;
    } catch (cacheError) {
      const message =
        cacheError instanceof Error
          ? cacheError.message
          : "Не удалось загрузить вложение";
      setError(message);
      throw cacheError;
    } finally {
      setLoading(false);
    }
  }, [accessToken, localUri, media]);

  useEffect(() => {
    if (media?.type !== "image") return;
    void ensureLocal().catch(() => undefined);
  }, [ensureLocal, media?.type]);

  if (location) {
    const openMap = () => {
      const { latitude, longitude } = location;
      const label = encodeURIComponent(location.label || "Геопозиция");
      const url =
        Platform.OS === "ios"
          ? `https://maps.apple.com/?ll=${latitude},${longitude}&q=${label}`
          : `geo:${latitude},${longitude}?q=${latitude},${longitude}(${label})`;
      void Linking.openURL(url);
    };
    return (
      <TouchableOpacity
        style={styles.locationCard}
        activeOpacity={0.84}
        onPress={openMap}
      >
        <View style={styles.locationIcon}>
          <Icon name="location" size={25} color={colors.white} />
        </View>
        <View style={styles.attachmentText}>
          <Text style={styles.attachmentTitle} numberOfLines={1}>
            {location.label || "Моя геопозиция"}
          </Text>
          <Text style={styles.attachmentSubtitle}>
            {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
          </Text>
        </View>
        <Icon name="open-outline" size={18} color={colors.primary} />
      </TouchableOpacity>
    );
  }

  if (!media) return null;

  const openViewer = async () => {
    try {
      await ensureLocal();
      setViewerVisible(true);
    } catch {
      // The inline error and retry action remain visible in the bubble.
    }
  };

  const openFile = async () => {
    try {
      const uri = await ensureLocal();
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert(
          "Файл сохранён",
          "На этом устройстве нет обработчика для открытия файла.",
        );
        return;
      }
      await Sharing.shareAsync(uri, {
        dialogTitle: media.original_name,
        mimeType: media.mime_type,
      });
    } catch {
      // Error is rendered below.
    }
  };

  return (
    <>
      {media.type === "image" ? (
        <TouchableOpacity
          style={styles.imageFrame}
          activeOpacity={0.9}
          onPress={openViewer}
        >
          {localUri ? (
            <Image
              source={localUri}
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
        <TouchableOpacity
          style={styles.fileCard}
          activeOpacity={0.84}
          onPress={media.type === "video" ? openViewer : openFile}
          disabled={loading}
        >
          <View style={styles.fileIcon}>
            {loading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Icon
                name={media.type === "video" ? "play" : "document-text"}
                size={23}
                color={colors.white}
              />
            )}
          </View>
          <View style={styles.attachmentText}>
            <Text style={styles.attachmentTitle} numberOfLines={2}>
              {media.original_name ||
                (media.type === "video" ? "Видео" : "Файл")}
            </Text>
            <Text style={styles.attachmentSubtitle}>
              {formatMessengerBytes(media.size_bytes)} · Нажмите для просмотра
            </Text>
          </View>
        </TouchableOpacity>
      )}

      {error && (
        <TouchableOpacity
          onPress={media.type === "file" ? openFile : openViewer}
        >
          <Text style={styles.errorText}>Не удалось загрузить · повторить</Text>
        </TouchableOpacity>
      )}

      <Modal
        visible={viewerVisible}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={() => setViewerVisible(false)}
      >
        <SafeAreaView style={styles.viewer} edges={["top", "bottom"]}>
          <View style={styles.viewerHeader}>
            <Text style={styles.viewerTitle} numberOfLines={1}>
              {media.original_name ||
                (media.type === "image" ? "Фотография" : "Видео")}
            </Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setViewerVisible(false)}
              accessibilityLabel="Закрыть просмотр"
            >
              <Icon name="close" size={28} color={colors.white} />
            </TouchableOpacity>
          </View>
          <View style={styles.viewerContent}>
            {localUri && media.type === "image" && (
              <ScrollView
                style={styles.zoomContainer}
                contentContainerStyle={styles.zoomContent}
                minimumZoomScale={1}
                maximumZoomScale={4}
                centerContent
              >
                <Image
                  source={localUri}
                  style={styles.fullImage}
                  contentFit="contain"
                />
              </ScrollView>
            )}
            {localUri && media.type === "video" && (
              <Video
                source={{ uri: localUri }}
                style={styles.fullVideo}
                useNativeControls
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay
              />
            )}
          </View>
        </SafeAreaView>
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
  fileCard: {
    width: 235,
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
    padding: 9,
    borderRadius: 13,
    backgroundColor: "rgba(255, 255, 255, 0.54)",
  },
  locationCard: {
    width: 235,
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
    padding: 9,
    borderRadius: 13,
    backgroundColor: "rgba(255, 255, 255, 0.54)",
  },
  fileIcon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: colors.primary,
  },
  locationIcon: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: colors.accent,
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
  closeButton: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  viewerContent: { flex: 1, alignItems: "center", justifyContent: "center" },
  zoomContainer: { width: "100%", height: "100%" },
  zoomContent: { flexGrow: 1, alignItems: "center", justifyContent: "center" },
  fullImage: { width: "100%", height: "100%", minHeight: 500 },
  fullVideo: { width: "100%", height: "100%" },
});
