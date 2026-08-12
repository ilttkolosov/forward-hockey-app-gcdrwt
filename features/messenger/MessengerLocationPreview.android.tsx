import React, { useMemo } from "react";
import {
  Alert,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Icon from "../../components/Icon";
import { colors } from "../../styles/commonStyles";
import type { MessengerLocation } from "./types";

interface MessengerLocationPreviewProps {
  location: MessengerLocation;
}

/**
 * Android deliberately uses a native-map-free preview.
 *
 * A MapView embedded into a virtualized message feed can terminate the
 * Android process before React gets an exception (in particular on vendor
 * firmware and release builds using the New Architecture). Expo Go uses a
 * different native container, so it does not reproduce that failure.
 * Keeping this component in a platform-specific file also means Android does
 * not import react-native-maps while a chat is rendered. The full location is
 * still opened in the user's installed maps application.
 */
export default function MessengerLocationPreview({
  location,
}: MessengerLocationPreviewProps) {
  const latitude = Number(location?.latitude);
  const longitude = Number(location?.longitude);
  const label = location?.label?.trim() || "Моя геопозиция";
  const validCoordinate =
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180;

  const coordinateText = validCoordinate
    ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
    : "Некорректная геопозиция";

  const links = useMemo(() => {
    if (!validCoordinate) return null;
    const query = `${latitude},${longitude}`;
    return {
      native: `geo:${query}?q=${encodeURIComponent(`${query} (${label})`)}`,
      web: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        query,
      )}`,
    };
  }, [label, latitude, longitude, validCoordinate]);

  const openMap = async () => {
    if (!links) {
      Alert.alert(
        "Координаты недоступны",
        "Сообщение содержит некорректную геопозицию.",
      );
      return;
    }
    try {
      await Linking.openURL(links.native);
    } catch {
      try {
        await Linking.openURL(links.web);
      } catch {
        Alert.alert(
          "Не удалось открыть карту",
          "На устройстве нет доступного приложения карт.",
        );
      }
    }
  };

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.84}
      onPress={() => void openMap()}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${coordinateText}. Открыть в картах`}
    >
      <View style={styles.preview} pointerEvents="none">
        <View style={[styles.road, styles.roadOne]} />
        <View style={[styles.road, styles.roadTwo]} />
        <View style={styles.pin}>
          <Icon name="location" size={28} color={colors.white} />
        </View>
        <View style={styles.previewCaption}>
          <Text style={styles.previewCaptionText}>
            {validCoordinate ? "Открыть в картах" : "Координаты недоступны"}
          </Text>
        </View>
      </View>
      <View style={styles.details}>
        <View style={styles.locationIcon}>
          <Icon name="location" size={23} color={colors.white} />
        </View>
        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={1}>
            {label}
          </Text>
          <Text style={styles.subtitle}>{coordinateText}</Text>
        </View>
        <Icon name="open-outline" size={18} color={colors.primary} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 235,
    marginBottom: 4,
    overflow: "hidden",
    borderRadius: 13,
    backgroundColor: "rgba(255, 255, 255, 0.66)",
  },
  preview: {
    height: 112,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#DCE7EF",
  },
  road: {
    position: "absolute",
    width: 300,
    height: 16,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.92)",
    backgroundColor: "#B9C8D4",
  },
  roadOne: { transform: [{ rotate: "19deg" }] },
  roadTwo: { transform: [{ rotate: "-37deg" }] },
  pin: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
    backgroundColor: colors.accent,
  },
  previewCaption: {
    position: "absolute",
    right: 8,
    bottom: 7,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 9,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
  },
  previewCaptionText: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: "700",
  },
  details: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    padding: 8,
  },
  locationIcon: {
    width: 43,
    height: 43,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  text: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: 13, fontWeight: "800" },
  subtitle: {
    marginTop: 3,
    color: colors.textSecondary,
    fontSize: 10,
    lineHeight: 14,
  },
});
