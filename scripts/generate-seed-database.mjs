import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const API_BASE_URL = 'https://www.hc-forward.com/wp-json/app/v1';
const DEFAULT_FROM = '2023-01-01';
const DEFAULT_TO = '2026-08-07';
const DEFAULT_OUTPUT = path.join(projectRoot, 'assets', 'database', 'forward_seed.db');
const REQUEST_TIMEOUT_MS = 90_000;

function readArguments(argv) {
  const result = { from: DEFAULT_FROM, to: DEFAULT_TO, output: DEFAULT_OUTPUT, chunkMonths: 6 };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--from') result.from = argv[++index];
    else if (value === '--to') result.to = argv[++index];
    else if (value === '--output') result.output = path.resolve(argv[++index]);
    else if (value === '--chunk-months') result.chunkMonths = Number(argv[++index]);
    else throw new Error(`Неизвестный аргумент: ${value}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result.from) || !/^\d{4}-\d{2}-\d{2}$/.test(result.to)) {
    throw new Error('Даты должны иметь формат YYYY-MM-DD');
  }
  if (!Number.isInteger(result.chunkMonths) || result.chunkMonths < 1 || result.chunkMonths > 12) {
    throw new Error('--chunk-months должен быть целым числом от 1 до 12');
  }
  return result;
}

const isoDate = date => date.toISOString().slice(0, 10);
const parseIsoDate = value => new Date(`${value}T00:00:00.000Z`);

function buildDateRanges(from, to, chunkMonths) {
  const ranges = [];
  const finalDate = parseIsoDate(to);
  let current = parseIsoDate(from);
  if (current > finalDate) throw new Error('--from не может быть позже --to');

  while (current <= finalDate) {
    const next = new Date(current);
    next.setUTCMonth(next.getUTCMonth() + chunkMonths);
    const rangeEnd = new Date(Math.min(next.getTime() - 86_400_000, finalDate.getTime()));
    ranges.push({ from: isoDate(current), to: isoDate(rangeEnd) });
    current = new Date(rangeEnd.getTime() + 86_400_000);
  }
  return ranges;
}

async function fetchApi(pathname, query = {}) {
  const url = new URL(`${API_BASE_URL}/${pathname}`);
  Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal });
      const payload = await response.json().catch(() => null);
      if (response.status === 404 && payload?.code === 'no_results') {
        return { status: 'success', data: [], count: 0 };
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${payload?.message || url}`);
      if (payload?.status !== 'success' || !Array.isArray(payload.data)) {
        throw new Error(`Некорректный ответ ${url}`);
      }
      return payload;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt * 750));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

async function loadEvents(from, to, chunkMonths) {
  const ranges = buildDateRanges(from, to, chunkMonths);
  const eventsById = new Map();

  for (let index = 0; index < ranges.length; index += 2) {
    const batch = ranges.slice(index, index + 2);
    const responses = await Promise.all(batch.map(async range => {
      console.log(`[Seed] Матчи ${range.from} — ${range.to}`);
      return fetchApi('get-events', { date_from: range.from, date_to: range.to });
    }));
    responses.flatMap(response => response.data).forEach(event => {
      eventsById.set(String(event.id), event);
    });
  }
  return [...eventsById.values()];
}

function insertRows(db, sql, rows) {
  const statement = db.prepare(sql);
  try {
    rows.forEach(row => statement.run(row));
  } finally {
    statement.free();
  }
}

function json(value, fallback) {
  return JSON.stringify(value ?? fallback);
}

