import type {
  MessengerMessage,
  MessengerOutboxItem,
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
  };
}

function messageOrder(left: MessengerMessage, right: MessengerMessage): number {
  if (left.pending !== right.pending) return left.pending ? 1 : -1;
  if (!left.pending && !right.pending) {
    const bySequence = compareMessengerSequence(left.sequence, right.sequence);
    if (bySequence !== 0) return bySequence;
  }
  const byCreatedAt = left.created_at.localeCompare(right.created_at);
  if (byCreatedAt !== 0) return byCreatedAt;
  return left.client_message_id.localeCompare(right.client_message_id);
}

export function mergeMessengerMessages(
  current: MessengerMessage[],
  incoming: MessengerMessage[],
  protectedReactionIds: ReadonlySet<string> = new Set(),
): MessengerMessage[] {
  const merged = [...current];

  for (const nextMessage of incoming) {
    const index = merged.findIndex(
      (existing) =>
        existing.id === nextMessage.id ||
        existing.client_message_id === nextMessage.client_message_id,
    );
    if (index < 0) {
      merged.push({
        ...nextMessage,
        pending: nextMessage.pending ?? false,
        send_error: nextMessage.pending ? nextMessage.send_error : null,
      });
      continue;
    }

    const existing = merged[index];
    merged[index] = {
      ...existing,
      ...nextMessage,
      reactions: protectedReactionIds.has(nextMessage.id)
        ? existing.reactions
        : nextMessage.reactions,
      pending: nextMessage.pending ?? false,
      send_error: nextMessage.pending ? nextMessage.send_error : null,
    };
  }

  const unique = new Map<string, MessengerMessage>();
  for (const message of merged) {
    const key = message.client_message_id || message.id;
    const existing = unique.get(key);
    if (!existing || (existing.pending && !message.pending)) {
      unique.set(key, message);
    }
  }
  return [...unique.values()].sort(messageOrder);
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
