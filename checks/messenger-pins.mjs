import assert from "node:assert/strict";
import {
  orderedMessengerPins,
  pinnedMessengerPreview,
  pinnedMessengerMedia,
  currentMessengerPinId,
  nextMessengerPinId,
  shouldResetPinAtLatest,
} from "../features/messenger/pins.ts";
const pin = (id, sequence, extra = {}) => ({
  message: {
    id,
    sequence,
    created_at: "2026-09-08T10:00:00Z",
    kind: "text",
    text: "First\nSecond",
    ...extra,
  },
  pinned_at: "2026-09-08",
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
  ["c", "a", "b"],
);
assert.equal(currentMessengerPinId(pins, "missing"), "b");
assert.equal(currentMessengerPinId(pins, "a"), "a");
assert.equal(nextMessengerPinId(pins, "b"), "a");
assert.equal(nextMessengerPinId(pins, "c"), "b");
assert.equal(nextMessengerPinId(pins, "a"), "c");
assert.equal(nextMessengerPinId(pins, "missing"), "b");
assert.equal(nextMessengerPinId([pins[0]], "c"), "c");
assert.equal(nextMessengerPinId([], "b"), null);
assert.equal(currentMessengerPinId([], "b"), null);
const chronological = orderedMessengerPins([
  {
    ...pin("older", "99", { created_at: "2026-09-08T10:00:00+03:00" }),
    pinned_at: "2026-09-08T18:00:00Z",
  },
  {
    ...pin("newest", "1", { created_at: "2026-09-08T10:00:00Z" }),
    pinned_at: "2026-09-08T11:00:00Z",
  },
  pin("middle", "0", {
    created_at: "2026-09-08T08:00:00Z",
    edited_at: "2026-09-09T08:00:00Z",
  }),
]);
assert.deepEqual(
  chronological.map((p) => p.message.id),
  ["older", "middle", "newest"],
  "message time, not pin/edit time or sequence",
);
assert.equal(currentMessengerPinId(chronological, null), "newest");
let selected = currentMessengerPinId(chronological, null);
for (const expected of [
  "middle",
  "older",
  "newest",
  "middle",
  "older",
  "newest",
]) {
  selected = nextMessengerPinId(chronological, selected);
  assert.equal(
    selected,
    expected,
    "preview cycles backward through message dates",
  );
}
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
const image = { id: "photo", type: "image", url: "/media/photo" };
const video = { id: "video", type: "video", url: "/media/video" };
assert.equal(
  pinnedMessengerMedia({ media_items: [{ type: "file" }, video, image] }),
  video,
);
assert.equal(pinnedMessengerMedia({ media: image, media_items: [] }), image);
assert.equal(pinnedMessengerMedia({ media_items: [] }), null);
assert.equal(
  pinnedMessengerPreview({ text: "", kind: "text", media_items: [video] }),
  "Видео",
);
const bottom = {
  distanceFromBottom: 0,
  listReady: true,
  userScrolled: true,
  filtered: false,
  navigating: false,
  loadedSequence: "9999999999999999",
  latestSequence: "9999999999999999",
  hasMoreNewer: false,
};
assert.equal(shouldResetPinAtLatest(bottom), true);
for (const extra of [
  { distanceFromBottom: 80 },
  { userScrolled: false },
  { navigating: true },
  { filtered: true },
  { listReady: false },
  { loadedSequence: "9999999999999998" },
  { loadedSequence: null },
  { latestSequence: null, hasMoreNewer: true },
])
  assert.equal(shouldResetPinAtLatest({ ...bottom, ...extra }), false);
console.log(
  "Pin chronology, latest default, cycling, media, previews and real bottom checks passed.",
);
