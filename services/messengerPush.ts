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
  getMessengerPushPreference,
  getMessengerRooms,
  markMessengerDelivered,
  registerMessengerPushToken,
  unregisterMessengerPushDevice,
  unregisterMessengerPushToken,
} from "./messengerApi";
import { messengerLog } from "./messengerLogger";
import { loadMessengerSession } from "./messengerSession";
import {
  refreshMessengerUnreadFromCache,
  setMessengerUnreadCount,
  syncMessengerUnreadFromRooms,
} from "./messengerUnread";
import {
  REMOTE_PUSH_UNAVAILABLE_MESSAGE,
  remotePushNotificationsSupported,
} from "./runtimeEnvironment";

export const MESSENGER_NOTIFICATION_CHANNEL = "messenger";
const MESSENGER_PUSH_ENABLED_PREFIX = "messenger_push_enabled:";
const MESSENGER_PUSH_PROMPTED_PREFIX = "messenger_push_prompted:";
const MESSENGER_NATIVE_PUSH_TOKEN_PREFIX = "messenger_native_push_token:";
const SHARED_EXPO_PUSH_TOKEN_KEY = "expo_push_token";
let enableMessengerPushInFlight: Promise<MessengerPushRegistration> | null =
  null;
let observedNativePushToken: string | null = null;

type NotificationPermissionRequest = "never" | "explicit" | "restore";

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

function nativePushTokenKey(userId: string): string {
  return `${MESSENGER_NATIVE_PUSH_TOKEN_PREFIX}${userId}`;
}

function assertRemotePushAvailable(): void {
  if (!remotePushNotificationsSupported) {
    throw new Error(REMOTE_PUSH_UNAVAILABLE_MESSAGE);
  }
}

function nativePushTokenIdentity(
  userId: string,
  token: Notifications.DevicePushToken,
): string {
  let data: string;
  try {
    data = JSON.stringify(token.data);
  } catch {
    data = String(token.data);
  }
  return `${userId}:${token.type}:${data}`;
}

function expoProjectId(): string {
  const extra = Constants.expoConfig?.extra as
    { eas?: { projectId?: string } } | undefined;
  const projectId = extra?.eas?.projectId || Constants.easConfig?.projectId;
  if (!projectId) {
    throw new Error("В конфигурации приложения отсутствует Expo projectId");
  }
  return projectId;
}

