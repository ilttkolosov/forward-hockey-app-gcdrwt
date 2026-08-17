import AsyncStorage from "@react-native-async-storage/async-storage";
import { STANDARD_MESSENGER_REACTIONS } from "../features/messenger/reactions";

export const MESSENGER_QUICK_REACTIONS = STANDARD_MESSENGER_REACTIONS;

export type MessengerQuickReaction = (typeof MESSENGER_QUICK_REACTIONS)[number];

export const DEFAULT_MESSENGER_QUICK_REACTION: MessengerQuickReaction = "👍";

function key(userId: string): string {
  return `messenger_quick_reaction:${userId}`;
}

export async function getMessengerQuickReaction(
  userId: string,
): Promise<MessengerQuickReaction> {
  const stored = await AsyncStorage.getItem(key(userId));
  return MESSENGER_QUICK_REACTIONS.includes(stored as MessengerQuickReaction)
    ? (stored as MessengerQuickReaction)
    : DEFAULT_MESSENGER_QUICK_REACTION;
}

export async function setMessengerQuickReaction(
  userId: string,
  reaction: MessengerQuickReaction,
): Promise<void> {
  await AsyncStorage.setItem(key(userId), reaction);
}
