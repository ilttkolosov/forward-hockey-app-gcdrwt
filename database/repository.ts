import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import type { ApiTeam } from '../services/apiService';
import type { ApiEvent, ApiLeague, ApiSeason, ApiVenue } from '../types/apiTypes';
import type { Training } from '../types/training';
import { DATABASE_NAME, migrateDatabase } from './index';
import { enqueueDatabaseWrite } from './writeCoordinator';

export type ReferenceEntity = 'teams' | 'venues' | 'leagues' | 'seasons' | 'players' | 'tournaments';

export interface LocalEventQuery {
  date_from?: string;
  date_to?: string;
  league?: string;
  season?: string;
  teams?: string;
  f2f?: boolean;
}

interface RawJsonRow {
  raw_json: string;
}

interface ValueRow {
  value: string;
}

interface VersionRow {
  version: number;
}

interface TournamentConfigRow extends RawJsonRow {
  version: number;
}

interface TournamentCatalogRow {
  tournament_id: string;
  name: string;
  category: 'current' | 'past';
}

export interface TournamentCatalogItem {
  tournament_ID: string;
  tournament_Name: string;
}

export interface TournamentCatalog {
  current: TournamentCatalogItem[];
  past: TournamentCatalogItem[];
}

export interface StoredTournamentConfig<TConfig> {
  config: TConfig;
  version: number;
}

export interface NewsArticleRecord {
  id: number;
  published_at: string;
  modified_at: string;
  title: string;
  excerpt: string;
  link: string;
  featured_media_id: number;
  image_url: string | null;
  image_alt: string | null;
  content_text: string;
  content_html: string;
  content_loaded: number;
}

let databasePromise: Promise<SQLiteDatabase> | null = null;

const withExclusiveDatabaseWrite = (
  db: SQLiteDatabase,
  operation: (transaction: SQLiteDatabase) => Promise<void>
): Promise<void> =>
  enqueueDatabaseWrite(() => db.withExclusiveTransactionAsync(operation));

export const getDatabase = async (): Promise<SQLiteDatabase> => {
  if (!databasePromise) {
    databasePromise = openDatabaseAsync(DATABASE_NAME).then(async database => {
      await migrateDatabase(database);
      return database;
    });
  }
  return databasePromise;
};

const parseRows = <T>(rows: RawJsonRow[]): T[] => rows.map(row => JSON.parse(row.raw_json) as T);
const nowIso = () => new Date().toISOString();

export const loadNewsPageFromDatabase = async (
  offset: number,
  limit: number,
): Promise<NewsArticleRecord[]> => {
  const db = await getDatabase();
  return db.getAllAsync<NewsArticleRecord>(
    `SELECT id, published_at, modified_at, title, excerpt, link, featured_media_id,
            image_url, image_alt, content_text, content_html, content_loaded
       FROM news_articles
      ORDER BY published_at DESC, id DESC
      LIMIT ? OFFSET ?`,
    limit,
    offset,
  );
};

export const loadNewsArticlesByIds = async (ids: number[]): Promise<NewsArticleRecord[]> => {
  if (ids.length === 0) return [];
  const db = await getDatabase();
  const placeholders = ids.map(() => '?').join(',');
  return db.getAllAsync<NewsArticleRecord>(
    `SELECT id, published_at, modified_at, title, excerpt, link, featured_media_id,
            image_url, image_alt, content_text, content_html, content_loaded
       FROM news_articles WHERE id IN (${placeholders})`,
    ...ids,
  );
};

export const loadNewsArticleFromDatabase = async (id: number): Promise<NewsArticleRecord | null> => {
  const rows = await loadNewsArticlesByIds([id]);
  return rows[0] || null;
};

