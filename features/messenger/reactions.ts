import AsyncStorage from "@react-native-async-storage/async-storage";

const QUICK_REACTIONS_KEY = "messenger.quick-reactions.v1";
export const QUICK_REACTION_LIMIT = 6;

export const STANDARD_MESSENGER_REACTIONS = [
  "👍",
  "❤️",
  "😂",
  "🔥",
  "👏",
  "🏒",
  "😍",
  "🤩",
  "😮",
  "😢",
  "😡",
  "🤔",
  "🙏",
  "💪",
  "🎉",
  "💯",
  "✅",
  "❌",
  "👀",
  "🤝",
  "😎",
  "🥳",
  "🤯",
  "🫡",
  "🏆",
  "🥅",
  "⛸️",
  "🚀",
] as const;

export const DEFAULT_QUICK_REACTIONS = STANDARD_MESSENGER_REACTIONS.slice(
  0,
  QUICK_REACTION_LIMIT,
);

function validQuickReactions(value: unknown): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_QUICK_REACTIONS];
  const allowed = new Set<string>(STANDARD_MESSENGER_REACTIONS);
  const unique = value.filter(
    (reaction, index): reaction is string =>
      typeof reaction === "string" &&
      allowed.has(reaction) &&
      value.indexOf(reaction) === index,
  );
  return [...unique, ...DEFAULT_QUICK_REACTIONS]
    .filter(
      (reaction, index, reactions) => reactions.indexOf(reaction) === index,
    )
    .slice(0, QUICK_REACTION_LIMIT);
}

export async function loadQuickMessengerReactions(): Promise<string[]> {
  try {
    const stored = await AsyncStorage.getItem(QUICK_REACTIONS_KEY);
    return validQuickReactions(stored ? JSON.parse(stored) : null);
  } catch {
    return [...DEFAULT_QUICK_REACTIONS];
  }
}

export async function rememberQuickMessengerReaction(
  reaction: string,
  current: string[],
): Promise<string[]> {
  const next = validQuickReactions([
    reaction,
    ...current.filter((item) => item !== reaction),
  ]);
  await AsyncStorage.setItem(QUICK_REACTIONS_KEY, JSON.stringify(next));
  return next;
}
