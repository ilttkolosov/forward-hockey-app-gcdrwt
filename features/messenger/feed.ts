import type {
  MessengerMessage,
  MessengerOutboxItem,
  MessengerPendingAttachmentSource,
  MessengerReaction,
  MessengerUser,
} from "./types";

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
    location: null,
    reply_to: replyTarget
      ? {
          id: replyTarget.id,
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
): MessengerMessage {
  return {
    id: `pending-${clientMessageId}`,
    sequence: "0",
    room_id: roomId,
    client_message_id: clientMessageId,
    kind:
      source === "location" ? "location" : source === "file" ? "file" : "image",
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
    location: null,
    reply_to: replyTarget
      ? {
          id: replyTarget.id,
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
      local_uri: null,
      file_name: null,
      size_bytes: null,
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
  return {
    ...message,
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
  return {
    ...existing,
    ...incoming,
    reactions: protectedReactionIds.has(incoming.id)
      ? existing.reactions
      : incoming.reactions,
    pending: incoming.pending ?? false,
    send_error: incoming.pending ? incoming.send_error : null,
    pending_attachment: incoming.pending
      ? (incoming.pending_attachment ?? existing.pending_attachment ?? null)
      : null,
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
