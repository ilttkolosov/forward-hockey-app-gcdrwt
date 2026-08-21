import { Image } from "expo-image";
import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  getLocalMessengerRoomAvatar,
  messengerRoomAvatarPreset,
  subscribeLocalMessengerRoomAvatar,
} from "../../services/messengerRoomAppearance";
import AuthenticatedAvatar from "./AuthenticatedAvatar";

interface LocalRoomAvatarProps {
  roomId: string;
  userId?: string | null;
  displayName: string;
  avatarUrl: string | null;
  accessToken?: string | null;
  size?: number;
}

export default function LocalRoomAvatar({
  roomId,
  userId,
  displayName,
  avatarUrl,
  accessToken,
  size = 44,
}: LocalRoomAvatarProps) {
  const [presetId, setPresetId] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || !roomId) {
      setPresetId(null);
      return;
    }
    let active = true;
    void getLocalMessengerRoomAvatar(userId, roomId).then((value) => {
      if (active) setPresetId(value);
    });
    const unsubscribe = subscribeLocalMessengerRoomAvatar(
      userId,
      roomId,
      setPresetId,
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [roomId, userId]);

  const preset = messengerRoomAvatarPreset(presetId);
  if (!preset) {
    return (
      <AuthenticatedAvatar
        displayName={displayName}
        avatarUrl={avatarUrl}
        accessToken={accessToken}
        identityKey={roomId}
        size={size}
      />
    );
  }

  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
      accessibilityLabel={`Личный аватар группы ${displayName}`}
    >
      <Image source={preset.source} style={styles.image} contentFit="contain" />
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
    backgroundColor: "#397BC0",
  },
  image: { width: "100%", height: "100%" },
});
