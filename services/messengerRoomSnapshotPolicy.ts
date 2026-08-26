import type { MessengerTransportPriority } from "./messengerTransport";

export function shouldReuseMessengerRoomsSnapshot(options: {
  priority: MessengerTransportPriority;
  force: boolean;
  receivedAt: number | null;
  now: number;
  maxAgeMs: number;
}): boolean {
  return (
    !options.force &&
    options.priority === "background" &&
    options.receivedAt !== null &&
    options.now - options.receivedAt < options.maxAgeMs
  );
}
