import React, { useCallback, useEffect, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

interface MessengerZoomableMediaProps {
  width: number;
  height: number;
  resetKey: string;
  children: React.ReactNode;
  nativeChild?: boolean;
  onZoomChange?: (zoomed: boolean) => void;
}

const MIN_SCALE = 1;
const DOUBLE_TAP_SCALE = 2;
const MAX_SCALE = 4;

function clamp(value: number, minimum: number, maximum: number): number {
  "worklet";
  return Math.min(maximum, Math.max(minimum, value));
}

export default function MessengerZoomableMedia({
  width,
  height,
  resetKey,
  children,
  nativeChild = false,
  onZoomChange,
}: MessengerZoomableMediaProps) {
  const scale = useSharedValue(MIN_SCALE);
  const startScale = useSharedValue(MIN_SCALE);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const startTranslateX = useSharedValue(0);
  const startTranslateY = useSharedValue(0);
  const notifyZoom = useCallback(
    (nextZoomed: boolean) => {
      onZoomChange?.(nextZoomed);
    },
    [onZoomChange],
  );

  const reset = useCallback(() => {
    scale.value = withTiming(MIN_SCALE);
    startScale.value = MIN_SCALE;
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    startTranslateX.value = 0;
    startTranslateY.value = 0;
    notifyZoom(false);
  }, [
    notifyZoom,
    scale,
    startScale,
    startTranslateX,
    startTranslateY,
    translateX,
    translateY,
  ]);

  useEffect(() => {
    reset();
  }, [reset, resetKey]);

  const gesture = useMemo(() => {
    const pinch = Gesture.Pinch()
      .onStart(() => {
        startScale.value = scale.value;
        startTranslateX.value = translateX.value;
        startTranslateY.value = translateY.value;
        runOnJS(notifyZoom)(true);
      })
      .onUpdate((event) => {
        const nextScale = clamp(
          startScale.value * event.scale,
          MIN_SCALE,
          MAX_SCALE,
        );
        const ratio = nextScale / startScale.value;
        const focalX = event.focalX - width / 2;
        const focalY = event.focalY - height / 2;
        const maximumX = (width * (nextScale - 1)) / 2;
        const maximumY = (height * (nextScale - 1)) / 2;

        scale.value = nextScale;
        translateX.value = clamp(
          startTranslateX.value + focalX * (1 - ratio),
          -maximumX,
          maximumX,
        );
        translateY.value = clamp(
          startTranslateY.value + focalY * (1 - ratio),
          -maximumY,
          maximumY,
        );
      })
      .onEnd(() => {
        if (scale.value <= 1.01) {
          scale.value = withTiming(MIN_SCALE);
          translateX.value = withTiming(0);
          translateY.value = withTiming(0);
          startScale.value = MIN_SCALE;
          startTranslateX.value = 0;
          startTranslateY.value = 0;
          runOnJS(notifyZoom)(false);
          return;
        }
        startScale.value = scale.value;
        startTranslateX.value = translateX.value;
        startTranslateY.value = translateY.value;
        runOnJS(notifyZoom)(true);
      });

    const pan = Gesture.Pan()
      .manualActivation(true)
      .onTouchesMove((_event, stateManager) => {
        if (scale.value > 1.01) stateManager.activate();
        else stateManager.fail();
      })
      .onBegin(() => {
        startTranslateX.value = translateX.value;
        startTranslateY.value = translateY.value;
      })
      .onUpdate((event) => {
        const maximumX = (width * (scale.value - 1)) / 2;
        const maximumY = (height * (scale.value - 1)) / 2;
        translateX.value = clamp(
          startTranslateX.value + event.translationX,
          -maximumX,
          maximumX,
        );
        translateY.value = clamp(
          startTranslateY.value + event.translationY,
          -maximumY,
          maximumY,
        );
      });

    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .maxDuration(280)
      .onEnd((event, successful) => {
        if (!successful) return;
        if (scale.value > 1.01) {
          scale.value = withTiming(MIN_SCALE);
          translateX.value = withTiming(0);
          translateY.value = withTiming(0);
          startScale.value = MIN_SCALE;
          startTranslateX.value = 0;
          startTranslateY.value = 0;
          runOnJS(notifyZoom)(false);
          return;
        }

        const nextScale = DOUBLE_TAP_SCALE;
        const maximumX = (width * (nextScale - 1)) / 2;
        const maximumY = (height * (nextScale - 1)) / 2;
        const nextX = clamp(
          (width / 2 - event.x) * (nextScale - 1),
          -maximumX,
          maximumX,
        );
        const nextY = clamp(
          (height / 2 - event.y) * (nextScale - 1),
          -maximumY,
          maximumY,
        );
        scale.value = withTiming(nextScale);
        translateX.value = withTiming(nextX);
        translateY.value = withTiming(nextY);
        startScale.value = nextScale;
        startTranslateX.value = nextX;
        startTranslateY.value = nextY;
        runOnJS(notifyZoom)(true);
      });

    const mediaGesture = Gesture.Simultaneous(pinch, pan, doubleTap);
    return nativeChild
      ? Gesture.Simultaneous(Gesture.Native(), mediaGesture)
      : mediaGesture;
  }, [
    height,
    nativeChild,
    notifyZoom,
    scale,
    startScale,
    startTranslateX,
    startTranslateY,
    translateX,
    translateY,
    width,
  ]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <View style={[styles.viewport, { width, height }]}>
      <GestureDetector gesture={gesture}>
        <Animated.View
          collapsable={false}
          style={[styles.content, { width, height }, animatedStyle]}
        >
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: { overflow: "hidden" },
  content: { alignItems: "center", justifyContent: "center" },
});
