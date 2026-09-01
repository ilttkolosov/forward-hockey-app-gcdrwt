interface MessengerAvatarCandidate {
  player_id?: number | null;
  avatar_url?: string | null;
}

/**
 * Returns a validated player ID only for a newly registered account that does
 * not already have an avatar. Missing fields keep older servers compatible.
 */
export function automaticMessengerAvatarPlayerId(
  user: MessengerAvatarCandidate,
): number | null {
  if (user.avatar_url) return null;
  return typeof user.player_id === "number" &&
    Number.isSafeInteger(user.player_id) &&
    user.player_id > 0
    ? user.player_id
    : null;
}
