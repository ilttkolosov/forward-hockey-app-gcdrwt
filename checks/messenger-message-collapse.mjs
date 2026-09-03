import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const roomSource = readFileSync(
  new URL("../app/messenger/room/[id].tsx", import.meta.url),
  "utf8",
);

assert.match(roomSource, /const COLLAPSED_MESSAGE_LINES = 30;/);
assert.match(
  roomSource,
  /const COLLAPSED_MESSAGE_ESTIMATED_CHARACTERS = 1_080;/,
);
assert.match(
  roomSource,
  /numberOfLines=\{longMessage && !expanded \? COLLAPSED_MESSAGE_LINES : undefined\}/,
);
assert.match(
  roomSource,
  /event\.nativeEvent\.lines\.length > COLLAPSED_MESSAGE_LINES/,
);

console.log("Messenger 30-line collapse checks passed.");
