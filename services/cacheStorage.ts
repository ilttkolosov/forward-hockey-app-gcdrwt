import AsyncStorage from '@react-native-async-storage/async-storage';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { StorageDeadlineError, withStorageDeadline } from './storageDeadline';

// Rebuildable snapshots must not share Android's size-limited RKStorage with
// login/device identifiers and preferences. Never put an outbox in this DB.
const MAX_CACHE_BYTES = 32 * 1024 * 1024;
const MAX_ENTRY_BYTES = 8 * 1024 * 1024;
const MAX_CACHE_ENTRIES = 512;
const MAX_PENDING_WRITES = 32;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const PINNED_KEYS = new Set([
  '@offline/startup-config/v1', '@offline/upcoming-master/v2', 'localPlayersData',
]);

type CacheRow = { key: string; size_bytes: number; updated_at: number };
let databasePromise: Promise<SQLiteDatabase> | null = null;
let writeTail: Promise<unknown> = Promise.resolve();
let migrationPromise: Promise<void> | null = null;
let pendingWrites = 0;
let writesDisabled = false;
let storageStalled = false;
let legacyStalled = false;

function noteFailure(error: unknown): void {
  if (error instanceof StorageDeadlineError) storageStalled = true;
  if (!writesDisabled) console.warn('[Cache] Запись кэша отключена до следующего запуска:', error);
  writesDisabled = true;
}

function cacheDatabase(): Promise<SQLiteDatabase> {
  if (storageStalled) return Promise.reject(new Error('Cache storage is stalled'));
  if (!databasePromise) {
    databasePromise = (async () => {
      const db = await openDatabaseAsync('forward-cache.db');
      try {
        await db.execAsync(`
          PRAGMA busy_timeout = 1000;
          PRAGMA journal_mode = WAL;
          PRAGMA journal_size_limit = 2097152;
          PRAGMA wal_autocheckpoint = 256;
          CREATE TABLE IF NOT EXISTS cache_entries (
            key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL,
            size_bytes INTEGER NOT NULL, updated_at INTEGER NOT NULL
          );
        `);
        return db;
      } catch (error) {
        await db.closeAsync().catch(() => undefined);
        throw error;
      }
    })().catch(error => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
}

function enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
  if (writesDisabled || pendingWrites >= MAX_PENDING_WRITES) {
    return Promise.reject(new Error('Cache writes unavailable'));
  }
  pendingWrites += 1;
  const result = writeTail.then(() => {
    if (writesDisabled) throw new Error('Cache writes disabled');
    return operation();
  }).finally(() => { pendingWrites -= 1; });
  writeTail = result.catch(() => undefined);
  return result;
}

function isLegacyCacheKey(key: string): boolean {
  return key === 'localPlayersData'
    || key === '@team_list'
    || key === '@offline/startup-config/v1'
    || /^@offline\/(?:games|game-detail)\/v1\//.test(key)
    || /^@offline\/upcoming-master\/v[12]$/.test(key)
    || key.startsWith('@messenger/link-preview/v1/');
}

// Eviction commits BEFORE the insert, so freed pages can be reused even when
// the next write would otherwise hit SQLITE_FULL. Keep the old value of a key
// until its replacement commits. Pinned launch snapshots survive eviction.
async function trimCache(db: SQLiteDatabase, incomingKey = '', incomingBytes = 0, emergency = false): Promise<void> {
  const rows = await db.getAllAsync<CacheRow>(
    'SELECT key, size_bytes, updated_at FROM cache_entries ORDER BY updated_at DESC, rowid DESC',
  );
  const others = rows.filter(row => row.key !== incomingKey);
  const pinned = others.filter(row => PINNED_KEYS.has(row.key));
  let bytes = incomingBytes + pinned.reduce((total, row) => total + row.size_bytes, 0);
  let count = (incomingKey ? 1 : 0) + pinned.length;
  const budget = MAX_CACHE_BYTES;
  const remove: string[] = [];
  for (const row of others) {
    if (PINNED_KEYS.has(row.key)) continue;
    if (emergency || row.updated_at < Date.now() - MAX_AGE_MS
      || bytes + row.size_bytes > budget || count >= MAX_CACHE_ENTRIES) {
      remove.push(row.key);
    } else {
      bytes += row.size_bytes;
      count += 1;
    }
  }
  if (remove.length) {
    await db.withTransactionAsync(async () => {
      for (const key of remove) await db.runAsync('DELETE FROM cache_entries WHERE key = ?', key);
    });
  }
  if (emergency || remove.length) {
    await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE);');
  }
}

