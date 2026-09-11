import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { mediaPanIntent, shouldDismissMedia } from "./mediaViewerPolicy";
import Animated, {
  cancelAnimation,
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
  onDismiss?: () => void;
  active?: boolean;
  zoomEnabled?: boolean;
  pagerGesture?: ReturnType<typeof Gesture.Native>;
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
  onDismiss,
  active = true,
  zoomEnabled = true,
  pagerGesture,
}: MessengerZoomableMediaProps) {
  const dismissEnabled = Boolean(onDismiss);
  const scale = useSharedValue(MIN_SCALE);
  const startScale = useSharedValue(MIN_SCALE);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const startTranslateX = useSharedValue(0);
  const startTranslateY = useSharedValue(0);
  const dismissY = useSharedValue(0);
  const touchX = useSharedValue(0);
  const touchY = useSharedValue(0);
  const pinchTouchX = useSharedValue(0);
  const pinchTouchY = useSharedValue(0);
  const panMode = useSharedValue<"zoom" | "dismiss" | "none">("none");
  const closing = useSharedValue(false);
  const multipleTouches = useSharedValue(false);
  const pinching = useSharedValue(false);
  const mounted = useRef(true);
  const callbacks = useRef({ onZoomChange, onDismiss });
  callbacks.current = { onZoomChange, onDismiss };
  // Neighbor downloads and parent callbacks must not reset the active photo.
  const notifyZoom = useCallback(
    (value: boolean) => callbacks.current.onZoomChange?.(value),
    [],
  );
  const notifyDismiss = useCallback(() => {
    if (mounted.current) callbacks.current.onDismiss?.();
  }, []);
  const reset = useCallback(() => {
    dismissY.value = 0;
    closing.value = false;
    panMode.value = "none";
    pinching.value = false;
    multipleTouches.value = false;
    scale.value = withTiming(MIN_SCALE);
    startScale.value = MIN_SCALE;
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    startTranslateX.value = 0;
    startTranslateY.value = 0;
    notifyZoom(false);
  }, [
    closing,
    dismissY,
    panMode,
    pinching,
    multipleTouches,
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
  }, [reset, resetKey, active, width, height]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelAnimation(dismissY);
    };
  }, [dismissY]);
  const gesture = useMemo(() => {
    const pinch = Gesture.Pinch()
      .enabled(active && zoomEnabled)
      .onTouchesDown((event, manager) => {
        if (closing.value) {
          manager.fail();
          return;
        }
        const touch = event.allTouches[0];
        if (event.numberOfTouches === 1 && touch) {
          pinchTouchX.value = touch.absoluteX;
          pinchTouchY.value = touch.absoluteY;
        }
      })
      .onTouchesMove((event, manager) => {
        // A waiting pinch also blocks the native pager. Release it once a
        // single finger commits to a drag, rather than waiting for finger-up.
        // Keep it pending while stationary so a second finger can begin zoom.
        if (
          event.numberOfTouches !== 1 ||
          pinching.value ||
          multipleTouches.value ||
          Math.max(scale.value, startScale.value) > 1.01
        )
          return;
        const touch = event.allTouches[0];
        if (!touch) return;
        const intent = mediaPanIntent(
          touch.absoluteX - pinchTouchX.value,
          touch.absoluteY - pinchTouchY.value,
          1,
          MIN_SCALE,
          true,
        );
        if (intent !== "wait") manager.fail();
      })
      .onStart(() => {
        pinching.value = true;
        multipleTouches.value = true;
        dismissY.value = withTiming(0);
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
      .onFinalize(() => {
        // Finalize also runs for interruptions/cancellation, unlike onEnd.
        if (!pinching.value) return;
        pinching.value = false;
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
      .enabled(active)
      .manualActivation(true)
      .maxPointers(1)
      .onTouchesDown((event, manager) => {
        if (event.numberOfTouches !== 1 || closing.value || pinching.value) {
          multipleTouches.value = true;
          manager.fail();
          return;
        }
        const touch = event.allTouches[0];
        if (!touch) {
          manager.fail();
          return;
        }
        touchX.value = touch.absoluteX;
        touchY.value = touch.absoluteY;
        panMode.value = "none";
        multipleTouches.value = false;
      })
      .onTouchesMove((event, manager) => {
        if (
          event.numberOfTouches !== 1 ||
          multipleTouches.value ||
          pinching.value
        ) {
          multipleTouches.value = true;
          manager.fail();
          return;
        }
        if (panMode.value !== "none") return;
        const touch = event.allTouches[0];
        if (!touch) {
          manager.fail();
          return;
        }
        const intent = mediaPanIntent(
          touch.absoluteX - touchX.value,
          touch.absoluteY - touchY.value,
          event.numberOfTouches,
          Math.max(scale.value, startScale.value),
          dismissEnabled,
        );
        if (intent === "fail") manager.fail();
        else if (intent !== "wait") {
          panMode.value = intent;
          manager.activate();
        }
      })
      .onStart(() => {
        startTranslateX.value = translateX.value;
        startTranslateY.value = translateY.value;
      })
      .onUpdate((event) => {
        if (panMode.value === "dismiss") {
          dismissY.value = Math.max(0, event.translationY);
          return;
        }
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
      })
      .onEnd((event, successful) => {
        if (
          successful &&
          panMode.value === "dismiss" &&
          !multipleTouches.value &&
          !pinching.value &&
          Math.max(scale.value, startScale.value) <= 1.01 &&
          !closing.value &&
          shouldDismissMedia(event.translationY, event.velocityY, height)
        ) {
          closing.value = true;
          dismissY.value = withTiming(height, { duration: 160 }, (finished) => {
            if (finished) runOnJS(notifyDismiss)();
          });
        }
      })
      .onFinalize(() => {
        if (!closing.value) dismissY.value = withTiming(0, { duration: 180 });
        panMode.value = "none";
      });
    // Do not make the native pager wait for the photo recognizers. At 1x the
    // pager and the media gestures observe the same stream: horizontal motion
    // is handled by FlatList, while a dominant downward motion activates our
    // dismiss pan. When zoomed, MediaLightbox disables FlatList scrolling.
    if (pagerGesture) {
      pan.simultaneousWithExternalGesture(pagerGesture);
      pinch.simultaneousWithExternalGesture(pagerGesture);
    }
    const doubleTap = Gesture.Tap()
      .enabled(active && zoomEnabled)
      .numberOfTaps(2)
      .maxDuration(280)
      .onEnd((event, successful) => {
        if (!successful || closing.value) return;
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
    active,
    zoomEnabled,
    pagerGesture,
    dismissEnabled,
    notifyDismiss,
    dismissY,
    closing,
    touchX,
    touchY,
    pinchTouchX,
    pinchTouchY,
    multipleTouches,
    pinching,
    panMode,
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
    opacity: 1 - Math.min(0.65, dismissY.value / Math.max(height, 1)),
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value + dismissY.value },
      { scale: scale.value },
    ],
  }));
  return (
    <View style={[styles.viewport, { width, height }]}>
      <GestureDetector gesture={gesture}>
        <Animated.View
          collapsable={false}
          testID="media-gesture-surface"
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
