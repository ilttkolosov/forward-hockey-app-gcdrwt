import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Dimensions,
  Keyboard,
  Platform,
  type LayoutChangeEvent,
  type View,
} from "react-native";
import {
  supportsNativeKeyboardGeometry,
  type ForwardRichTextKeyboardGeometry,
} from "../../modules/forward-rich-text-input";
import { calculateAndroidKeyboardInset, usesSystemKeyboardResizeOnly } from "./androidKeyboardAvoidancePolicy";

interface AndroidKeyboardAvoidanceController {
  bottomInset: number;
  onNativeKeyboardGeometry: (geometry: ForwardRichTextKeyboardGeometry) => void;
  onTargetLayout: (event: LayoutChangeEvent) => void;
  refresh: () => void;
}

/**
 * Native geometry owns the entire show/hide session, including Back -> reopen
 * without a focus change. RN events are exclusively an old-binary fallback.
 * Never replay a native snapshot on a timer or on a later composer layout.
 */
export function useAndroidKeyboardAvoidance(
  targetRef: React.RefObject<View | null>,
): AndroidKeyboardAvoidanceController {
  const [bottomInset, setBottomInset] = useState(0);
  const nativeOwnsGeometry = supportsNativeKeyboardGeometry();
  const systemResizeOnly = Platform.OS === "android" && usesSystemKeyboardResizeOnly(
    Platform.constants.Manufacturer,
    Platform.constants.Model,
    Platform.Version,
  );
  const appliedInsetRef = useRef(0);
  const laidOutInsetRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const mountedRef = useRef(true);
  const nativeSnapshotRef = useRef<{
    geometry: ForwardRichTextKeyboardGeometry;
    appliedInset: number;
  } | null>(null);

  const updateInset = useCallback((value: number) => {
    const next = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
    if (!mountedRef.current || next === appliedInsetRef.current) return;
    appliedInsetRef.current = next;
    setBottomInset(next);
  }, []);

  const cancelMeasurement = useCallback(() => {
    generationRef.current += 1;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    nativeSnapshotRef.current = null;
  }, []);

  const measureLegacy = useCallback(() => {
    if (systemResizeOnly || nativeOwnsGeometry || Platform.OS !== "android") return;
    // At most one measurement per frame, including Dimensions + focus + layout.
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const metrics = Keyboard.metrics();
      if (!metrics || metrics.height <= 0) {
        updateInset(0);
        return;
      }
      const generation = generationRef.current;
      const insetAtMeasurement = laidOutInsetRef.current;
      targetRef.current?.measureInWindow((_x, y, _width, height) => {
        if (!mountedRef.current || generation !== generationRef.current ||
            height <= 0 || !Keyboard.isVisible()) return;
        updateInset(calculateAndroidKeyboardInset({
          targetBottom: y + height,
          appliedInset: insetAtMeasurement,
          keyboardScreenY: metrics.screenY,
          keyboardHeight: metrics.height,
          screenHeight: Dimensions.get("screen").height,
        }));
      });
    });
  }, [systemResizeOnly, nativeOwnsGeometry, targetRef, updateInset]);

  const onNativeKeyboardGeometry = useCallback(
    (geometry: ForwardRichTextKeyboardGeometry) => {
      if (systemResizeOnly || !nativeOwnsGeometry || !mountedRef.current) return;
      if (!geometry.visible) {
        cancelMeasurement();
        updateInset(0);
        return;
      }
      nativeSnapshotRef.current = {
        geometry,
        // Use the margin acknowledged by layout, not a queued React update.
        appliedInset: laidOutInsetRef.current,
      };
      if (frameRef.current !== null) return;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        const snapshot = nativeSnapshotRef.current;
        nativeSnapshotRef.current = null;
        if (!snapshot) return;
        const { geometry: current, appliedInset } = snapshot;
        const overlap = current.editorKeyboardOverlap;
        if (typeof overlap !== "number" || !Number.isFinite(overlap)) return;
        const rootAlreadyResized =
          (current.frameworkImeHeight ?? 0) > 0 &&
          typeof current.visibleFrameInset === "number" &&
          current.visibleFrameInset <= 24;
        updateInset(rootAlreadyResized ? 0 : calculateAndroidKeyboardInset({
          targetBottom: 0,
          appliedInset,
          keyboardScreenY: 0,
          keyboardHeight: 0,
          nativeEditorOverlap: overlap,
          nativeOverlapAppliedInset: appliedInset,
          screenHeight: Dimensions.get("screen").height,
        }));
      });
    },
    [cancelMeasurement, systemResizeOnly, nativeOwnsGeometry, updateInset],
  );

  const onTargetLayout = useCallback((_event: LayoutChangeEvent) => {
    laidOutInsetRef.current = bottomInset;
    // Native global-layout observation provides a NEW measurement. Reusing the
    // previous overlap here would add the margin twice when a media row grows.
    measureLegacy();
  }, [bottomInset, measureLegacy]);

  useEffect(() => {
    mountedRef.current = true;
    if (Platform.OS !== "android") return undefined;
    if (systemResizeOnly) {
      console.info("[ForwardIME] system-resize-only", {
        model: Platform.constants.Model,
        apiLevel: Platform.Version,
        bottomInset: 0,
      });
    }
    // Register no competing RN keyboard/dimensions listeners in native binaries.
    const subscriptions = systemResizeOnly || nativeOwnsGeometry ? [] : [
      Keyboard.addListener("keyboardDidShow", measureLegacy),
      Keyboard.addListener("keyboardDidHide", () => {
        cancelMeasurement();
        updateInset(0);
      }),
      Dimensions.addEventListener("change", () => {
        cancelMeasurement();
        measureLegacy();
      }),
    ];
    return () => {
      mountedRef.current = false;
      subscriptions.forEach((subscription) => subscription.remove());
      cancelMeasurement();
    };
  }, [cancelMeasurement, measureLegacy, systemResizeOnly, nativeOwnsGeometry, updateInset]);

  return {
    bottomInset,
    onNativeKeyboardGeometry,
    onTargetLayout,
    refresh: measureLegacy,
  };
}