function isStorageFull(error: unknown): boolean {
  const detail = error instanceof Error ? error.message : String(error);
  return /SQLITE_FULL|database or disk is full|disk full|ENOSPC|no space left|SQLiteFullException/i.test(detail);
}

async function storeValue(key: string, value: string, onlyIfMissing = false): Promise<boolean> {
  // A UTF-16 code unit takes at most 3 UTF-8 bytes. Use a conservative bound
  // without allocating another multi-megabyte buffer on the JS thread.
  const sizeBytes = (key.length + value.length) * 3;
  if (sizeBytes > MAX_ENTRY_BYTES || writesDisabled || pendingWrites >= MAX_PENDING_WRITES) return false;
  try {
    await withStorageDeadline(enqueueWrite(async () => {
      const db = await cacheDatabase();
      if (onlyIfMissing && await db.getFirstAsync('SELECT key FROM cache_entries WHERE key = ?', key)) return;
      await trimCache(db, key, sizeBytes);
      if (writesDisabled) throw new Error('Cache writes disabled');
      const insert = () => db.runAsync(
        `INSERT INTO cache_entries (key, value, size_bytes, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value,
         size_bytes = excluded.size_bytes, updated_at = excluded.updated_at`,
        key, value, sizeBytes, Date.now(),
      );
      try {
        await insert();
      } catch (error) {
        if (!isStorageFull(error)) throw error;
        await trimCache(db, key, sizeBytes, true);
        // Exactly one retry. A real disk failure must not create a retry loop.
        if (writesDisabled) throw error;
        await insert();
      }
    }));
    return true;
  } catch (error) {
    noteFailure(error);
    return false;
  }
}

async function readLegacyCopy(key: string): Promise<string | null> {
  if (!isLegacyCacheKey(key) || legacyStalled) return null;
  try {
    return await withStorageDeadline(AsyncStorage.getItem(key));
  } catch (error) {
    if (error instanceof StorageDeadlineError) legacyStalled = true;
    console.warn('[Cache] Старый снимок недоступен:', error);
    return null;
  }
}

async function removeLegacyCopy(key: string): Promise<void> {
  if (!isLegacyCacheKey(key) || legacyStalled) return;
  try {
    await withStorageDeadline(AsyncStorage.removeItem(key));
  } catch (error) {
    if (error instanceof StorageDeadlineError) legacyStalled = true;
    console.warn('[Cache] Старый снимок будет удалён при следующем запуске:', error);
  }
}

export async function writeCacheValue(key: string, value: string): Promise<void> {
  // Cache writes are always optional. Callers keep using their fresh data.
  if (await storeValue(key, value)) await removeLegacyCopy(key);
}

export async function readCacheValue(key: string): Promise<string | null> {
  if (!storageStalled) {
    try {
      const row = await withStorageDeadline((async () => {
        const db = await cacheDatabase();
        return db.getFirstAsync<{ value: string }>('SELECT value FROM cache_entries WHERE key = ?', key);
      })());
      if (row) return row.value;
    } catch (error) {
      noteFailure(error);
    }
  }
  const legacy = await readLegacyCopy(key);
  if (legacy !== null) {
    // Do not make a cache read wait for migration. The source survives failed,
    // oversized or timed-out writes, and remains usable without a network.
    void storeValue(key, legacy, true).then(async saved => {
      if (saved) await removeLegacyCopy(key);
    });
  }
  return legacy;
}

/** Incremental upgrade: bounded work; no network and no AsyncStorage.clear(). */
export function prepareCacheStorage(): Promise<void> {
  if (migrationPromise) return migrationPromise;
  migrationPromise = (async () => {
    const startedAt = Date.now();
    try {
      await withStorageDeadline(enqueueWrite(async () => trimCache(await cacheDatabase())));
      const keys = (await withStorageDeadline(AsyncStorage.getAllKeys())).filter(isLegacyCacheKey);
      keys.sort((a, b) => Number(PINNED_KEYS.has(b)) - Number(PINNED_KEYS.has(a)));
      let migrated = 0;
      for (const key of keys.slice(0, 128)) {
        if (Date.now() - startedAt >= 1500 || writesDisabled || legacyStalled) break;
        // One entry per read avoids Android CursorWindow's multiGet size limit.
        const raw = await readLegacyCopy(key);
        if (raw === null) continue;
        if (await storeValue(key, raw, true)) {
          await removeLegacyCopy(key);
          migrated += 1;
        }
      }
      if (keys.length) console.log(`[Cache] Перенесено старых снимков: ${migrated}/${keys.length}`);
    } catch (error) {
      noteFailure(error);
    }
  })().finally(() => { migrationPromise = null; });
  return migrationPromise;
}
