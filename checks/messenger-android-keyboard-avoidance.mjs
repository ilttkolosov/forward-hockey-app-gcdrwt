import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const react = {
  createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
  forwardRef: (render) => (props) => render(props, null),
  useCallback: (fn) => fn,
  useMemo: (fn) => fn(),
  useRef: (current) => ({ current }),
  useImperativeHandle: () => {},
};
function compile(source, mocks) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports,
    require: (name) => {
      if (name === "react") return { ...react, default: react };
      if (!(name in mocks)) throw new Error("Unexpected import: " + name);
      return mocks[name];
    },
  });
  return exports;
}

// Execute the exact pinned dependency used by ChatKeyboardArea. Check the final
// window edge, plus translation-only intermediate frames (no list reflow).
const kavSource = read("node_modules/react-native-keyboard-controller/src/components/KeyboardAvoidingView/index.tsx");
function layoutHarness(windowHeight, top, navigationInset) {
  const keyboard = {
    heightWhenOpened: { value: 0 }, progress: { value: 0 }, isClosed: { value: true },
  };
  const animation = { translate: { value: 0 }, padding: { value: 0 } };
  let style;
  const reanimated = {
    default: { View: "AnimatedView" },
    useSharedValue: (value) => ({ value }),
    useDerivedValue: (fn) => ({ get value() { return fn(); } }),
    useAnimatedStyle: (fn) => { style = fn; return fn; },
    runOnUI: (fn) => fn,
    interpolate: (value, _input, output) => output[0] + value * (output[1] - output[0]),
  };
  const Component = compile(kavSource, {
    "react-native": { View: "View" },
    "react-native-reanimated": reanimated,
    "../../hooks": { useWindowDimensions: () => ({ height: windowHeight }) },
    "./hooks": { useKeyboardAnimation: () => keyboard, useTranslateAnimation: () => animation },
  }).default;
  const tree = Component({ behavior: "translate-with-padding", keyboardVerticalOffset: top });
  tree.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 400, height: windowHeight - top - navigationInset } } });
  return {
    frame: (height, progress, settled) => {
      keyboard.heightWhenOpened.value = height;
      keyboard.progress.value = progress;
      keyboard.isClosed.value = progress === 0;
      animation.translate.value = progress;
      animation.padding.value = settled ? progress : 0;
      return style();
    },
  };
}
for (const [height, top, nav] of [[872, 120, 24], [872, 160, 48], [420, 100, 24], [900, 140, 0]]) {
  const h = layoutHarness(height, top, nav);
  for (const ime of [280, 310, 220]) {
    const opening = h.frame(ime, 0.5, false);
    assert.equal(opening.paddingTop, 0, "intermediate frames must not shrink the feed");
    const opened = h.frame(ime, 1, true);
    assert.equal(height - nav + opened.transform[0].translateY, height - ime,
      "composer ends at the IME edge, with gesture/3-button bars counted once");
    assert.equal(top + opened.paddingTop + opened.transform[0].translateY, top,
      "settled list begins immediately below the fixed header");
    const closed = h.frame(ime, 0, true);
    assert.equal(closed.paddingTop, 0);
    assert.equal(Math.abs(closed.transform[0].translateY), 0, "reopen starts without stale margin");
  }
  assert.equal(h.frame(0, 0, true).paddingTop, 0, "floating/hardware keyboard creates no artificial inset");
}

// Execute the real hook, including mount restoration (the old harness only
// supplied idealised padding/translation and missed this native navigation bug).
react.useLayoutEffect = (effect) => effect();
for (const initialProgress of [0, 0.4, 1]) {
  let handler;
  const hooks = compile(read("node_modules/react-native-keyboard-controller/src/components/KeyboardAvoidingView/hooks.ts"), {
    "react-native": { Platform: { OS: "android" } },
    "react-native-reanimated": { useSharedValue: value => ({ value }), runOnUI: fn => fn },
    "../../context": { useKeyboardContext: () => ({ reanimated: { progress: { value: initialProgress }, height: { value: -280 * initialProgress } } }) },
    "../../hooks": { useKeyboardHandler: value => { handler = value; } },
  });
  const geometry = hooks.useKeyboardAnimation();
  handler.onEnd({ height: 310, progress: 1 });
  assert.equal(geometry.heightWhenOpened.value, 310, "native reattachment snapshot has no start event");
  const restored = hooks.useTranslateAnimation();
  assert.equal(restored.padding.value - restored.translate.value, 0, "mount must not expose blank padding above the feed");
  handler.onEnd({ height: 0, progress: 0 });
  assert.equal(restored.padding.value, 0);
  assert.equal(restored.translate.value, 0);
  handler.onEnd({ height: 280, progress: 1 });
  assert.equal(restored.padding.value - restored.translate.value, 0);
}

