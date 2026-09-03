export interface AndroidKeyboardOverlapMeasurement {
  targetBottom: number;
  appliedInset: number;
  keyboardScreenY: number;
  keyboardHeight: number;
  screenHeight: number;
}

const OVERLAP_TOLERANCE = 4;
const MAX_KEYBOARD_INSET_EXTRA = 32;

function finiteNumber(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

/**
 * Calculates only the part of the IME overlap that Android did not already
 * remove through adjustResize. `appliedInset` is added back to the measured
 * bottom so repeated measurements remain stable after the fallback margin is
 * applied.
 */
export function calculateAndroidKeyboardInset({
  targetBottom,
  appliedInset,
  keyboardScreenY,
  keyboardHeight,
  screenHeight,
}: AndroidKeyboardOverlapMeasurement): number {
  const measuredBottom = finiteNumber(targetBottom);
  const height = finiteNumber(keyboardHeight);
  if (measuredBottom === null || height === null || height <= 0) return 0;

  const displayHeight = finiteNumber(screenHeight);
  let keyboardTop = finiteNumber(keyboardScreenY);
  if (keyboardTop === null || keyboardTop <= 0) {
    if (displayHeight === null || displayHeight <= height) return 0;
    keyboardTop = displayHeight - height;
  }

  const alreadyApplied = Math.max(0, finiteNumber(appliedInset) ?? 0);
  const naturalBottom = measuredBottom + alreadyApplied;
  const overlap = naturalBottom - keyboardTop;
  if (overlap <= OVERLAP_TOLERANCE) return 0;

  const maximum = Math.max(0, height + MAX_KEYBOARD_INSET_EXTRA);
  return Math.min(Math.ceil(overlap), Math.ceil(maximum));
}
