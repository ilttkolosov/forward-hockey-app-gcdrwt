export interface MessengerPlayerIdentitySource {
  id: number | string;
  number: number | null | undefined;
}

let playerNumbers = new Map<string, string>();

function normalizePlayerId(value: unknown): string | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  }
  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) return null;
  const normalized = Number(value);
  return Number.isSafeInteger(normalized) && normalized > 0
    ? String(normalized)
    : null;
}

function normalizeJerseyNumber(value: unknown): string | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
    ? String(value)
    : null;
}

/** Replaces the local player-to-number reference atomically after a DB refresh. */
export function replaceMessengerPlayerNumbers(
  players: readonly MessengerPlayerIdentitySource[],
): void {
  const next = new Map<string, string>();
  for (const player of players) {
    const playerId = normalizePlayerId(player.id);
    const jerseyNumber = normalizeJerseyNumber(player.number);
    if (playerId && jerseyNumber !== null) next.set(playerId, jerseyNumber);
  }
  playerNumbers = next;
}

/**
 * Adds a locally resolved jersey number. Missing fields are deliberately
 * ignored so clients remain compatible with older servers and partial data.
 */
export function formatMessengerPlayerDisplayName(
  displayName: string,
  playerId: unknown,
): string {
  const normalizedPlayerId = normalizePlayerId(playerId);
  if (!normalizedPlayerId) return displayName;
  const jerseyNumber = playerNumbers.get(normalizedPlayerId);
  if (jerseyNumber === undefined) return displayName;
  const suffix = ` #${jerseyNumber}`;
  return displayName.endsWith(suffix) ? displayName : `${displayName}${suffix}`;
}
