// /services/startupApi.ts
import { dataAvailability } from './dataAvailability';
import { readPersistentCache, writePersistentCache } from './persistentCache';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { getMetadata } from '../database/repository';


export interface StartupConfig {
  config_schema_version?: number;
  config_revision?: number;
  generated_at?: string;
  teams_version: number;
  players_version: number;
  venues_version?: number;
  leagues_version?: number;
  seasons_version?: number;
  reference_version?: number;
  tournaments_version?: number;
  data_versions?: Partial<Record<'teams' | 'players' | 'venues' | 'leagues' | 'seasons' | 'tournaments', number>>;
  league_id: string | number;
  season_id: string | number;
  tournamentsNow: { tournament_ID: string; tournament_Name: string }[];
  tournamentsPast: { tournament_ID: string; tournament_Name: string }[];
  app?: {
    latest_version?: { ios?: string; android?: string };
    minimum_supported_version?: { ios?: string; android?: string };
    update_message?: string;
    app_store_url?: string;
    google_play_url?: string;
    android_download_url?: string;
  };
  api?: {
    base_url?: string;
    request_timeout_seconds?: number;
    tournament_table_cache_ttl_seconds?: number;
  };
  sync?: {
    historical_start_date?: string;
    historical_delay_days?: number;
    event_chunk_days?: number;
  };
  features?: Record<string, boolean>;
  maintenance?: { enabled?: boolean; message?: string; retry_after_seconds?: number };
  announcement?: { enabled?: boolean; id?: string; title?: string; message?: string; url?: string };
}

export interface StartupConfigResult {
  data: StartupConfig;
  source: 'network' | 'cache';
  savedAt: number;
  /** Продолжающееся обновление сети, если старт уже разрешён из локального кэша. */
  backgroundRefresh?: Promise<StartupConfig | null>;
}

const STARTUP_CONFIG_CACHE_KEY = '@offline/startup-config/v1';
const STARTUP_CONFIG_URL = 'https://www.hc-forward.com/wp-content/themes/marquee/inc/MobileAppConfig.txt';
const REQUEST_TIMEOUT_MS = 8_000;
const CACHED_CONFIG_NETWORK_GRACE_MS = 750;

const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

const validateStartupConfig = (value: unknown): StartupConfig => {
  const config = value as Partial<StartupConfig> | null;
  if (!config || typeof config !== 'object') throw new Error('Пустая стартовая конфигурация');
  if (!Array.isArray(config.tournamentsNow) || !Array.isArray(config.tournamentsPast)) {
    throw new Error('Некорректный список турниров в стартовой конфигурации');
  }
  if (typeof config.teams_version !== 'number' || typeof config.players_version !== 'number') {
    throw new Error('Некорректные версии данных в стартовой конфигурации');
  }
  return config as StartupConfig;
};

