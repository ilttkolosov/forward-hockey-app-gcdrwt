import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Dimensions,
  Keyboard,
  Platform,
  type KeyboardEvent,
  type LayoutChangeEvent,
  type View,
} from "react-native";
import type { ForwardRichTextKeyboardGeometry } from "../../modules/forward-rich-text-input";
import { calculateAndroidKeyboardInset } from "./androidKeyboardAvoidancePolicy";

type AndroidKeyboardFrame = Pick<
  KeyboardEvent["endCoordinates"],
  "screenY" | "height"
>;

const MEASUREMENT_DELAYS_MS = [0, 80, 220, 420, 800] as const;
const METRICS_PROBE_DELAYS_MS = [0, 90, 220, 450, 800, 1_200] as const;

interface AndroidKeyboardAvoidanceController {
  bottomInset: number;
  onNativeKeyboardGeometry: (
    geometry: ForwardRichTextKeyboardGeometry,
  ) => void;
  onTargetLayout: (event: LayoutChangeEvent) => void;
  refresh: () => void;
}

function normalizedKeyboardHeight(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
}

/**
 * Keeps a bottom-docked control above Android keyboards on devices where the
 * Activity reports adjustResize but the vendor window implementation still
 * overlays part of the React tree. Devices that resize correctly receive a
 * zero inset, so this does not apply the keyboard height twice.
 */
export function useAndroidKeyboardAvoidance(
  targetRef: React.RefObject<View | null>,
): AndroidKeyboardAvoidanceController {
  const [bottomInset, setBottomInset] = useState(0);
  const appliedInsetRef = useRef(0);
  const keyboardFrameRef = useRef<AndroidKeyboardFrame | null>(null);
  const nativeKeyboardHeightRef = useRef(0);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const updateInset = useCallback((nextInset: number) => {
    const normalized = Math.max(0, Math.round(nextInset));
    if (normalized === appliedInsetRef.current) return;
    appliedInsetRef.current = normalized;
    setBottomInset(normalized);
  }, []);

  const clearTimers = useCallback(() => {
    for (const timer of timersRef.current) clearTimeout(timer);
    timersRef.current.clear();
  }, []);

  const schedule = useCallback((delay: number, callback: () => void) => {
    const timer = setTimeout(() => {
      timersRef.current.delete(timer);
      callback();
    }, delay);
    timersRef.current.add(timer);
  }, []);

  const measureOverlap = useCallback(() => {
    if (Platform.OS !== "android") return;
    const frame = keyboardFrameRef.current;
    const nativeKeyboardHeight = nativeKeyboardHeightRef.current;
    const target = targetRef.current;
    if ((!frame && nativeKeyboardHeight <= 0) || !target) return;

    target.measureInWindow((_x, y, _width, height) => {
      if (height <= 0) return;
      const activeFrame = keyboardFrameRef.current;
      const activeNativeKeyboardHeight = nativeKeyboardHeightRef.current;
      if (!activeFrame && activeNativeKeyboardHeight <= 0) return;
      updateInset(
        calculateAndroidKeyboardInset({
          targetBottom: y + height,
          appliedInset: appliedInsetRef.current,
          keyboardScreenY: activeFrame?.screenY ?? 0,
          keyboardHeight: activeFrame?.height ?? 0,
          nativeKeyboardHeight: activeNativeKeyboardHeight,
          screenHeight: Dimensions.get("screen").height,
        }),
      );
    });
  }, [targetRef, updateInset]);

  const scheduleMeasurements = useCallback(() => {
    if (Platform.OS !== "android") return;
    for (const delay of MEASUREMENT_DELAYS_MS) {
      schedule(delay, () => requestAnimationFrame(measureOverlap));
    }
  }, [measureOverlap, schedule]);

  const rememberFrame = useCallback(
    (frame: AndroidKeyboardFrame | null) => {
      if (!frame || !Number.isFinite(frame.height) || frame.height <= 0) {
        keyboardFrameRef.current = null;
        clearTimers();
        if (nativeKeyboardHeightRef.current > 0) {
          scheduleMeasurements();
        } else {
          updateInset(0);
        }
        return;
      }
      keyboardFrameRef.current = {
        screenY: frame.screenY,
        height: frame.height,
      };
      clearTimers();
      scheduleMeasurements();
    },
    [clearTimers, scheduleMeasurements, updateInset],
  );

  const onNativeKeyboardGeometry = useCallback(
    (geometry: ForwardRichTextKeyboardGeometry) => {
      nativeKeyboardHeightRef.current = geometry.visible
        ? Math.max(
            normalizedKeyboardHeight(geometry.imeHeight),
            normalizedKeyboardHeight(geometry.frameworkImeHeight),
            normalizedKeyboardHeight(geometry.visibleFrameInset),
          )
        : 0;
      clearTimers();
      if (nativeKeyboardHeightRef.current > 0 || keyboardFrameRef.current) {
        scheduleMeasurements();
      } else {
        updateInset(0);
      }
    },
    [clearTimers, scheduleMeasurements, updateInset],
  );

  const refresh = useCallback(() => {
    if (Platform.OS !== "android") return;
    clearTimers();
    for (const delay of METRICS_PROBE_DELAYS_MS) {
      schedule(delay, () => {
        const metrics = Keyboard.metrics();
        if (metrics && metrics.height > 0) {
          keyboardFrameRef.current = {
            screenY: metrics.screenY,
            height: metrics.height,
          };
        }
        requestAnimationFrame(measureOverlap);
      });
    }
  }, [clearTimers, measureOverlap, schedule]);

  const onTargetLayout = useCallback(
    (_event: LayoutChangeEvent) => {
      if (
        Platform.OS !== "android" ||
        (!keyboardFrameRef.current && nativeKeyboardHeightRef.current <= 0)
      ) {
        return;
      }
      schedule(0, () => requestAnimationFrame(measureOverlap));
    },
    [measureOverlap, schedule],
  );

  useEffect(() => {
    if (Platform.OS !== "android") return undefined;
    const showSubscription = Keyboard.addListener(
      "keyboardDidShow",
      (event: KeyboardEvent) => rememberFrame(event.endCoordinates),
    );
    const hideSubscription = Keyboard.addListener("keyboardDidHide", () =>
      rememberFrame(null),
    );
    const dimensionsSubscription = Dimensions.addEventListener("change", () => {
      const metrics = Keyboard.metrics();
      if (metrics && metrics.height > 0) {
        keyboardFrameRef.current = {
          screenY: metrics.screenY,
          height: metrics.height,
        };
      }
      if (keyboardFrameRef.current || nativeKeyboardHeightRef.current > 0) {
        scheduleMeasurements();
      }
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
      dimensionsSubscription.remove();
      keyboardFrameRef.current = null;
      nativeKeyboardHeightRef.current = 0;
      clearTimers();
      appliedInsetRef.current = 0;
    };
  }, [clearTimers, rememberFrame, scheduleMeasurements]);

  return {
    bottomInset,
    onNativeKeyboardGeometry,
    onTargetLayout,
    refresh,
  };
}
