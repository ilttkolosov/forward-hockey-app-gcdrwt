import React from "react";
import { View, StyleSheet } from "react-native";

export interface ChatKeyboardAreaProps extends React.PropsWithChildren {
  onTransitionStart?: () => void;
}

export default function ChatKeyboardArea({ children }: ChatKeyboardAreaProps) {
  return <View style={styles.body}>{children}</View>;
}

const styles = StyleSheet.create({ body: { flex: 1 } });
