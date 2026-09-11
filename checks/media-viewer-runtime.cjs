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
  cancelAnimation: () => {},
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
const orientationCalls = [];
let supportsOrientation = async () => true;
let applyOrientation = async () => {};
const viewerModule = compile("features/messenger/MediaLightbox.tsx", {
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
    supportsOrientationLockAsync: () => supportsOrientation(),
    lockAsync: async (lock) => {
      orientationCalls.push(lock);
      await applyOrientation(lock);
    },
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
  // Cancel an effect before its microtask, and replay it exactly as StrictMode
  // does. This executes the real hook with a minimal lifecycle, not a copy.
  let effects = [];
  let refIndex = 0;
  const refs = [];
  const hookLifecycle = {
    useRef: (value) =>
      refs[refIndex++] || (refs[refIndex - 1] = { current: value }),
    useEffect: (effect) => effects.push(effect),
  };
  const cancellableLoader = compile(
    "features/messenger/useMediaViewerLoading.ts",
    {
      react: hookLifecycle,
    },
  );
  const renderHook = (index, request) => {
    refIndex = 0;
    effects = [];
    cancellableLoader.useMediaViewerLoading(
      [fixture("cancel-test")],
      index,
      1,
      request,
    );
    return effects[0]();
  };
  const cancelledCalls = [];
  const request = async (item) => {
    cancelledCalls.push(item.id);
    return "file://cancel-test";
  };
  let cleanup = renderHook(0, request);
  cleanup();
  renderHook(null, request);
  await flush();
  assert.deepEqual(
    cancelledCalls,
    [],
    "closed before the microtask: no new download",
  );
  cleanup = renderHook(0, request);
  cleanup();
  cleanup = renderHook(0, request);
  await flush();
  assert.deepEqual(
    cancelledCalls,
    ["cancel-test"],
    "StrictMode replay retains the automatic attempt",
  );
  cleanup();

  // Both entry points delegate visual-media loading to the common viewer.
  const attachmentSource = fs.readFileSync(
    path.resolve(
      __dirname,
      "../features/messenger/MessengerAttachmentView.tsx",
    ),
    "utf8",
  );
  const openItemBody = attachmentSource.slice(
    attachmentSource.indexOf("const openItem ="),
    attachmentSource.indexOf("const renderAlbum ="),
  );
  assert.doesNotMatch(
    openItemBody,
    /await ensureLocal/,
    "No duplicate initial visual download from the chat tile",
  );
  const profileSource = fs.readFileSync(
    path.resolve(
      __dirname,
      "../features/messenger/MessengerProfileMediaTab.tsx",
    ),
    "utf8",
  );
  const visualOpen = profileSource.slice(
    profileSource.indexOf("const index = viewerEntries.findIndex"),
    profileSource.indexOf("const showActions"),
  );
  assert.doesNotMatch(
    visualOpen,
    /await ensureLocal/,
    "Profile must open immediately and load via the common viewer",
  );
  for (const source of [attachmentSource, profileSource]) {
    assert.match(source, /import MediaLightbox from "\.\/MediaLightbox"/);
    assert.match(source, /<MediaLightbox/);
  }
  assert.match(
    fs.readFileSync(
      path.resolve(__dirname, "../features/messenger/MessengerMediaViewer.tsx"),
      "utf8",
    ),
    /export \{ default \} from "\.\/MediaLightbox"/,
    "legacy import must be an alias, not a second viewer",
  );
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
  const pinch = gestures.find((x) => x.kind === "pinch");
  assert.ok(pan.config.simultaneousWithExternalGesture);
  assert.ok(pinch.config.simultaneousWithExternalGesture);
  assert.equal(pan.config.blocksExternalGesture, undefined);
  assert.equal(pinch.config.blocksExternalGesture, undefined);
  let pinchFailed = 0;
  const pinchManager = { fail: () => pinchFailed++ };
  // Both recognizers, not only Pan, must release the native horizontal list.
  const waitingPinchDrag = (dx, dy, n = 1) => {
    pinch.callbacks.onTouchesDown(touch(100, 100), pinchManager);
    pinch.callbacks.onTouchesMove(touch(100 + dx, 100 + dy, n), pinchManager);
  };
  waitingPinchDrag(3, 3);
  assert.equal(
    pinchFailed,
    0,
    "a stationary first finger allows pinch to start",
  );
  waitingPinchDrag(70, 2);
  assert.equal(
    pinchFailed,
    1,
    "single-finger paging must fail the waiting pinch",
  );
  waitingPinchDrag(0, 70);
  assert.equal(pinchFailed, 2, "downward dismissal does not wait for a pinch");
  waitingPinchDrag(70, 2, 2);
  assert.equal(pinchFailed, 2, "two fingers retain pinch ownership");
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
  waitingPinchDrag(70, 2);
  assert.equal(pinchFailed, 2, "zoomed panning may still add a pinch finger");
  await act(async () => {
    tap.callbacks.onEnd({ x: 195, y: 422 }, true);
  });
  assert.equal(zooms.at(-1), false);
  drag(0, 240, 0, false);
  assert.equal(animations.length, 0, "cancelled gesture cannot close");
  drag(0, 240, 0, true, 2);
  assert.equal(animations.length, 0, "pinch cannot close");
  await act(async () => {
    pinch.callbacks.onStart();
    pinch.callbacks.onUpdate({ scale: 1, focalX: 195, focalY: 422 });
    pinch.callbacks.onFinalize({}, false);
  });
  assert.equal(
    zooms.at(-1),
    false,
    "interrupted pinch at 1x releases the horizontal pager",
  );
  pan.callbacks.onTouchesMove(touch(100, 340), manager);
  pan.callbacks.onEnd({ translationY: 240, velocityY: 0 }, true);
  assert.equal(animations.length, 0, "a leftover pinch finger cannot dismiss");
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
    const lateMomentumEnd = pager.props.onMomentumScrollEnd;
    assert.equal(pager.props.windowSize, 3);
    await act(async () => {
      pager.props.onMomentumScrollEnd({
        nativeEvent: { contentOffset: { x: 390 * 3 } },
      });
    });
    assert.deepEqual(selected, [3]);
    await act(async () => {
      pager.props.onViewableItemsChanged({
        viewableItems: [{ index: 3, isViewable: true }],
      });
      pager.props.onScrollEndDrag({
        nativeEvent: { contentOffset: { x: 390 * 3 } },
      });
    });
    assert.deepEqual(
      selected,
      [3],
      "one selection despite multiple native notifications",
    );
    await act(async () => {
      pager.props.onScrollEndDrag({
        nativeEvent: { contentOffset: { x: 390 * 3.5 } },
      });
    });
    assert.deepEqual(
      selected,
      [3],
      "a partially visible neighbor is not selected",
    );
    await act(async () => {
      pager.props.onViewableItemsChanged({
        viewableItems: [{ index: 4, isViewable: true }],
      });
    });
    assert.deepEqual(
      selected,
      [3, 4],
      "fully visible page works without a momentum-end event",
    );
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
      tree.update(
        React.createElement(viewerModule.default, { ...props, index: null }),
      );
    });
    const beforeCloseEvents = selected.length;
    await act(async () => {
      lateMomentumEnd({ nativeEvent: { contentOffset: { x: 0 } } });
    });
    assert.equal(
      selected.length,
      beforeCloseEvents,
      "late pager event cannot reopen a closed modal",
    );
    await act(async () => {
      tree.unmount();
    });
  }
  // Native orientation calls may resolve after the user has closed/reopened.
  const orientationProps = {
    items: [fixture("orientation")],
    index: 0,
    session: 1,
    localUris: {},
    loadingIds: new Set(),
    errors: {},
    savingId: null,
    onIndexChange: () => {},
    onClose: () => {},
    onEnsureLocal: async () => "file://orientation",
    onSave: async () => {},
  };
  native.Platform.OS = "ios";
  await flush();
  orientationCalls.length = 0;
  let resolveSupport;
  supportsOrientation = () =>
    new Promise((resolve) => {
      resolveSupport = resolve;
    });
  await act(async () => {
    tree = create(React.createElement(viewerModule.default, orientationProps));
    await flush();
  });
  await act(async () => {
    tree.update(
      React.createElement(viewerModule.default, {
        ...orientationProps,
        index: null,
      }),
    );
  });
  await act(async () => {
    resolveSupport(true);
    await flush();
  });
  assert.deepEqual(
    orientationCalls,
    [3],
    "support check resolving after close must not unlock orientation",
  );
  await act(async () => {
    tree.unmount();
  });
  supportsOrientation = async () => true;
  orientationCalls.length = 0;
  let resolveLock;
  applyOrientation = (lock) =>
    lock === 1
      ? new Promise((r) => {
          resolveLock = r;
        })
      : Promise.resolve();
  await act(async () => {
    tree = create(React.createElement(viewerModule.default, orientationProps));
    await flush();
  });
  await act(async () => {
    tree.update(
      React.createElement(viewerModule.default, {
        ...orientationProps,
        index: null,
      }),
    );
    await flush();
  });
  assert.deepEqual(
    orientationCalls,
    [1],
    "restore waits for an already-running native unlock",
  );
  await act(async () => {
    resolveLock();
    await flush();
  });
  assert.deepEqual(
    orientationCalls,
    [1, 3],
    "portrait is the last completed lock after close",
  );
  await act(async () => {
    tree.unmount();
  });
  applyOrientation = async () => {};
  console.log(
    "Media viewer: autoload/neighbor policy, retries, cancellation, gestures, zoom and both platform paths passed.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
