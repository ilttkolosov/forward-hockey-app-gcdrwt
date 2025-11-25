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

  // Генерируем уникальный URL для обхода кэша
  const url = `https://www.hc-forward.com/wp-content/themes/marquee/inc/MobileAppConfig.txt?_t=${Date.now()}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} при загрузке MobileAppConfig.txt`);
  }

  // (Опционально) Логируем сырые данные для отладки
  const text = await response.text();
  //console.log('Сырой ответ от сервера:', text);

  let result;
  try {
    result = JSON.parse(text);
  } catch (e) {
    throw new Error('Невалидный JSON в MobileAppConfig.txt');
  }

  if (result.status !== 'success') {
    throw new Error('Ошибка в статическом файле конфигурации: статус не "success"');
  }

  console.log('Получили конфигурацию из статического файла: ', result.data);
  return result.data;
};