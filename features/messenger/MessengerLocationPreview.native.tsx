import React from "react";
import {
  Alert,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import Icon from "../../components/Icon";
import { colors } from "../../styles/commonStyles";
import type { MessengerLocation } from "./types";

interface MessengerLocationPreviewProps {
  location: MessengerLocation;
}

export default function MessengerLocationPreview({
  location,
}: MessengerLocationPreviewProps) {
  const { latitude, longitude } = location;
  const label = location.label || "Моя геопозиция";
  const coordinate = { latitude, longitude };

  const openMap = async () => {
    const encodedLabel = encodeURIComponent(label);
    const url =
      Platform.OS === "ios"
        ? `https://maps.apple.com/?ll=${latitude},${longitude}&q=${encodedLabel}`
        : `geo:${latitude},${longitude}?q=${latitude},${longitude}(${encodedLabel})`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert("Не удалось открыть карту", "Попробуйте ещё раз.");
    }
  };

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.9}
      onPress={() => void openMap()}
      accessibilityRole="button"
      accessibilityLabel={`${label}. Открыть в картах`}
    >
      <View style={styles.mapClip} pointerEvents="none">
        <MapView
          style={StyleSheet.absoluteFill}
          region={{
            ...coordinate,
            latitudeDelta: 0.008,
            longitudeDelta: 0.008,
          }}
          mapType="standard"
          loadingEnabled
          liteMode={Platform.OS === "android"}
          pitchEnabled={false}
          rotateEnabled={false}
          scrollEnabled={false}
          zoomEnabled={false}
          toolbarEnabled={false}
          showsBuildings={false}
          showsCompass={false}
          showsPointsOfInterest={false}
          showsScale={false}
          showsTraffic={false}
          showsUserLocation={false}
        >
          <Marker coordinate={coordinate} title={label} />
        </MapView>
      </View>
      <View style={styles.details}>
        <View style={styles.locationIcon}>
          <Icon name="location" size={19} color={colors.white} />
        </View>
        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={1}>
            {label}
          </Text>
          <Text style={styles.subtitle}>
            {latitude.toFixed(5)}, {longitude.toFixed(5)}
          </Text>
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
    backgroundColor: "rgba(255, 255, 255, 0.7)",
  },
  mapClip: {
    width: "100%",
    height: 132,
    overflow: "hidden",
    backgroundColor: "#DCE7EF",
  },
  details: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  locationIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 19,
    backgroundColor: colors.accent,
  },
  text: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: 13, fontWeight: "800" },
  subtitle: {
    marginTop: 2,
    color: colors.textSecondary,
    fontSize: 10,
    lineHeight: 14,
  },
});
