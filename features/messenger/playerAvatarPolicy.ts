interface MessengerAvatarCandidate {
  player_id?: number | null;
}

/**
 * Returns a validated player ID for the account created in the current
 * registration flow. A server-assigned preset avatar must be replaced by the
 * player's local photo. Missing fields keep older servers compatible.
 */
export function automaticMessengerAvatarPlayerId(
  user: MessengerAvatarCandidate,
): number | null {
  return typeof user.player_id === "number" &&
    Number.isSafeInteger(user.player_id) &&
    user.player_id > 0
    ? user.player_id
    : null;
}
