import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import {
  cacheIncomingMessengerMessage,
  cacheMessengerRooms,
  loadCachedMessengerRoom,
} from "../features/messenger/repository";
import type { MessengerPushRegistration } from "../features/messenger/types";
import { getDatabase } from "../database/repository";
import {
  getMessengerMessage,
  getMessengerPushRegistration,
  getMessengerRooms,
  registerMessengerPushToken,
  unregisterMessengerPushToken,
} from "./messengerApi";
import { messengerLog } from "./messengerLogger";
import { loadMessengerSession } from "./messengerSession";
import {
  refreshMessengerUnreadFromCache,
  setMessengerUnreadCount,
  syncMessengerUnreadFromRooms,
} from "./messengerUnread";

export const MESSENGER_NOTIFICATION_CHANNEL = "messenger";
const MESSENGER_PUSH_ENABLED_PREFIX = "messenger_push_enabled:";
const MESSENGER_PUSH_PROMPTED_PREFIX = "messenger_push_prompted:";
const SHARED_EXPO_PUSH_TOKEN_KEY = "expo_push_token";

export interface MessengerPushPayload {
  type: "messenger.message" | "messenger.badge";
  room_id?: string;
  room_title?: string;
  message_id?: string;
  sequence?: string;
  unread_count?: number;
}

function enabledKey(userId: string): string {
  return `${MESSENGER_PUSH_ENABLED_PREFIX}${userId}`;
}

function promptedKey(userId: string): string {
  return `${MESSENGER_PUSH_PROMPTED_PREFIX}${userId}`;
}

function expoProjectId(): string {
  const extra = Constants.expoConfig?.extra as
    | { eas?: { projectId?: string } }
    | undefined;
  const projectId = extra?.eas?.projectId || Constants.easConfig?.projectId;
  if (!projectId) {
    throw new Error("В конфигурации приложения отсутствует Expo projectId");
  }
  return projectId;
}

export async function ensureMessengerNotificationChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(
    MESSENGER_NOTIFICATION_CHANNEL,
    {
      name: "Сообщения команды",
      description: "Новые сообщения командного мессенджера",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      enableVibrate: true,
      showBadge: true,
      lockscreenVisibility:
        Notifications.AndroidNotificationVisibility.PRIVATE,
    },
  );
}

export async function getProjectExpoPushToken(): Promise<string> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") {
    throw new Error("PUSH-уведомления доступны только на мобильном устройстве");
  }
  if (!Device.isDevice) {
    throw new Error("PUSH-уведомления необходимо проверять на физическом устройстве");
  }
  await ensureMessengerNotificationChannel();
  const token = await Notifications.getExpoPushTokenAsync({
    projectId: expoProjectId(),
  });
  await AsyncStorage.setItem(SHARED_EXPO_PUSH_TOKEN_KEY, token.data);
  return token.data;
}

async function ensureNotificationPermission(request: boolean): Promise<boolean> {
  let permission = await Notifications.getPermissionsAsync();
  if (permission.status !== "granted" && request) {
    permission = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });
  }
  return permission.status === "granted";
}

export async function loadMessengerPushPreference(userId: string): Promise<boolean> {
  return (await AsyncStorage.getItem(enabledKey(userId))) === "true";
}

export async function enableMessengerPush(
  requestPermission = true,
): Promise<MessengerPushRegistration> {
  const session = await loadMessengerSession();
  if (!session) throw new Error("Сначала войдите в командный мессенджер");
  if (!(await ensureNotificationPermission(requestPermission))) {
    throw new Error(
      "Разрешение на уведомления не выдано. Его можно включить в настройках устройства.",
    );
  }
  const token = await getProjectExpoPushToken();
  const platform = Platform.OS === "ios" ? "ios" : "android";
  const registration = await registerMessengerPushToken(token, platform);
  await AsyncStorage.setItem(enabledKey(session.user.id), "true");
  messengerLog("info", "push.registration.enabled", {
    registration_id: registration.id,
    platform,
  });
  return registration;
}

export async function disableMessengerPush(): Promise<void> {
  const session = await loadMessengerSession();
  if (!session) return;
  try {
    await unregisterMessengerPushToken();
  } finally {
    await AsyncStorage.setItem(enabledKey(session.user.id), "false");
  }
  messengerLog("info", "push.registration.disabled", {
    user_id: session.user.id,
  });
}

