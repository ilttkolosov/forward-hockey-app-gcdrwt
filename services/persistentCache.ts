import { readCacheValue, writeCacheValue } from './cacheStorage';

export interface PersistentCacheEntry<T> {
  data: T;
  savedAt: number;
  schemaVersion: 1;
}

export async function readPersistentCache<T>(key: string): Promise<PersistentCacheEntry<T> | null> {
  try {
    const raw = await readCacheValue(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistentCacheEntry<T>> | null;
    if (!parsed || typeof parsed !== 'object' || parsed.schemaVersion !== 1 || typeof parsed.savedAt !== 'number' || !('data' in parsed)) {
      return null;
    }
    return parsed as PersistentCacheEntry<T>;
  } catch (error) {
    console.warn(`[Cache] Не удалось прочитать ${key}:`, error);
    return null;
  }
}

export async function writePersistentCache<T>(key: string, data: T): Promise<void> {
  const entry: PersistentCacheEntry<T> = {
    data,
    savedAt: Date.now(),
    schemaVersion: 1,
  };
  try {
    await writeCacheValue(key, JSON.stringify(entry));
  } catch (error) {
    console.warn(`[Cache] Не удалось сохранить ${key}:`, error);
  }
}
