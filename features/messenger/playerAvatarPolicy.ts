interface MessengerAvatarCandidate {
  player_id?: unknown;
}

function normalizePlayerId(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) return null;
  const normalized = Number(value.trim());
  return Number.isSafeInteger(normalized) && normalized > 0 ? normalized : null;
}

/**
 * Returns the first validated player ID available during registration.
 * The authenticated user is the primary source; the invitation preview is a
 * fallback for older server responses. A preset avatar must never block the
 * player's local photo from replacing it.
 */
export function automaticMessengerAvatarPlayerId(
  ...candidates: readonly MessengerAvatarCandidate[]
): number | null {
  for (const candidate of candidates) {
    const playerId = normalizePlayerId(candidate.player_id);
    if (playerId !== null) return playerId;
  }
  return null;
}
