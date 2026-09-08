import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import PinnedMediaThumbnail from "./PinnedMediaThumbnail";
import { colors } from "../../styles/commonStyles";
import {
  pinnedMessengerPreview,
  pinnedMessengerMedia,
  type MessengerPin,
} from "./pins";

interface Props {
  items: MessengerPin[];
  messageId: string | null;
  visitedId: string | null;
  busy: boolean;
  onPress: () => void;
  accessToken: string;
  active: boolean;
}
export default function PinnedMessagesBanner({
  items,
  messageId,
  busy,
  onPress,
  accessToken,
  active,
}: Props) {
  const index = items.findIndex((pin) => pin.message.id === messageId);
  const pin = items[index];
  if (!pin) return null;
  // The rail describes the preview (the next tap target), never the focused row.
  const activeId = messageId;
  const preview = pinnedMessengerPreview(pin.message);
  const media = pinnedMessengerMedia(pin.message);
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
            testID={`pin-segment-${item.message.id}`}
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
      {media && (
        <PinnedMediaThumbnail
          media={media}
          accessToken={accessToken}
          active={active}
        />
      )}
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={1}>
          Закрепленное сообщение
        </Text>
        <Text style={styles.preview} numberOfLines={1} ellipsizeMode="tail">
          {preview}
        </Text>
      </View>
      <View style={styles.symbol} pointerEvents="none" accessible={false}>
        {busy ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Svg width={24} height={24} viewBox="0 0 24 24">
            <Path
              d="M3 5h17M3 10h8M3 15h6M14 9h6M15 9v5l-2 3h8l-2-3V9M17 17v5"
              fill="none"
              stroke={colors.primary}
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        )}
      </View>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  banner: {
    minHeight: 64,
    paddingVertical: 8,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rail: {
    height: 48,
    width: 5,
    flexShrink: 0,
    marginRight: 10,
    alignItems: "center",
  },
  segment: { flex: 1, borderRadius: 2, backgroundColor: colors.primary },
  content: { flex: 1, minWidth: 0 },
  symbol: {
    width: 24,
    height: 24,
    marginLeft: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 3,
  },
  preview: { color: colors.text, fontSize: 14 },
});