export const upsertNewsIndexes = async (records: NewsArticleRecord[]): Promise<void> => {
  if (records.length === 0) return;
  const db = await getDatabase();
  await withExclusiveDatabaseWrite(db, async tx => {
    for (const record of records) {
      await tx.runAsync(
        `INSERT INTO news_articles (
           id, published_at, modified_at, title, excerpt, link, featured_media_id,
           image_url, image_alt, content_text, content_html, content_loaded, indexed_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', 0, ?)
         ON CONFLICT(id) DO UPDATE SET
           published_at = excluded.published_at,
           title = excluded.title,
           excerpt = excluded.excerpt,
           link = excluded.link,
           featured_media_id = excluded.featured_media_id,
           image_url = excluded.image_url,
           image_alt = excluded.image_alt,
           content_text = CASE WHEN news_articles.modified_at <> excluded.modified_at THEN '' ELSE news_articles.content_text END,
           content_html = CASE WHEN news_articles.modified_at <> excluded.modified_at THEN '' ELSE news_articles.content_html END,
           content_loaded = CASE WHEN news_articles.modified_at <> excluded.modified_at THEN 0 ELSE news_articles.content_loaded END,
           modified_at = excluded.modified_at,
           indexed_at = excluded.indexed_at`,
        record.id,
        record.published_at,
        record.modified_at,
        record.title,
        record.excerpt,
        record.link,
        record.featured_media_id,
        record.image_url,
        record.image_alt,
        nowIso(),
      );
    }
  });
};

export const saveNewsArticleContent = async (record: NewsArticleRecord): Promise<void> => {
  const db = await getDatabase();
  await withExclusiveDatabaseWrite(db, async tx => {
    await tx.runAsync(
      `INSERT INTO news_articles (
         id, published_at, modified_at, title, excerpt, link, featured_media_id,
         image_url, image_alt, content_text, content_html, content_loaded, indexed_at, content_synced_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         published_at = excluded.published_at,
         modified_at = excluded.modified_at,
         title = excluded.title,
         excerpt = CASE WHEN excluded.excerpt <> '' THEN excluded.excerpt ELSE news_articles.excerpt END,
         link = excluded.link,
         featured_media_id = excluded.featured_media_id,
         image_url = excluded.image_url,
         image_alt = excluded.image_alt,
         content_text = excluded.content_text,
         content_html = excluded.content_html,
         content_loaded = 1,
         indexed_at = excluded.indexed_at,
         content_synced_at = excluded.content_synced_at`,
      record.id,
      record.published_at,
      record.modified_at,
      record.title,
      record.excerpt,
      record.link,
      record.featured_media_id,
      record.image_url,
      record.image_alt,
      record.content_text,
      record.content_html,
      nowIso(),
      nowIso(),
    );
  });
};

export const getMetadata = async (key: string): Promise<string | null> => {
  const db = await getDatabase();
  return (await db.getFirstAsync<ValueRow>('SELECT value FROM metadata WHERE key = ?', key))?.value ?? null;
};

export const setMetadata = async (key: string, value: string): Promise<void> => {
  const db = await getDatabase();
  await db.runAsync(
    'INSERT INTO metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value
  );
};

export const getReferenceVersion = async (entity: ReferenceEntity): Promise<number> => {
  const db = await getDatabase();
  return Number((await db.getFirstAsync<VersionRow>(
    'SELECT version FROM sync_versions WHERE entity = ?',
    entity
  ))?.version ?? 0);
};

const setReferenceVersion = async (
  db: SQLiteDatabase,
  entity: ReferenceEntity,
  version: number
): Promise<void> => {
  await db.runAsync(
    `INSERT INTO sync_versions (entity, version, synced_at) VALUES (?, ?, ?)
     ON CONFLICT(entity) DO UPDATE SET version = excluded.version, synced_at = excluded.synced_at`,
    entity,
    version,
    nowIso()
  );
};

export const loadTournamentConfigFromDatabase = async <TConfig>(
  tournamentId: string
): Promise<StoredTournamentConfig<TConfig> | null> => {
  const db = await getDatabase();
  const row = await db.getFirstAsync<TournamentConfigRow>(
    'SELECT raw_json, version FROM tournament_configs WHERE tournament_id = ?',
    tournamentId
  );
  if (!row) return null;
  try {
    return {
      config: JSON.parse(row.raw_json) as TConfig,
      version: Number(row.version || 0),
    };
  } catch (error) {
    console.warn(`[Database] Повреждена конфигурация турнира ${tournamentId}:`, error);
    return null;
  }
};

