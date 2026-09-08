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
  const native = instance.require.bind(instance);
  instance.require = (name) =>
    Object.hasOwn(mocks, name) ? mocks[name] : native(name);
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
const policy = compile("features/messenger/pins.ts");
const { usePinnedMessageSelection } = compile(
  "features/messenger/usePinnedMessageSelection.ts",
  { react: React, "./pins": policy },
);
const pins = policy.orderedMessengerPins(
  [1, 2, 3].map((n) => ({
    message: {
      id: String(n),
      sequence: String(n),
      kind: "text",
      text: "Текст",
      created_at: `2026-09-08T0${n}:00:00Z`,
    },
  })),
);
let latest;
function Harness({ items = pins, identity = "user:room", active = true }) {
  latest = usePinnedMessageSelection(items, identity, active);
  return null;
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
(async () => {
  let tree;
  await act(async () => {
    tree = create(React.createElement(Harness, { items: [] }));
  });
  assert.equal(latest.currentId, null);
  await act(async () => {
    tree.update(React.createElement(Harness));
  });
  assert.equal(latest.currentId, "3", "late list chooses newest");
  await act(async () => {
    latest.visit("3");
  });
  assert.equal(latest.currentId, "2");
  assert.equal(latest.visitedId, "3");
  await act(async () => {
    latest.visit("2");
  });
  assert.equal(latest.currentId, "1");
  await act(async () => {
    latest.visit("1");
  });
  assert.equal(latest.currentId, "3", "oldest wraps back to newest");
  const staleRevision = latest.getRevision();
  await act(async () => {
    latest.resetToLatest();
  });
  await act(async () => {
    latest.visit("2", staleRevision);
  });
  assert.equal(
    latest.currentId,
    "3",
    "bottom reset overrides in-flight navigation",
  );
  assert.equal(latest.visitedId, null);
  await act(async () => {
    latest.select("1");
    tree.update(React.createElement(Harness, { active: false }));
  });
  await act(async () => {
    tree.update(React.createElement(Harness));
  });
  assert.equal(latest.currentId, "3", "same-room reentry resets");
  await act(async () => {
    latest.select("1");
  });
  await act(async () => {
    tree.update(React.createElement(Harness, { identity: "another:room" }));
  });
  assert.equal(latest.currentId, "3");
  await act(async () => {
    latest.select("2");
  });
  await act(async () => {
    tree.update(
      React.createElement(Harness, {
        identity: "another:room",
        items: [pins[0], pins[2]],
      }),
    );
  });
  assert.equal(latest.currentId, "3", "unpin selected falls back to newest");
  await act(async () => {
    tree.unmount();
  });
  const players = [];
  const { requestMessengerPinVideoThumbnail: request } = compile(
    "services/messengerPinVideoThumbnail.ts",
    {
      "expo-video": {
        createVideoPlayer(source) {
          assert.equal(source, null);
          const p = {
            status: "readyToPlay",
            released: 0,
            release() {
              this.released++;
            },
            addListener(_, fn) {
              this.listener = fn;
              return { remove() {} };
            },
            replaceAsync(s) {
              this.source = s;
              return Promise.resolve();
            },
            generateThumbnailsAsync(time, options) {
              this.time = time;
              this.options = options;
              return new Promise((resolve) => {
                this.frame = resolve;
              });
            },
          };
          players.push(p);
          return p;
        },
      },
    },
  );
  const frames = [];
  const cancel = request(
    "/protected-video",
    { Authorization: "Bearer fixture" },
    (f) => frames.push(f),
  );
  await tick();
  assert.equal(players[0].muted, true);
  assert.equal(players[0].time, 0);
  assert.equal(players[0].source.headers.Authorization, "Bearer fixture");
  players[0].frame([{ nativeRefType: "image" }]);
  await tick();
  assert.equal(frames.length, 1);
  assert.equal(players[0].released, 1);
  cancel();
  assert.equal(players[0].released, 1);
  const cancel2 = request("/other", undefined, (f) => frames.push(f));
  await tick();
  cancel2();
  players[1].frame([{ nativeRefType: "image" }]);
  await tick();
  assert.equal(frames.length, 1, "late thumbnail discarded");
  assert.equal(players[1].released, 1);
  const rn = {
    ActivityIndicator: "ActivityIndicator",
    Pressable: "Pressable",
    Text: "Text",
    View: "View",
    StyleSheet: { create: (s) => s, hairlineWidth: 1 },
  };
  const Banner = compile("features/messenger/PinnedMessagesBanner.tsx", {
    react: React,
    "react-native": rn,
    "react-native-svg": { __esModule: true, default: "Svg", Path: "Path" },
    "./PinnedMediaThumbnail": { __esModule: true, default: "Thumbnail" },
    "../../styles/commonStyles": { colors: {} },
    "./pins": policy,
  }).default;
  const photo = { id: "photo", type: "image", url: "/protected-image" };
  const visualPins = [
    { ...pins[2], message: { ...pins[2].message, media_items: [photo] } },
  ];
  await act(async () => {
    tree = create(
      React.createElement(Banner, {
        items: visualPins,
        messageId: "3",
        visitedId: null,
        busy: false,
        active: true,
        accessToken: "fixture",
        onPress() {},
      }),
    );
  });
  const texts = tree.root.findAllByType("Text").map((n) => n.children.join(""));
  assert.deepEqual(texts, ["Закрепленное сообщение", "Текст"]);
  assert.equal(tree.root.findByType("Thumbnail").props.media, photo);
  assert.equal(tree.root.findAllByType("Svg").length, 1);
  await act(async () => {
    tree.unmount();
  });
  // Actual hook and banner: the focused row must never override the next preview.
  const previewPins = pins.map((pin) => ({
    ...pin,
    message: { ...pin.message, text: `Превью ${pin.message.id}` },
  }));
  let selection;
  function PreviewHarness({
    items = previewPins,
    identity = "user:preview",
    active = true,
  }) {
    selection = usePinnedMessageSelection(items, identity, active);
    return React.createElement(Banner, {
      items,
      messageId: selection.currentId,
      visitedId: selection.visitedId,
      busy: false,
      active,
      accessToken: "fixture",
      onPress() {},
    });
  }
  await act(async () => {
    tree = create(React.createElement(PreviewHarness));
  });
  const segments = () =>
    tree.root.findAll(
      (node) =>
        typeof node.props.testID === "string" &&
        node.props.testID.startsWith("pin-segment-"),
    );
  const originalSegments = segments();
  function checkPreview(expected, focused) {
    assert.equal(selection.currentId, expected);
    assert.equal(selection.visitedId, focused);
    assert.deepEqual(
      tree.root.findAllByType("Text").map((node) => node.children.join("")),
      ["Закрепленное сообщение", `Превью ${expected}`],
    );
    const current = segments();
    assert.deepEqual(
      current.map((node) => node.props.testID),
      ["pin-segment-1", "pin-segment-2", "pin-segment-3"],
    );
    current.forEach((node, index) => {
      assert.equal(
        node,
        originalSegments[index],
        "fixed section identity survives cycling",
      );
      const style = Object.assign({}, ...node.props.style);
      assert.equal(
        style.width,
        String(index + 1) === expected ? 4 : 2,
        "bold segment belongs to the preview, not the focused row",
      );
    });
  }
  checkPreview("3", null);
  for (const [focused, preview] of [
    ["3", "2"],
    ["2", "1"],
    ["1", "3"],
    ["3", "2"],
    ["2", "1"],
    ["1", "3"],
  ]) {
    await act(async () => {
      selection.visit(focused);
    });
    checkPreview(preview, focused);
  }
  await act(async () => {
    selection.resetToLatest();
  });
  checkPreview("3", null);
  await act(async () => {
    tree.update(
      React.createElement(PreviewHarness, { items: [previewPins[0]] }),
    );
  });
  await act(async () => {
    selection.visit("1");
  });
  assert.equal(selection.currentId, "1", "one pin cycles to itself");
  assert.equal(segments().length, 1);
  assert.equal(Object.assign({}, ...segments()[0].props.style).width, 4);
  await act(async () => {
    tree.update(React.createElement(PreviewHarness, { items: [] }));
  });
  assert.equal(tree.toJSON(), null, "empty pins have no banner or rail");
  await act(async () => {
    tree.unmount();
  });
  console.log(
    "Pin presentation runtime: late list, focus, bottom reset, deletion, two-line title, thumbnail placement, first-frame generation and cleanup passed.",
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
