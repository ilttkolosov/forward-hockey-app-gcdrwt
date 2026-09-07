import type { MessengerMessage } from "./types";

export interface MessengerPin {
  message: MessengerMessage;
  pinned_at: string;
  pinned_by_user_id: string | null;
}

/** Order by message chronology without losing bigint precision. */
export function orderedMessengerPins(
  items: readonly MessengerPin[],
): MessengerPin[] {
  const unique = new Map<string, MessengerPin>();
  for (const pin of items) {
    if (!pin.message.deleted_at && pin.message.kind !== "system")
      unique.set(pin.message.id, pin);
  }
  return [...unique.values()].sort((a, b) => {
    const left = a.message.sequence.replace(/^0+(?=\d)/, "");
    const right = b.message.sequence.replace(/^0+(?=\d)/, "");
    return (
      right.length - left.length ||
      (left < right ? 1 : left > right ? -1 : 0) ||
      b.message.id.localeCompare(a.message.id)
    );
  });
}

export function pinnedMessengerPreview(
  message: Pick<MessengerMessage, "text" | "kind">,
): string {
  const line =
    (message.text || "")
      .replace(/[\u2060-\u2063]/g, "")
      .split(/\r\n|[\n\r\u2028\u2029]/, 1)[0]
      ?.trim() || "";
  const fallback = {
    text: "Текстовое сообщение",
    image: "Фото",
    video: "Видео",
    file: "Файл",
    location: "Геопозиция",
    system: "Служебное сообщение",
  };
  const characters = Array.from(line || fallback[message.kind] || "Сообщение");
  return characters.length > 120
    ? `${characters.slice(0, 120).join("")}…`
    : characters.join("");
}

export function currentMessengerPinId(
  items: readonly MessengerPin[],
  selectedId: string | null,
): string | null {
  return items.some((pin) => pin.message.id === selectedId)
    ? selectedId
    : (items[0]?.message.id ?? null);
}

export function nextMessengerPinId(
  items: readonly MessengerPin[],
  visitedId: string,
): string | null {
  const index = items.findIndex((pin) => pin.message.id === visitedId);
  return items.length ? items[(index + 1) % items.length]!.message.id : null;
}
