/* eslint-env node */
/* eslint-disable @typescript-eslint/no-require-imports, react/prop-types */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const testRequire = process.env.PIN_TEST_MODULES
  ? Module.createRequire(
      path.join(process.env.PIN_TEST_MODULES, "package.json"),
    )
  : require;
const React = testRequire("react");
const { create, act } = testRequire("react-test-renderer");
global.IS_REACT_ACT_ENVIRONMENT = true;
function compile(relative, mocks = {}) {
  const filename = path.resolve(__dirname, "..", relative);
  const instance = new Module(filename, module);
  instance.filename = filename;
  instance.paths = Module._nodeModulePaths(path.dirname(filename));
  const normal = instance.require.bind(instance);
  instance.require = (name) =>
    Object.hasOwn(mocks, name) ? mocks[name] : normal(name);
  instance._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.React,
        esModuleInterop: true,
      },
    }).outputText,
    filename,
  );
  return instance.exports;
}
const policy = compile("features/messenger/mediaViewerPolicy.ts");
for (const [args, expected] of [
  [[0, 5, 1, 1, true], "wait"],
  [[3, 25, 1, 1, true], "dismiss"],
  [[25, 3, 1, 1, true], "fail"],
  [[-25, 3, 1, 1, true], "fail"],
  [[0, -30, 1, 1, true], "fail"],
  [[0, 30, 2, 1, true], "fail"],
  [[0, 30, 1, 2, true], "zoom"],
  [[0, 30, 1, 1, false], "fail"],
])
  assert.equal(policy.mediaPanIntent(...args), expected);