export const saveTournamentConfigToDatabase = async <TConfig extends {
  league_id?: number;
  season_id?: number;
  generated_at?: string;
}>(
  tournamentId: string,
  config: TConfig,
  version: number
): Promise<void> => {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO tournament_configs
      (tournament_id, league_id, season_id, version, generated_at, updated_at, raw_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(tournament_id) DO UPDATE SET
       league_id=excluded.league_id,
       season_id=excluded.season_id,
       version=excluded.version,
       generated_at=excluded.generated_at,
       updated_at=excluded.updated_at,
       raw_json=excluded.raw_json`,
    tournamentId,
    config.league_id ?? null,
    config.season_id ?? null,
    Math.max(0, Math.trunc(version)),
    config.generated_at || null,
    nowIso(),
    JSON.stringify(config)
  );
};

export const markTournamentConfigsSynchronized = async (version: number): Promise<void> => {
  const db = await getDatabase();
  await setReferenceVersion(db, 'tournaments', Math.max(0, Math.trunc(version)));
};

export const loadTournamentCatalogFromDatabase = async (): Promise<TournamentCatalog> => {
  const db = await getDatabase();
  const rows = await db.getAllAsync<TournamentCatalogRow>(
    `SELECT tournament_id, name, category
     FROM tournament_catalog
     ORDER BY CASE category WHEN 'current' THEN 0 ELSE 1 END, display_order, tournament_id`
  );
  const toItem = (row: TournamentCatalogRow): TournamentCatalogItem => ({
    tournament_ID: row.tournament_id,
    tournament_Name: row.name,
  });
  return {
    current: rows.filter(row => row.category === 'current').map(toItem),
    past: rows.filter(row => row.category === 'past').map(toItem),
  };
};

/**
 * Replaces only the startup-config membership/order. Tournament tables remain
 * in tournament_configs, so historical data is retained between revisions.
 */
export const replaceTournamentCatalog = async (
  current: TournamentCatalogItem[],
  past: TournamentCatalogItem[],
  configRevision = 0,
): Promise<void> => {
  const db = await getDatabase();
  await withExclusiveDatabaseWrite(db, async tx => {
    await tx.runAsync('DELETE FROM tournament_catalog');
    const insert = async (
      item: TournamentCatalogItem,
      category: 'current' | 'past',
      displayOrder: number,
    ) => {
      await tx.runAsync(
        `INSERT INTO tournament_catalog
          (tournament_id, name, category, display_order, config_revision, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(tournament_id) DO UPDATE SET
           name=excluded.name,
           category=excluded.category,
           display_order=excluded.display_order,
           config_revision=excluded.config_revision,
           updated_at=excluded.updated_at`,
        String(item.tournament_ID),
        item.tournament_Name || `Турнир ${item.tournament_ID}`,
        category,
        displayOrder,
        Math.max(0, Math.trunc(configRevision)),
        nowIso(),
      );
    };
    for (let index = 0; index < current.length; index += 1) {
      await insert(current[index], 'current', index);
    }
    for (let index = 0; index < past.length; index += 1) {
      await insert(past[index], 'past', index);
    }
  });
};

export const loadTeamsFromDatabase = async (): Promise<ApiTeam[]> => {
  const db = await getDatabase();
  return parseRows<ApiTeam>(await db.getAllAsync<RawJsonRow>('SELECT raw_json FROM teams ORDER BY name'));
};

export const loadVenuesFromDatabase = async (): Promise<ApiVenue[]> => {
  const db = await getDatabase();
  return parseRows<ApiVenue>(await db.getAllAsync<RawJsonRow>('SELECT raw_json FROM venues ORDER BY name'));
};

export const loadLeaguesFromDatabase = async (): Promise<ApiLeague[]> => {
  const db = await getDatabase();
  return parseRows<ApiLeague>(await db.getAllAsync<RawJsonRow>('SELECT raw_json FROM leagues ORDER BY name'));
};

export const loadSeasonsFromDatabase = async (): Promise<ApiSeason[]> => {
  const db = await getDatabase();
  return parseRows<ApiSeason>(await db.getAllAsync<RawJsonRow>('SELECT raw_json FROM seasons ORDER BY name'));
};

export interface DatabasePlayer {
  id: number;
  name: string;
  nationality: string;
  number: number | null;
  position: string;
  birth_date: string;
  metrics: Record<string, string>;
  photo_url: string;
}

export const loadPlayersFromDatabase = async (): Promise<DatabasePlayer[]> => {
  const db = await getDatabase();
  return parseRows<DatabasePlayer>(await db.getAllAsync<RawJsonRow>('SELECT raw_json FROM players ORDER BY number, name'));
};

export const replaceTeams = async (items: ApiTeam[], version: number): Promise<void> => {
  const db = await getDatabase();
  await withExclusiveDatabaseWrite(db, async tx => {
    await tx.runAsync('DELETE FROM teams WHERE id NOT IN (SELECT team_id FROM event_teams)');
    for (const item of items) {
      await tx.runAsync(
        `INSERT INTO teams (id, name, logo_url, updated_at, raw_json) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, logo_url=excluded.logo_url,
           updated_at=excluded.updated_at, raw_json=excluded.raw_json`,
        String(item.id), item.name || '', item.logo_url || '', nowIso(), JSON.stringify(item)
      );
    }
    await setReferenceVersion(tx, 'teams', version);
  });
};

export const replaceVenues = async (items: ApiVenue[], version: number): Promise<void> => {
  const db = await getDatabase();
  await withExclusiveDatabaseWrite(db, async tx => {
    for (const item of items) {
      await tx.runAsync(
        `INSERT INTO venues (id, name, address, latitude, longitude, updated_at, raw_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, address=excluded.address,
           latitude=excluded.latitude, longitude=excluded.longitude,
           updated_at=excluded.updated_at, raw_json=excluded.raw_json`,
        String(item.id), item.name || '', item.address || '', item.coordinates?.latitude ?? null,
        item.coordinates?.longitude ?? null, nowIso(), JSON.stringify(item)
      );
    }
    await setReferenceVersion(tx, 'venues', version);
  });
};

export const replaceLeagues = async (items: ApiLeague[], version: number): Promise<void> => {
  const db = await getDatabase();
  await withExclusiveDatabaseWrite(db, async tx => {
    for (const item of items) {
      await tx.runAsync(
        `INSERT INTO leagues (id, name, slug, updated_at, raw_json) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, slug=excluded.slug,
           updated_at=excluded.updated_at, raw_json=excluded.raw_json`,
        String(item.id), item.name || '', item.slug || '', nowIso(), JSON.stringify(item)
      );
    }
    await setReferenceVersion(tx, 'leagues', version);
  });
};

export const replaceSeasons = async (items: ApiSeason[], version: number): Promise<void> => {
  const db = await getDatabase();
  await withExclusiveDatabaseWrite(db, async tx => {
    // Intentionally additive: historical seasons must survive later snapshots.
    for (const item of items) {
      await tx.runAsync(
        `INSERT INTO seasons (id, name, slug, updated_at, raw_json) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, slug=excluded.slug,
           updated_at=excluded.updated_at, raw_json=excluded.raw_json`,
        String(item.id), item.name || '', item.slug || '', nowIso(), JSON.stringify(item)
      );
    }
    await setReferenceVersion(tx, 'seasons', version);
  });
};

export const replacePlayers = async (items: DatabasePlayer[], version: number): Promise<void> => {
  const db = await getDatabase();
  await withExclusiveDatabaseWrite(db, async tx => {
    await tx.runAsync('DELETE FROM players');
    for (const item of items) {
      await tx.runAsync(
        `INSERT INTO players
          (id, name, nationality, number, position, birth_date, metrics_json, photo_url, updated_at, raw_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        String(item.id), item.name || '', item.nationality || '', item.number ?? null,
        item.position || '', item.birth_date || '', JSON.stringify(item.metrics || {}),
        item.photo_url || '', nowIso(), JSON.stringify(item)
      );
    }
    await setReferenceVersion(tx, 'players', version);
  });
};