async function main() {
  const options = readArguments(process.argv.slice(2));
  const migrationPath = path.join(projectRoot, 'database', 'migrations.json');
  const migrationConfig = JSON.parse(await fs.readFile(migrationPath, 'utf8'));

  console.log('[Seed] Загрузка справочников...');
  const [teamsResponse, venuesResponse, playersResponse, leaguesResponse, seasonsResponse] =
    await Promise.all([
      fetchApi('get-team'),
      fetchApi('get-venue'),
      fetchApi('get-players-full'),
      fetchApi('get-league'),
      fetchApi('get-season'),
    ]);
  const events = await loadEvents(options.from, options.to, options.chunkMonths);
  const generatedAt = new Date().toISOString();

  const SQL = await initSqlJs({
    locateFile: file => path.join(projectRoot, 'node_modules', 'sql.js', 'dist', file),
  });
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON;');
  migrationConfig.migrations.forEach(migration => db.run(migration.sql));
  db.run(`PRAGMA user_version = ${migrationConfig.schemaVersion}`);
  db.run('BEGIN TRANSACTION;');

  try {
    insertRows(db, 'INSERT INTO metadata (key, value) VALUES (?, ?)', [
      ['schema_version', String(migrationConfig.schemaVersion)],
      ['seed_generated_at', generatedAt],
      ['events_from', options.from],
      ['events_to', options.to],
    ]);

    insertRows(
      db,
      'INSERT INTO teams (id, name, logo_url, raw_json) VALUES (?, ?, ?, ?)',
      teamsResponse.data.map(item => [String(item.id), item.name || '', item.logo_url || '', json(item, {})])
    );
    insertRows(
      db,
      'INSERT INTO venues (id, name, address, latitude, longitude, raw_json) VALUES (?, ?, ?, ?, ?, ?)',
      venuesResponse.data.map(item => [
        String(item.id), item.name || '', item.address || '', item.coordinates?.latitude ?? null,
        item.coordinates?.longitude ?? null, json(item, {}),
      ])
    );
    insertRows(
      db,
      'INSERT INTO players (id, name, nationality, number, position, birth_date, metrics_json, photo_url, raw_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      playersResponse.data.map(item => [
        String(item.id), item.name || '', item.nationality || '', item.number ?? null,
        item.position || '', item.birth_date || '', json(item.metrics, {}), item.photo_url || '', json(item, {}),
      ])
    );
    insertRows(
      db,
      'INSERT INTO leagues (id, name, slug, raw_json) VALUES (?, ?, ?, ?)',
      leaguesResponse.data.map(item => [String(item.id), item.name || '', item.slug || '', json(item, {})])
    );
    insertRows(
      db,
      'INSERT INTO seasons (id, name, slug, raw_json) VALUES (?, ?, ?, ?)',
      seasonsResponse.data.map(item => [String(item.id), item.name || '', item.slug || '', json(item, {})])
    );
    insertRows(
      db,
      'INSERT INTO events (id, title, event_date, video_url, results_json, protocol_json, player_stats_json, raw_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      events.map(item => [
        String(item.id), item.title || '', item.date || '', item.sp_video || '', json(item.results, {}),
        json(item.protocol, []), json(item.player_stats, {}), json(item, {}),
      ])
    );

    const eventTeams = [];
    const eventVenues = [];
    const eventLeagues = [];
    const eventSeasons = [];
    const knownTeamIds = new Set(teamsResponse.data.map(item => String(item.id)));
    const knownVenueIds = new Set(venuesResponse.data.map(item => String(item.id)));
    const knownLeagueIds = new Set(leaguesResponse.data.map(item => String(item.id)));
    const knownSeasonIds = new Set(seasonsResponse.data.map(item => String(item.id)));
    const missingTeams = new Map();
    const missingVenues = new Set();
    const missingLeagues = new Set();
    const missingSeasons = new Set();
    events.forEach(event => {
      const eventId = String(event.id);
      const titleTeams = String(event.title || '').split(/\s+vs\s+/i);
      (event.teams || []).forEach((id, side) => {
        const teamId = String(id);
        eventTeams.push([eventId, teamId, side]);
        if (!knownTeamIds.has(teamId) && !missingTeams.has(teamId)) {
          missingTeams.set(teamId, titleTeams[side]?.trim() || `Команда ${teamId}`);
        }
      });
      (event.venues || []).forEach((id, position) => {
        const venueId = String(id);
        eventVenues.push([eventId, venueId, position]);
        if (!knownVenueIds.has(venueId)) missingVenues.add(venueId);
      });
      (event.leagues || []).forEach(id => {
        const leagueId = String(id);
        eventLeagues.push([eventId, leagueId]);
        if (!knownLeagueIds.has(leagueId)) missingLeagues.add(leagueId);
      });
      (event.seasons || []).forEach(id => {
        const seasonId = String(id);
        eventSeasons.push([eventId, seasonId]);
        if (!knownSeasonIds.has(seasonId)) missingSeasons.add(seasonId);
      });
    });

    insertRows(
      db,
      'INSERT OR IGNORE INTO teams (id, name, logo_url, raw_json) VALUES (?, ?, ?, ?)',
      [...missingTeams].map(([id, name]) => [id, name, '', json({ id, name, historical_placeholder: true }, {})])
    );
    insertRows(
      db,
      'INSERT OR IGNORE INTO venues (id, name, address, raw_json) VALUES (?, ?, ?, ?)',
      [...missingVenues].map(id => [id, `Арена ${id}`, '', json({ id, historical_placeholder: true }, {})])
    );
    insertRows(
      db,
      'INSERT OR IGNORE INTO leagues (id, name, slug, raw_json) VALUES (?, ?, ?, ?)',
      [...missingLeagues].map(id => [id, `Лига ${id}`, '', json({ id, historical_placeholder: true }, {})])
    );
    insertRows(
      db,
      'INSERT OR IGNORE INTO seasons (id, name, slug, raw_json) VALUES (?, ?, ?, ?)',
      [...missingSeasons].map(id => [id, `Сезон ${id}`, '', json({ id, historical_placeholder: true }, {})])
    );
    db.run('INSERT INTO metadata (key, value) VALUES (?, ?)', [
      'historical_placeholders',
      JSON.stringify({
        teams: missingTeams.size,
        venues: missingVenues.size,
        leagues: missingLeagues.size,
        seasons: missingSeasons.size,
      }),
    ]);
    console.log('[Seed] Исторические ID вне текущих справочников:', {
      teams: missingTeams.size,
      venues: missingVenues.size,
      leagues: missingLeagues.size,
      seasons: missingSeasons.size,
    });
    insertRows(db, 'INSERT OR IGNORE INTO event_teams (event_id, team_id, side) VALUES (?, ?, ?)', eventTeams);
    insertRows(db, 'INSERT OR IGNORE INTO event_venues (event_id, venue_id, position) VALUES (?, ?, ?)', eventVenues);
    insertRows(db, 'INSERT OR IGNORE INTO event_leagues (event_id, league_id) VALUES (?, ?)', eventLeagues);
    insertRows(db, 'INSERT OR IGNORE INTO event_seasons (event_id, season_id) VALUES (?, ?)', eventSeasons);
    db.run('COMMIT;');
  } catch (error) {
    db.run('ROLLBACK;');
    throw error;
  }

  db.run('VACUUM;');
  const binary = db.export();
  db.close();
  await fs.mkdir(path.dirname(options.output), { recursive: true });
  await fs.writeFile(options.output, binary);

  console.log('[Seed] Готово:', {
    output: path.relative(projectRoot, options.output),
    bytes: binary.byteLength,
    teams: teamsResponse.data.length,
    venues: venuesResponse.data.length,
    players: playersResponse.data.length,
    leagues: leaguesResponse.data.length,
    seasons: seasonsResponse.data.length,
    events: events.length,
  });
}

main().catch(error => {
  console.error('[Seed] Ошибка генерации:', error);
  process.exitCode = 1;
});
