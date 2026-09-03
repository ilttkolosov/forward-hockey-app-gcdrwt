import type { MessengerMessage, MessengerRoom } from "./types";

export const SCHEDULE_BOT_USER_ID = "00000000-0000-4000-8000-000000000027";
export const MESSAGE_MUTATION_WINDOW_MS = 3 * 60 * 1000;

function coachScheduleAnnouncementMutationAvailable(
  message: MessengerMessage,
  currentUserId: string | undefined,
  roomKind: string | null,
  canManageRoom: boolean,
): boolean {
  return Boolean(
    currentUserId &&
      canManageRoom &&
      (roomKind === "coach_team" || roomKind === "coach_parents") &&
      (message.author.id === currentUserId ||
        message.author.id === SCHEDULE_BOT_USER_ID),
  );
}

export function messageMutationAvailable(
  message: MessengerMessage,
  currentUserId: string | undefined,
  roomKind: string | null,
  canManageRoom: boolean,
): boolean {
  if (message.pending || message.deleted_at || message.kind === "system") {
    return false;
  }
  if (
    coachScheduleAnnouncementMutationAvailable(
      message,
      currentUserId,
      roomKind,
      canManageRoom,
    )
  ) {
    return true;
  }
  if (message.author.id !== currentUserId) return false;

  const createdAt = Date.parse(message.created_at);
  if (!Number.isFinite(createdAt)) return false;
  const age = Date.now() - createdAt;
  return age >= 0 && age <= MESSAGE_MUTATION_WINDOW_MS;
}

export function messageDeletionAvailable(
  message: MessengerMessage,
  currentUserId: string | undefined,
  roomType: MessengerRoom["room_type"] | null,
  roomKind: string | null,
  canManageRoom: boolean,
): boolean {
  if (message.pending || message.deleted_at || message.kind === "system") {
    return false;
  }
  if (
    coachScheduleAnnouncementMutationAvailable(
      message,
      currentUserId,
      roomKind,
      canManageRoom,
    )
  ) {
    return true;
  }
  if (message.author.id !== currentUserId) return false;

  return (
    roomType === "saved" ||
    messageMutationAvailable(
      message,
      currentUserId,
      roomKind,
      canManageRoom,
    )
  );
}
