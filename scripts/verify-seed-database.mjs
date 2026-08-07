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

const integrity = scalar('PRAGMA integrity_check');
const userVersion = scalar('PRAGMA user_version');
const counts = Object.fromEntries(
  ['teams', 'venues', 'players', 'leagues', 'seasons', 'events', 'tournament_configs'].map(table => [
    table,
    Number(scalar(`SELECT COUNT(*) FROM ${table}`)),
  ])
);
const missingEventIds = Number(scalar(
  'SELECT COUNT(*) FROM event_teams et LEFT JOIN events e ON e.id = et.event_id WHERE e.id IS NULL'
));

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

console.log('[Seed] Проверка успешна:', { integrity, userVersion, counts });
