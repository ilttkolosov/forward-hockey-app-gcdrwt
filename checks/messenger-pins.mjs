import assert from "node:assert/strict";
import {
  orderedMessengerPins,
  pinnedMessengerPreview,
  currentMessengerPinId,
  nextMessengerPinId,
} from "../features/messenger/pins.ts";
const pin = (id, sequence, extra = {}) => ({
  message: { id, sequence, kind: "text", text: "First\nSecond", ...extra },
  pinned_at: "2026-09-07",
  pinned_by_user_id: null,
});
const pins = orderedMessengerPins([
  pin("a", "9007199254740992"),
  pin("b", "9007199254740993"),
  pin("c", "2"),
  pin("b", "9007199254740993"),
  pin("deleted", "99", { deleted_at: "today" }),
  pin("system", "100", { kind: "system" }),
]);
assert.deepEqual(
  pins.map((p) => p.message.id),
  ["b", "a", "c"],
);
assert.equal(currentMessengerPinId(pins, "missing"), "b");
assert.equal(currentMessengerPinId(pins, "a"), "a");
assert.equal(nextMessengerPinId(pins, "b"), "a");
assert.equal(nextMessengerPinId(pins, "c"), "b");
assert.equal(nextMessengerPinId([pins[0]], "b"), "b");
assert.equal(nextMessengerPinId([], "b"), null);
assert.equal(currentMessengerPinId([], "b"), null);
for (const separator of ["\n", "\r\n", "\r", "\u2028", "\u2029"])
  assert.equal(
    pinnedMessengerPreview({
      text: `  First  ${separator}Second`,
      kind: "text",
    }),
    "First",
  );
assert.equal(
  pinnedMessengerPreview({ text: "\u2060Title\u2060\nHidden", kind: "text" }),
  "Title",
);
assert.equal(pinnedMessengerPreview({ text: "", kind: "image" }), "Фото");
assert.equal(
  pinnedMessengerPreview({ text: "\nsecond", kind: "file" }),
  "Файл",
);
assert.equal(
  pinnedMessengerPreview({ text: "🏒".repeat(121), kind: "text" }),
  "🏒".repeat(120) + "…",
);
console.log(
  "Messenger pin ordering, cycling, previews and deletion checks passed.",
);
