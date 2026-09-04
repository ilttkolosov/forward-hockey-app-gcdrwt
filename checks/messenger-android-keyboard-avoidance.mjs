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

// Legacy MagicOS fallback: a native IME height may expose an earlier top.
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

// New binaries report the signed editor/keyboard overlap directly in one
// coordinate space. Only the actually covered part plus 4 dp is applied.
const directHonorInset = calculateAndroidKeyboardInset({
  targetBottom: 0,
  appliedInset: 0,
  keyboardScreenY: 0,
  keyboardHeight: 0,
  nativeEditorOverlap: 23.4,
  nativeOverlapAppliedInset: 0,
  screenHeight: 800,
});
assert.equal(directHonorInset, 28);

// The snapshot records which inset was active when native measured the
// editor. Re-measuring after movement therefore remains stable.
assert.equal(
  calculateAndroidKeyboardInset({
    targetBottom: 0,
    appliedInset: directHonorInset,
    keyboardScreenY: 0,
    keyboardHeight: 0,
    nativeEditorOverlap: -4.1,
    nativeOverlapAppliedInset: directHonorInset,
    screenHeight: 800,
  }),
  28,
);

// A correctly resized device must not be raised at all, even if legacy
// screen metrics would have suggested an overlap.
assert.equal(
  calculateAndroidKeyboardInset({
    targetBottom: 620,
    appliedInset: 0,
    keyboardScreenY: 500,
    keyboardHeight: 300,
    nativeEditorOverlap: 0,
    nativeOverlapAppliedInset: 0,
    screenHeight: 800,
  }),
  0,
);
assert.equal(
  calculateAndroidKeyboardInset({
    targetBottom: 0,
    appliedInset: 20,
    keyboardScreenY: 0,
    keyboardHeight: 0,
    nativeEditorOverlap: -20,
    nativeOverlapAppliedInset: 20,
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

const hookSource = readFileSync(
  new URL(
    "../features/messenger/useAndroidKeyboardAvoidance.ts",
    import.meta.url,
  ),
  "utf8",
);
assert.match(hookSource, /nativeEditorOverlapRef/);
assert.match(hookSource, /nativeOverlapAppliedInset/);

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
assert.match(wrapperSource, /editorKeyboardOverlap\?: number/);

const nativeModuleSource = readFileSync(
  new URL(
    "../modules/forward-rich-text-input/android/src/main/java/com/forwardhockey/richtext/ForwardRichTextInputModule.kt",
    import.meta.url,
  ),
  "utf8",
);
assert.match(
  nativeModuleSource,
  /Constant\("keyboardGeometryVersion"\) \{ 2 \}/,
);
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
assert.match(nativeInputSource, /WindowInsets\.Type\.ime\(\)/);
assert.match(nativeInputSource, /getWindowVisibleDisplayFrame/);
assert.match(nativeInputSource, /editor\.getLocationOnScreen/);
assert.match(nativeInputSource, /"editorKeyboardOverlap" to editorOverlapDp/);
assert.match(
  nativeInputSource,
  /height\.toDouble\(\) \/ density\.toDouble\(\)/,
);

console.log("Messenger Android keyboard avoidance checks passed.");
