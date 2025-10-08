// /services/startupApi.ts
import { apiService } from '../services/apiService';


export interface StartupConfig {
  teams_version: number;   // "true" или "false" (как в WordPress)
  players_version: number; // "true" или "false"
  league_id: string;
  season_id: string;
  tournamentsNow: { tournament_ID: string; tournament_Name: string }[];
  tournamentsPast: { tournament_ID: string; tournament_Name: string }[];
}

/**
 * Получает стартовую конфигурацию из WordPress API
 */
export const fetchStartupConfig = async (): Promise<StartupConfig> => {
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
};