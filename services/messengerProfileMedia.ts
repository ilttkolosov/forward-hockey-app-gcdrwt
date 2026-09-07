import type { MessengerMessage } from "../features/messenger/types";
import {
  getMessengerMessages,
  MessengerApiError,
  messengerRequest,
} from "./messengerApi";

export interface MessengerRoomMediaPage {
  items: MessengerMessage[];
  page: {
    has_more: boolean;
    next_cursor: string | null;
  };
}

/**
 * Uses the dedicated media endpoint when the server supports it. During a
 * rolling deployment an older server can still serve the same view from the
 * existing message-history API, so the new client does not require a lockstep
 * backend upgrade.
 */
export async function getMessengerRoomMediaPage(
  roomId: string,
  cursor?: string | null,
): Promise<MessengerRoomMediaPage> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  try {
    return await messengerRequest<MessengerRoomMediaPage>(
      `/chat/rooms/${encodeURIComponent(roomId)}/media${query}`,
      { transportPriority: "foreground" },
    );
  } catch (error) {
    if (!(error instanceof MessengerApiError) || error.status !== 404) {
      throw error;
    }
  }

  const legacy = await getMessengerMessages(roomId, {
    cursor: cursor || undefined,
    direction: cursor ? "before" : undefined,
    limit: 100,
    priority: "foreground",
  });
  return {
    items: legacy.items
      .filter((message) => message.media_items?.length || message.media)
      .reverse(),
    page: {
      has_more: legacy.page.has_more,
      next_cursor: legacy.page.has_more ? legacy.page.oldest_sequence : null,
    },
  };
}
