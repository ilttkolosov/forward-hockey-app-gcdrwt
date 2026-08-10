/**
 * Temporary diagnostic logging for messenger testing. Set to false after the
 * integration has stabilised. Never pass tokens, passwords, message text or
 * media contents to this logger.
 */
export const MESSENGER_DEBUG_LOGS_ENABLED = true;

type MessengerLogLevel = "debug" | "info" | "warn" | "error";
type MessengerLogContext = Record<
  string,
  string | number | boolean | null | undefined
>;

function compact(context: MessengerLogContext): MessengerLogContext {
  return Object.fromEntries(
    Object.entries(context).filter(([, value]) => value !== undefined),
  );
}

export function messengerLog(
  level: MessengerLogLevel,
  event: string,
  context: MessengerLogContext = {},
): void {
  if (!MESSENGER_DEBUG_LOGS_ENABLED) return;
  const prefix = `[Messenger][${event}]`;
  const payload = compact(context);
  if (level === "error") console.error(prefix, payload);
  else if (level === "warn") console.warn(prefix, payload);
  else console.log(prefix, payload);
}

export function messengerRequestId(): string {
  const timestamp = Date.now().toString(16);
  const random = `${Math.random().toString(16).slice(2)}${Math.random()
    .toString(16)
    .slice(2)}`;
  return `${timestamp}${random}`.slice(0, 32).padEnd(32, "0");
}
