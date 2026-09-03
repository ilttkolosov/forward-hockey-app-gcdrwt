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
assert.equal(overlay, 284);

// Re-measuring after the margin is applied must keep the same correction,
// rather than oscillating between the measured inset and zero.
assert.equal(
  calculateAndroidKeyboardInset({
    targetBottom: 496,
    appliedInset: overlay,
    keyboardScreenY: 500,
    keyboardHeight: 300,
    screenHeight: 800,
  }),
  284,
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
  114,
);
assert.equal(
  calculateAndroidKeyboardInset({
    targetBottom: 502,
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
  284,
);

// MagicOS and some other vendor keyboards report screenY below the keyboard
// toolbar. Native IME insets must win when they expose an earlier top edge.
assert.equal(
  calculateAndroidKeyboardInset({
    targetBottom: 550,
    appliedInset: 0,
    keyboardScreenY: 560,
    keyboardHeight: 240,
    nativeKeyboardHeight: 300,
    screenHeight: 800,
  }),
  54,
);
assert.equal(
  calculateAndroidKeyboardInset({
    targetBottom: 500,
    appliedInset: 0,
    keyboardScreenY: 560,
    keyboardHeight: 240,
    nativeKeyboardHeight: 300,
    screenHeight: 800,
  }),
  0,
);
assert.equal(
  calculateAndroidKeyboardInset({
    targetBottom: 550,
    appliedInset: 0,
    keyboardScreenY: 0,
    keyboardHeight: 0,
    nativeKeyboardHeight: 300,
    screenHeight: 800,
  }),
  54,
);
assert.equal(
  calculateAndroidKeyboardInset({
    targetBottom: 780,
    appliedInset: 0,
    keyboardScreenY: 0,
    keyboardHeight: 0,
    nativeKeyboardHeight: 0,
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
assert.match(
  roomSource,
  /onKeyboardGeometryChange=\{handleNativeKeyboardGeometry\}/,
);

const wrapperSource = readFileSync(
  new URL(
    "../modules/forward-rich-text-input/src/ForwardRichTextInput.tsx",
    import.meta.url,
  ),
  "utf8",
);
assert.match(wrapperSource, /PixelRatio\.get\(\)/);
assert.match(wrapperSource, /cachedNativeContentSizeUsesDp/);
assert.match(wrapperSource, /cachedNativeKeyboardGeometrySupported/);
assert.match(wrapperSource, /onKeyboardGeometryChange/);

const nativeModuleSource = readFileSync(
  new URL(
    "../modules/forward-rich-text-input/android/src/main/java/com/forwardhockey/richtext/ForwardRichTextInputModule.kt",
    import.meta.url,
  ),
  "utf8",
);
assert.match(nativeModuleSource, /Constant\("keyboardGeometryVersion"\)/);
assert.match(nativeModuleSource, /Constant\("contentSizeUnitVersion"\)/);
assert.match(nativeModuleSource, /"onKeyboardGeometryChange"/);

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
assert.match(nativeInputSource, /WindowInsets\.Type\.ime\(\)/);
assert.match(nativeInputSource, /visibleFrameInset/);
assert.match(
  nativeInputSource,
  /height\.toDouble\(\) \/ density\.toDouble\(\)/,
);

console.log("Messenger Android keyboard avoidance checks passed.");