const ensureReference = async (
  tx: SQLiteDatabase,
  table: 'teams' | 'venues' | 'leagues' | 'seasons',
  id: string
): Promise<void> => {
  const label = table === 'teams' ? 'Команда' : table === 'venues' ? 'Арена' : table === 'leagues' ? 'Лига' : 'Сезон';
  const raw = JSON.stringify({ id, name: `${label} ${id}`, historical_placeholder: true });
  const extraColumn = table === 'teams' ? 'logo_url' : table === 'venues' ? 'address' : 'slug';
  await tx.runAsync(
    `INSERT OR IGNORE INTO ${table} (id, name, ${extraColumn}, raw_json) VALUES (?, ?, '', ?)`,
    id,
    `${label} ${id}`,
    raw
  );
};

export const upsertEvents = async (events: ApiEvent[]): Promise<number> => {
  if (events.length === 0) return 0;
  const db = await getDatabase();
  await withExclusiveDatabaseWrite(db, async tx => {
    for (const event of events) {
      const eventId = String(event.id);
      const teamIds = (event.teams || []).map(String);
      const venueIds = (event.venues || []).map(String);
      const leagueIds = (event.leagues || []).map(String);
      const seasonIds = (event.seasons || []).map(String);
      for (const id of teamIds) await ensureReference(tx, 'teams', id);
      for (const id of venueIds) await ensureReference(tx, 'venues', id);
      for (const id of leagueIds) await ensureReference(tx, 'leagues', id);
      for (const id of seasonIds) await ensureReference(tx, 'seasons', id);

      await tx.runAsync(
        `INSERT INTO events
          (id, title, event_date, video_url, results_json, protocol_json, player_stats_json, updated_at, raw_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET title=excluded.title, event_date=excluded.event_date,
           video_url=excluded.video_url, results_json=excluded.results_json,
           protocol_json=excluded.protocol_json, player_stats_json=excluded.player_stats_json,
           updated_at=excluded.updated_at, raw_json=excluded.raw_json`,
        eventId, event.title || '', event.date, event.sp_video || '', JSON.stringify(event.results || {}),
        JSON.stringify(event.protocol || []), JSON.stringify(event.player_stats || {}), nowIso(), JSON.stringify(event)
      );
      await tx.runAsync('DELETE FROM event_teams WHERE event_id = ?', eventId);
      await tx.runAsync('DELETE FROM event_venues WHERE event_id = ?', eventId);
      await tx.runAsync('DELETE FROM event_leagues WHERE event_id = ?', eventId);
      await tx.runAsync('DELETE FROM event_seasons WHERE event_id = ?', eventId);
      for (let side = 0; side < teamIds.length; side += 1) {
        await tx.runAsync('INSERT INTO event_teams (event_id, team_id, side) VALUES (?, ?, ?)', eventId, teamIds[side], side);
      }
      for (let position = 0; position < venueIds.length; position += 1) {
        await tx.runAsync('INSERT INTO event_venues (event_id, venue_id, position) VALUES (?, ?, ?)', eventId, venueIds[position], position);
      }
      for (const id of leagueIds) await tx.runAsync('INSERT INTO event_leagues (event_id, league_id) VALUES (?, ?)', eventId, id);
      for (const id of seasonIds) await tx.runAsync('INSERT INTO event_seasons (event_id, season_id) VALUES (?, ?)', eventId, id);
    }
  });
  return events.length;
};

