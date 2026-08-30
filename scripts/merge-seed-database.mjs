import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const basePath = path.resolve(process.argv[2] || path.join(projectRoot, 'assets/database/forward_seed.db'));
const updatePath = path.resolve(process.argv[3] || '');
if (!process.argv[3]) throw new Error('Укажите путь к БД с актуальным диапазоном');

const SQL = await initSqlJs({
  locateFile: file => path.join(projectRoot, 'node_modules/sql.js/dist', file),
});
const base = new SQL.Database(await fs.readFile(basePath));
const update = new SQL.Database(await fs.readFile(updatePath));

function rows(db, table, where = '') {
  const result = db.exec(`SELECT * FROM ${table}${where}`)[0];
  if (!result) return [];
  return result.values.map(values => Object.fromEntries(
    result.columns.map((column, index) => [column, values[index]])
  ));
}

function upsert(table, items, primaryKey) {
  if (!items.length) return;
  const columns = Object.keys(items[0]);
  const updates = columns
    .filter(column => column !== primaryKey)
    .map(column => `${column}=excluded.${column}`)
    .join(',');
  const statement = base.prepare(
    `INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')}) `
    + `ON CONFLICT(${primaryKey}) DO UPDATE SET ${updates}`
  );
  try {
    items.forEach(item => statement.run(columns.map(column => item[column])));
  } finally {
    statement.free();
  }
}

function insertRelations(table, items) {
  if (!items.length) return;
  const columns = Object.keys(items[0]);
  const statement = base.prepare(
    `INSERT OR IGNORE INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`
  );
  try {
    items.forEach(item => statement.run(columns.map(column => item[column])));
  } finally {
    statement.free();
  }
}

base.run('PRAGMA foreign_keys = ON;');
base.run('BEGIN TRANSACTION;');
try {
  upsert('teams', rows(update, 'teams'), 'id');
  upsert('venues', rows(update, 'venues'), 'id');
  upsert('leagues', rows(update, 'leagues'), 'id');
  upsert('seasons', rows(update, 'seasons'), 'id');

  base.run('DELETE FROM players');
  upsert('players', rows(update, 'players'), 'id');
  upsert('tournament_configs', rows(update, 'tournament_configs'), 'tournament_id');
  upsert('sync_versions', rows(update, 'sync_versions'), 'entity');

  const updatedEvents = rows(update, 'events');
  const eventIds = updatedEvents.map(item => String(item.id));
  if (eventIds.length) {
    const placeholders = eventIds.map(() => '?').join(',');
    for (const table of ['event_teams', 'event_venues', 'event_leagues', 'event_seasons']) {
      base.run(`DELETE FROM ${table} WHERE event_id IN (${placeholders})`, eventIds);
    }
  }
  upsert('events', updatedEvents, 'id');
  insertRelations('event_teams', rows(update, 'event_teams'));
  insertRelations('event_venues', rows(update, 'event_venues'));
  insertRelations('event_leagues', rows(update, 'event_leagues'));
  insertRelations('event_seasons', rows(update, 'event_seasons'));

  const metadata = Object.fromEntries(rows(update, 'metadata').map(item => [item.key, item.value]));
  const baseMetadata = Object.fromEntries(rows(base, 'metadata').map(item => [item.key, item.value]));
  const mergedMetadata = {
    ...metadata,
    events_from: baseMetadata.events_from || metadata.events_from,
    events_to: metadata.events_to,
    historical_events_through: metadata.events_to,
  };
  upsert(
    'metadata',
    Object.entries(mergedMetadata).map(([key, value]) => ({ key, value })),
    'key'
  );

  const startupConfig = JSON.parse(metadata.startup_config || '{}');
  const generatedAt = metadata.seed_generated_at || new Date().toISOString();
  base.run('DELETE FROM tournament_catalog');
  const catalog = [
    ...(startupConfig.tournamentsNow || []).map((item, index) => ({ item, category: 'current', index })),
    ...(startupConfig.tournamentsPast || []).map((item, index) => ({ item, category: 'past', index })),
  ];
  upsert('tournament_catalog', catalog.map(({ item, category, index }) => ({
    tournament_id: String(item.tournament_ID),
    name: item.tournament_Name || '',
    category,
    display_order: index,
    config_revision: Number(startupConfig.config_revision || 0),
    updated_at: generatedAt,
  })), 'tournament_id');

  base.run('COMMIT;');
} catch (error) {
  base.run('ROLLBACK;');
  throw error;
}

base.run('VACUUM;');
const binary = base.export();
base.close();
update.close();
await fs.writeFile(basePath, binary);
console.log('[Seed] Инкрементальный снимок объединён:', {
  base: path.relative(projectRoot, basePath),
  update: updatePath,
  bytes: binary.byteLength,
});
