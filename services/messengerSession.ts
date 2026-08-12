import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import type {
  MessengerPasswordChangeRequired,
  MessengerSession,
} from "../features/messenger/types";

const SESSION_KEY = "forward_messenger_session_v1";
const PASSWORD_CHANGE_KEY = "forward_messenger_password_change_v1";
const DEVICE_ID_KEY = "forward_messenger_device_id_v1";

let memorySession: MessengerSession | null | undefined;
let memoryPasswordChange: MessengerPasswordChangeRequired | null | undefined;
const listeners = new Set<(session: MessengerSession | null) => void>();

async function secureStoreAvailable(): Promise<boolean> {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

async function readValue(key: string): Promise<string | null> {
  if (await secureStoreAvailable()) {
    return SecureStore.getItemAsync(key);
  }
  return AsyncStorage.getItem(key);
}

async function writeValue(key: string, value: string | null): Promise<void> {
  if (await secureStoreAvailable()) {
    if (value === null) await SecureStore.deleteItemAsync(key);
    else
      await SecureStore.setItemAsync(key, value, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
    return;
  }
  if (value === null) await AsyncStorage.removeItem(key);
  else await AsyncStorage.setItem(key, value);
}

export async function loadMessengerSession(): Promise<MessengerSession | null> {
  if (memorySession !== undefined) return memorySession;
  try {
    const stored = await readValue(SESSION_KEY);
    memorySession = stored ? (JSON.parse(stored) as MessengerSession) : null;
  } catch (error) {
    console.warn("[Messenger] Не удалось прочитать защищённую сессию:", error);
    memorySession = null;
  }
  return memorySession;
}

export async function saveMessengerSession(
  session: MessengerSession,
): Promise<void> {
  await writeValue(SESSION_KEY, JSON.stringify(session));
  memorySession = session;
  listeners.forEach((listener) => listener(session));
  console.log("[Messenger] Сессия сохранена в защищённом хранилище");
}

export async function clearMessengerSession(): Promise<void> {
  await writeValue(SESSION_KEY, null);
  memorySession = null;
  listeners.forEach((listener) => listener(null));
  console.log("[Messenger] Локальная сессия удалена");
}

export async function loadMessengerPasswordChange(): Promise<MessengerPasswordChangeRequired | null> {
  if (memoryPasswordChange !== undefined) return memoryPasswordChange;
  try {
    const stored = await readValue(PASSWORD_CHANGE_KEY);
    memoryPasswordChange = stored
      ? (JSON.parse(stored) as MessengerPasswordChangeRequired)
      : null;
  } catch (error) {
    console.warn(
      "[Messenger] Не удалось прочитать токен обязательной смены пароля:",
      error,
    );
    memoryPasswordChange = null;
  }
  return memoryPasswordChange;
}

export async function saveMessengerPasswordChange(
  passwordChange: MessengerPasswordChangeRequired,
): Promise<void> {
  await writeValue(PASSWORD_CHANGE_KEY, JSON.stringify(passwordChange));
  memoryPasswordChange = passwordChange;
}

export async function clearMessengerPasswordChange(): Promise<void> {
  await writeValue(PASSWORD_CHANGE_KEY, null);
  memoryPasswordChange = null;
}

export async function getMessengerDeviceId(): Promise<string> {
  const stored = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (stored) return stored;
  const created = `forward-${Crypto.randomUUID()}`;
  await AsyncStorage.setItem(DEVICE_ID_KEY, created);
  return created;
}

export function subscribeMessengerSession(
  listener: (session: MessengerSession | null) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
