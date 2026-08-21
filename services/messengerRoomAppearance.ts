import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  MESSENGER_PRESET_AVATARS,
  type MessengerPresetAvatar,
} from "../features/messenger/presetAvatars";

const listeners = new Map<string, Set<(presetId: string | null) => void>>();

function key(userId: string, roomId: string): string {
  return `messenger_room_avatar:${userId}:${roomId}`;
}

export async function getLocalMessengerRoomAvatar(
  userId: string,
  roomId: string,
): Promise<string | null> {
  const stored = await AsyncStorage.getItem(key(userId, roomId));
  return MESSENGER_PRESET_AVATARS.some((preset) => preset.id === stored)
    ? stored
    : null;
}

export async function setLocalMessengerRoomAvatar(
  userId: string,
  roomId: string,
  presetId: string | null,
): Promise<void> {
  const storageKey = key(userId, roomId);
  if (presetId) await AsyncStorage.setItem(storageKey, presetId);
  else await AsyncStorage.removeItem(storageKey);
  listeners.get(storageKey)?.forEach((listener) => listener(presetId));
}

export function subscribeLocalMessengerRoomAvatar(
  userId: string,
  roomId: string,
  listener: (presetId: string | null) => void,
): () => void {
  const storageKey = key(userId, roomId);
  const roomListeners = listeners.get(storageKey) || new Set();
  roomListeners.add(listener);
  listeners.set(storageKey, roomListeners);
  return () => {
    roomListeners.delete(listener);
    if (!roomListeners.size) listeners.delete(storageKey);
  };
}

export function messengerRoomAvatarPreset(
  presetId: string | null,
): MessengerPresetAvatar | null {
  return (
    MESSENGER_PRESET_AVATARS.find((preset) => preset.id === presetId) || null
  );
}
