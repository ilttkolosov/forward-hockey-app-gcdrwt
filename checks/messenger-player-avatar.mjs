import assert from "node:assert/strict";
import { automaticMessengerAvatarPlayerId } from "../features/messenger/playerAvatarPolicy.ts";

assert.equal(automaticMessengerAvatarPlayerId({ player_id: 76, avatar_url: null }), 76);
assert.equal(automaticMessengerAvatarPlayerId({ avatar_url: null }), null);
assert.equal(automaticMessengerAvatarPlayerId({ player_id: null, avatar_url: null }), null);
assert.equal(automaticMessengerAvatarPlayerId({ player_id: 0, avatar_url: null }), null);
assert.equal(
  automaticMessengerAvatarPlayerId({ player_id: 76, avatar_url: "/api/v1/media/existing" }),
  null,
);

console.log("Messenger automatic player avatar checks passed.");
