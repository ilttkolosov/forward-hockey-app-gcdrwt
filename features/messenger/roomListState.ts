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

function newestRoomSnapshot(
  visibleRoom: MessengerRoom,
  cachedRoom: MessengerRoom,
): MessengerRoom {
  const cachedTail = cachedRoom.last_message;
  const visibleTail = visibleRoom.last_message;
  if (
    visibleTail &&
    (!cachedTail ||
      compareMessengerSequence(visibleTail.sequence, cachedTail.sequence) > 0)
  ) {
    return {
      ...cachedRoom,
      last_message: visibleTail,
      unread_count: Math.max(
        visibleRoom.unread_count,
        cachedRoom.unread_count,
      ),
    };
  }
  return cachedRoom;
}

/**
 * Reconciles the mounted room list with SQLite after any local message write.
 * The list screen remains mounted underneath an open room, so applying the
 * cache here makes its preview and ordering correct before the back animation
 * reveals it.
 */
export function mergeMessengerRoomSnapshots(
  visibleRooms: MessengerRoom[],
  cachedRooms: readonly MessengerRoom[],
): MessengerRoom[] {
  const visibleById = new Map(visibleRooms.map((room) => [room.id, room]));
  let changed = visibleRooms.length !== cachedRooms.length;
  const nextRooms = cachedRooms.map((cachedRoom) => {
    const visibleRoom = visibleById.get(cachedRoom.id);
    if (!visibleRoom) return cachedRoom;
    const nextRoom = newestRoomSnapshot(visibleRoom, cachedRoom);
    if (JSON.stringify(nextRoom) === JSON.stringify(visibleRoom)) {
      return visibleRoom;
    }
    changed = true;
    return nextRoom;
  });
  return changed ? nextRooms : visibleRooms;
}
