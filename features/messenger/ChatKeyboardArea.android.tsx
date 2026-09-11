import React, { useCallback, useState } from "react";
import { View, StyleSheet, type LayoutChangeEvent } from "react-native";
import { KeyboardAvoidingView, useGenericKeyboardHandler } from "react-native-keyboard-controller";
import { runOnJS } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ChatKeyboardAreaProps } from "./ChatKeyboardArea";

/** One IME owner for the list + composer; the header stays outside the clip. */
export default function ChatKeyboardArea({ children, onTransitionStart }: ChatKeyboardAreaProps) {
  const [top, setTop] = useState(0);
  const { top: safeTop, bottom } = useSafeAreaInsets();
  const reportTransition = useCallback((phase: "start" | "end", height: number) => {
    if (phase === "start") onTransitionStart?.();
    // Two records per transition, never per animation frame; no message data.
    console.info("[ForwardIME] system-insets", { phase, height, bodyTop: top + safeTop, navigationInset: bottom });
  }, [bottom, top, safeTop, onTransitionStart]);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    // The provider exposes the full window. KeyboardFrame is inside the chat
    // SafeAreaView: y includes header/pins; safeTop supplies its window offset.
    // It changes on header/rotation layout, never on keyboard animation frames.
    setTop(event.nativeEvent.layout.y);
  }, []);
  useGenericKeyboardHandler({
    onStart: (event) => {
      "worklet";
      runOnJS(reportTransition)("start", event.height);
    },
    onEnd: (event) => {
      "worklet";
      runOnJS(reportTransition)("end", event.height);
    },
  }, [reportTransition]);

  return (
    <View style={styles.clip} onLayout={onLayout}>
      <KeyboardAvoidingView style={styles.body} behavior="translate-with-padding" keyboardVerticalOffset={top + safeTop}>
        {children}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { flex: 1, overflow: "hidden" },
  body: { flex: 1 },
});
