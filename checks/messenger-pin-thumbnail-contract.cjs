/* eslint-env node */
/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const filename = path.resolve(
  __dirname,
  "../services/messengerPinVideoThumbnail.ts",
);
const players = [];
let options = {};
const native = {
  createVideoPlayer(source) {
    assert.equal(source, null, "load asynchronously, not in the constructor");
    const behavior = options;
    const player = {
      status: "readyToPlay",
      calls: [],
      released: 0,
      removed: 0,
      addListener(event, callback) {
        assert.equal(event, "statusChange");
        this.listener = callback;
        return {
          remove: () => {
            this.removed += 1;
          },
        };
      },
      replaceAsync(source) {
        this.source = source;
        return behavior.replaceFails
          ? Promise.reject(new Error("offline"))
          : Promise.resolve();
      },
      generateThumbnailsAsync(times, size) {
        this.calls.push({ times, size });
        // Model the native array contract, NOT TypeScript's number | number[].
        if (!Array.isArray(times))
          throw new TypeError("iOS SDK 54 requires [Double]");
        if (behavior.generateFails)
          return Promise.reject(new Error("invalid video"));
        return new Promise((resolve) => {
          this.finish = resolve;
        });
      },
      release() {
        this.released += 1;
      },
    };
    players.push(player);
    return player;
  },
};
const instance = new Module(filename, module);
instance.filename = filename;
instance.paths = Module._nodeModulePaths(path.dirname(filename));
instance.require = (name) => {
  assert.equal(name, "expo-video");
  return native;
};
instance._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  filename,
);
const request = instance.exports.requestMessengerPinVideoThumbnail;
const tick = () => new Promise((resolve) => setImmediate(resolve));
(async () => {
  const frames = [];
  const cancel = request(
    "/fixture.mp4",
    { Authorization: "Bearer test-only" },
    (frame) => frames.push(frame),
  );
  await tick();
  const first = players[0];
  assert.deepEqual(
    first.calls,
    [{ times: [0], size: { maxWidth: 160, maxHeight: 160 } }],
    "regression: scalar 0 crashes the SDK 54 iOS bridge before a JS catch can help",
  );
  assert.equal(first.source.headers.Authorization, "Bearer test-only");
  assert.equal(first.muted, true);
  assert.equal(first.staysActiveInBackground, false);
  first.listener({ status: "readyToPlay" });
  assert.equal(
    first.calls.length,
    1,
    "one generation per request despite duplicate ready events",
  );
  first.finish([{ nativeRefType: "image", width: 64, height: 64 }]);
  await tick();
  assert.equal(frames.length, 1);
  cancel();
  assert.equal(first.released, 1);
  assert.equal(first.removed, 1);

  const beforeLoad = request("/cancel-before-load", undefined, (frame) =>
    frames.push(frame),
  );
  beforeLoad();
  await tick();
  assert.equal(players[1].calls.length, 0);
  assert.equal(players[1].released, 1);

  const duringGeneration = request("/cancel-after-load", undefined, (frame) =>
    frames.push(frame),
  );
  await tick();
  duringGeneration();
  players[2].finish([{ nativeRefType: "image" }]);
  await tick();
  assert.equal(
    frames.length,
    1,
    "late frame never updates an unmounted banner",
  );
  assert.equal(players[2].released, 1);

  options = { generateFails: true };
  request("/invalid-video", undefined, (frame) => frames.push(frame));
  await tick();
  assert.deepEqual(players[3].calls[0].times, [0]);
  assert.equal(players[3].released, 1);
  options = { replaceFails: true };
  request("/offline", undefined, (frame) => frames.push(frame));
  await tick();
  assert.equal(players[4].released, 1);
  assert.equal(players[4].calls.length, 0);
  assert.equal(frames.length, 1);
  console.log(
    "Pin thumbnail native-array contract, mute, authorization, duplicate events, cancellation and media errors passed.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