export async function ensureMessengerNotificationChannel(): Promise<void> {
  if (!remotePushNotificationsSupported || Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(
    MESSENGER_NOTIFICATION_CHANNEL,
    {
      name: "Сообщения команды",
      description: "Новые сообщения командного мессенджера",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      enableVibrate: true,
      showBadge: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    },
  );
}

export async function getProjectExpoPushToken(): Promise<string> {
  assertRemotePushAvailable();
  if (Platform.OS !== "ios" && Platform.OS !== "android") {
    throw new Error("PUSH-уведомления доступны только на мобильном устройстве");
  }
  if (!Device.isDevice) {
    throw new Error(
      "PUSH-уведомления необходимо проверять на физическом устройстве",
    );
  }
  await ensureMessengerNotificationChannel();
  const token = await Notifications.getExpoPushTokenAsync({
    projectId: expoProjectId(),
  });
  await AsyncStorage.setItem(SHARED_EXPO_PUSH_TOKEN_KEY, token.data);
  return token.data;
}

async function ensureNotificationPermission(
  request: NotificationPermissionRequest,
): Promise<boolean> {
  if (!remotePushNotificationsSupported) return false;
  let permission = await Notifications.getPermissionsAsync();
  const shouldRequest =
    permission.status !== "granted" &&
    permission.canAskAgain &&
    (request === "explicit" ||
      (request === "restore" && permission.status === "undetermined"));
  if (shouldRequest) {
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

export async function loadMessengerPushPreference(
  userId: string,
): Promise<boolean> {
  return (await AsyncStorage.getItem(enabledKey(userId))) === "true";
}

export async function enableMessengerPush(
  requestPermission = true,
): Promise<MessengerPushRegistration> {
  assertRemotePushAvailable();
  if (enableMessengerPushInFlight) return enableMessengerPushInFlight;

  const operation = (async () => {
    const session = await loadMessengerSession();
    if (!session) throw new Error("Сначала войдите в командный мессенджер");
    if (
      !(await ensureNotificationPermission(
        requestPermission ? "explicit" : "never",
      ))
    ) {
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
  })();

  enableMessengerPushInFlight = operation;
  try {
    return await operation;
  } finally {
    if (enableMessengerPushInFlight === operation) {
      enableMessengerPushInFlight = null;
    }
  }
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
  permissionGranted: boolean;
  registration: MessengerPushRegistration | null;
}> {
  const session = await loadMessengerSession();
  if (!session) {
    return { enabled: false, permissionGranted: false, registration: null };
  }
  const preferred = await loadMessengerPushPreference(session.user.id);
  const permissionGranted = remotePushNotificationsSupported
    ? await ensureNotificationPermission("never")
    : false;
  try {
    const preference = await getMessengerPushPreference();
    const enabled = Boolean(preference.enabled);
    await AsyncStorage.setItem(enabledKey(session.user.id), String(enabled));
    return {
      enabled,
      permissionGranted,
      registration: preference.current_registration,
    };
  } catch (error) {
    messengerLog("debug", "push.registration.status_deferred", {
      message: error instanceof Error ? error.message : String(error),
    });
    return { enabled: preferred, permissionGranted, registration: null };
  }
}

export async function syncMessengerPushRegistration(): Promise<void> {
  if (!remotePushNotificationsSupported) return;
  const session = await loadMessengerSession();
  if (!session) return;
  const status = await messengerPushStatus();
  if (!status.enabled) {
    await unregisterMessengerPushDevice().catch(() => undefined);
    return;
  }
  if (!(await ensureNotificationPermission("restore"))) {
    // The account-level choice stays enabled so another authorized device is
    // unaffected. This installation is disabled until the OS grants access.
    await unregisterMessengerPushDevice().catch(() => undefined);
    messengerLog("info", "push.device.permission_missing", {
      user_id: session.user.id,
    });
    return;
  }
  await enableMessengerPush(false);
}

export async function syncMessengerPushTokenRotation(
  token: Notifications.DevicePushToken,
): Promise<void> {
  if (!remotePushNotificationsSupported) return;
  const session = await loadMessengerSession();
  if (!session) return;

  const identity = nativePushTokenIdentity(session.user.id, token);
  if (observedNativePushToken === identity) return;
  observedNativePushToken = identity;

  const storageKey = nativePushTokenKey(session.user.id);
  if ((await AsyncStorage.getItem(storageKey)) === identity) return;

  // Store before requesting the Expo token. That request can itself emit the
  // native-token event; marking it first prevents a recursive registration loop.
  await AsyncStorage.setItem(storageKey, identity);
  await syncMessengerPushRegistration();
}

export async function shouldOfferMessengerPush(
  userId: string,
): Promise<boolean> {
  if (!remotePushNotificationsSupported) return false;
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
    if (
      record.type === "messenger.message" ||
      record.type === "messenger.badge"
    ) {
      const unread = Number(record.unread_count);
      return {
        type: record.type,
        room_id:
          typeof record.room_id === "string" ? record.room_id : undefined,
        room_title:
          typeof record.room_title === "string" ? record.room_title : undefined,
        message_id:
          typeof record.message_id === "string" ? record.message_id : undefined,
        sequence:
          typeof record.sequence === "string" ? record.sequence : undefined,
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
      const reconciled = await cacheMessengerRooms(db, rooms);
      await syncMessengerUnreadFromRooms(reconciled);
    }
    await cacheIncomingMessengerMessage(db, message, session.user.id);
    if (message.author.id !== session.user.id) {
      try {
        await markMessengerDelivered(message.room_id, message.sequence);
      } catch (error) {
        // The message itself is already cached. A later room-list sync will
        // retry only the missing delivery cursor without losing the push.
        messengerLog("debug", "push.delivery_ack.deferred", {
          room_id: message.room_id,
          message_id: message.id,
          sequence: message.sequence,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
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
