import React from "react";
import {
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

export default function MessengerLocationPreview({
  location,
}: MessengerLocationPreviewProps) {
  const openMap = () => {
    const { latitude, longitude } = location;
    void Linking.openURL(
      `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
    );
  };

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.84}
      onPress={openMap}
      accessibilityRole="button"
      accessibilityLabel="Открыть геопозицию на карте"
    >
      <View style={styles.icon}>
        <Icon name="location" size={25} color={colors.white} />
      </View>
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {location.label || "Моя геопозиция"}
        </Text>
        <Text style={styles.subtitle}>
          {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
        </Text>
      </View>
      <Icon name="open-outline" size={18} color={colors.primary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
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
  icon: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: colors.accent,
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
