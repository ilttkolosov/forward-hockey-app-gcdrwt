import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import type {
  MessengerPasswordChangeRequired,
  MessengerSession,
} from "../features/messenger/types";

const SESSION_KEY = "forward_messenger_session_v1";
const SESSION_RECOVERY_KEY = "forward_messenger_session_recovery_v1";
const SESSION_PRESENT_KEY = "forward_messenger_session_present_v1";
const PASSWORD_CHANGE_KEY = "forward_messenger_password_change_v1";
const DEVICE_ID_KEY = "forward_messenger_device_id_v1";
// Give the original registration callback time to finish before the recovery
// pass publishes a newer session, preventing an older avatar-less state from
// winning a React state race.
const PLAYER_AVATAR_RECONCILIATION_DELAY_MS = 1_500;

let memorySession: MessengerSession | null | undefined;
let memoryPasswordChange: MessengerPasswordChangeRequired | null | undefined;
let sessionReadPromise: Promise<MessengerSession | null> | null = null;
let playerAvatarReconciliationGeneration = 0;
let playerAvatarReconciliationModule:
  | Promise<typeof import("./messengerPlayerAvatarReconciliation")>
  | null = null;
const listeners = new Set<(session: MessengerSession | null) => void>();

function loadPlayerAvatarReconciliationModule() {
  if (!playerAvatarReconciliationModule) {
    playerAvatarReconciliationModule = import(
      "./messengerPlayerAvatarReconciliation"
    ).catch((error) => {
      playerAvatarReconciliationModule = null;
      throw error;
    });
  }
  return playerAvatarReconciliationModule;
}

function schedulePlayerAvatarReconciliation(
  session: MessengerSession | null,
): void {
  const generation = ++playerAvatarReconciliationGeneration;
  const playerId = session?.user.player_id;
  if (
    !session ||
    session.user.avatar_url ||
    typeof playerId !== "number" ||
    !Number.isSafeInteger(playerId) ||
    playerId <= 0
  ) {
    return;
  }
  setTimeout(() => {
    if (generation !== playerAvatarReconciliationGeneration) return;
    void loadPlayerAvatarReconciliationModule()
      .then(({ reconcileMessengerPlayerAvatar }) =>
        reconcileMessengerPlayerAvatar(session.user.id),
      )
      .catch((error) =>
        console.warn(
          "[Messenger] Автоматическая установка фотографии игрока отложена:",
          error,
        ),
      );
  }, PLAYER_AVATAR_RECONCILIATION_DELAY_MS);
}

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
        // A silent PUSH can wake the process while the screen is locked. The
        // session still needs to be readable after the first device unlock;
        // otherwise a temporary Keychain denial can look like a signed-out
        // user until the React Native process is restarted.
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      });
    return;
  }
  if (value === null) await AsyncStorage.removeItem(key);
  else await AsyncStorage.setItem(key, value);
}

function parseStoredSession(value: string | null): MessengerSession | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as MessengerSession;
    if (
      !parsed?.access_token ||
      !parsed?.refresh_token ||
      !parsed?.refresh_token_expires_at ||
      !parsed?.user?.id
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function sessionExpiry(session: MessengerSession | null): number {
  if (!session) return 0;
  const value = Date.parse(session.refresh_token_expires_at);
  return Number.isFinite(value) ? value : 0;
}

async function markSessionPresent(userId: string | null): Promise<void> {
  try {
    if (userId) await AsyncStorage.setItem(SESSION_PRESENT_KEY, userId);
    else await AsyncStorage.removeItem(SESSION_PRESENT_KEY);
  } catch (error) {
    console.warn("[Messenger] Не удалось обновить маркер сессии:", error);
  }
}

export async function hasMessengerSessionMarker(): Promise<boolean> {
  if (memorySession) return true;
  try {
    return Boolean(await AsyncStorage.getItem(SESSION_PRESENT_KEY));
  } catch {
    return false;
  }
}

export async function loadMessengerSession(): Promise<MessengerSession | null> {
  if (memorySession !== undefined) return memorySession;
  if (sessionReadPromise) return sessionReadPromise;

  sessionReadPromise = (async () => {
    try {
      const [primaryValue, recoveryValue] = await Promise.all([
        readValue(SESSION_KEY),
        readValue(SESSION_RECOVERY_KEY),
      ]);
      const primary = parseStoredSession(primaryValue);
      const recovery = parseStoredSession(recoveryValue);
      const parsed =
        primary && recovery
          ? sessionExpiry(recovery) >= sessionExpiry(primary)
            ? recovery
            : primary
          : recovery ?? primary;

      if (!parsed) return null;

      memorySession = parsed;
      schedulePlayerAvatarReconciliation(parsed);
      void markSessionPresent(parsed.user.id);

      const serialized = JSON.stringify(parsed);
      try {
        if (recoveryValue !== serialized) {
          await writeValue(SESSION_RECOVERY_KEY, serialized);
        }
        if (primaryValue !== serialized) {
          await writeValue(SESSION_KEY, serialized);
        }
      } catch (migrationError) {
        console.warn(
          "[Messenger] Не удалось восстановить резервную копию сессии:",
          migrationError,
        );
      }
      return parsed;
    } catch (error) {
      console.warn("[Messenger] Не удалось прочитать защищённую сессию:", error);
      return memorySession ?? null;
    }
  })().finally(() => {
    sessionReadPromise = null;
  });

  return sessionReadPromise;
}

export async function saveMessengerSession(
  session: MessengerSession,
): Promise<void> {
  const serialized = JSON.stringify(session);
  // Recovery first: if the OS kills JS after a refresh response, the newest
  // credential is already durable before the primary copy is replaced.
  await writeValue(SESSION_RECOVERY_KEY, serialized);
  await writeValue(SESSION_KEY, serialized);
  await markSessionPresent(session.user.id);
  memorySession = session;
  listeners.forEach((listener) => listener(session));
  schedulePlayerAvatarReconciliation(session);
  console.log("[Messenger] Сессия сохранена в защищённом хранилище");
}

export async function clearMessengerSession(): Promise<void> {
  try {
    await Promise.all([
      writeValue(SESSION_KEY, null),
      writeValue(SESSION_RECOVERY_KEY, null),
      markSessionPresent(null),
    ]);
  } finally {
    memorySession = null;
    schedulePlayerAvatarReconciliation(null);
    listeners.forEach((listener) => listener(null));
    console.log("[Messenger] Локальная сессия удалена");
  }
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
  try {
    await writeValue(PASSWORD_CHANGE_KEY, null);
  } finally {
    memoryPasswordChange = null;
  }
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
