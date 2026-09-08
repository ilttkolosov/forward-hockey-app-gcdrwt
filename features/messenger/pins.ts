import type { MessengerMedia, MessengerMessage } from "./types";

export interface MessengerPin {
  message: MessengerMessage;
  pinned_at: string;
  pinned_by_user_id: string | null;
}
function messageTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}
/** Oldest MESSAGE first. Pin/edit time is deliberately not an ordering key. */
export function orderedMessengerPins(
  items: readonly MessengerPin[],
): MessengerPin[] {
  const unique = new Map<string, MessengerPin>();
  for (const pin of items) {
    if (!pin.message.deleted_at && pin.message.kind !== "system")
      unique.set(pin.message.id, pin);
  }
  return [...unique.values()].sort((a, b) => {
    const time =
      messageTimestamp(a.message.created_at) -
      messageTimestamp(b.message.created_at);
    if (time) return time;
    // Stable tie breaker for equal/missing timestamps; never round bigint cursors.
    const left = a.message.sequence.replace(/^0+(?=\d)/, "");
    const right = b.message.sequence.replace(/^0+(?=\d)/, "");
    return (
      left.length - right.length ||
      (left < right ? -1 : left > right ? 1 : 0) ||
      a.message.id.localeCompare(b.message.id)
    );
  });
}
type PinMediaMessage = Pick<MessengerMessage, "media" | "media_items">;
export function pinnedMessengerMedia(
  message: Partial<PinMediaMessage>,
): MessengerMedia | null {
  const items = message.media_items?.length
    ? message.media_items
    : message.media
      ? [message.media]
      : [];
  return (
    items.find((media) => media.type === "image" || media.type === "video") ??
    null
  );
}
export function pinnedMessengerPreview(
  message: Pick<MessengerMessage, "text" | "kind"> & Partial<PinMediaMessage>,
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
  const kind = pinnedMessengerMedia(message)?.type ?? message.kind;
  const characters = Array.from(line || fallback[kind] || "Сообщение");
  return characters.length > 120
    ? `${characters.slice(0, 120).join("")}…`
    : characters.join("");
}
/** Null selection follows the newest message, including asynchronously loaded pins. */
export function currentMessengerPinId(
  items: readonly MessengerPin[],
  selectedId: string | null,
): string | null {
  return items.some((pin) => pin.message.id === selectedId)
    ? selectedId
    : (items.at(-1)?.message.id ?? null);
}
export function nextMessengerPinId(
  items: readonly MessengerPin[],
  visitedId: string,
): string | null {
  const index = items.findIndex((pin) => pin.message.id === visitedId);
  return items.length ? items[(index + 1) % items.length]!.message.id : null;
}
/** The bottom of an older cached page or an author filter is NOT the chat bottom. */
export function shouldResetPinAtLatest(options: {
  distanceFromBottom: number;
  listReady: boolean;
  userScrolled: boolean;
  filtered: boolean;
  navigating: boolean;
  loadedSequence: string | null;
  latestSequence: string | null;
  hasMoreNewer: boolean;
}): boolean {
  if (
    !options.listReady ||
    !options.userScrolled ||
    options.filtered ||
    options.navigating ||
    options.distanceFromBottom > 4
  )
    return false;
  if (!options.latestSequence) return !options.hasMoreNewer;
  if (!options.loadedSequence) return false;
  const left = options.loadedSequence.replace(/^0+(?=\d)/, "");
  const right = options.latestSequence.replace(/^0+(?=\d)/, "");
  return (
    left.length > right.length ||
    (left.length === right.length && left >= right)
  );
}
