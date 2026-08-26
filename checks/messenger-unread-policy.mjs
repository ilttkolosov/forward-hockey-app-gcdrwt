import assert from "node:assert/strict";
import {
  MessengerUnreadMessageLedger,
  messengerUnreadAuthAction,
  normalizeMessengerUnreadCount,
  reconcileMessengerUnreadCount,
  selectMessengerUnreadRestore,
} from "../services/messengerUnreadPolicy.ts";
import {
  mergeMessengerRoomReadState,
  mergeMessengerRoomSnapshots,
} from "../features/messenger/roomListState.ts";

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
assert.equal(selectMessengerUnreadRestore(9, 6), 6);
assert.equal(selectMessengerUnreadRestore(6, 0), 6);
assert.equal(selectMessengerUnreadRestore(2, 7), 7);

const messageLedger = new MessengerUnreadMessageLedger(3);
assert.equal(messageLedger.record("message-1"), true);
assert.equal(messageLedger.record("message-1"), false);
assert.equal(messageLedger.record("message-2"), true);
assert.equal(messageLedger.record("message-3"), true);
assert.equal(messageLedger.record("message-4"), true);
assert.equal(
  messageLedger.record("message-1"),
  true,
  "The bounded ledger must eventually evict the oldest message id",
);
messageLedger.clear();
assert.equal(messageLedger.record("message-4"), true);

// Reproduces the first video pass: the OS knows about four unread messages,
// while the terminated application's SQLite snapshot still says zero.
let unread = reconcileMessengerUnreadCount(0, 4, "system");
assert.equal(unread, 4);
unread = reconcileMessengerUnreadCount(9, 6, "system");
assert.equal(unread, 6, "A positive native badge corrects stale persistence");
unread = reconcileMessengerUnreadCount(unread, 0, "cache");
assert.equal(
  unread,
  6,
  "A stale cold-start cache must not erase the OS/server badge",
);

// Reproduces the second pass: a new push carries total=5 while local rooms
// still total four. Opening/minimising the app must retain five.
unread = 4;
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

// Reproduces the Android video: persisted cache says 9, while the newest
// still-present server notification says the exact current total is 6.
unread = reconcileMessengerUnreadCount(9, 6, "presented", true);
assert.equal(unread, 6);
unread = reconcileMessengerUnreadCount(unread, 7, "push", true);
assert.equal(unread, 7, "One new PUSH after six unread must produce seven");

// Only a confirmed local read or logout may intentionally reduce the value
// before the next server reconciliation.
unread = reconcileMessengerUnreadCount(unread, 1, "local-read");
assert.equal(unread, 1);
unread = reconcileMessengerUnreadCount(unread, 0, "logout");
assert.equal(unread, 0);

const visibleReadRoom = {
  id: "read-room",
  title: "Visible title",
  avatar_url: "visible-avatar",
  last_read_sequence: "100",
  unread_count: 2,
};
const untouchedRoom = {
  id: "untouched-room",
  title: "Untouched",
  last_read_sequence: "50",
  unread_count: 1,
};
const visibleRooms = [visibleReadRoom, untouchedRoom];
const mergedRooms = mergeMessengerRoomReadState(visibleRooms, [
  {
    ...visibleReadRoom,
    title: "Stale cached title",
    avatar_url: "stale-cached-avatar",
    last_read_sequence: "102",
    unread_count: 0,
  },
  { ...untouchedRoom },
  {
    id: "cached-only-room",
    title: "Must not be added",
    last_read_sequence: "1",
    unread_count: 1,
  },
]);
assert.notStrictEqual(mergedRooms, visibleRooms);
assert.equal(mergedRooms.length, 2);
assert.equal(mergedRooms[0].last_read_sequence, "102");
assert.equal(mergedRooms[0].unread_count, 0);
assert.equal(mergedRooms[0].title, "Visible title");
assert.equal(mergedRooms[0].avatar_url, "visible-avatar");
assert.strictEqual(mergedRooms[1], untouchedRoom);

const partiallyReadRooms = mergeMessengerRoomReadState(
  [{ ...visibleReadRoom, unread_count: 4 }],
  [{ ...visibleReadRoom, last_read_sequence: "101", unread_count: 2 }],
);
assert.equal(partiallyReadRooms[0].unread_count, 2);

const staleReadRooms = [visibleReadRoom, untouchedRoom];
assert.strictEqual(
  mergeMessengerRoomReadState(staleReadRooms, [
    { ...visibleReadRoom, last_read_sequence: "99", unread_count: 0 },
  ]),
  staleReadRooms,
  "An older cache cursor must not overwrite the rendered room state",
);

const refreshedRooms = mergeMessengerRoomSnapshots(visibleRooms, [
  {
    ...untouchedRoom,
    last_message: {
      id: "message-2",
      sequence: "52",
      created_at: "2026-08-26T12:02:00Z",
    },
  },
  {
    ...visibleReadRoom,
    last_message: {
      id: "message-1",
      sequence: "103",
      created_at: "2026-08-26T12:03:00Z",
    },
  },
]);
assert.equal(refreshedRooms[0].last_message.id, "message-2");
assert.equal(refreshedRooms[1].last_message.id, "message-1");
assert.strictEqual(
  mergeMessengerRoomSnapshots(refreshedRooms, refreshedRooms),
  refreshedRooms,
  "An unchanged SQLite snapshot must not rerender the room list",
);

console.log("messenger unread policy: ok");
