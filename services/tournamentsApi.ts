import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getReferenceVersion,
  loadTournamentConfigFromDatabase,
  markTournamentConfigsSynchronized,
  saveTournamentConfigToDatabase,
} from '../database/repository';
import { fetchWithTimeout } from './httpClient';
import type { StartupConfig } from './startupApi';

export type TournamentTable = {
  position: string;
  team_id: string;
  team_name: string;
  games: string;
  wins: string;
  losses: string;
  draws: string;
  overtime_wins: string;
  overtime_losses: string;
  points_2x: string;
  goals_for: string;
  goals_against: string;
  coefficient: string;
  goal_diff: string;
  ppg: string;
  ppo: string;
  ppg_percent: string;
  ppa: string;
  ppoa: string;
  pkpercent: string;
};

export interface TournamentConfig {
  league_id: number;
  season_id: number;
  tables: TournamentTable[];
  version?: number;
  generated_at?: string;
}

export interface TournamentSynchronizationResult {
  requested: number;
  updated: number;
  failed: string[];
  targetVersion: number;
  localVersion: number;
  skipped: boolean;
}

const API_URL = 'https://www.hc-forward.com/wp-json/app/v1/get-table';
const CURRENT_TOURNAMENT_DATA_KEY = 'current_tournament_data';
const CURRENT_TOURNAMENT_CONFIG_KEY = 'current_tournament_config';

const asString = (value: unknown, fallback = ''): string => {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
};

