import React from "react";
import { StyleSheet } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";

/** Keeps the forwarding sheet inside the visible area of the modal's portal. */
export default function ForwardModalKeyboardArea({
  children,
}: React.PropsWithChildren) {
  return (
    <KeyboardAvoidingView style={styles.container} behavior="height">
      {children}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({ container: { flex: 1 } });
