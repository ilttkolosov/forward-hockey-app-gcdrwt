import { Image } from "expo-image";
import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { messengerMediaUrl } from "../../services/messengerApi";
import { MESSENGER_PRESET_AVATARS } from "./presetAvatars";

interface AuthenticatedAvatarProps {
  displayName: string;
  avatarUrl: string | null;
  accessToken?: string | null;
  size?: number;
  identityKey?: string | null;
  roles?: readonly string[];
}

const ROLE_COLORS: Record<string, string> = {
  administrator: "#455A64",
  coaching_staff: "#B84C4C",
  captain: "#2E6FB6",
  assistant: "#3E8CA8",
  parent_committee: "#7A5AA6",
  parent: "#4E8B67",
  fan: "#D68132",
  player: "#397BC0",
};

const FALLBACK_COLORS = [
  "#397BC0",
  "#4E8B67",
  "#7A5AA6",
  "#D68132",
  "#3E8CA8",
  "#B05B78",
] as const;

function stableHash(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function roleColor(roles: readonly string[] | undefined, hash: number): string {
  if (roles) {
    for (const role of [
      "administrator",
      "coaching_staff",
      "captain",
      "assistant",
      "parent_committee",
      "parent",
      "fan",
      "player",
    ]) {
      if (roles.includes(role)) return ROLE_COLORS[role];
    }
  }
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
}

function AuthenticatedAvatar({
  displayName,
  avatarUrl,
  accessToken,
  size = 34,
  identityKey,
  roles,
}: AuthenticatedAvatarProps) {
  const uri = messengerMediaUrl(avatarUrl);
  const identity = identityKey || displayName.trim().toLocaleLowerCase("ru-RU");
  const hash = useMemo(() => stableHash(identity || "forward"), [identity]);
  const preset =
    MESSENGER_PRESET_AVATARS[hash % MESSENGER_PRESET_AVATARS.length];
  const backgroundColor = roleColor(roles, hash);

  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor,
        },
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
        <Image
          source={preset.source}
          style={styles.image}
          contentFit="contain"
          transition={120}
        />
      )}
    </View>
  );
}

// Message bubbles update frequently (delivery marks, composer state and
// viewability). Reusing an unchanged avatar prevents expo-image from being
// reconciled again whenever another message is appended to the feed.
export default React.memo(AuthenticatedAvatar);

const styles = StyleSheet.create({
  avatar: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(23, 52, 87, 0.14)",
  },
  image: { width: "100%", height: "100%" },
});
