import React, { useMemo } from "react";
import { StyleSheet, Text } from "react-native";

export function messengerAvatarInitials(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  const value =
    words.length > 1
      ? `${words[0]?.[0] || ""}${words[1]?.[0] || ""}`
      : words[0]?.slice(0, 2) || "?";
  return value.toLocaleUpperCase("ru-RU");
}

export default function AvatarInitials({
  displayName,
  size,
}: {
  displayName: string;
  size: number;
}) {
  const initials = useMemo(
    () => messengerAvatarInitials(displayName),
    [displayName],
  );
  return (
    <Text style={[styles.text, { fontSize: Math.max(12, Math.round(size * 0.36)) }]}>
      {initials}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    color: "#FFFFFF",
    fontWeight: "800",
    textAlign: "center",
  },
});
