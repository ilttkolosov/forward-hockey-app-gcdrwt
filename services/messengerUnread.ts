import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import type { SQLiteDatabase } from "expo-sqlite";
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { loadCachedMessengerRooms } from "../features/messenger/repository";
import type { MessengerRoom } from "../features/messenger/types";
import { messengerLog } from "./messengerLogger";
import {
  normalizeMessengerUnreadCount,
  reconcileMessengerUnreadCount,
  type MessengerUnreadSource,
} from "./messengerUnreadPolicy";
import { remotePushNotificationsSupported } from "./runtimeEnvironment";

const MESSENGER_UNREAD_COUNT_PREFIX = "messenger_unread_count:";

let currentUnreadCount = 0;
let currentUnreadUserId: string | null = null;
let unreadSessionGeneration = 0;
let unreadAuthoritativeRevision = 0;
let hasAuthoritativeUnreadSnapshot = false;
let badgeUpdateQueue: Promise<void> = Promise.resolve();
let persistenceQueue: Promise<void> = Promise.resolve();
let badgeUnsupportedReported = false;
const listeners = new Set<(count: number) => void>();

function unreadCountKey(userId: string): string {
  return `${MESSENGER_UNREAD_COUNT_PREFIX}${userId}`;
}

function notifyUnreadListeners(count: number): void {
  for (const listener of listeners) listener(count);
}

function enqueueUnreadPersistence(userId: string, count: number): Promise<void> {
  const operation = persistenceQueue
    .catch(() => undefined)
    .then(() => AsyncStorage.setItem(unreadCountKey(userId), String(count)));
  persistenceQueue = operation.catch((error) => {
    messengerLog("debug", "badge.persistence.deferred", {
      unread_count: count,
      message: error instanceof Error ? error.message : String(error),
    });
  });
  return operation;
}

function enqueueNativeBadgeUpdate(source: MessengerUnreadSource): Promise<void> {
  if (!remotePushNotificationsSupported) return Promise.resolve();
  const operation = badgeUpdateQueue
    .catch(() => undefined)
    .then(async () => {
      // Read the latest value when the serialized native operation starts. A
      // slower earlier call can therefore never overwrite a newer read/push.
      const unreadCount = currentUnreadCount;
      const supported = await Notifications.setBadgeCountAsync(unreadCount);
      if (!supported && !badgeUnsupportedReported) {
        badgeUnsupportedReported = true;
        messengerLog("warn", "badge.update.unsupported", {
          platform: Platform.OS,
          source,
          unread_count: unreadCount,
        });
      } else if (supported) {
        badgeUnsupportedReported = false;
      }
    });
  badgeUpdateQueue = operation.catch((error) => {
    messengerLog("debug", "badge.update.deferred", {
      platform: Platform.OS,
      source,
      unread_count: currentUnreadCount,
      message: error instanceof Error ? error.message : String(error),
    });
  });
  return operation;
}

export function messengerUnreadTotal(rooms: readonly MessengerRoom[]): number {
  return rooms.reduce(
    (total, room) =>
      total + normalizeMessengerUnreadCount(room.unread_count),
    0,
  );
}

export function getMessengerUnreadCount(): number {
  return currentUnreadCount;
}

/**
 * Restores a positive launcher badge after the application activity leaves
 * the foreground. Some Android launchers clear their badge merely because the
 * activity was opened, even though no messenger room was read.
 */
export async function reapplyMessengerUnreadBadge(): Promise<number> {
  const unreadCount = currentUnreadCount;
  if (unreadCount <= 0) return unreadCount;

  const persistence = currentUnreadUserId
    ? enqueueUnreadPersistence(currentUnreadUserId, unreadCount)
    : Promise.resolve();
  await Promise.allSettled([
    persistence,
    enqueueNativeBadgeUpdate("system"),
  ]);
  messengerLog("debug", "badge.lifecycle.reapplied", {
    platform: Platform.OS,
    unread_count: currentUnreadCount,
  });
  return currentUnreadCount;
}

export function subscribeMessengerUnreadCount(
  listener: (count: number) => void,
): () => void {
  listeners.add(listener);
  listener(currentUnreadCount);
  return () => listeners.delete(listener);
}

/**
 * Starts a user-scoped unread lifecycle without touching the native badge.
 * The first session keeps a count already supplied by a background push; a
 * real account switch starts from zero and is then hydrated for that user.
 */
