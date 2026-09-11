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
const svg = read(
  "node_modules/react-native-svg/apple/Elements/RNSVGSvgView.mm",
);
assert.match(svg, /RNSVGContainsFilter\(self\)/);
assert.match(svg, /CGContextRef bitmapContext = CGBitmapContextCreate\(/);
assert.match(svg, /CGBitmapContextCreateImage\(bitmapContext\)/);
assert.match(svg, /UIGraphicsPushContext\(bitmapContext\)/);
assert.match(svg, /drawToContext:bitmapContext withRect:bounds/);
assert.match(svg, /UIGraphicsPopContext\(\)/);
assert.match(svg, /CGContextRelease\(bitmapContext\)/);
assert.match(svg, /CGColorSpaceRelease\(colorSpace\)/);
assert.match(svg, /CGImageRelease\(raster\)/);
assert.match(svg, /\[image drawAtPoint:bounds.origin\]/);
assert.match(svg, /height > SIZE_MAX \/ bytesPerRow/);
// getDataURL has its own upstream image renderer; only drawRect is patched.
const svgDrawRect = svg.slice(
  svg.indexOf("- (void)drawRect:"),
  svg.indexOf("- (BOOL)pointInside:"),
);
assert.ok(svgDrawRect.includes("RNSVGContainsFilter(self)"));
assert.doesNotMatch(
  svgDrawRect,
  /UIGraphicsImageRenderer|CGBitmapContextGetBitsPerPixel\(/,
);
assert.doesNotMatch(
  read("node_modules/react-native-svg/apple/RNSVGRenderable.mm"),
  /CGBitmapContextGet(?:BitsPerPixel|BitsPerComponent|Data|ColorSpace)\(context\)/,
  "Do not probe a UIKit display list with a bitmap-only function",
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