assert.equal(policy.shouldDismissMedia(40, 1200, 844), true);
assert.equal(policy.shouldDismissMedia(10, 2000, 844), false);
assert.equal(policy.shouldDismissMedia(155, 0, 844), true);
assert.equal(policy.shouldDismissMedia(80, 0, 844), false);
const loader = compile("features/messenger/useMediaViewerLoading.ts", {
  react: React,
});
const fixture = (id, type = "image") => ({
  id,
  type,
  original_name: id,
  url: `/test/${id}`,
  mime_type: type === "image" ? "image/png" : "video/mp4",
});
const items = [
  fixture("v0", "video"),
  fixture("a"),
  fixture("v2", "video"),
  fixture("b"),
  fixture("v4", "video"),
];
const calls = [];
const ensure = async (item) => {
  calls.push(item.id);
  if (item.id === "v2") throw new Error("offline");
  return `file://${item.id}`;
};
function Loader(props) {
  loader.useMediaViewerLoading(
    props.items || items,
    props.index,
    props.session || 1,
    props.ensure || ensure,
  );
  return null;
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
const native = {
  View: "View",
  FlatList: "FlatList",
  Text: "Text",
  Modal: "Modal",
  Pressable: "Pressable",
  TouchableOpacity: "TouchableOpacity",
  ActivityIndicator: "ActivityIndicator",
  Platform: { OS: "ios" },
  StyleSheet: { create: (x) => x, hairlineWidth: 1 },
  useWindowDimensions: () => ({ width: 390, height: 844 }),
};
native.FlatList = (props) =>
  React.createElement(
    "FlatList",
    props,
    props.data.map((item, index) =>
      React.createElement(
        React.Fragment,
        { key: index },
        props.renderItem({ item, index }),
      ),
    ),
  );
const animations = [];
const reanimated = {
  default: { View: "AnimatedView" },
  __esModule: true,
  useSharedValue: (value) => React.useRef({ value }).current,
  useAnimatedStyle: (callback) => callback(),
  runOnJS: (callback) => callback,
  withTiming: (value, _options, callback) => {
    if (callback) animations.push(callback);
    return value;
  },
};
let gestures = [];
function gesture(kind) {
  const result = { kind, callbacks: {}, config: {} };
  for (const name of [
    "enabled",
    "manualActivation",
    "maxPointers",
    "numberOfTaps",
    "maxDuration",
    "blocksExternalGesture",
    "simultaneousWithExternalGesture",
  ])
    result[name] = (...args) => {
      result.config[name] = args;
      return result;
    };
  for (const name of [
    "onStart",
    "onBegin",
    "onEnd",
    "onUpdate",
    "onFinalize",
    "onTouchesDown",
    "onTouchesMove",
  ])
    result[name] = (callback) => {
      result.callbacks[name] = callback;
      return result;
    };
  gestures.push(result);
  return result;
}
const gestureModule = {
  Gesture: {
    Pan: () => gesture("pan"),
    Pinch: () => gesture("pinch"),
    Tap: () => gesture("tap"),
    Native: () => gesture("native"),
    Simultaneous: (...children) => ({ kind: "simultaneous", children }),
  },
  GestureDetector: "GestureDetector",
  GestureHandlerRootView: "GestureRoot",
};
const zoomModule = compile("features/messenger/MessengerZoomableMedia.tsx", {
  react: React,
  "react-native": native,
  "react-native-gesture-handler": gestureModule,
  "react-native-reanimated": reanimated,
  "./mediaViewerPolicy": policy,
});
const viewerModule = compile("features/messenger/MessengerMediaViewer.tsx", {
  react: React,
  "react-native": native,
  "react-native-gesture-handler": gestureModule,
  "react-native-safe-area-context": {
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  },
  "expo-image": { Image: "Image" },
  "expo-status-bar": { StatusBar: "StatusBar" },
  "expo-screen-orientation": {
    OrientationLock: { ALL: 1, DEFAULT: 0, PORTRAIT_UP: 3 },
    supportsOrientationLockAsync: async () => true,
    lockAsync: async () => {},
    getOrientationLockAsync: async () => 1,
  },
  "../../components/Icon": { __esModule: true, default: "Icon" },
  "../../styles/commonStyles": { colors: { white: "white", primary: "blue" } },
  "../../services/messengerLogger": { messengerLog: () => {} },
  "./MessengerVideoPlayer": { __esModule: true, default: "Video" },
  "./MessengerZoomableMedia": zoomModule,
  "./useMediaViewerLoading": loader,
});
const touch = (x, y, n = 1) => ({
  numberOfTouches: n,
  allTouches: [{ absoluteX: x, absoluteY: y }],
});
(async () => {
  let tree;
  await act(async () => {
    tree = create(React.createElement(Loader, { index: null }));
  });
  assert.deepEqual(calls, []);
  await act(async () => {
    tree.update(React.createElement(Loader, { index: 2 }));
    await flush();
  });
  assert.deepEqual(
    calls,
    ["v2", "a", "b"],
    "current video autoloads first; photos prefetched, not all videos",
  );
  await act(async () => {
    tree.update(
      React.createElement(Loader, {
        index: 2,
        items: [...items],
        ensure: async (item) => ensure(item),
      }),
    );
    await flush();
  });
  assert.equal(
    calls.length,
    3,
    "new callback/array after errors must not start a request loop",
  );
  await act(async () => {
    tree.update(React.createElement(Loader, { index: 3 }));
    await flush();
  });
  assert.equal(calls.at(-1), "b");
  await act(async () => {
    tree.update(React.createElement(Loader, { index: 2 }));
    await flush();
  });
  assert.equal(
    calls.filter((x) => x === "v2").length,
    2,
    "revisiting allows a fresh automatic attempt",
  );
  let resolve;
  const pending = new Promise((r) => {
    resolve = r;
  });
  let pendingCalls = 0;
  const slow = () => {
    pendingCalls++;
    return pending;
  };
  await act(async () => {
    tree.unmount();
    tree = create(
      React.createElement(Loader, {
        index: 0,
        items: [fixture("one")],
        ensure: slow,
      }),
    );
    await flush();
  });
  await act(async () => {
    tree.update(
      React.createElement(Loader, {
        index: null,
        items: [fixture("one")],
        ensure: slow,
      }),
    );
  });
  await act(async () => {
    tree.update(
      React.createElement(Loader, {
        index: 0,
        session: 2,
        items: [fixture("one")],
        ensure: slow,
      }),
    );
    await flush();
  });
  assert.equal(
    pendingCalls,
    1,
    "same in-flight download is not duplicated after reopen",
  );
  await act(async () => {
    resolve("file://one");
    await flush();
    tree.unmount();
  });
  let closes = 0,
    zooms = [];
  const base = {
    width: 390,
    height: 844,
    resetKey: "1:photo",
    onDismiss: () => closes++,
    onZoomChange: (v) => zooms.push(v),
    pagerGesture: gesture("pager"),
  };
  gestures = [];
  await act(async () => {
    tree = create(React.createElement(zoomModule.default, base));
  });
  let pan = gestures.find((x) => x.kind === "pan"),
    tap = gestures.find((x) => x.kind === "tap");
  assert.ok(pan.config.blocksExternalGesture);
  let activated = 0,
    failed = 0;
  const manager = { activate: () => activated++, fail: () => failed++ };
  const drag = (dx, dy, velocity = 0, success = true, n = 1) => {
    pan.callbacks.onTouchesDown(touch(100, 100), manager);
    pan.callbacks.onTouchesMove(touch(100 + dx, 100 + dy, n), manager);
    pan.callbacks.onStart();
    pan.callbacks.onUpdate({ translationX: dx, translationY: dy });
    pan.callbacks.onEnd(
      { translationX: dx, translationY: dy, velocityY: velocity },
      success,
    );
    pan.callbacks.onFinalize();
  };
  drag(70, 2);
  assert.equal(failed, 1);
  assert.equal(animations.length, 0);
  drag(0, -70);
  assert.equal(failed, 2);
  drag(0, 80);
  assert.equal(animations.length, 0, "short vertical drag snaps back");
  await act(async () => {
    tap.callbacks.onEnd({ x: 195, y: 422 }, true);
  });
  assert.equal(zooms.at(-1), true);
  const zoomCount = zooms.length;
  await act(async () => {
    tree.update(
      React.createElement(zoomModule.default, {
        ...base,
        onZoomChange: (v) => zooms.push(v),
      }),
    );
  });
  assert.equal(
    zooms.length,
    zoomCount,
    "neighbor downloads must not reset active zoom",
  );
  drag(0, 240);
  assert.equal(animations.length, 0, "zoomed pan does not dismiss");
  await act(async () => {
    tap.callbacks.onEnd({ x: 195, y: 422 }, true);
  });
  assert.equal(zooms.at(-1), false);
  drag(0, 240, 0, false);
  assert.equal(animations.length, 0, "cancelled gesture cannot close");
  drag(0, 240, 0, true, 2);
  assert.equal(animations.length, 0, "pinch cannot close");
  drag(0, 210);
  assert.equal(animations.length, 1);
  await act(async () => {
    animations.shift()(true);
  });
  assert.equal(closes, 1);
  await act(async () => {
    tree.unmount();
  });
  for (const platform of ["ios", "android"]) {
    native.Platform.OS = platform;
    calls.length = 0;
    let selected = [];
    const props = {
      items,
      index: 2,
      session: 1,
      localUris: {},
      loadingIds: new Set(),
      errors: {},
      savingId: null,
      onIndexChange: (n) => selected.push(n),
      onClose: () => closes++,
      onEnsureLocal: ensure,
      onSave: async () => {},
    };
    await act(async () => {
      tree = create(React.createElement(viewerModule.default, props));
      await flush();
    });
    assert.deepEqual(calls, ["v2", "a", "b"]);
    assert.equal(
      tree.root.findAllByType("ActivityIndicator").length,
      5,
      "autoload shows loading, not a manual-download prompt",
    );
    const pager = tree.root.findByType("FlatList");
    assert.equal(pager.props.windowSize, 3);
    await act(async () => {
      pager.props.onMomentumScrollEnd({
        nativeEvent: { contentOffset: { x: 390 * 3 } },
      });
    });
    assert.deepEqual(selected, [3]);
    await act(async () => {
      tree.update(
        React.createElement(viewerModule.default, { ...props, index: 4 }),
      );
      await flush();
    });
    assert.ok(
      calls.includes("v4"),
      "swiping to next video autoloads on both platforms",
    );
    await act(async () => {
      tree.unmount();
    });
  }
  console.log(
    "Media viewer: autoload/neighbor policy, retries, cancellation, gestures, zoom and both platform paths passed.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