export function beginMessengerUnreadSession(userId: string): void {
  if (currentUnreadUserId === userId) return;
  const shouldReset = currentUnreadUserId !== null;
  currentUnreadUserId = userId;
  unreadSessionGeneration += 1;
  unreadAuthoritativeRevision = 0;
  hasAuthoritativeUnreadSnapshot = false;
  if (shouldReset && currentUnreadCount !== 0) {
    currentUnreadCount = 0;
    notifyUnreadListeners(0);
  }
}

/** Restores the best known count before the first authoritative room request. */
export async function hydrateMessengerUnreadSession(
  userId: string,
): Promise<number> {
  beginMessengerUnreadSession(userId);
  const generation = unreadSessionGeneration;
  const authoritativeRevision = unreadAuthoritativeRevision;
  const [storedResult, systemResult] = await Promise.allSettled([
    AsyncStorage.getItem(unreadCountKey(userId)),
    remotePushNotificationsSupported
      ? Notifications.getBadgeCountAsync()
      : Promise.resolve(0),
  ]);
  if (
    currentUnreadUserId !== userId ||
    unreadSessionGeneration !== generation ||
    unreadAuthoritativeRevision !== authoritativeRevision
  ) {
    return currentUnreadCount;
  }
  const storedCount =
    storedResult.status === "fulfilled"
      ? normalizeMessengerUnreadCount(Number(storedResult.value))
      : 0;
  const systemCount =
    systemResult.status === "fulfilled"
      ? normalizeMessengerUnreadCount(systemResult.value)
      : 0;
  if (storedResult.status === "rejected") {
    messengerLog("debug", "badge.persistence.restore_deferred", {
      message:
        storedResult.reason instanceof Error
          ? storedResult.reason.message
          : String(storedResult.reason),
    });
  }
  if (systemResult.status === "rejected") {
    messengerLog("debug", "badge.system.restore_deferred", {
      platform: Platform.OS,
      message:
        systemResult.reason instanceof Error
          ? systemResult.reason.message
          : String(systemResult.reason),
    });
  }
  const restored = Math.max(storedCount, systemCount);
  const next = await setMessengerUnreadCount(restored, "stored");
  messengerLog("info", "badge.session.hydrated", {
    stored_count: storedCount,
    system_count: systemCount,
    unread_count: next,
  });
  return next;
}

export async function clearMessengerUnreadSession(): Promise<void> {
  const previousUserId = currentUnreadUserId;
  currentUnreadUserId = null;
  unreadSessionGeneration += 1;
  hasAuthoritativeUnreadSnapshot = false;
  await setMessengerUnreadCount(0, "logout");
  if (previousUserId) {
    await enqueueUnreadPersistence(previousUserId, 0).catch(() => undefined);
  }
}

export async function setMessengerUnreadCount(
  value: number,
  source: MessengerUnreadSource = "authoritative",
): Promise<number> {
  if (
    source === "authoritative" ||
    source === "local-read" ||
    source === "logout"
  ) {
    unreadAuthoritativeRevision += 1;
  }
  const next = reconcileMessengerUnreadCount(
    currentUnreadCount,
    value,
    source,
    hasAuthoritativeUnreadSnapshot,
  );
  if (
    source === "authoritative" ||
    source === "local-read" ||
    source === "push"
  ) {
    hasAuthoritativeUnreadSnapshot = true;
  }
  const changed = next !== currentUnreadCount;
  currentUnreadCount = next;
  if (changed) notifyUnreadListeners(next);

  const shouldRefreshPersistence =
    changed ||
    source === "authoritative" ||
    source === "local-read" ||
    source === "push";
  const persistence =
    shouldRefreshPersistence && currentUnreadUserId
      ? enqueueUnreadPersistence(currentUnreadUserId, next)
      : Promise.resolve();
  await Promise.allSettled([persistence, enqueueNativeBadgeUpdate(source)]);
  return next;
}

export function syncMessengerUnreadFromRooms(
  rooms: readonly MessengerRoom[],
  source: MessengerUnreadSource = "authoritative",
): Promise<number> {
  return setMessengerUnreadCount(messengerUnreadTotal(rooms), source);
}

export async function refreshMessengerUnreadFromCache(
  db: SQLiteDatabase,
  source: MessengerUnreadSource = "cache",
): Promise<number> {
  return syncMessengerUnreadFromRooms(
    await loadCachedMessengerRooms(db),
    source,
  );
}

export function useMessengerUnreadCount(): number {
  const [count, setCount] = useState(getMessengerUnreadCount);
  useEffect(() => subscribeMessengerUnreadCount(setCount), []);
  return count;
}
