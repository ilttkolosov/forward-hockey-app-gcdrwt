import assert from "node:assert/strict";
import { waitForMessengerFocus } from "../features/messenger/messageFocus.ts";
let current = true;
let visible = false;
let completed = false;
const pending = waitForMessengerFocus({
  isCurrent: () => current,
  isVisible: () => visible,
  intervalMs: 5,
  stableMs: 15,
  timeoutMs: 300,
}).then((result) => {
  completed = true;
  return result;
});
await new Promise((resolve) => setTimeout(resolve, 20));
assert.equal(completed, false, "scroll request is not a focused message");
visible = true;
assert.equal(await pending, true, "viewability confirms the target");
visible = false;
current = true;
const interrupted = waitForMessengerFocus({
  isCurrent: () => current,
  isVisible: () => visible,
  intervalMs: 5,
  stableMs: 15,
  timeoutMs: 300,
});
current = false;
visible = true;
assert.equal(
  await interrupted,
  false,
  "late layout after manual scroll/room change is rejected",
);
assert.equal(
  await waitForMessengerFocus({
    isCurrent: () => true,
    isVisible: () => false,
    intervalMs: 5,
    timeoutMs: 20,
  }),
  false,
  "unrenderable row does not advance the pin cycle",
);
console.log(
  "Pin focus completion: waiting, actual visibility, cancellation and deadline checks passed.",
);

// Geometry and native bridge regressions, independent of server synchronization.
const { messengerFocusGeometry, measureMessengerFocus } =
  await import("../features/messenger/messageFocus.ts");
const viewport = { x: 0, y: 100, width: 320, height: 600 };
const row = { x: 10, y: 300, width: 300, height: 70 };
assert.equal(messengerFocusGeometry(viewport, row).visible, true);
assert.equal(
  messengerFocusGeometry(viewport, { ...row, y: 699 }).visible,
  false,
);
assert.equal(
  messengerFocusGeometry(viewport, { ...row, y: 710 }).visible,
  false,
);
assert.equal(
  messengerFocusGeometry(viewport, { ...row, y: 120, height: 1200 }).visible,
  true,
);
assert.equal(
  messengerFocusGeometry(viewport, { ...row, x: 500 }).visible,
  false,
);
assert.equal(messengerFocusGeometry(viewport, { ...row, height: 0 }), null);
assert.equal(messengerFocusGeometry(viewport, { ...row, y: NaN }), null);
const measuredView = (rect) => ({
  measureInWindow: (cb) => cb(rect.x, rect.y, rect.width, rect.height),
});
assert.equal(
  (
    await measureMessengerFocus(
      measuredView(viewport),
      measuredView(row),
      () => true,
    )
  ).visible,
  true,
);
assert.equal(
  await measureMessengerFocus(null, measuredView(row), () => true),
  null,
);
assert.equal(
  await measureMessengerFocus(
    measuredView(viewport),
    { measureInWindow() {} },
    () => true,
    5,
  ),
  null,
  "missing native callback has a deadline",
);
assert.equal(
  await measureMessengerFocus(
    measuredView(viewport),
    {
      measureInWindow() {
        throw new Error("unmounted");
      },
    },
    () => true,
  ),
  null,
);
let pendingSample;
current = true;
const asyncFocus = waitForMessengerFocus({
  isCurrent: () => current,
  isVisible: () =>
    new Promise((resolve) => {
      pendingSample = resolve;
    }),
  stableMs: 0,
});
current = false;
pendingSample(true);
assert.equal(
  await asyncFocus,
  false,
  "late native measurement cannot confirm a cancelled focus",
);
let retries = 0;
assert.equal(
  await waitForMessengerFocus({
    isCurrent: () => true,
    isVisible: () => retries > 1,
    onRetry: () => {
      retries += 1;
    },
    intervalMs: 2,
    retryMs: 4,
    stableMs: 3,
    timeoutMs: 100,
  }),
  true,
);
console.log(
  "Native focus measurement: geometry, tall/short rows, missing callbacks, retry and late cancellation checks passed.",
);
