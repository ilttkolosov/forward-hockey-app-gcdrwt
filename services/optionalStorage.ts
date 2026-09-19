import AsyncStorage from '@react-native-async-storage/async-storage';
import { StorageDeadlineError, withStorageDeadline } from './storageDeadline';

let readsStalled = false;
let writesDisabled = false;

// Only use for auxiliary markers whose source of truth is elsewhere.
// Authentication, user settings and queued messages must report write failures.
export async function writeOptionalStorageValue(key: string, value: string): Promise<void> {
  if (writesDisabled) return;
  try {
    await withStorageDeadline(AsyncStorage.setItem(key, value));
  } catch (error) {
    writesDisabled = true;
    console.warn(`[Storage] Не удалось сохранить вспомогательный флаг ${key}:`, error);
  }
}

export async function readOptionalStorageValue(key: string): Promise<string | null> {
  if (readsStalled) return null;
  try {
    return await withStorageDeadline(AsyncStorage.getItem(key));
  } catch (error) {
    if (error instanceof StorageDeadlineError) readsStalled = true;
    console.warn(`[Storage] Вспомогательный флаг ${key} недоступен:`, error);
    return null;
  }
}
