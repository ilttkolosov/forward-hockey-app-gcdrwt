export interface AndroidKeyboardOverlapMeasurement {
  targetBottom: number;
  appliedInset: number;
  keyboardScreenY: number;
  keyboardHeight: number;
  nativeKeyboardHeight?: number;
  nativeEditorOverlap?: number;
  nativeOverlapAppliedInset?: number;
  screenHeight: number;
}

const OVERLAP_TOLERANCE = 2;
const KEYBOARD_CLEARANCE = 4;
const MAX_KEYBOARD_INSET_EXTRA = 40;
const MAX_KEYBOARD_INSET_SCREEN_RATIO = 0.75;
const RESIZE_SETTLING_MIN_OVERLAP = 96;
const RESIZE_SETTLING_OVERLAP_RATIO = 0.6;
const RESIZED_VISIBLE_FRAME_TOLERANCE = 24;

function finiteNumber(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function positiveNumber(value: number | undefined): number | null {
  const finite = finiteNumber(value);
  return finite !== null && finite > 0 ? finite : null;
}

export interface AndroidNativeKeyboardGeometry {
  visible: boolean;
  frameworkImeHeight?: number;
  visibleFrameInset?: number;
  editorKeyboardOverlap?: number;
}

/**
 * During the opening animation MIUI can briefly report the pre-resize editor
 * position together with the full IME inset. Applying that overlap immediately
 * lifts the composer by almost an entire second keyboard height. Wait only for
 * this large, full-height shape; the small residual overlap used by MagicOS is
 * deliberately outside the predicate and remains immediate.
 */
export function androidImeGeometryMayStillResize(
  geometry: AndroidNativeKeyboardGeometry,
): boolean {
  if (!geometry.visible) return false;
  const frameworkImeHeight = positiveNumber(geometry.frameworkImeHeight);
  const visibleFrameInset = positiveNumber(geometry.visibleFrameInset);
  const editorOverlap = positiveNumber(geometry.editorKeyboardOverlap);
  if (
    frameworkImeHeight === null ||
    visibleFrameInset === null ||
    editorOverlap === null ||
    visibleFrameInset <= RESIZED_VISIBLE_FRAME_TOLERANCE
  ) {
    return false;
  }
  return (
    editorOverlap >= RESIZE_SETTLING_MIN_OVERLAP &&
    editorOverlap >= frameworkImeHeight * RESIZE_SETTLING_OVERLAP_RATIO
  );
}

/**
 * Calculates only the part of the IME overlap that Android did not already
 * remove through adjustResize.
 *
 * New native binaries report the signed overlap between the actual editor
 * bottom and the actual visible keyboard top in one coordinate space. That
 * direct measurement is preferred because vendor navigation bars can make
 * `screenHeight - imeHeight` inaccurate by roughly half a composer row.
 * `nativeOverlapAppliedInset` reconstructs the unshifted overlap so repeated
 * measurements remain stable after the fallback margin is applied.
 *
 * Older binaries continue through the height/screenY fallback below.
 */
export function calculateAndroidKeyboardInset({
  targetBottom,
  appliedInset,
  keyboardScreenY,
  keyboardHeight,
  nativeKeyboardHeight,
  nativeEditorOverlap,
  nativeOverlapAppliedInset,
  screenHeight,
}: AndroidKeyboardOverlapMeasurement): number {
  const directOverlap = finiteNumber(nativeEditorOverlap);
  if (directOverlap !== null) {
    const insetAtMeasurement = Math.max(
      0,
      finiteNumber(nativeOverlapAppliedInset) ?? 0,
    );
    const naturalOverlap = directOverlap + insetAtMeasurement;
    if (naturalOverlap <= OVERLAP_TOLERANCE) return 0;

    const displayHeight = positiveNumber(screenHeight);
    const maximum =
      displayHeight !== null
        ? displayHeight * MAX_KEYBOARD_INSET_SCREEN_RATIO
        : Number.POSITIVE_INFINITY;
    return Math.min(
      Math.ceil(naturalOverlap + KEYBOARD_CLEARANCE),
      Math.ceil(maximum),
    );
  }

  const measuredBottom = finiteNumber(targetBottom);
  if (measuredBottom === null) return 0;

  const displayHeight = positiveNumber(screenHeight);
  const eventHeight = positiveNumber(keyboardHeight);
  const nativeHeight = positiveNumber(nativeKeyboardHeight);
  const keyboardTopCandidates: number[] = [];

  const reportedKeyboardTop = positiveNumber(keyboardScreenY);
  if (reportedKeyboardTop !== null) {
    keyboardTopCandidates.push(reportedKeyboardTop);
  } else if (
    displayHeight !== null &&
    eventHeight !== null &&
    displayHeight > eventHeight
  ) {
    keyboardTopCandidates.push(displayHeight - eventHeight);
  }

  if (
    displayHeight !== null &&
    nativeHeight !== null &&
    displayHeight > nativeHeight
  ) {
    keyboardTopCandidates.push(displayHeight - nativeHeight);
  }

  if (keyboardTopCandidates.length === 0) return 0;
  const keyboardTop = Math.min(...keyboardTopCandidates);
  const alreadyApplied = Math.max(0, finiteNumber(appliedInset) ?? 0);
  const naturalBottom = measuredBottom + alreadyApplied;
  const overlap = naturalBottom - keyboardTop;
  if (overlap <= OVERLAP_TOLERANCE) return 0;

  const observedHeight =
    displayHeight !== null ? Math.max(0, displayHeight - keyboardTop) : 0;
  const maximumKeyboardHeight = Math.max(
    eventHeight ?? 0,
    nativeHeight ?? 0,
    observedHeight,
  );
  const maximum = Math.max(
    0,
    maximumKeyboardHeight + MAX_KEYBOARD_INSET_EXTRA,
  );
  return Math.min(
    Math.ceil(overlap + KEYBOARD_CLEARANCE),
    Math.ceil(maximum),
  );
}
