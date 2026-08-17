import React from "react";
import { StyleSheet, View } from "react-native";
import Icon from "../../components/Icon";
import { colors } from "../../styles/commonStyles";

function SavedMessagesAvatar({ size = 44 }: { size?: number }) {
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
      accessibilityLabel="Аватар чата Избранное"
    >
      <Icon name="star" size={Math.round(size * 0.5)} color={colors.white} />
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
    // Forward's orange accent is warmer and more on-brand than the old gold.
    backgroundColor: colors.secondary,
  },
});