export async function messengerPushStatus(): Promise<{
  enabled: boolean;
  registration: MessengerPushRegistration | null;
}> {
  const session = await loadMessengerSession();
  if (!session) return { enabled: false, registration: null };
  const preferred = await loadMessengerPushPreference(session.user.id);
  try {
    const registration = await getMessengerPushRegistration();
    const enabled = Boolean(preferred && registration?.enabled);
    await AsyncStorage.setItem(enabledKey(session.user.id), String(enabled));
    return { enabled, registration };
  } catch (error) {
    messengerLog("debug", "push.registration.status_deferred", {
      message: error instanceof Error ? error.message : String(error),
    });
    return { enabled: preferred, registration: null };
  }
}

export async function syncMessengerPushRegistration(): Promise<void> {
  const session = await loadMessengerSession();
  if (!session || !(await loadMessengerPushPreference(session.user.id))) return;
  if (!(await ensureNotificationPermission(false))) {
    await AsyncStorage.setItem(enabledKey(session.user.id), "false");
    await unregisterMessengerPushToken().catch(() => undefined);
    return;
  }
  await enableMessengerPush(false);
}

export async function shouldOfferMessengerPush(userId: string): Promise<boolean> {
  return (await AsyncStorage.getItem(promptedKey(userId))) !== "true";
}

export function markMessengerPushOffered(userId: string): Promise<void> {
  return AsyncStorage.setItem(promptedKey(userId), "true");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function parsedDataString(record: Record<string, unknown>): unknown {
  if (typeof record.dataString !== "string") return record;
  try {
    return JSON.parse(record.dataString) as unknown;
  } catch {
    return record;
  }
}

export function normalizeMessengerPushPayload(
  raw: unknown,
): MessengerPushPayload | null {
  let candidate: unknown = raw;
  for (let depth = 0; depth < 5; depth += 1) {
    const record = asRecord(candidate);
    if (!record) return null;
    const parsed = parsedDataString(record);
    if (parsed !== record) {
      candidate = parsed;
      continue;
    }
    if (record.type === "messenger.message" || record.type === "messenger.badge") {
      const unread = Number(record.unread_count);
      return {
        type: record.type,
        room_id: typeof record.room_id === "string" ? record.room_id : undefined,
        room_title:
          typeof record.room_title === "string" ? record.room_title : undefined,
        message_id:
          typeof record.message_id === "string" ? record.message_id : undefined,
        sequence: typeof record.sequence === "string" ? record.sequence : undefined,
        unread_count: Number.isFinite(unread) ? unread : undefined,
      };
    }
    const responseNotification = asRecord(record.notification);
    const request = asRecord(responseNotification?.request);
    const content = asRecord(request?.content);
    if (content?.data) {
      candidate = content.data;
      continue;
    }
    if (record.data) {
      candidate = record.data;
      continue;
    }
    return null;
  }
  return null;
}

export async function processMessengerPushPayload(
  raw: unknown,
): Promise<MessengerPushPayload | null> {
  const payload = normalizeMessengerPushPayload(raw);
  if (!payload) return null;
  if (payload.unread_count !== undefined) {
    await setMessengerUnreadCount(payload.unread_count);
  }
  if (payload.type !== "messenger.message" || !payload.message_id) {
    return payload;
  }
  const session = await loadMessengerSession();
  if (!session) return payload;
  try {
    const [db, message] = await Promise.all([
      getDatabase(),
      getMessengerMessage(payload.message_id),
    ]);
    if (!(await loadCachedMessengerRoom(db, message.room_id))) {
      const rooms = await getMessengerRooms();
      await cacheMessengerRooms(db, rooms);
      await syncMessengerUnreadFromRooms(rooms);
    }
    await cacheIncomingMessengerMessage(db, message, session.user.id);
    if (payload.unread_count === undefined) {
      await refreshMessengerUnreadFromCache(db);
    } else {
      await setMessengerUnreadCount(payload.unread_count);
    }
    messengerLog("info", "push.message.cached", {
      room_id: message.room_id,
      message_id: message.id,
      sequence: message.sequence,
    });
  } catch (error) {
    // The notification remains useful while offline; normal room sync will
    // fetch the message when connectivity returns.
    messengerLog("warn", "push.message.cache_deferred", {
      room_id: payload.room_id,
      message_id: payload.message_id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
  return payload;
}
