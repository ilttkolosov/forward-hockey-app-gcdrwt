import type {
  MessengerMessage,
  MessengerMessageDelivery,
  MessengerMessageDeliveryUpdate,
  MessengerOutboxItem,
  MessengerPendingAttachmentSource,
  MessengerReaction,
  MessengerUser,
} from "./types";

const DELIVERY_STATUS_RANK: Record<MessengerMessageDelivery["status"], number> =
  {
    sent: 0,
    delivered: 1,
    read: 2,
  };

function deliveryStatusForCounts(
  recipientCount: number,
  deliveredCount: number,
  readCount: number,
): MessengerMessageDelivery["status"] {
  if (recipientCount > 0 && readCount >= recipientCount) return "read";
  if (recipientCount > 0 && deliveredCount >= recipientCount) {
    return "delivered";
  }
  return "sent";
}

/**
 * Delivery receipts are append-only on the server. A delayed REST response
 * must therefore never undo a newer realtime update on the phone.
 */
export function mergeMessengerDelivery(
  existing: MessengerMessageDelivery,
  incoming: MessengerMessageDelivery,
): MessengerMessageDelivery {
  const readCount = Math.max(existing.read_count, incoming.read_count);
  const deliveredCount = Math.max(
    existing.delivered_count,
    incoming.delivered_count,
    readCount,
  );
  const recipientCount = Math.max(
    existing.recipient_count,
    incoming.recipient_count,
    deliveredCount,
  );
  const countedStatus = deliveryStatusForCounts(
    recipientCount,
    deliveredCount,
    readCount,
  );
  const status = [existing.status, incoming.status, countedStatus].reduce(
    (latest, candidate) =>
      DELIVERY_STATUS_RANK[candidate] > DELIVERY_STATUS_RANK[latest]
        ? candidate
        : latest,
    "sent" as MessengerMessageDelivery["status"],
  );
  const merged: MessengerMessageDelivery = {
    status,
    recipient_count: recipientCount,
    delivered_count: deliveredCount,
    read_count: readCount,
  };
  if (
    existing.status === merged.status &&
    existing.recipient_count === merged.recipient_count &&
    existing.delivered_count === merged.delivered_count &&
    existing.read_count === merged.read_count
  ) {
    return existing;
  }
  if (
    incoming.status === merged.status &&
    incoming.recipient_count === merged.recipient_count &&
    incoming.delivered_count === merged.delivered_count &&
    incoming.read_count === merged.read_count
  ) {
    return incoming;
  }
  return merged;
}

/** Updates delivery metadata without inserting, removing or reordering feed rows. */
export function applyMessengerDeliveryUpdates(
  messages: MessengerMessage[],
  updates: readonly MessengerMessageDeliveryUpdate[],
): MessengerMessage[] {
  if (!updates.length) return messages;
  const byMessageId = new Map(
    updates.map((update) => [update.message_id, update.delivery] as const),
  );
  let changed = false;
  const next = messages.map((message) => {
    const incoming = byMessageId.get(message.id);
    if (!incoming) return message;
    const delivery = mergeMessengerDelivery(message.delivery, incoming);
    if (delivery === message.delivery) return message;
    changed = true;
    return { ...message, delivery };
  });
  return changed ? next : messages;
}

function normalizedSequence(value: string): string {
  return value.replace(/^0+/, "") || "0";
}

export function compareMessengerSequence(left: string, right: string): number {
  const normalizedLeft = normalizedSequence(left);
  const normalizedRight = normalizedSequence(right);
  if (normalizedLeft.length !== normalizedRight.length) {
    return normalizedLeft.length - normalizedRight.length;
  }
  return normalizedLeft.localeCompare(normalizedRight);
}

export function pendingMessengerMessage(
  item: MessengerOutboxItem,
  currentUser: MessengerUser,
  replyTarget?: MessengerMessage,
): MessengerMessage {
  return {
    id: `pending-${item.client_message_id}`,
    sequence: "0",
    room_id: item.room_id,
    client_message_id: item.client_message_id,
    kind: "text",
    text: item.text,
    created_at: item.created_at,
    edited_at: null,
    deleted_at: null,
    author: {
      id: currentUser.id,
      username: currentUser.username,
      display_name: currentUser.display_name,
      avatar_url: currentUser.avatar_url,
    },
    media: null,
    media_items: [],
    location: null,
    reply_to: replyTarget
      ? {
          id: replyTarget.id,
          room_id: replyTarget.room_id,
          sequence: replyTarget.sequence,
          kind: replyTarget.kind,
          text: replyTarget.text,
          deleted_at: replyTarget.deleted_at,
          author: {
            id: replyTarget.author.id,
            display_name: replyTarget.author.display_name,
          },
        }
      : null,
    forwarded_from: null,
    reactions: [],
    delivery: {
      status: "sent",
      recipient_count: 0,
      delivered_count: 0,
      read_count: 0,
    },
    pending: true,
    send_error: item.last_error,
    pending_attachment: null,
  };
}

