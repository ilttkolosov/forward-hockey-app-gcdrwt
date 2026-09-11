/** Gesture decisions are shared by native worklets and deterministic regressions. */
export function mediaPanIntent(dx: number, dy: number, pointers: number, scale: number, dismissEnabled: boolean): "wait" | "fail" | "zoom" | "dismiss" {
  "worklet";
  if (pointers !== 1) return "fail";
  if (scale > 1.01) return "zoom";
  if (!dismissEnabled) return "fail";
  if (dy > 12 && dy > Math.abs(dx) * 1.4) return "dismiss";
  if (Math.abs(dx) > 12 || dy < -12) return "fail";
  return "wait";
}
export function shouldDismissMedia(dy: number, velocityY: number, height: number): boolean {
  "worklet";
  const distance = Math.min(160, Math.max(90, height * 0.18));
  return dy >= distance || (dy >= 32 && velocityY >= 900);
}
