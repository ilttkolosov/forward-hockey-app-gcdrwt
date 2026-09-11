/* eslint-env node */
/* eslint-disable @typescript-eslint/no-require-imports */
// Fast install/build guard; the companion macOS test executes the native paths.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const player = read("node_modules/expo-video/ios/VideoPlayer.swift");
assert.match(player, /override func sharedObjectWillRelease\(\)/);
assert.match(player, /sourceInitializationTask\?\.cancel\(\)/);
assert.match(player, /sourceLoadTask\?\.cancel\(\)/);
assert.match(player, /observer\?\.cleanup\(\)/);
assert.match(player, /guard needsCleanup else \{ return \}/);
assert.match(
  player,
  /guard !hasBeenReleased, !Task\.isCancelled else \{ return \}/,
);
assert.match(player, /sourceLoadTask = Task \{ \[weak self\]/);
assert.match(player, /self\.ref\.currentItem === playerItem/);
const emit = player.slice(player.indexOf("  func safeEmit("));
assert.match(emit, /runtime\.schedule \{ \[weak self, weak appContext\]/);
assert.match(emit, /guard let self, !self\.hasBeenReleased/);
assert.match(emit, /JSIUtils\.emitEvent\(event, to: jsObject/);
const svg = read("node_modules/react-native-svg/apple/RNSVGRenderable.mm");
assert.match(
  svg,
  /CGBitmapContextGetBitsPerPixel\(context\) > 0\s*\? CGBitmapContextCreateImage\(context\)\s*:\s*nil/,
);
assert.match(
  read("components/PersistentBottomNavigation.tsx"),
  /<FeGaussianBlur stdDeviation=\{8\.5\}/,
  "do not disable the visible navigation shadow",
);
const lock = JSON.parse(read("package-lock.json")).packages;
for (const [name, version] of [
  ["expo-video", "3.0.16"],
  ["react-native-svg", "15.12.1"],
]) {
  assert.equal(
    lock[`node_modules/${name}`].version,
    version,
    "Review native patches when upgrading the dependency",
  );
  const patch = read(`patches/${name}+${version}.patch`);
  assert.doesNotMatch(
    patch,
    /^diff --git .*\/android\//m,
    "Android native sources must be unchanged",
  );
}
console.log(
  "iOS player teardown/event ownership and SVG bitmap context guards are installed.",
);
