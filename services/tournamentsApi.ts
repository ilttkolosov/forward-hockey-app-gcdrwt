// services/tournamentsApi.ts
import { apiService } from './apiService';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type TournamentTable = {
  position: string;
  team_id: number;
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

const CURRENT_TOURNAMENT_DATA_KEY = 'current_tournament_data';

/**
 * Получает турнирную таблицу по ID и сохраняет в кэш
 */
export const fetchTournamentTable = async (tournamentId: string): Promise<TournamentTable[]> => {
  try {
    const response = await fetch(`https://www.hc-forward.com/wp-json/app/v1/get-table/${tournamentId}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();

    let tableData: TournamentTable[] = [];

    if (Array.isArray(data)) {
      tableData = data;
    } else if (data && Array.isArray(data.data)) {
      tableData = data.data;
    } else {
      throw new Error('Invalid tournament table response format');
    }

    // === СОХРАНЕНИЕ В КЭШ ===
    await AsyncStorage.setItem(`${CURRENT_TOURNAMENT_DATA_KEY}_${tournamentId}`, JSON.stringify(tableData));
    return tableData;
  } catch (error) {
    console.error('❌ Failed to fetch tournament table:', error);
    // В случае ошибки, возвращаем кэшированные данные
    return await getCachedTournamentTable(tournamentId);
  }
};

/**
 * Получает турнирную таблицу из кэша
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