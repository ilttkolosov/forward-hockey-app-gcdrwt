import AsyncStorage from "@react-native-async-storage/async-storage";
import type { MessengerContactAlias } from "./types";
import { formatMessengerPlayerDisplayName } from "./playerIdentity";
import {
  clearMessengerAvatarIdentities,
  registerMessengerAvatarIdentity,
} from "./avatarIdentity";

const STORAGE_PREFIX = "messenger_contact_aliases:";

let ownerUserId: string | null = null;
let prepared = false;
let aliases = new Map<string, string>();

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

function normalizedEntries(
  entries: readonly Pick<MessengerContactAlias, "user_id" | "alias">[],
): Map<string, string> {
  return new Map(
    entries
      .map((entry) => [entry.user_id, entry.alias.trim()] as const)
      .filter((entry) => Boolean(entry[0] && entry[1])),
  );
}

export async function prepareMessengerAliases(userId: string): Promise<void> {
  if (prepared && ownerUserId === userId) return;
  ownerUserId = userId;
  prepared = false;
  aliases = new Map();
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    const cached = raw ? (JSON.parse(raw) as MessengerContactAlias[]) : [];
    if (ownerUserId === userId) aliases = normalizedEntries(cached);
  } catch {
    if (ownerUserId === userId) aliases = new Map();
  } finally {
    if (ownerUserId === userId) prepared = true;
  }
}

export async function replaceMessengerAliases(
  userId: string,
  entries: readonly MessengerContactAlias[],
): Promise<void> {
  if (ownerUserId !== userId) ownerUserId = userId;
  aliases = normalizedEntries(entries);
  prepared = true;
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(entries));
}

export async function updateMessengerAlias(
  userId: string,
  targetUserId: string,
  alias: string | null,
): Promise<void> {
  if (ownerUserId !== userId) await prepareMessengerAliases(userId);
  const next = new Map(aliases);
  const normalized = alias?.trim() || "";
  if (normalized) next.set(targetUserId, normalized);
  else next.delete(targetUserId);
  aliases = next;
  prepared = true;
  await AsyncStorage.setItem(
    storageKey(userId),
    JSON.stringify(
      [...next].map(([entryUserId, entryAlias]) => ({
        user_id: entryUserId,
        alias: entryAlias,
        updated_at: new Date().toISOString(),
      })),
    ),
  );
}

export function clearMessengerAliases(): void {
  ownerUserId = null;
  prepared = false;
  aliases = new Map();
  clearMessengerAvatarIdentities();
}

function transformedIdentity(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const identityId =
    typeof value.id === "string"
      ? value.id
      : typeof value.user_id === "string"
        ? value.user_id
        : null;
  if (!identityId || typeof value.display_name !== "string") return value;
  const original =
    typeof value.original_display_name === "string"
      ? value.original_display_name
      : value.display_name;
  const hasExplicitAlias = Object.prototype.hasOwnProperty.call(value, "alias");
  const explicitAlias =
    typeof value.alias === "string" && value.alias.trim()
      ? value.alias.trim()
      : null;
  const personalAlias = hasExplicitAlias
    ? explicitAlias
    : prepared
      ? (aliases.get(identityId) ?? null)
      : null;
  const displayName = formatMessengerPlayerDisplayName(
    personalAlias ?? original,
    value.player_id,
  );
  registerMessengerAvatarIdentity(
    identityId,
    original,
    personalAlias,
    displayName,
  );
  return {
    ...value,
    display_name: displayName,
    original_display_name: original,
    ...(hasExplicitAlias ? { alias: personalAlias } : {}),
  };
}

/** Applies the current viewer's aliases to API, realtime and SQLite objects. */
export function applyMessengerAliases<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => applyMessengerAliases(entry)) as T;
  }
  if (!value || typeof value !== "object") return value;
  const source = value as Record<string, unknown>;
  const recursivelyTransformed = Object.fromEntries(
    Object.entries(source).map(([key, entry]) => [
      key,
      applyMessengerAliases(entry),
    ]),
  );
  const identity = transformedIdentity(recursivelyTransformed);
  if (
    identity.room_type === "direct" &&
    identity.peer &&
    typeof identity.peer === "object"
  ) {
    const peer = identity.peer as Record<string, unknown>;
    if (typeof peer.display_name === "string") {
      return { ...identity, title: peer.display_name } as T;
    }
  }
  return identity as T;
}
