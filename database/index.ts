import type { SQLiteDatabase } from 'expo-sqlite';
import migrationConfig from './migrations.json';

export const DATABASE_NAME = 'forward.db';
export const DATABASE_ASSET_SOURCE = {
  assetId: require('../assets/database/forward_seed.db'),
};

interface UserVersionRow {
  user_version: number;
}

export async function migrateDatabase(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync<UserVersionRow>('PRAGMA user_version');
  let currentVersion = row?.user_version ?? 0;

  if (currentVersion > migrationConfig.schemaVersion) {
    throw new Error(
      `Версия локальной базы ${currentVersion} новее поддерживаемой ${migrationConfig.schemaVersion}`
    );
  }

  for (const migration of migrationConfig.migrations) {
    if (migration.version <= currentVersion) continue;

    await db.withTransactionAsync(async () => {
      await db.execAsync(migration.sql);
      await db.execAsync(`PRAGMA user_version = ${migration.version}`);
    });
    currentVersion = migration.version;
    console.log(`[Database] Применена миграция ${migration.version}: ${migration.name}`);
  }
}