function pendingAttachmentLabel(
  source: MessengerPendingAttachmentSource,
): string {
  if (source === "camera") return "Подготовка фотографии…";
  if (source === "library") return "Подготовка медиа…";
  if (source === "file") return "Подготовка файла…";
  return "Определяем геопозицию…";
}

export function pendingMessengerAttachmentMessage(
  roomId: string,
  clientMessageId: string,
  source: MessengerPendingAttachmentSource,
  caption: string,
  currentUser: MessengerUser,
  replyTarget?: MessengerMessage,
  attachments: {
    kind: "image" | "video" | "file";
    uri: string;
    name: string;
    type: string;
    size_bytes: number | null;
    original_size_bytes: number | null;
    width?: number;
    height?: number;
  }[] = [],
): MessengerMessage {
  const firstAttachment = attachments[0];
  const messageKind =
    source === "location"
      ? "location"
      : (firstAttachment?.kind ?? (source === "file" ? "file" : "image"));
  return {
    id: `pending-${clientMessageId}`,
    sequence: "0",
    room_id: roomId,
    client_message_id: clientMessageId,
    kind: messageKind,
    text: source === "location" ? "" : caption,
    created_at: new Date().toISOString(),
    edited_at: null,
    deleted_at: null,
    author: {
      id: currentUser.id,
      username: currentUser.username,
      display_name: currentUser.display_name,
      avatar_url: currentUser.avatar_url,
    },
    media: null,
    media_items: [],
    location: null,
    reply_to: replyTarget
      ? {
          id: replyTarget.id,
          room_id: replyTarget.room_id,
          sequence: replyTarget.sequence,
          kind: replyTarget.kind,
          text: replyTarget.text,
          deleted_at: replyTarget.deleted_at,
          author: {
            id: replyTarget.author.id,
            display_name: replyTarget.author.display_name,
          },
        }
      : null,
    forwarded_from: null,
    reactions: [],
    delivery: {
      status: "sent",
      recipient_count: 0,
      delivered_count: 0,
      read_count: 0,
    },
    pending: true,
    send_error: null,
    pending_attachment: {
      source,
      stage: "preparing",
      label: pendingAttachmentLabel(source),
      progress_percent: null,
      local_uri: firstAttachment?.uri ?? null,
      file_name: firstAttachment?.name ?? null,
      size_bytes: firstAttachment?.size_bytes ?? null,
      items: attachments.map((attachment) => ({
        kind: attachment.kind,
        local_uri: attachment.uri,
        file_name: attachment.name,
        mime_type: attachment.type,
        size_bytes: attachment.size_bytes,
        original_size_bytes: attachment.original_size_bytes,
        width: attachment.width,
        height: attachment.height,
      })),
    },
  };
}

type MessengerMergePlacement = "append" | "prepend";

function sameMessengerMessage(
  left: MessengerMessage,
  right: MessengerMessage,
): boolean {
  return (
    left.id === right.id || left.client_message_id === right.client_message_id
  );
}

function normalizedMessengerMessage(
  message: MessengerMessage,
): MessengerMessage {
  const mediaItems = message.media_items?.length
    ? message.media_items
    : message.media
      ? [message.media]
      : [];
  return {
    ...message,
    media: message.media ?? mediaItems[0] ?? null,
    media_items: mediaItems,
    pending: message.pending ?? false,
    send_error: message.pending ? message.send_error : null,
    pending_attachment: message.pending
      ? (message.pending_attachment ?? null)
      : null,
  };
}

function mergeMessengerMessage(
  existing: MessengerMessage,
  incoming: MessengerMessage,
  protectedReactionIds: ReadonlySet<string>,
): MessengerMessage {
  const mediaItems = incoming.media_items?.length
    ? incoming.media_items
    : incoming.media
      ? [incoming.media]
      : [];
  // Socket.IO can publish the committed server message before the HTTP upload
  // response reaches the sender. Keep the device-local preview during that
  // short interval instead of replacing it with a server URL and starting a
  // redundant download. The next confirmed merge (after cache seeding) clears
  // this local-only field because `existing.pending` is then already false.
  const committedLocalAttachment =
    !incoming.pending &&
    existing.pending &&
    existing.pending_attachment &&
    existing.pending_attachment.source !== "location"
      ? {
          ...existing.pending_attachment,
          stage: "committed" as const,
          label: "Отправлено",
          progress_percent: 100,
        }
      : null;
  return {
    ...existing,
    ...incoming,
    delivery: mergeMessengerDelivery(existing.delivery, incoming.delivery),
    media: incoming.media ?? mediaItems[0] ?? null,
    media_items: mediaItems,
    reactions: protectedReactionIds.has(incoming.id)
      ? existing.reactions
      : incoming.reactions,
    pending: incoming.pending ?? false,
    send_error: incoming.pending ? incoming.send_error : null,
    pending_attachment: incoming.pending
      ? (incoming.pending_attachment ?? existing.pending_attachment ?? null)
      : committedLocalAttachment,
  };
}

