import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { automaticMessengerAvatarPlayerId } from "../features/messenger/playerAvatarPolicy.ts";

assert.equal(automaticMessengerAvatarPlayerId({ player_id: 76, avatar_url: null }), 76);
assert.equal(automaticMessengerAvatarPlayerId({ player_id: "76", avatar_url: null }), 76);
assert.equal(automaticMessengerAvatarPlayerId({ player_id: " 76 " }), 76);
assert.equal(automaticMessengerAvatarPlayerId({ avatar_url: null }), null);
assert.equal(automaticMessengerAvatarPlayerId({ player_id: null, avatar_url: null }), null);
assert.equal(automaticMessengerAvatarPlayerId({ player_id: 0, avatar_url: null }), null);
assert.equal(automaticMessengerAvatarPlayerId({ player_id: 7.6, avatar_url: null }), null);
assert.equal(automaticMessengerAvatarPlayerId({ player_id: "7.6" }), null);
assert.equal(automaticMessengerAvatarPlayerId({ player_id: "76x" }), null);
assert.equal(
  automaticMessengerAvatarPlayerId(
    { avatar_url: "/api/v1/media/preset" },
    { player_id: 76 },
  ),
  76,
);
assert.equal(
  automaticMessengerAvatarPlayerId({
    player_id: 76,
    avatar_url: "/api/v1/media/preset",
  }),
  76,
);

const authSource = readFileSync(
  new URL("../contexts/MessengerAuthContext.tsx", import.meta.url),
  "utf8",
);
assert.match(authSource, /expected_player_id:\s*expectedPlayerId/);
assert.match(
  authSource,
  /automaticMessengerAvatarPlayerId\(\s*authenticated\.user,\s*\{ player_id: expectedPlayerId \},\s*\)/,
);

const registrationSource = readFileSync(
  new URL("../app/messenger/register.tsx", import.meta.url),
  "utf8",
);
assert.match(registrationSource, /expected_player_id:\s*preview\?\.player_id/);

const playerDataSource = readFileSync(
  new URL("../services/playerDataService.ts", import.meta.url),
  "utf8",
);
const cachedPhotoLookup = playerDataSource.indexOf("cachedPhotoCandidates");
const versionedPhotoLookup = playerDataSource.indexOf("getReferenceVersion('players')");
assert.ok(cachedPhotoLookup >= 0, "cached player photo candidates must be checked");
assert.ok(
  versionedPhotoLookup > cachedPhotoLookup,
  "the exact cached player photo path must be preferred over version-derived paths",
);

console.log("Messenger automatic player avatar checks passed.");
