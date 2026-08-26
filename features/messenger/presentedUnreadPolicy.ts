export interface PresentedMessengerMessage {
  messageId: string;
  sequence?: string;
}

function compareMessengerSequence(left: string, right: string): number {
  const normalizedLeft = left.replace(/^0+/, "") || "0";
  const normalizedRight = right.replace(/^0+/, "") || "0";
  if (normalizedLeft.length !== normalizedRight.length) {
    return normalizedLeft.length - normalizedRight.length;
  }
  return normalizedLeft.localeCompare(normalizedRight);
}

/**
 * Android may display PUSH notifications while its background JS task is
 * suspended. Every still-present unique message is therefore a durable lower
 * bound for the unread badge of its room. Messages already covered by the
 * local read cursor must never resurrect that badge.
 */
export function presentedMessengerUnreadFloor(
  messages: readonly PresentedMessengerMessage[],
  lastReadSequence: string,
): number {
  const unreadMessageIds = new Set<string>();
  for (const message of messages) {
    if (!message.messageId) continue;
    if (
      message.sequence &&
      compareMessengerSequence(message.sequence, lastReadSequence) <= 0
    ) {
      continue;
    }
    unreadMessageIds.add(message.messageId);
  }
  return unreadMessageIds.size;
}

export function recoveredMessengerRoomUnreadFloor(
  cachedMessageCount: number,
  presentedMessageCount: number,
): number {
  const normalize = (value: number) =>
    Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return Math.max(
    normalize(cachedMessageCount),
    normalize(presentedMessageCount),
  );
}
