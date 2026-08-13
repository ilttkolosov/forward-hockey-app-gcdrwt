import {
  applyMessengerDeliveryUpdates,
  reconcileMessengerMessageUpdates,
} from "../features/messenger/feed";
import type { MessengerMessage } from "../features/messenger/types";

function message(id: string, sequence: string): MessengerMessage {
  return {
    id,
    sequence,
    room_id: "room",
    client_message_id: `client-${id}`,
    kind: "text",
    text: id,
    created_at: "2026-08-13T12:00:00.000Z",
    edited_at: null,
    deleted_at: null,
    author: {
      id: "author",
      username: "author",
      display_name: "Author",
      avatar_url: null,
    },
    media: null,
    media_items: [],
    location: null,
    reply_to: null,
    forwarded_from: null,
    reactions: [],
    delivery: {
      status: "sent",
      recipient_count: 2,
      delivered_count: 0,
      read_count: 0,
    },
  };
}

const before = [message("one", "1"), message("two", "2")];
const after = applyMessengerDeliveryUpdates(before, [
  {
    message_id: "one",
    delivery: {
      status: "delivered",
      recipient_count: 2,
      delivered_count: 2,
      read_count: 1,
    },
  },
]);

if (after.map((item) => item.id).join(",") !== "one,two") {
  throw new Error("Delivery update changed feed order");
}
if (after[0]?.delivery.status !== "delivered") {
  throw new Error("Delivery status was not applied");
}
if (after[1] !== before[1]) {
  throw new Error("Unrelated message was unnecessarily replaced");
}

const staleRealtimeUpdate = applyMessengerDeliveryUpdates(after, [
  {
    message_id: "one",
    delivery: {
      status: "sent",
      recipient_count: 2,
      delivered_count: 0,
      read_count: 0,
    },
  },
]);
if (staleRealtimeUpdate[0]?.delivery.status !== "delivered") {
  throw new Error("A stale receipt update regressed the delivery status");
}

const read = {
  ...message("one", "1"),
  delivery: {
    status: "read" as const,
    recipient_count: 2,
    delivered_count: 2,
    read_count: 2,
  },
};
const staleReconciliation = reconcileMessengerMessageUpdates(
  [read],
  [message("one", "1")],
);
if (staleReconciliation[0]?.delivery.status !== "read") {
  throw new Error("A delayed room sync regressed the read status");
}

console.log("messenger delivery updates: ok");
