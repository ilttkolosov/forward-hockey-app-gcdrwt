import React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from "react-native";

export default function ForwardModalKeyboardArea({
  children,
}: React.PropsWithChildren) {
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({ container: { flex: 1 } });
