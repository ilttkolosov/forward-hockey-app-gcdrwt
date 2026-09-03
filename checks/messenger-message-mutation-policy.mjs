import assert from "node:assert/strict";
import {
  messageDeletionAvailable,
  messageMutationAvailable,
  SCHEDULE_BOT_USER_ID,
} from "../features/messenger/messageMutationPolicy.ts";

const coachId = "coach-user";
const oldJimmyMessage = {
  pending: false,
  deleted_at: null,
  kind: "text",
  created_at: "2020-01-01T00:00:00.000Z",
  author: { id: SCHEDULE_BOT_USER_ID },
};
const oldCoachMessage = {
  ...oldJimmyMessage,
  author: { id: coachId },
};
const playerMessage = {
  ...oldJimmyMessage,
  author: { id: "player-user" },
};

assert.equal(
  messageMutationAvailable(
    oldJimmyMessage,
    coachId,
    "coach_team",
    true,
  ),
  true,
);
assert.equal(
  messageDeletionAvailable(
    oldJimmyMessage,
    coachId,
    "group",
    "coach_parents",
    true,
  ),
  true,
);
assert.equal(
  messageMutationAvailable(
    oldCoachMessage,
    coachId,
    "coach_team",
    true,
  ),
  true,
);
assert.equal(
  messageMutationAvailable(
    playerMessage,
    coachId,
    "coach_team",
    true,
  ),
  false,
);
assert.equal(
  messageMutationAvailable(
    oldJimmyMessage,
    coachId,
    "coaching_staff",
    true,
  ),
  false,
);
assert.equal(
  messageMutationAvailable(
    oldJimmyMessage,
    coachId,
    "coach_team",
    false,
  ),
  false,
);

console.log("Messenger coach schedule message mutation checks passed.");
