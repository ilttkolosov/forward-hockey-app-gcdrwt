import assert from "node:assert/strict";
import {
  messengerRoomConnectionStatus,
  shouldShowMessengerRoomSyncError,
} from "../features/messenger/roomConnectionStatus.ts";

const readyRoom = {
  initialDataReady: true,
  roomDetailsReady: true,
  roomTypeReady: true,
  realtimeConnected: true,
  syncError: null,
};

assert.equal(
  messengerRoomConnectionStatus({
    ...readyRoom,
    realtimeConnected: false,
    syncError: "Expired request failed",
  }),
  "connecting",
  "Token refresh and realtime reconnection must hide a stale sync error",
);
assert.equal(
  messengerRoomConnectionStatus({
    ...readyRoom,
    initialDataReady: false,
  }),
  "connecting",
  "The first server reconciliation must be presented as connecting",
);
assert.equal(
  messengerRoomConnectionStatus({
    ...readyRoom,
    syncError: "Server rejected synchronization",
  }),
  "sync_error",
  "A failed synchronization after transport recovery must stay visible",
);
assert.equal(
  messengerRoomConnectionStatus(readyRoom),
  "ready",
  "A fully synchronized room must restore its normal subtitle",
);
assert.equal(
  shouldShowMessengerRoomSyncError({
    remoteRequestStarted: true,
    remoteResponseReceived: false,
  }),
  true,
  "A rejected or interrupted server request must expose a sync error",
);
assert.equal(
  shouldShowMessengerRoomSyncError({
    remoteRequestStarted: true,
    remoteResponseReceived: true,
  }),
  false,
  "A SQLite failure after a valid response must not impersonate a server sync error",
);
assert.equal(
  shouldShowMessengerRoomSyncError({
    remoteRequestStarted: false,
    remoteResponseReceived: false,
  }),
  false,
  "A local cache read failure before networking must not be called a sync error",
);

console.log("Messenger room connection status checks passed");
