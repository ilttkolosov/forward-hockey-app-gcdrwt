export type MessengerRoomConnectionStatus =
  | "connecting"
  | "sync_error"
  | "ready";

export interface MessengerRoomConnectionStatusInput {
  initialDataReady: boolean;
  roomDetailsReady: boolean;
  roomTypeReady: boolean;
  realtimeConnected: boolean;
  syncError: string | null;
}

/**
 * Reconnecting is a normal transport state, including token rotation after
 * the app returns from the background. A previous REST failure must not win
 * over that state and flash a synchronization error while recovery is still
 * running. Only an authenticated, otherwise-ready room may expose a genuine
 * synchronization failure.
 */
export function messengerRoomConnectionStatus(
  input: MessengerRoomConnectionStatusInput,
): MessengerRoomConnectionStatus {
  if (
    !input.initialDataReady ||
    !input.roomDetailsReady ||
    !input.roomTypeReady ||
    !input.realtimeConnected
  ) {
    return "connecting";
  }
  return input.syncError ? "sync_error" : "ready";
}
