import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import {
  calculateAndroidKeyboardInset,
  usesSystemKeyboardResizeOnly,
} from "../features/messenger/androidKeyboardAvoidancePolicy.ts";

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
assert.doesNotMatch(hookSource, /setTimeout|MEASUREMENT_DELAYS|METRICS_PROBE/);
assert.match(hookSource, /nativeOwnsGeometry \? \[\] :/);
assert.match(hookSource, /laidOutInsetRef/);

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

// Execute the actual hook with deterministic frame/event ordering, not just
// string assertions. These regressions previously escaped pure math tests.
const require = createRequire(import.meta.url);
const ts = require("typescript");
const compiledHook = ts.transpileModule(hookSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function harness(native = true, model = "HONOR Magic7 Pro", manufacturer = "HONOR", api = 35) {
  const slots = [];
  let cursor = 0;
  let initialized = false;
  const cleanups = [];
  const frames = new Map();
  const listeners = new Map();
  let frameId = 0;
  let visible = true;
  let measurement;
  const react = {
    useRef: (value) => slots[cursor++] ??= { current: value },
    useState: (value) => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = value;
      return [slots[index], (next) => { slots[index] = next; }];
    },
    useCallback: (callback) => callback,
    useEffect: (effect) => { if (!initialized) cleanups.push(effect()); },
  };
  const subscribe = (event, callback) => {
    listeners.set(event, callback);
    return { remove: () => listeners.delete(event) };
  };
  const rn = {
    Platform: { OS: "android", Version: api, constants: { Model: model, Manufacturer: manufacturer } },
    Keyboard: {
      metrics: () => visible ? { screenY: 500, height: 300 } : undefined,
      isVisible: () => visible,
      addListener: subscribe,
    },
    Dimensions: { get: () => ({ height: 800 }), addEventListener: subscribe },
  };
  const exports = {};
  vm.runInNewContext(compiledHook, {
    exports,
    console: { info: () => {} },
    require: (name) => {
      if (name === "react") return react;
      if (name === "react-native") return rn;
      if (name.includes("forward-rich-text-input")) {
        return { supportsNativeKeyboardGeometry: () => native };
      }
      return { calculateAndroidKeyboardInset, usesSystemKeyboardResizeOnly };
    },
    requestAnimationFrame: (callback) => { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: (id) => frames.delete(id),
  });
  const target = { current: { measureInWindow: (callback) => { measurement = callback; } } };
  return {
    render: () => {
      cursor = 0;
      const controller = exports.useAndroidKeyboardAvoidance(target);
      initialized = true;
      return controller;
    },
    flush: () => {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback());
    },
    hide: () => { visible = false; listeners.get("keyboardDidHide")?.(); },
    completeMeasurement: () => measurement?.(0, 700, 100, 80),
    dispose: () => cleanups.forEach((cleanup) => cleanup?.()),
    frames,
    listeners,
  };
}
const native = harness();
let controller = native.render();
assert.equal(native.listeners.size, 0, "RN cannot race native geometry, even before first event");
const geometry = (overlap, visibleFrameInset = 300) => ({
  visible: true, imeHeight: 300, frameworkImeHeight: 300,
  visibleFrameInset, editorKeyboardOverlap: overlap,
});
controller.onNativeKeyboardGeometry(geometry(23.4));
controller.onNativeKeyboardGeometry(geometry(23.4));
assert.equal(native.frames.size, 1, "coalesce repeated native events");
native.flush();
controller = native.render();
assert.equal(controller.bottomInset, 28, "Honor residual correction retained");
controller.onTargetLayout({});
controller.onNativeKeyboardGeometry(geometry(-4.1));
native.flush();
controller = native.render();
assert.equal(controller.bottomInset, 28, "layout feedback must not grow the inset");
controller.onTargetLayout({});
controller.refresh();
assert.equal(native.frames.size, 0, "media/focus/layout cannot replay old native overlap");
controller.onNativeKeyboardGeometry({ visible: false, imeHeight: 0 });
controller = native.render();
assert.equal(controller.bottomInset, 0);
controller.onTargetLayout({});
// Reopen without a new focus event; only latest geometry in this frame wins.
controller.onNativeKeyboardGeometry(geometry(280));
controller.onNativeKeyboardGeometry(geometry(-4, 0));
native.flush();
controller = native.render();
assert.equal(controller.bottomInset, 0, "MIUI repeat open uses final resized geometry");
controller.onNativeKeyboardGeometry(geometry(280));
controller.onNativeKeyboardGeometry({ visible: false, imeHeight: 0 });
assert.equal(native.frames.size, 0, "hide cancels queued measurements");
native.dispose();

const legacy = harness(false);
const oldController = legacy.render();
oldController.refresh();
oldController.refresh();
assert.equal(legacy.frames.size, 1);
legacy.flush();
legacy.hide();
legacy.completeMeasurement();
assert.equal(legacy.render().bottomInset, 0, "stale legacy callback after hide is rejected");
legacy.dispose();
// Device log: every show/media-return applied 282 dp despite native resize.
// Even stale/full-overlap snapshots must never introduce a second margin here.
for (const nativeAvailable of [true, false]) {
  const xiaomi = harness(nativeAvailable, "M2101K9AG", "Xiaomi", 33);
  let input = xiaomi.render();
  assert.equal(xiaomi.listeners.size, 0);
  for (let cycle = 0; cycle < 4; cycle += 1) {
    input.onNativeKeyboardGeometry(geometry(278));
    input.refresh();
    input.onTargetLayout({});
    xiaomi.flush();
    input = xiaomi.render();
    assert.equal(input.bottomInset, 0, "Xiaomi must retain system resize on show/media return");
    input.onNativeKeyboardGeometry({ visible: false, imeHeight: 0 });
  }
  assert.equal(xiaomi.frames.size, 0);
  xiaomi.dispose();
}
assert.equal(usesSystemKeyboardResizeOnly("HONOR", "M2101K9AG", 33), false);
assert.equal(usesSystemKeyboardResizeOnly("Xiaomi", "another model", 33), false);
assert.equal(usesSystemKeyboardResizeOnly("Xiaomi", "M2101K9AG", 35), false);
console.log("Messenger Android keyboard math, ownership and lifecycle checks passed.");