function mergeMessengerMessagesAt(
  current: MessengerMessage[],
  incoming: MessengerMessage[],
  protectedReactionIds: ReadonlySet<string>,
  placement: MessengerMergePlacement,
): MessengerMessage[] {
  const merged = [...current];
  const added: MessengerMessage[] = [];

  for (const nextMessage of incoming) {
    const existingIndex = merged.findIndex((existing) =>
      sameMessengerMessage(existing, nextMessage),
    );
    if (existingIndex >= 0) {
      merged[existingIndex] = mergeMessengerMessage(
        merged[existingIndex],
        nextMessage,
        protectedReactionIds,
      );
      continue;
    }

    const addedIndex = added.findIndex((existing) =>
      sameMessengerMessage(existing, nextMessage),
    );
    if (addedIndex >= 0) {
      added[addedIndex] = mergeMessengerMessage(
        added[addedIndex],
        nextMessage,
        protectedReactionIds,
      );
    } else {
      added.push(normalizedMessengerMessage(nextMessage));
    }
  }

  return placement === "prepend"
    ? [...added, ...merged]
    : [...merged, ...added];
}

/**
 * Reconciles live, optimistic and server-confirmed messages without changing
 * the position of a bubble that is already rendered. In particular, replacing
 * a pending message with the server copy only updates its delivery metadata;
 * it must never reorder the feed.
 */
export function mergeMessengerMessages(
  current: MessengerMessage[],
  incoming: MessengerMessage[],
  protectedReactionIds: ReadonlySet<string> = new Set(),
): MessengerMessage[] {
  return mergeMessengerMessagesAt(
    current,
    incoming,
    protectedReactionIds,
    "append",
  );
}

/**
 * Applies server changes only to bubbles already present in the current
 * window. This is used by mutation reconciliation: edits and tombstones must
 * be refreshed without appending a detached recent page or changing scroll
 * position when the user is reading older history.
 */
export function reconcileMessengerMessageUpdates(
  current: MessengerMessage[],
  incoming: MessengerMessage[],
  protectedReactionIds: ReadonlySet<string> = new Set(),
): MessengerMessage[] {
  if (!current.length || !incoming.length) return current;
  return current.map((existing) => {
    const replacement = incoming.find((candidate) =>
      sameMessengerMessage(existing, candidate),
    );
    return replacement
      ? mergeMessengerMessage(existing, replacement, protectedReactionIds)
      : existing;
  });
}

/** Adds an older, already sorted history page above the visible feed. */
export function prependMessengerMessages(
  current: MessengerMessage[],
  older: MessengerMessage[],
  protectedReactionIds: ReadonlySet<string> = new Set(),
): MessengerMessage[] {
  return mergeMessengerMessagesAt(
    current,
    older,
    protectedReactionIds,
    "prepend",
  );
}

export function firstUnreadMessengerMessage(
  messages: MessengerMessage[],
  lastReadSequence: string,
  currentUserId: string,
): MessengerMessage | null {
  return (
    messages.find(
      (message) =>
        !message.pending &&
        message.author.id !== currentUserId &&
        compareMessengerSequence(message.sequence, lastReadSequence) > 0,
    ) ?? null
  );
}

/**
 * Returns the newest confirmed message that was already covered by the local
 * room read cursor. Both the cursor and the messages come from SQLite during
 * the first render, so opening a room never has to wait for the network merely
 * to choose a stable scroll anchor.
 */
export function lastReadMessengerMessage(
  messages: MessengerMessage[],
  lastReadSequence: string,
): MessengerMessage | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (
      !message.pending &&
      compareMessengerSequence(message.sequence, lastReadSequence) <= 0
    ) {
      return message;
    }
  }
  return null;
}

export function applyOptimisticReaction(
  reactions: MessengerReaction[],
  nextReaction: string | null,
): MessengerReaction[] {
  const previousReaction = reactions.find((reaction) => reaction.reacted_by_me);
  const updated = reactions
    .map((reaction) => {
      if (!reaction.reacted_by_me) return reaction;
      return {
        ...reaction,
        count: Math.max(0, reaction.count - 1),
        reacted_by_me: false,
      };
    })
    .filter((reaction) => reaction.count > 0);

  if (!nextReaction || previousReaction?.reaction === nextReaction) {
    return updated;
  }

  const existing = updated.find(
    (reaction) => reaction.reaction === nextReaction,
  );
  if (existing) {
    return updated.map((reaction) =>
      reaction.reaction === nextReaction
        ? { ...reaction, count: reaction.count + 1, reacted_by_me: true }
        : reaction,
    );
  }
  return [
    ...updated,
    { reaction: nextReaction, count: 1, reacted_by_me: true },
  ];
}
