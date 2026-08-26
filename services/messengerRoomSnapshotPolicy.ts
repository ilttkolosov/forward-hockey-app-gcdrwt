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

export function shouldReuseMessengerRoomsRequest(options: {
  force: boolean;
  priority: MessengerTransportPriority;
  inFlightPriority: MessengerTransportPriority | null;
}): boolean {
  if (options.force || options.inFlightPriority === null) return false;
  return !(
    options.priority === "foreground" &&
    options.inFlightPriority === "background"
  );
}