const asNumber = (value: unknown, field: string): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Некорректное поле ${field}`);
  return parsed;
};

const normalizeTournamentRow = (value: unknown): TournamentTable | null => {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const teamId = asString(row.team_id);
  if (!teamId) {
    console.warn('[Турниры] Строка без team_id исключена из локальной таблицы:', row.team_name);
    return null;
  }

  return {
    position: asString(row.position),
    team_id: teamId,
    team_name: asString(row.team_name),
    games: asString(row.games, '0'),
    wins: asString(row.wins, '0'),
    losses: asString(row.losses, '0'),
    draws: asString(row.draws, '0'),
    overtime_wins: asString(row.overtime_wins, '0'),
    overtime_losses: asString(row.overtime_losses, '0'),
    points_2x: asString(row.points_2x ?? row.points_3x, '0'),
    goals_for: asString(row.goals_for, '0'),
    goals_against: asString(row.goals_against, '0'),
    coefficient: asString(row.coefficient),
    goal_diff: asString(row.goal_diff, '0'),
    ppg: asString(row.ppg, '0'),
    ppo: asString(row.ppo ?? row.ppg_attempts, '0'),
    ppg_percent: asString(row.ppg_percent, '0'),
    ppa: asString(row.ppa, '0'),
    ppoa: asString(row.ppoa ?? row.ppa_attempts, '0'),
    pkpercent: asString(row.pkpercent ?? row.penalty_kill_percent, '0'),
  };
};

const parseTournamentConfig = (
  rawData: unknown,
  fallbackVersion = 0
): TournamentConfig => {
  if (!rawData || typeof rawData !== 'object') {
    throw new Error('Некорректный формат ответа турнирной таблицы');
  }
  const raw = rawData as Record<string, unknown>;
  if (raw.league_id === undefined || raw.season_id === undefined) {
    throw new Error('В ответе отсутствуют league_id или season_id');
  }

  const rawTables = Array.isArray(raw.data)
    ? raw.data
    : Array.isArray(raw.tables)
      ? raw.tables
      : null;
  if (!rawTables) throw new Error('В ответе отсутствует массив турнирной таблицы');

  const tables = rawTables
    .map(normalizeTournamentRow)
    .filter((row): row is TournamentTable => row !== null);

  return {
    league_id: asNumber(raw.league_id, 'league_id'),
    season_id: asNumber(raw.season_id, 'season_id'),
    tables,
    version: Number.isFinite(Number(raw.version))
      ? Math.max(0, Math.trunc(Number(raw.version)))
      : Math.max(0, Math.trunc(fallbackVersion)),
    generated_at: asString(raw.generated_at) || undefined,
  };
};

const saveLegacyCompatibilityCache = async (
  tournamentId: string,
  config: TournamentConfig
): Promise<void> => {
  await AsyncStorage.multiSet([
    [`${CURRENT_TOURNAMENT_CONFIG_KEY}_${tournamentId}`, JSON.stringify(config)],
    [`${CURRENT_TOURNAMENT_DATA_KEY}_${tournamentId}`, JSON.stringify(config.tables)],
  ]);
};

export const getConfiguredTournamentVersion = (config: StartupConfig): number => {
  const value = config.data_versions?.tournaments ?? config.tournaments_version ?? 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
};

/**
 * Принудительно получает конфигурацию с сервера и атомарно сохраняет её в SQLite.
 * Сетевые ошибки не маскируются кэшем: это необходимо, чтобы не пометить старые
 * данные новой версией. Fallback выполняют вызывающие функции.
 */
export const fetchTournamentConfig = async (
  tournamentId: string,
  targetVersion = 0
): Promise<TournamentConfig> => {
  const startedAt = Date.now();
  const url = `${API_URL}/${encodeURIComponent(tournamentId)}?version=${Math.max(0, targetVersion)}`;
  console.log(`[Турниры] Запрос таблицы ${tournamentId}, целевая версия ${targetVersion}`);

  const response = await fetchWithTimeout(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} при загрузке турнира ${tournamentId}`);

  const rawData = await response.json();
  const config = parseTournamentConfig(rawData, targetVersion);
  const responseVersion = rawData && typeof rawData === 'object'
    ? (rawData as Record<string, unknown>).version
    : undefined;
  const hasExplicitVersion = Boolean(
    responseVersion !== null
    && responseVersion !== undefined
    && Number.isFinite(Number(responseVersion))
  );
  const previous = await loadTournamentConfigFromDatabase<TournamentConfig>(tournamentId);
  let storedVersion = config.version ?? targetVersion;
  if (!hasExplicitVersion && targetVersion === 0 && previous) {
    storedVersion = previous.version;
    config.version = storedVersion;
  }
  if (targetVersion > 0 && storedVersion !== targetVersion) {
    throw new Error(
      `Сервер вернул устаревшую таблицу ${tournamentId}: версия ${storedVersion}, ожидалась ${targetVersion}`
    );
  }
  if (previous && previous.version > storedVersion) {
    throw new Error(
      `Таблица ${tournamentId} не обновлена: серверная версия ${storedVersion} `
      + `старше локальной ${previous.version}`
    );
  }
  await saveTournamentConfigToDatabase(tournamentId, config, storedVersion);
  await saveLegacyCompatibilityCache(tournamentId, config);

  console.log(
    `[Турниры] Таблица ${tournamentId}: получено ${config.tables.length} строк, `
    + `версия ${storedVersion}, источник сервера=${response.headers.get('X-Forward-Cache') || 'wordpress'}, `
    + `${Date.now() - startedAt} мс`
  );
  return config;
};

/** Получает конфигурацию прежде всего из SQLite и однократно мигрирует старый AsyncStorage. */
export const getCachedTournamentConfig = async (
  tournamentId: string
): Promise<TournamentConfig | null> => {
  const stored = await loadTournamentConfigFromDatabase<TournamentConfig>(tournamentId);
  if (stored) {
    try {
      return {
        ...parseTournamentConfig(stored.config, stored.version),
        version: stored.version,
      };
    } catch (error) {
      console.warn(`[Турниры] SQLite-кэш турнира ${tournamentId} повреждён:`, error);
    }
  }

  const legacyKey = `${CURRENT_TOURNAMENT_CONFIG_KEY}_${tournamentId}`;
  try {
    const legacy = await AsyncStorage.getItem(legacyKey);
    if (!legacy) return null;
    const config = parseTournamentConfig(JSON.parse(legacy), 0);
    await saveTournamentConfigToDatabase(tournamentId, config, config.version ?? 0);
    console.log(`[Турниры] Конфигурация ${tournamentId} перенесена из AsyncStorage в SQLite`);
    return config;
  } catch (error) {
    console.warn(`[Турниры] Не удалось прочитать старый кэш турнира ${tournamentId}:`, error);
    return null;
  }
};

