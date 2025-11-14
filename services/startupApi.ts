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

  const response = await fetch('https://www.hc-forward.com/wp-content/themes/marquee/inc/MobileAppConfig.txt');
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} при загрузке MobileAppConfig.txt`);
  }

  const result = await response.json();

  if (result.status !== 'success') {
    throw new Error('Ошибка в статическом файле конфигурации: статус не "success"');
  }

  console.log('Получили конфигурацию из статического файла');
  return result.data; // ← именно data, как в JSON
};