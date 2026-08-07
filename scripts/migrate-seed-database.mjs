import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const databasePath = path.join(projectRoot, 'assets', 'database', 'forward_seed.db');
const migrationConfig = JSON.parse(
  await fs.readFile(path.join(projectRoot, 'database', 'migrations.json'), 'utf8')
);
const SQL = await initSqlJs({
  locateFile: file => path.join(projectRoot, 'node_modules', 'sql.js', 'dist', file),
});
const db = new SQL.Database(await fs.readFile(databasePath));
const versionResult = db.exec('PRAGMA user_version');
const initialVersion = Number(versionResult[0]?.values[0]?.[0] ?? 0);

if (initialVersion > migrationConfig.schemaVersion) {
  db.close();
  throw new Error(
    `Seed user_version=${initialVersion} новее схемы приложения ${migrationConfig.schemaVersion}`
  );
}

let currentVersion = initialVersion;
for (const migration of migrationConfig.migrations) {
  if (migration.version <= currentVersion) continue;
  db.run('BEGIN TRANSACTION;');
  try {
    db.run(migration.sql);
    db.run(`PRAGMA user_version = ${migration.version}`);
    db.run('COMMIT;');
    currentVersion = migration.version;
    console.log(`[Seed] Применена миграция ${migration.version}: ${migration.name}`);
  } catch (error) {
    db.run('ROLLBACK;');
    db.close();
    throw error;
  }
}

if (currentVersion === initialVersion) {
  db.close();
  console.log(`[Seed] Миграции не требуются: версия ${currentVersion}`);
  process.exit(0);
}

db.run('VACUUM;');
const binary = db.export();
db.close();
await fs.writeFile(databasePath, binary);
console.log(`[Seed] База обновлена: ${initialVersion} → ${currentVersion}, ${binary.byteLength} байт`);
