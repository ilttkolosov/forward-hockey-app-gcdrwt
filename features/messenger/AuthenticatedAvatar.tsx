import { Image } from "expo-image";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { messengerMediaUrl } from "../../services/messengerApi";

interface AuthenticatedAvatarProps {
  displayName: string;
  avatarUrl: string | null;
  accessToken?: string | null;
  size?: number;
}

function initials(displayName: string): string {
  return (
    displayName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0] || "")
      .join("")
      .toUpperCase() || "F"
  );
}

export default function AuthenticatedAvatar({
  displayName,
  avatarUrl,
  accessToken,
  size = 34,
}: AuthenticatedAvatarProps) {
  const uri = messengerMediaUrl(avatarUrl);
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
      accessibilityLabel={`Аватар: ${displayName}`}
    >
      {uri ? (
        <Image
          source={{
            uri,
            headers: accessToken
              ? { Authorization: `Bearer ${accessToken}` }
              : undefined,
          }}
          style={styles.image}
          contentFit="cover"
          transition={120}
        />
      ) : (
        <Text
          style={[styles.initials, { fontSize: Math.max(11, size * 0.34) }]}
        >
          {initials(displayName)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(23, 52, 87, 0.14)",
    backgroundColor: "#377FD4",
  },
  image: { width: "100%", height: "100%" },
  initials: { color: "#FFFFFF", fontWeight: "900" },
});
