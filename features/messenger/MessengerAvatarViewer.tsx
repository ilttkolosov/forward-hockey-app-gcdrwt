import { Image } from "expo-image";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "../../components/Icon";
import { messengerMediaUrl } from "../../services/messengerApi";
import { colors } from "../../styles/commonStyles";

interface MessengerAvatarViewerProps {
  visible: boolean;
  title: string;
  avatarUrl?: string | null;
  localUri?: string | null;
  accessToken?: string | null;
  onClose(): void;
}

/** Full-resolution avatar viewer shared by user and group profile screens. */
export default function MessengerAvatarViewer({
  visible,
  title,
  avatarUrl,
  localUri,
  accessToken,
  onClose,
}: MessengerAvatarViewerProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const uri = localUri || messengerMediaUrl(avatarUrl || null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setFailed(false);
    setReloadKey(0);
  }, [uri, visible]);

  const source = useMemo(
    () =>
      uri
        ? {
            uri,
            headers:
              !localUri && accessToken
                ? { Authorization: `Bearer ${accessToken}` }
                : undefined,
          }
        : null,
    [accessToken, localUri, uri],
  );
  const imageHeight = Math.max(
    1,
    height - Math.max(insets.top, 12) - insets.bottom - 56,
  );

  return (
    <Modal
      visible={visible && Boolean(source)}
      animationType="fade"
      presentationStyle="fullScreen"
      statusBarTranslucent={false}
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.viewer,
          {
            paddingTop: Math.max(insets.top, 12),
            paddingBottom: insets.bottom,
          },
        ]}
        accessibilityViewIsModal
      >
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <TouchableOpacity
            style={[
              styles.closeButton,
              { marginRight: Math.max(insets.right, 8) },
            ]}
            onPress={onClose}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Закрыть просмотр фотографии"
          >
            <Icon name="close" size={28} color={colors.white} />
          </TouchableOpacity>
        </View>

        <View style={styles.imageStage}>
          {source ? (
            <ScrollView
              style={styles.zoomContainer}
              contentContainerStyle={styles.zoomContent}
              minimumZoomScale={1}
              maximumZoomScale={4}
              centerContent
              bouncesZoom
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
            >
              <Image
                key={`${uri}:${reloadKey}`}
                source={source}
                style={{ width, height: imageHeight }}
                contentFit="contain"
                transition={120}
                onLoadStart={() => {
                  setLoading(true);
                  setFailed(false);
                }}
                onLoad={() => setLoading(false)}
                onError={() => {
                  setLoading(false);
                  setFailed(true);
                }}
                accessibilityLabel={`Фотография: ${title}`}
              />
            </ScrollView>
          ) : null}

          {loading && !failed ? (
            <View style={styles.overlay} pointerEvents="none">
              <ActivityIndicator size="large" color={colors.white} />
            </View>
          ) : null}
          {failed ? (
            <View style={styles.overlay}>
              <Icon name="image-outline" size={42} color={colors.white} />
              <Text style={styles.errorText}>
                Не удалось загрузить фотографию
              </Text>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => {
                  setFailed(false);
                  setLoading(true);
                  setReloadKey((current) => current + 1);
                }}
              >
                <Text style={styles.retryText}>Повторить</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  viewer: { flex: 1, backgroundColor: "#08121E" },
  header: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.2)",
  },
  title: { flex: 1, color: colors.white, fontWeight: "700" },
  closeButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  imageStage: { flex: 1 },
  zoomContainer: { flex: 1, width: "100%" },
  zoomContent: { flexGrow: 1, alignItems: "center", justifyContent: "center" },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    paddingHorizontal: 28,
    backgroundColor: "rgba(8,18,30,0.72)",
  },
  errorText: { color: colors.white, textAlign: "center", fontSize: 14 },
  retryButton: {
    minHeight: 42,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  retryText: { color: colors.white, fontWeight: "800" },
});