const migrateLegacyStartupConfig = async (): Promise<StartupConfig | null> => {
  const values = await AsyncStorage.multiGet([
    'teams_version',
    'players_version',
    'tournaments_now',
    'tournaments_past',
  ]);
  const storage = Object.fromEntries(values);
  const parseArray = (raw?: string | null) => {
    try {
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };
  const tournamentsNow = parseArray(storage.tournaments_now);
  const tournamentsPast = parseArray(storage.tournaments_past);
  const teamsVersion = Number(storage.teams_version || 0);
  const playersVersion = Number(storage.players_version || 0);
  if (teamsVersion === 0 && playersVersion === 0 && tournamentsNow.length === 0 && tournamentsPast.length === 0) {
    return null;
  }
  const migrated: StartupConfig = {
    teams_version: teamsVersion,
    players_version: playersVersion,
    league_id: '0',
    season_id: '0',
    tournamentsNow,
    tournamentsPast,
  };
  await writePersistentCache(STARTUP_CONFIG_CACHE_KEY, migrated);
  return migrated;
};

/**
 * Получает стартовую конфигурацию из WordPress API
 */
/*export const fetchStartupConfig = async (): Promise<StartupConfig> => {
  console.log("Начали получение конфигурации");
  try {
    const response = await apiService.get('/get-startup-config');
    if (response.status === 'success' && response.data) {
      return response.data as StartupConfig;
    }
    throw new Error('Invalid response format');
  } catch (error) {
    console.error('❌ Failed to fetch startup config:', error);
    // Возвращаем значения по умолчанию при ошибке
    return {
      teams_version: 0,
      players_version: 0,
      league_id: '0',
      season_id: '0',
      tournamentsNow: [],
      tournamentsPast: []
    };
  }
}*/

/**
 * Загружает стартовую конфигурацию из статического JSON-файла
 */
export const fetchStartupConfig = async (): Promise<StartupConfig> => {
  console.log('Начали получение конфигурации из статического файла');

  // Генерируем уникальный URL для обхода кэша
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${STARTUP_CONFIG_URL}?_t=${Date.now()}`, {
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
        signal: controller.signal,
      });

      if (!response.ok) throw new Error(`HTTP ${response.status} при загрузке MobileAppConfig.txt`);

      const text = await response.text();
      const result = JSON.parse(text);
      if (result.status !== 'success') throw new Error('Статус стартовой конфигурации не success');

      const config = validateStartupConfig(result.data);
      await writePersistentCache(STARTUP_CONFIG_CACHE_KEY, config);
      dataAvailability.markNetworkSuccess();
      return config;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await wait(500);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Не удалось получить стартовую конфигурацию');
};

export const loadStartupConfig = async (): Promise<StartupConfigResult> => {
  let cached = await readPersistentCache<StartupConfig>(STARTUP_CONFIG_CACHE_KEY);
  if (!cached) {
    const migrated = await migrateLegacyStartupConfig();
    if (migrated) cached = { data: migrated, savedAt: Date.now(), schemaVersion: 1 };
  }
  if (!cached) {
    const bundled = await getMetadata('startup_config');
    if (bundled) {
      const data = validateStartupConfig(JSON.parse(bundled));
      await writePersistentCache(STARTUP_CONFIG_CACHE_KEY, data);
      cached = { data, savedAt: Date.now(), schemaVersion: 1 };
    }
  }

  const network = await NetInfo.fetch();
  const canUseNetwork = network.isConnected !== false && network.isInternetReachable !== false;
  if (canUseNetwork) {
    const networkRefresh = fetchStartupConfig().catch(error => {
      console.warn('Стартовая конфигурация не обновлена, используется локальная:', error);
      return null;
    });

    if (cached) {
      const result = await Promise.race([
        networkRefresh.then(data => ({ kind: 'network' as const, data })),
        wait(CACHED_CONFIG_NETWORK_GRACE_MS).then(() => ({ kind: 'cache' as const, data: null })),
      ]);
      if (result.kind === 'network' && result.data) {
        return { data: result.data, source: 'network', savedAt: Date.now() };
      }
      if (result.kind === 'cache') {
        dataAvailability.markCachedDataUsed('Сеть медленно отвечает на запрос конфигурации');
        console.log(
          `[Инициализация] Конфигурация: сеть не ответила за ${CACHED_CONFIG_NETWORK_GRACE_MS} мс, `
          + 'запуск продолжается с локальной копией'
        );
        return {
          data: validateStartupConfig(cached.data),
          source: 'cache',
          savedAt: cached.savedAt,
          backgroundRefresh: networkRefresh,
        };
      }
    } else {
      const data = await networkRefresh;
      if (data) return { data, source: 'network', savedAt: Date.now() };
    }
  }

  if (cached) {
    dataAvailability.markCachedDataUsed();
    return { data: validateStartupConfig(cached.data), source: 'cache', savedAt: cached.savedAt };
  }
  throw new Error('Не удалось открыть встроенную конфигурацию приложения. Переустановите приложение или повторите попытку.', {
    cause: new Error('Startup config is absent in cache and bundled database'),
  });
};
