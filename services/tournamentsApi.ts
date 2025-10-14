// services/tournamentsApi.ts
import { apiService } from './apiService';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  tables: TournamentTable[]; // Добавлен ключ "tables"
}

// === НОВЫЕ КЛЮЧИ ДЛЯ КЭШИРОВАНИЯ ВСЕЙ КОНФИГУРАЦИИ ТУРНИРА ===
const CURRENT_TOURNAMENT_DATA_KEY = 'current_tournament_data'; // Для таблицы (старый ключ)
const CURRENT_TOURNAMENT_CONFIG_KEY = 'current_tournament_config'; // Для всей конфигурации (новый ключ)

/**
 * Получает ВСЮ информацию о турнире (конфиг) по ID и сохраняет в кэш
 */
export const fetchTournamentConfig = async (tournamentId: string): Promise<TournamentConfig> => {
  try {
    // Используем тот же URL, но ожидаем TournamentConfig
    const response = await fetch(`https://www.hc-forward.com/wp-json/app/v1/get-table/${tournamentId}`); // Убран пробел!
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();

    // Проверяем структуру ответа
    let configData: TournamentConfig | null = null;

    if (data && typeof data === 'object') {
      // Проверяем, есть ли league_id и season_id в корне ответа
      if (data.league_id !== undefined && data.season_id !== undefined) {
        // Предполагаем, что таблица находится в поле data.data или data.tables
        let tables: TournamentTable[] = [];
        if (Array.isArray(data.data)) {
          tables = data.data;
        } else if (Array.isArray(data.tables)) {
          tables = data.tables;
        } else if (Array.isArray(data)) {
          // Если data - это сразу массив таблиц
          tables = data;
        } else {
          throw new Error('Tables not found in response under "data" or "tables" or as root array');
        }
        configData = {
          league_id: data.league_id,
          season_id: data.season_id,
          tables: tables,
        };
      } else {
        // Если league_id и season_id нет в корне, возможно, это старая структура
        // Попробуем найти таблицу и предположить, что её нужно кэшировать отдельно
        // Но для получения league_id/season_id нужно изменить API или понять структуру
        // Пока бросим ошибку, если структура не соответствует ожидаемой TournamentConfig
        throw new Error('Response does not contain league_id and season_id at root level');
      }
    } else {
      throw new Error('Invalid tournament config response format, not an object');
    }

    if (!configData) {
        throw new Error('Could not parse TournamentConfig from response');
    }

    // === СОХРАНЕНИЕ ВСЕЙ КОНФИГУРАЦИИ В КЭШ ===
    await AsyncStorage.setItem(`${CURRENT_TOURNAMENT_CONFIG_KEY}_${tournamentId}`, JSON.stringify(configData));
    // Сохраняем также таблицу отдельно для совместимости с fetchTournamentTable
    await AsyncStorage.setItem(`${CURRENT_TOURNAMENT_DATA_KEY}_${tournamentId}`, JSON.stringify(configData.tables));

    return configData;
  } catch (error) {
    console.error('❌ Failed to fetch tournament config:', error);
    // В случае ошибки, возвращаем кэшированные данные
    const cachedConfig = await getCachedTournamentConfig(tournamentId);
    if (cachedConfig) {
        return cachedConfig;
    }
    // Если кэша нет, пробуем вернуть старую кэшированную таблицу, но это не даст league_id/season_id
    // Лучше бросить ошибку или вернуть null, если критично
    // Для совместимости, если fetchTournamentTable использовалась, можно попробовать её кэш
    // Но fetchTournamentTable возвращает только таблицу.
    // Пока бросим ошибку, если не удалось получить полный config.
    throw error; // Перебрасываем ошибку, чтобы вызывающий код мог обработать
  }
};

/**
 * Получает ВСЮ информацию о турнире (конфиг) из кэша
 */
export const getCachedTournamentConfig = async (tournamentId: string): Promise<TournamentConfig | null> => {
  const key = `${CURRENT_TOURNAMENT_CONFIG_KEY}_${tournamentId}`;
  try {
    const cached = await AsyncStorage.getItem(key);
    if (cached) {
      const parsed = JSON.parse(cached);
      // Проверим, соответствует ли кэшированный объект TournamentConfig
      if (parsed && typeof parsed === 'object' && parsed.league_id !== undefined && parsed.season_id !== undefined && Array.isArray(parsed.tables)) {
        return parsed as TournamentConfig;
      } else {
        console.warn(`Cached config for ${tournamentId} is malformed, skipping.`);
        return null;
      }
    }
  } catch (e) {
    console.error('❌ Failed to get cached tournament config:', e);
  }
  return null;
};

// --- СТАРЫЕ ФУНКЦИИ ДЛЯ СОВМЕСТИМОСТИ ---
// (fetchTournamentTable и getCachedTournamentTable остаются, но теперь fetchTournamentTable может использовать fetchTournamentConfig)

/**
 * Получает турнирную таблицу по ID и сохраняет в кэш (старый способ, возвращает только таблицу)
 * Может быть обновлён, чтобы использовать fetchTournamentConfig
 */
export const fetchTournamentTable = async (tournamentId: string): Promise<TournamentTable[]> => {
  // Попробуем сначала получить полный config, это даст и таблицу, и метаданные
  try {
    const config = await fetchTournamentConfig(tournamentId);
    return config.tables;
  } catch (error) {
    // Если получить config не удалось, пробуем старый способ
    console.warn('Failed to fetch config, falling back to old table fetch method for', tournamentId);
    // Повторим логику старой функции fetchTournamentTable
    // (Вам нужно адаптировать её сюда, если старая логика отличается и важна)
    // Пока просто вернём пустой массив или вызовем старую кэшированную версию
    return await getCachedTournamentTable(tournamentId);
  }
};

/**
 * Получает турнирную таблицу из кэша (старый способ, возвращает только таблицу)
 */
export const getCachedTournamentTable = async (tournamentId: string): Promise<TournamentTable[]> => {
  const key = `${CURRENT_TOURNAMENT_DATA_KEY}_${tournamentId}`;
  try {
    const cached = await AsyncStorage.getItem(key);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (e) {
    console.error('❌ Failed to get cached tournament table:', e);
  }
  return [];
};