// Run the real editor wrapper, catching the String -> Int color bridge failure
// from device logs. iOS and fallback TextInput keep their existing color values.
const wrapperSource = read("modules/forward-rich-text-input/src/ForwardRichTextInput.tsx");
for (const os of ["android", "ios"]) {
  const Component = compile(wrapperSource, {
    "expo-constants": { default: { executionEnvironment: "bare" }, ExecutionEnvironment: { StoreClient: "store" } },
    "expo-modules-core": {
      requireNativeViewManager: () => "NativeEditor",
      requireOptionalNativeModule: () => ({ contentSizeUnitVersion: 1 }),
    },
    "react-native": {
      Platform: { OS: os }, PixelRatio: { get: () => 2.75 }, TextInput: "TextInput",
      processColor: (color) => Number.parseInt(color.slice(1), 16) | 0xff000000,
    },
  }).ForwardRichTextInput;
  const editor = Component({ value: "", onChangeText: () => {}, textColor: "#112233", placeholderTextColor: "#445566", selectionColor: "#778899" });
  for (const prop of ["textColor", "placeholderTextColor", "selectionColor"]) {
    assert.equal(typeof editor.props[prop], os === "android" ? "number" : "string");
  }
}

const room = read("app/messenger/room/[id].tsx");
const area = read("features/messenger/ChatKeyboardArea.android.tsx");
const forwardModalArea = read("features/messenger/ForwardModalKeyboardArea.android.tsx");
const forwardModalAreaIos = read("features/messenger/ForwardModalKeyboardArea.tsx");
const provider = read("features/messenger/AppKeyboardProvider.android.tsx");
const native = read("modules/forward-rich-text-input/android/src/main/java/com/forwardhockey/richtext/ForwardRichTextInputView.kt");
let areaTop = 0;
let handlers;
let transitions = 0;
react.useState = () => [areaTop, (value) => { areaTop = value; }];
react.useLayoutEffect = (effect) => effect();
const Area = compile(area, {
  "react-native": { View: "View", StyleSheet: { create: (styles) => styles } },
  "react-native-keyboard-controller": {
    KeyboardAvoidingView: "AvoidingView",
    useGenericKeyboardHandler: (value) => { handlers = value; },
  },
  "react-native-reanimated": { runOnJS: (fn) => fn },
  "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 24, bottom: 48 }) },
}).default;
let areaTree = Area({ children: "list/composer", onTransitionStart: () => { transitions++; } });
areaTree.props.onLayout({ nativeEvent: { layout: { y: 98 } } });
areaTree = Area({ children: "list/composer", onTransitionStart: () => { transitions++; } });
assert.equal(areaTree.props.children[0].props.keyboardVerticalOffset, 122,
  "body y is relative to KeyboardFrame: top safe area is added once");
assert.equal(areaTree.props.style.overflow, "hidden");
assert.equal(handlers.onMove, undefined, "no per-frame JS callback");
handlers.onStart({ height: 300 });
handlers.onEnd({ height: 300 });
assert.equal(transitions, 1);

for (const [pathname, expected] of [["/messenger/room/123", true], ["/messenger/search", false], ["/trainings", false]]) {
  let enabled;
  const Provider = compile(provider, {
    "expo-router": { usePathname: () => pathname },
    "react-native-keyboard-controller": {
      KeyboardProvider: "Provider",
      useKeyboardController: () => ({ setEnabled: (value) => { enabled = value; } }),
    },
  }).default;
  const scope = Provider({ children: "navigation" }).props.children[0];
  scope.type(scope.props);
  assert.equal(enabled, expected, "window mode follows route, including leaving chat");
}
assert(!existsSync(new URL("../features/messenger/useAndroidKeyboardAvoidance.ts", import.meta.url)));
assert(!existsSync(new URL("../features/messenger/androidKeyboardAvoidancePolicy.ts", import.meta.url)));
assert.doesNotMatch(room, /androidKeyboardInset|keyboardScrollTimer|onKeyboardGeometryChange|refreshAndroidKeyboard/);
assert.doesNotMatch(native, /getWindowVisibleDisplayFrame|OnGlobalLayoutListener|enforceImeResize|onKeyboardGeometryChange/);
assert.doesNotMatch(area + provider, /setTimeout|setInterval|Manufacturer|M2101K9AG|measureInWindow/);
assert.match(area, /behavior="translate-with-padding"/);
assert.match(area, /keyboardVerticalOffset=\{top \+ safeTop\}/);
assert.match(provider, /statusBarTranslucent navigationBarTranslucent/);
assert.match(provider, /setEnabled\(inChat\)/);
assert.match(forwardModalArea, /behavior="height"/);
assert.match(forwardModalArea, /container: \{ flex: 1 \}/);
assert.match(forwardModalAreaIos, /Platform\.OS === "ios" \? "padding" : undefined/);
assert.match(room, /<ForwardModalKeyboardArea>[\s\S]*styles\.forwardSheet[\s\S]*<\/ForwardModalKeyboardArea>/);
assert.match(room, /forwardList: \{ flexShrink: 1, minHeight: 0 \}/);
assert(room.indexOf("<PinnedMessagesBanner") < room.indexOf("<ChatKeyboardArea"));
assert(room.indexOf("<ChatKeyboardArea") < room.indexOf("ref={feedViewportRef}"));
assert(room.indexOf("style={styles.composerShell}") < room.indexOf("</ChatKeyboardArea>"));
assert.equal(JSON.parse(read("package.json")).dependencies["react-native-keyboard-controller"], "1.18.5");
console.log("System keyboard layout: window/navigation geometry, repeated cycles, fixed header, no frame reflow, editor color bridge passed.");
