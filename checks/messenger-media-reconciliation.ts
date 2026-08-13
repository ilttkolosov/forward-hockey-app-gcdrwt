import {
  mergeMessengerMessages,
  pendingMessengerAttachmentMessage,
} from "../features/messenger/feed";
import type {
  MessengerMessage,
  MessengerUser,
} from "../features/messenger/types";

const user: MessengerUser = {
  id: "sender",
  username: "sender",
  display_name: "Sender",
  avatar_url: null,
  last_seen_at: null,
  roles: [],
  permissions: [],
};

const optimistic = pendingMessengerAttachmentMessage(
  "room",
  "client-media",
  "library",
  "",
  user,
  undefined,
  [
    {
      kind: "image",
      uri: "file:///local/photo.jpg",
      name: "photo.jpg",
      type: "image/jpeg",
      size_bytes: 123_456,
      original_size_bytes: 123_456,
    },
  ],
);

const confirmed: MessengerMessage = {
  ...optimistic,
  id: "server-media",
  sequence: "42",
  media: {
    id: "asset",
    type: "image",
    mime_type: "image/jpeg",
    size_bytes: 123_456,
    original_name: "photo.jpg",
    url: "/api/v1/media/assets/asset",
  },
  media_items: [
    {
      id: "asset",
      type: "image",
      mime_type: "image/jpeg",
      size_bytes: 123_456,
      original_name: "photo.jpg",
      url: "/api/v1/media/assets/asset",
    },
  ],
  delivery: {
    status: "sent",
    recipient_count: 1,
    delivered_count: 0,
    read_count: 0,
  },
  pending: false,
  send_error: null,
  pending_attachment: null,
};

const realtimeFirst = mergeMessengerMessages([optimistic], [confirmed]);
if (realtimeFirst[0]?.pending) {
  throw new Error("Committed realtime media remained pending");
}
if (realtimeFirst[0]?.pending_attachment?.stage !== "committed") {
  throw new Error("Realtime confirmation discarded the local media preview");
}
if (
  realtimeFirst[0]?.pending_attachment?.local_uri !== "file:///local/photo.jpg"
) {
  throw new Error("Realtime confirmation changed the local media URI");
}

const uploadResponse = mergeMessengerMessages(realtimeFirst, [confirmed]);
if (uploadResponse[0]?.pending_attachment !== null) {
  throw new Error("A second confirmation did not release the local preview");
}

console.log("messenger media reconciliation: ok");
