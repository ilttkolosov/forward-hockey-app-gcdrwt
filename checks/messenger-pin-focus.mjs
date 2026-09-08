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
