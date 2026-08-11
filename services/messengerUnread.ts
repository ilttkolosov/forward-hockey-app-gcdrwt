import * as Notifications from "expo-notifications";
import type { SQLiteDatabase } from "expo-sqlite";
import { useEffect, useState } from "react";
import {
  loadCachedMessengerRooms,
} from "../features/messenger/repository";
import type { MessengerRoom } from "../features/messenger/types";
import { messengerLog } from "./messengerLogger";

let currentUnreadCount = 0;
const listeners = new Set<(count: number) => void>();

function normalizedUnreadCount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

export function messengerUnreadTotal(rooms: readonly MessengerRoom[]): number {
  return rooms.reduce(
    (total, room) => total + normalizedUnreadCount(room.unread_count),
    0,
  );
}

export function getMessengerUnreadCount(): number {
  return currentUnreadCount;
}

export function subscribeMessengerUnreadCount(
  listener: (count: number) => void,
): () => void {
  listeners.add(listener);
  listener(currentUnreadCount);
  return () => listeners.delete(listener);
}

export async function setMessengerUnreadCount(value: number): Promise<number> {
  const next = normalizedUnreadCount(value);
  const changed = next !== currentUnreadCount;
  currentUnreadCount = next;
  if (changed) {
    for (const listener of listeners) listener(next);
  }
  try {
    await Notifications.setBadgeCountAsync(next);
  } catch (error) {
    messengerLog("debug", "badge.update.skipped", {
      unread_count: next,
      message: error instanceof Error ? error.message : String(error),
    });
  }
  return next;
}

export function syncMessengerUnreadFromRooms(
  rooms: readonly MessengerRoom[],
): Promise<number> {
  return setMessengerUnreadCount(messengerUnreadTotal(rooms));
}

export async function refreshMessengerUnreadFromCache(
  db: SQLiteDatabase,
): Promise<number> {
  return syncMessengerUnreadFromRooms(await loadCachedMessengerRooms(db));
}

export function useMessengerUnreadCount(): number {
  const [count, setCount] = useState(getMessengerUnreadCount);
  useEffect(() => subscribeMessengerUnreadCount(setCount), []);
  return count;
}
