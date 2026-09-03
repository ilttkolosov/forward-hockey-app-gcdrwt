import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calculateAndroidKeyboardInset } from "../features/messenger/androidKeyboardAvoidancePolicy.ts";

const overlay = calculateAndroidKeyboardInset({
  targetBottom: 780,
  appliedInset: 0,
  keyboardScreenY: 500,
  keyboardHeight: 300,
  screenHeight: 800,
});
assert.equal(overlay, 280);

// Re-measuring after the margin is applied must keep the same correction,
// rather than oscillating between the measured inset and zero.
assert.equal(
  calculateAndroidKeyboardInset({
    targetBottom: 500,
    appliedInset: overlay,
    keyboardScreenY: 500,
    keyboardHeight: 300,
    screenHeight: 800,
  }),
  280,
);

assert.equal(
  calculateAndroidKeyboardInset({
    targetBottom: 500,
    appliedInset: 0,
    keyboardScreenY: 500,
    keyboardHeight: 300,
    screenHeight: 800,
  }),
  0,
);
assert.equal(
  calculateAndroidKeyboardInset({
    targetBottom: 610,
    appliedInset: 0,
    keyboardScreenY: 500,
    keyboardHeight: 300,
    screenHeight: 800,
  }),
  110,
);
assert.equal(
  calculateAndroidKeyboardInset({
    targetBottom: 503,
    appliedInset: 0,
    keyboardScreenY: 500,
    keyboardHeight: 300,
    screenHeight: 800,
  }),
  0,
);
assert.equal(
  calculateAndroidKeyboardInset({
    targetBottom: 780,
    appliedInset: 0,
    keyboardScreenY: 0,
    keyboardHeight: 300,
    screenHeight: 800,
  }),
  280,
);
assert.equal(
  calculateAndroidKeyboardInset({
    targetBottom: 780,
    appliedInset: 0,
    keyboardScreenY: 500,
    keyboardHeight: 0,
    screenHeight: 800,
  }),
  0,
);

const roomSource = readFileSync(
  new URL("../app/messenger/room/[id].tsx", import.meta.url),
  "utf8",
);
assert.match(roomSource, /useAndroidKeyboardAvoidance\(composerShellRef\)/);
assert.match(roomSource, /marginBottom:\s*androidKeyboardInset/);
assert.match(roomSource, /refreshAndroidKeyboardAvoidance\(\)/);

const nativeInputSource = readFileSync(
  new URL(
    "../modules/forward-rich-text-input/android/src/main/java/com/forwardhockey/richtext/ForwardRichTextInputView.kt",
    import.meta.url,
  ),
  "utf8",
);
assert.match(nativeInputSource, /SOFT_INPUT_ADJUST_RESIZE/);
assert.match(nativeInputSource, /setSoftInputMode\(nextMode\)/);
assert.match(nativeInputSource, /enforceImeResize\(\)/);

console.log("Messenger Android keyboard avoidance checks passed.");