export const fetchTournamentTable = async (tournamentId: string): Promise<TournamentTable[]> => {
  try {
    return (await fetchTournamentConfig(tournamentId)).tables;
  } catch (error) {
    const cached = await getCachedTournamentTable(tournamentId);
    if (cached) {
      console.warn(`[Турниры] Таблица ${tournamentId}: сеть недоступна, используется SQLite`, error);
      return cached;
    }
    throw error;
  }
};

/** `null` означает отсутствие кэша; пустой массив является корректной пустой таблицей. */
export const getCachedTournamentTable = async (
  tournamentId: string
): Promise<TournamentTable[] | null> => {
  return (await getCachedTournamentConfig(tournamentId))?.tables ?? null;
};

const runWithConcurrency = async (
  ids: string[],
  concurrency: number,
  task: (id: string) => Promise<void>
): Promise<void> => {
  const queue = [...ids];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) {
      const id = queue.shift();
      if (id) await task(id);
    }
  });
  await Promise.all(workers);
};

/**
 * Обновляет только отсутствующие или устаревшие таблицы. Общая версия отмечается
 * синхронизированной только после успешного получения всех обязательных данных.
 */
export const synchronizeTournamentConfigs = async (
  tournamentIds: string[],
  targetVersion: number,
  canUseNetwork: boolean
): Promise<TournamentSynchronizationResult> => {
  const ids = [...new Set(tournamentIds.map(String).filter(id => /^\d+$/.test(id)))];
  const normalizedTargetVersion = Math.max(0, Math.trunc(targetVersion));
  const localVersion = await getReferenceVersion('tournaments');
  const cached = await Promise.all(ids.map(id => getCachedTournamentConfig(id)));
  const staleIds = ids.filter((id, index) => {
    const item = cached[index];
    return !item || (
      normalizedTargetVersion > 0
      && (item.version ?? 0) !== normalizedTargetVersion
    );
  });

  if (staleIds.length === 0) {
    if (normalizedTargetVersion > 0 && localVersion !== normalizedTargetVersion) {
      await markTournamentConfigsSynchronized(normalizedTargetVersion);
    }
    console.log(
      `[Турниры] SQLite актуален: ${ids.length} таблиц, версия `
      + `${normalizedTargetVersion || `не задана (локальная ${localVersion})`}; сетевые запросы не требуются`
    );
    return {
      requested: 0,
      updated: 0,
      failed: [],
      targetVersion: normalizedTargetVersion,
      localVersion,
      skipped: true,
    };
  }

  if (!canUseNetwork) {
    console.log(
      `[Турниры] Обновление ${staleIds.length} таблиц отложено: интернет недоступен; `
      + `локальная версия ${localVersion}/${normalizedTargetVersion}`
    );
    return {
      requested: 0,
      updated: 0,
      failed: staleIds,
      targetVersion: normalizedTargetVersion,
      localVersion,
      skipped: true,
    };
  }

  const failed: string[] = [];
  let updated = 0;
  console.log(
    `[Турниры] Требуется обновить ${staleIds.length} из ${ids.length} таблиц; `
    + `версия ${localVersion} → ${normalizedTargetVersion}`
  );
  await runWithConcurrency(staleIds, 2, async id => {
    try {
      await fetchTournamentConfig(id, normalizedTargetVersion);
      updated += 1;
    } catch (error) {
      failed.push(id);
      console.warn(`[Турниры] Не удалось обновить таблицу ${id}:`, error);
    }
  });

  if (failed.length === 0 && normalizedTargetVersion > 0) {
    await markTournamentConfigsSynchronized(normalizedTargetVersion);
    console.log(`[Турниры] Все таблицы синхронизированы, версия ${normalizedTargetVersion}`);
  } else if (failed.length === 0) {
    console.log('[Турниры] Все отсутствовавшие таблицы загружены; серверная версия не задана');
  } else {
    console.warn(
      `[Турниры] Версия ${normalizedTargetVersion} не зафиксирована: `
      + `ошибка для ID ${failed.join(', ')}`
    );
  }

  return {
    requested: staleIds.length,
    updated,
    failed,
    targetVersion: normalizedTargetVersion,
    localVersion,
    skipped: false,
  };
};
