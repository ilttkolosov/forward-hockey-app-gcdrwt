import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { colors } from "../../styles/commonStyles";
import { pinnedMessengerPreview, type MessengerPin } from "./pins";

interface Props {
  items: MessengerPin[];
  messageId: string | null;
  visitedId: string | null;
  busy: boolean;
  onPress: () => void;
}

export default function PinnedMessagesBanner({
  items,
  messageId,
  visitedId,
  busy,
  onPress,
}: Props) {
  const index = items.findIndex((pin) => pin.message.id === messageId);
  const pin = items[index];
  if (!pin) return null;
  const activeId = items.some((item) => item.message.id === visitedId)
    ? visitedId
    : messageId;
  const preview = pinnedMessengerPreview(pin.message);
  return (
    <Pressable
      style={styles.banner}
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: busy }}
      accessibilityLabel={`Закреплённое сообщение ${index + 1} из ${items.length}. ${preview}`}
      accessibilityHint="Перейти к сообщению и показать следующее закрепление"
    >
      <View style={styles.rail} accessible={false}>
        {items.map((item, segment) => (
          <View
            key={item.message.id}
            style={[
              styles.segment,
              {
                width: item.message.id === activeId ? 4 : 2,
                opacity: item.message.id === activeId ? 1 : 0.35,
                marginTop: segment ? Math.min(2, 12 / items.length) : 0,
              },
            ]}
          />
        ))}
      </View>
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={1}>
          Закреплённое сообщение
          {items.length > 1 ? ` · ${index + 1}/${items.length}` : ""}
        </Text>
        <Text style={styles.preview} numberOfLines={1} ellipsizeMode="tail">
          {preview}
        </Text>
      </View>
      {busy && <ActivityIndicator size="small" color={colors.primary} />}
    </Pressable>
  );
}
const styles = StyleSheet.create({
  banner: {
    minHeight: 58,
    paddingVertical: 8,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rail: { height: 40, width: 5, marginRight: 10, alignItems: "center" },
  segment: { flex: 1, borderRadius: 2, backgroundColor: colors.primary },
  content: { flex: 1, minWidth: 0 },
  title: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 3,
  },
  preview: { color: colors.text, fontSize: 14 },
});
