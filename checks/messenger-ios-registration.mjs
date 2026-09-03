import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const modal = readFileSync(
  new URL("../features/messenger/MessengerRulesModal.tsx", import.meta.url),
  "utf8",
);
assert.match(modal, /const submittingRef = useRef\(false\)/);
assert.match(modal, /rules\.accept\.press_in/);
assert.match(modal, /rules\.accept\.failed/);
assert.match(modal, /accessibilityRole="alert"/);
assert.match(modal, /onDismiss=\{\(\) =>/);

const registration = readFileSync(
  new URL("../app/messenger/register.tsx", import.meta.url),
  "utf8",
);
assert.match(registration, /Keyboard\.dismiss\(\)/);
assert.match(registration, /scannerLockedRef\.current/);
assert.match(registration, /invitationCheckRef\.current/);
assert.match(registration, /onDismiss=\{runRulesDismissAction\}/);
assert.doesNotMatch(registration, /await acceptMessengerRules\(/);
assert.match(registration, /rules:\s*\{/);

const auth = readFileSync(
  new URL("../contexts/MessengerAuthContext.tsx", import.meta.url),
  "utf8",
);
assert.match(auth, /registerInMessengerWithRules/);
assert.doesNotMatch(auth, /await uploadMessengerAvatar\(localPhoto\)/);

const api = readFileSync(
  new URL("../services/messengerApi.ts", import.meta.url),
  "utf8",
);
assert.match(api, /\/auth\/register-with-rules/);
assert.match(api, /error\.status === 404 \|\| error\.status === 405/);
assert.match(api, /acceptRulesForUnpublishedSession/);
assert.match(api, /pendingLegacyRegistration/);
assert.match(api, /await saveMessengerSession\(result\)/);

console.log("Messenger iOS registration reliability checks passed.");
