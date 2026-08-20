import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import Icon from "../../components/Icon";
import {
  DEFAULT_SAVED_APPEARANCE,
  getMessengerSavedAppearance,
  type MessengerSavedAppearance,
} from "../../services/messengerSavedAppearance";

interface SavedMessagesAvatarProps {
  size?: number;
  userId?: string;
  appearance?: MessengerSavedAppearance;
}

function SavedMessagesAvatar({
  size = 44,
  userId,
  appearance,
}: SavedMessagesAvatarProps) {
  const [storedAppearance, setStoredAppearance] =
    useState<MessengerSavedAppearance>(DEFAULT_SAVED_APPEARANCE);

  useEffect(() => {
    if (appearance || !userId) return;
    let active = true;
    void getMessengerSavedAppearance(userId).then((value) => {
      if (active) setStoredAppearance(value);
    });
    return () => {
      active = false;
    };
  }, [appearance, userId]);

  const selected = appearance || storedAppearance;
  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: selected.backgroundColor,
        },
      ]}
      accessibilityLabel="Аватар чата Избранное"
    >
      <Icon
        name={selected.icon}
        size={Math.round(size * 0.5)}
        color="#FFFFFF"
      />
    </View>
  );
}

export default React.memo(SavedMessagesAvatar);

const styles = StyleSheet.create({
  avatar: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(27, 54, 93, 0.16)",
  },
});
