import type { MessengerPin } from "../features/messenger/pins";
import { applyMessengerAliases } from "../features/messenger/aliases";
import { messengerRequest } from "./messengerApi";

export async function getMessengerPins(
  roomId: string,
): Promise<{ can_pin: boolean; items: MessengerPin[] }> {
  const result = await messengerRequest<{
    can_pin: boolean;
    items: MessengerPin[];
  }>(`/chat/rooms/${encodeURIComponent(roomId)}/pins`, {
    transportPriority: "background",
  });
  return {
    ...result,
    items: result.items.map((pin) => ({
      ...pin,
      message: applyMessengerAliases(pin.message),
    })),
  };
}

export function setMessengerMessagePinned(
  roomId: string,
  messageId: string,
  pinned: boolean,
) {
  return messengerRequest<{
    room_id: string;
    message_id: string;
    pinned: boolean;
    changed: boolean;
  }>(
    `/chat/rooms/${encodeURIComponent(roomId)}/pins/${encodeURIComponent(messageId)}`,
    { method: pinned ? "PUT" : "DELETE", transportPriority: "foreground" },
  );
}
