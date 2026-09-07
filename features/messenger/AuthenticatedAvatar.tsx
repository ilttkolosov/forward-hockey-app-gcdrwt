import { Image } from "expo-image";
import { usePathname, useRouter } from "expo-router";
import React, { useMemo } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { useMessengerAuth } from "../../contexts/MessengerAuthContext";
import { messengerMediaUrl } from "../../services/messengerApi";
import {
  registerMessengerAvatarIdentity,
  resolveMessengerAvatarIdentity,
} from "./avatarIdentity";
import AvatarInitials from "./AvatarInitials";
import SavedMessagesAvatar from "./SavedMessagesAvatar";

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
  const router = useRouter();
  const pathname = usePathname();
  const { session } = useMessengerAuth();
  const uri = messengerMediaUrl(avatarUrl);
  if (identityKey) registerMessengerAvatarIdentity(identityKey, displayName);
  const identity = resolveMessengerAvatarIdentity(identityKey, displayName);
  const hash = useMemo(() => stableHash(identity), [identity]);
  const backgroundColor = uri ? "#FFFFFF" : roleColor(roles, hash);
  const roomMatch = /^\/messenger\/room\/([^/]+)/.exec(pathname);
  const roomId = roomMatch?.[1] || null;
  const opensForeignMessageAuthorProfile = Boolean(
    roomId &&
      size === 40 &&
      identityKey &&
      identityKey !== session?.user.id,
  );

  if (!uri && displayName === "Избранное" && session?.user.id) {
    return <SavedMessagesAvatar size={size} userId={session.user.id} />;
  }

  const avatar = (
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
        <AvatarInitials displayName={displayName} size={size} />
      )}
    </View>
  );

  if (!opensForeignMessageAuthorProfile || !identityKey || !roomId) {
    return avatar;
  }

  return (
    <TouchableOpacity
      activeOpacity={0.78}
      onPress={() =>
        router.push({
          pathname: "/messenger/contact/[id]",
          params: {
            id: identityKey,
            roomId,
            openedAt: String(Date.now()),
          },
        })
      }
      accessibilityRole="button"
      accessibilityLabel={`Открыть профиль ${displayName}`}
    >
      {avatar}
    </TouchableOpacity>
  );
}

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
