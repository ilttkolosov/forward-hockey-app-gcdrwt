// /services/startupApi.ts
import { dataAvailability } from './dataAvailability';
import { readPersistentCache, writePersistentCache } from './persistentCache';
import AsyncStorage from '@react-native-async-storage/async-storage';


export interface StartupConfig {
  teams_version: number;   // "true" или "false" (как в WordPress)
  players_version: number; // "true" или "false"
  league_id: string | number;
  season_id: string | number;
  tournamentsNow: { tournament_ID: string; tournament_Name: string }[];
  tournamentsPast: { tournament_ID: string; tournament_Name: string }[];
}

export interface StartupConfigResult {
  data: StartupConfig;
  source: 'network' | 'cache';
  savedAt: number;
}

const STARTUP_CONFIG_CACHE_KEY = '@offline/startup-config/v1';
const STARTUP_CONFIG_URL = 'https://www.hc-forward.com/wp-content/themes/marquee/inc/MobileAppConfig.txt';
const REQUEST_TIMEOUT_MS = 8_000;

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
  if (cached) {
    dataAvailability.markCachedDataUsed();
    void fetchStartupConfig().catch(error => {
      console.warn('Фоновое обновление стартовой конфигурации не выполнено:', error);
    });
    return { data: validateStartupConfig(cached.data), source: 'cache', savedAt: cached.savedAt };
  }

  try {
    const data = await fetchStartupConfig();
    return { data, source: 'network', savedAt: Date.now() };
  } catch (error) {
    throw new Error('Для первого запуска требуется подключение к интернету. Проверьте соединение и повторите попытку.', { cause: error });
  }
};