export const queryEvents = async (query: LocalEventQuery): Promise<ApiEvent[]> => {
  const db = await getDatabase();
  const conditions: string[] = [];
  const values: string[] = [];
  if (query.date_from) {
    conditions.push('substr(e.event_date, 1, 10) >= ?');
    values.push(query.date_from);
  }
  if (query.date_to) {
    conditions.push('substr(e.event_date, 1, 10) <= ?');
    values.push(query.date_to);
  }
  if (query.league) {
    conditions.push('EXISTS (SELECT 1 FROM event_leagues el WHERE el.event_id=e.id AND el.league_id=?)');
    values.push(query.league);
  }
  if (query.season) {
    conditions.push('EXISTS (SELECT 1 FROM event_seasons es WHERE es.event_id=e.id AND es.season_id=?)');
    values.push(query.season);
  }
  const teamIds = query.teams?.split(/[,| ]+/).filter(Boolean) ?? [];
  if (query.f2f) {
    teamIds.forEach(id => {
      conditions.push('EXISTS (SELECT 1 FROM event_teams et WHERE et.event_id=e.id AND et.team_id=?)');
      values.push(id);
    });
  } else if (teamIds.length > 0) {
    conditions.push(`EXISTS (SELECT 1 FROM event_teams et WHERE et.event_id=e.id AND et.team_id IN (${teamIds.map(() => '?').join(',')}))`);
    values.push(...teamIds);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await db.getAllAsync<RawJsonRow>(
    `SELECT e.raw_json FROM events e ${where} ORDER BY e.event_date ASC`,
    values
  );
  return parseRows<ApiEvent>(rows);
};

export const getEventFromDatabase = async (id: string): Promise<ApiEvent | null> => {
  const db = await getDatabase();
  const row = await db.getFirstAsync<RawJsonRow>('SELECT raw_json FROM events WHERE id = ?', id);
  return row ? JSON.parse(row.raw_json) as ApiEvent : null;
};

export interface TrainingDatabaseQuery {
  date_from?: string;
  date_to?: string;
  team?: string;
}

export const loadTrainingsFromDatabase = async (
  query: TrainingDatabaseQuery = {}
): Promise<Training[]> => {
  const db = await getDatabase();
  const conditions: string[] = [];
  const values: string[] = [];
  if (query.date_from) {
    conditions.push('substr(start_at, 1, 10) >= ?');
    values.push(query.date_from);
  }
  if (query.date_to) {
    conditions.push('substr(start_at, 1, 10) <= ?');
    values.push(query.date_to);
  }
  if (query.team) {
    conditions.push('team_id = ?');
    values.push(query.team);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await db.getAllAsync<RawJsonRow>(
    `SELECT raw_json FROM trainings ${where} ORDER BY start_at ASC, type ASC`,
    values
  );
  return parseRows<Training>(rows);
};

/**
 * Полностью заменяет только успешно загруженное окно дат. Поэтому удалённое на
 * сайте занятие исчезнет локально, а кэш за пределами окна останется нетронутым.
 */
export const replaceTrainingsInRange = async (
  items: Training[],
  dateFrom: string,
  dateTo: string,
  teamId: string
): Promise<number> => {
  const db = await getDatabase();
  const synchronizedAt = nowIso();
  const dateToExclusiveValue = new Date(`${dateTo}T00:00:00.000Z`);
  dateToExclusiveValue.setUTCDate(dateToExclusiveValue.getUTCDate() + 1);
  const dateToExclusive = dateToExclusiveValue.toISOString().slice(0, 10);
  await withExclusiveDatabaseWrite(db, async tx => {
    await tx.runAsync(
      `DELETE FROM trainings
       WHERE team_id = ? AND start_at >= ? AND start_at < ?`,
      teamId,
      dateFrom,
      dateToExclusive
    );
    // Keep well below SQLite's usual bind-variable limit while avoiding one
    // native bridge/finalize cycle per training. For the current 19-row
    // schedule this is one INSERT instead of 19 separate statements.
    const insertChunkSize = 50;
    for (let offset = 0; offset < items.length; offset += insertChunkSize) {
      const chunk = items.slice(offset, offset + insertChunkSize);
      const placeholders = chunk
        .map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .join(', ');
      const values = chunk.flatMap(item => [
        String(item.id),
        item.uid,
        item.type,
        item.title,
        item.start_at,
        item.end_at,
        item.timezone || 'Europe/Moscow',
        item.location || '',
        item.note || '',
        item.team?.id || '',
        item.team?.name || '',
        item.updated_at || synchronizedAt,
        JSON.stringify(item),
      ]);
      await tx.runAsync(
        `INSERT INTO trainings
          (id, uid, type, title, start_at, end_at, timezone, location, note,
           team_id, team_name, updated_at, raw_json)
         VALUES ${placeholders}`,
        ...values
      );
    }
    await tx.runAsync(
      `INSERT INTO metadata (key, value) VALUES ('trainings_last_sync_at', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      synchronizedAt
    );
  });
  return items.length;
};
