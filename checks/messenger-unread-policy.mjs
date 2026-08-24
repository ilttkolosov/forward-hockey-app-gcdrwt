import assert from "node:assert/strict";
import {
  messengerUnreadAuthAction,
  normalizeMessengerUnreadCount,
  reconcileMessengerUnreadCount,
} from "../services/messengerUnreadPolicy.ts";

assert.equal(
  messengerUnreadAuthAction("loading", null),
  "wait",
  "Cold-start auth restoration must not clear the badge",
);
assert.equal(
  messengerUnreadAuthAction("authenticated", "user"),
  "hydrate",
  "An authenticated session must restore its unread state",
);
assert.equal(
  messengerUnreadAuthAction("authenticated", null),
  "clear",
  "An incomplete authenticated state must not attach another user's count",
);
assert.equal(
  messengerUnreadAuthAction("unauthenticated", null),
  "clear",
  "A completed logout must clear unread state",
);

assert.equal(normalizeMessengerUnreadCount(Number.NaN), 0);
assert.equal(normalizeMessengerUnreadCount(-3), 0);
assert.equal(normalizeMessengerUnreadCount(4.9), 4);

// Reproduces the first video pass: the OS knows about four unread messages,
// while the terminated application's SQLite snapshot still says zero.
let unread = reconcileMessengerUnreadCount(0, 4, "system");
assert.equal(unread, 4);
unread = reconcileMessengerUnreadCount(unread, 0, "cache");
assert.equal(
  unread,
  4,
  "A stale cold-start cache must not erase the OS/server badge",
);

// Reproduces the second pass: a new push carries total=5 while local rooms
// still total four. Opening/minimising the app must retain five.
unread = reconcileMessengerUnreadCount(unread, 5, "push");
assert.equal(unread, 5);
unread = reconcileMessengerUnreadCount(unread, 4, "cache");
assert.equal(unread, 5, "Opening the app must not regress a push total");
unread = reconcileMessengerUnreadCount(unread, 4, "realtime");
assert.equal(unread, 5, "A delayed realtime/cache write must not regress unread");

// A server room snapshot is authoritative and may correct in either direction.
unread = reconcileMessengerUnreadCount(unread, 6, "authoritative");
assert.equal(unread, 6);
unread = reconcileMessengerUnreadCount(unread, 4, "authoritative");
assert.equal(unread, 4);
unread = reconcileMessengerUnreadCount(unread, 6, "cache", true);
assert.equal(
  unread,
  4,
  "A cache snapshot cannot override an already authoritative server total",
);
unread = reconcileMessengerUnreadCount(unread, 5, "realtime", true);
assert.equal(unread, 5, "A genuine realtime message may increase the total");

// Only a confirmed local read or logout may intentionally reduce the value
// before the next server reconciliation.
unread = reconcileMessengerUnreadCount(unread, 1, "local-read");
assert.equal(unread, 1);
unread = reconcileMessengerUnreadCount(unread, 0, "logout");
assert.equal(unread, 0);

console.log("messenger unread policy: ok");
