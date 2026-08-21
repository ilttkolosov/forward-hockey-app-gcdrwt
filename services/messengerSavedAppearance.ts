import AsyncStorage from "@react-native-async-storage/async-storage";

export const SAVED_MESSAGE_ICONS = [
  "star",
  "bookmark",
  "heart",
  "archive",
  "folder",
  "cloud",
] as const;

export const SAVED_MESSAGE_COLORS = [
  "#F28C28",
  "#377FD4",
  "#4F9D69",
  "#8257C2",
  "#D15473",
  "#5B6B7A",
] as const;

export type SavedMessageIcon = (typeof SAVED_MESSAGE_ICONS)[number];
export type SavedMessageColor = (typeof SAVED_MESSAGE_COLORS)[number];

export interface MessengerSavedAppearance {
  icon: SavedMessageIcon;
  backgroundColor: SavedMessageColor;
}

const listeners = new Map<
  string,
  Set<(appearance: MessengerSavedAppearance) => void>
>();

export const DEFAULT_SAVED_APPEARANCE: MessengerSavedAppearance = {
  icon: "star",
  backgroundColor: "#F28C28",
};

function key(userId: string): string {
  return `messenger_saved_appearance:${userId}`;
}

export async function getMessengerSavedAppearance(
  userId: string,
): Promise<MessengerSavedAppearance> {
  const stored = await AsyncStorage.getItem(key(userId));
  if (!stored) return DEFAULT_SAVED_APPEARANCE;
  try {
    const parsed = JSON.parse(stored) as Partial<MessengerSavedAppearance>;
    return {
      icon: SAVED_MESSAGE_ICONS.includes(parsed.icon as SavedMessageIcon)
        ? (parsed.icon as SavedMessageIcon)
        : DEFAULT_SAVED_APPEARANCE.icon,
      backgroundColor: SAVED_MESSAGE_COLORS.includes(
        parsed.backgroundColor as SavedMessageColor,
      )
        ? (parsed.backgroundColor as SavedMessageColor)
        : DEFAULT_SAVED_APPEARANCE.backgroundColor,
    };
  } catch {
    return DEFAULT_SAVED_APPEARANCE;
  }
}

export async function setMessengerSavedAppearance(
  userId: string,
  appearance: MessengerSavedAppearance,
): Promise<void> {
  const storageKey = key(userId);
  await AsyncStorage.setItem(storageKey, JSON.stringify(appearance));
  listeners.get(storageKey)?.forEach((listener) => listener(appearance));
}

export function subscribeMessengerSavedAppearance(
  userId: string,
  listener: (appearance: MessengerSavedAppearance) => void,
): () => void {
  const storageKey = key(userId);
  const userListeners = listeners.get(storageKey) || new Set();
  userListeners.add(listener);
  listeners.set(storageKey, userListeners);
  return () => {
    userListeners.delete(listener);
    if (!userListeners.size) listeners.delete(storageKey);
  };
}
