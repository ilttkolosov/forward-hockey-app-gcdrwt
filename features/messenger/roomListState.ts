import type { MessengerRoom } from "./types";

function compareMessengerSequence(left: string, right: string): number {
  const normalizedLeft = left.replace(/^0+/, "") || "0";
  const normalizedRight = right.replace(/^0+/, "") || "0";
  if (normalizedLeft.length !== normalizedRight.length) {
    return normalizedLeft.length - normalizedRight.length;
  }
  return normalizedLeft.localeCompare(normalizedRight);
}

/**
 * Applies read progress written by the room screen without replacing the
 * already rendered room cards. Keeping the visible objects also keeps avatar
 * and title state stable during the back transition.
 */
export function mergeMessengerRoomReadState(
  visibleRooms: MessengerRoom[],
  cachedRooms: readonly MessengerRoom[],
): MessengerRoom[] {
  const cachedById = new Map(cachedRooms.map((room) => [room.id, room]));
  let changed = false;
  const nextRooms = visibleRooms.map((visibleRoom) => {
    const cachedRoom = cachedById.get(visibleRoom.id);
    if (
      !cachedRoom ||
      compareMessengerSequence(
        cachedRoom.last_read_sequence,
        visibleRoom.last_read_sequence,
      ) <= 0
    ) {
      return visibleRoom;
    }
    changed = true;
    return {
      ...visibleRoom,
      last_read_sequence: cachedRoom.last_read_sequence,
      unread_count: cachedRoom.unread_count,
    };
  });
  return changed ? nextRooms : visibleRooms;
}
