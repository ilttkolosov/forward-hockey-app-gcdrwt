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
    const response = await fetch(`https://www.hc-forward.com/wp-json/app/v1/get-table/${tournamentId}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const rawData = await response.json();
    //console.log(`[API] Ответ для турнира ${tournamentId}:`, JSON.stringify(rawData, null, 2));

    let configData: TournamentConfig | null = null;
    if (rawData && typeof rawData === 'object') {
      if (rawData.league_id !== undefined && rawData.season_id !== undefined) {
        let tables: TournamentTable[] = [];
        if (Array.isArray(rawData.data)) {
          tables = rawData.data;
        } else if (Array.isArray(rawData.tables)) {
          tables = rawData.tables;
        } else if (Array.isArray(rawData)) {
          tables = rawData;
        } else {
          throw new Error('Tables not found in response');
        }

        // 🔎 Логируем первую строку таблицы
        if (tables.length > 0) {
          //console.log(`[API] Первая строка таблицы для ${tournamentId}:`, tables[0]);
        }

        configData = {
          league_id: rawData.league_id,
          season_id: rawData.season_id,
          tables,
        };
      } else {
        throw new Error('No league_id/season_id in root');
      }
    } else {
      throw new Error('Invalid response format');
    }

    // Сохраняем в кэш
    await AsyncStorage.setItem(`${CURRENT_TOURNAMENT_CONFIG_KEY}_${tournamentId}`, JSON.stringify(configData));
    await AsyncStorage.setItem(`${CURRENT_TOURNAMENT_DATA_KEY}_${tournamentId}`, JSON.stringify(configData.tables));

    console.log(`[CACHE] Сохранена конфигурация турнира ${tournamentId} в AsyncStorage`);
    return configData;
  } catch (error) {
    console.error('❌ fetchTournamentConfig error:', error);
    const cached = await getCachedTournamentConfig(tournamentId);
    if (cached) return cached;
    throw error;
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
      const parsed = JSON.parse(cached);
      //console.log(`[CACHE] Загружена таблица из кэша для ${tournamentId}. Первые 2 строки:`, parsed.slice(0, 2));
      return parsed;
    } else {
      console.log(`[CACHE] Нет данных в кэше для ${tournamentId}`);
    }
  } catch (e) {
    console.error('❌ getCachedTournamentTable error:', e);
  }
  return [];
};