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

function scalar(sql) {
  const result = db.exec(sql);
  return result[0]?.values[0]?.[0];
}

const packagedUserVersion = Number(scalar('PRAGMA user_version'));
if (packagedUserVersion > migrationConfig.schemaVersion) {
  throw new Error(
    `Seed user_version=${packagedUserVersion} новее схемы приложения ${migrationConfig.schemaVersion}`
  );
}
for (const migration of migrationConfig.migrations) {
  if (migration.version <= packagedUserVersion) continue;
  db.run(migration.sql);
  db.run(`PRAGMA user_version = ${migration.version}`);
}

const integrity = scalar('PRAGMA integrity_check');
const userVersion = scalar('PRAGMA user_version');
const counts = Object.fromEntries(
  ['teams', 'venues', 'players', 'leagues', 'seasons', 'events', 'tournament_configs', 'trainings'].map(table => [
    table,
    Number(scalar(`SELECT COUNT(*) FROM ${table}`)),
  ])
);
const missingEventIds = Number(scalar(
  'SELECT COUNT(*) FROM event_teams et LEFT JOIN events e ON e.id = et.event_id WHERE e.id IS NULL'
));
let gameTrainingSupported = true;
try {
  db.run(
    `INSERT INTO trainings
      (id, uid, type, title, start_at, end_at, timezone, location, note,
       team_id, team_name, updated_at, raw_json)
     VALUES (?, ?, 'game', ?, ?, ?, ?, '', '', ?, ?, ?, ?)`,
    [
      '__schema_check_game__',
      '__schema_check_game__',
      'Проверка типа «Игра»',
      '2099-01-01T10:00:00+03:00',
      '2099-01-01T11:00:00+03:00',
      'Europe/Moscow',
      'forward-2014',
      'Динамо-Форвард 2014',
      new Date().toISOString(),
      '{}',
    ]
  );
} catch {
  gameTrainingSupported = false;
}

db.close();

if (integrity !== 'ok') throw new Error(`SQLite integrity_check: ${integrity}`);
if (Number(userVersion) !== migrationConfig.schemaVersion) {
  throw new Error(`user_version=${userVersion}, ожидалось ${migrationConfig.schemaVersion}`);
}
if (
  counts.teams === 0
  || counts.venues === 0
  || counts.players === 0
  || counts.events === 0
  || counts.tournament_configs === 0
) {
  throw new Error(`Seed содержит пустые обязательные таблицы: ${JSON.stringify(counts)}`);
}
if (missingEventIds !== 0) throw new Error(`Нарушены связи event_teams: ${missingEventIds}`);
if (!gameTrainingSupported) {
  throw new Error('Схема trainings не принимает поддерживаемый тип game');
}

console.log('[Seed] Проверка успешна:', {
  integrity,
  packagedUserVersion,
  migratedUserVersion: userVersion,
  gameTrainingSupported,
  counts,
});
