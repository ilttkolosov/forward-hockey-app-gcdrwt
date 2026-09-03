import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const apiSource = readFileSync(
  new URL("../services/messengerApi.ts", import.meta.url),
  "utf8",
);
assert.match(apiSource, /new ExpoFile\(file\.uri\)/);
assert.match(
  apiSource,
  /form\.append\("file", uploadFile as unknown as Blob, file\.name\)/,
);
assert.match(
  apiSource,
  /expoFetch\(`\$\{MESSENGER_API_BASE_URL\}\$\{path\}`/,
);
assert.match(apiSource, /api\.avatar_upload\.response/);

const profileSource = readFileSync(
  new URL("../app/messenger/profile.tsx", import.meta.url),
  "utf8",
);
assert.match(profileSource, /prepareMessengerAvatarUpload\(\{/);
assert.match(
  profileSource,
  /await uploadMessengerAvatar\(preparedAvatar\)/,
);

const roomSource = readFileSync(
  new URL("../app/messenger/room/[id].tsx", import.meta.url),
  "utf8",
);
assert.match(
  roomSource,
  /pasteAttachmentsEnabled=\{\s*Platform\.OS !== "android" &&/,
);

console.log(
  "Messenger avatar and Android IME compatibility checks passed.",
);
