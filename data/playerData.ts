// data/playerData.ts

import { Player } from '../types';
import { playerDownloadService } from '../services/playerDataService'; // Импортируем наш новый сервис

/**
 * Main function to get players data
 * Uses the new PlayerDownloadService for loading and caching.
 * - On first launch: loads from API and caches.
 * - On subsequent launches: returns cached data.
 */
export async function getPlayers(): Promise<Player[]> {
  try {
    console.log('Data/playerData: Attempting to get players via PlayerDownloadService...');
    // Check if data is already loaded using the service's flag
    const dataLoaded = await playerDownloadService.isDataLoaded();
    if (dataLoaded) {
      console.log('Data/playerData: Data already loaded via service, fetching from storage...');
      const players = await playerDownloadService.getPlayersFromStorage();
      if (players.length > 0) {
        console.log(`Data/playerData: Returning ${players.length} players from service storage`);
        return players;
      }
    }

    console.log('Data/playerData: First launch or no cached data via service — loading from API...');
    // If not loaded, use the service to load everything
    const players = await playerDownloadService.loadAllPlayersData();
    console.log(`Data/playerData: Successfully loaded and returned ${players.length} players via service`);
    return players;
  } catch (error) {
    console.error('Data/playerData: Error in getPlayers:', error);
    // Fallback to service's stored data if initial load fails
    try {
      const cachedPlayers = await playerDownloadService.getPlayersFromStorage();
      if (cachedPlayers.length > 0) {
        console.log('Data/playerData: Returning cached players from service as fallback');
        return cachedPlayers;
      }
    } catch (cacheError) {
      console.error('Data/playerData: Error loading cached players from service:', cacheError);
    }
    console.log('Data/playerData: Using fallback players data (empty array or predefined)');
    // Return an empty array or a predefined fallback list if service fails completely
    return []; // Или return getFallbackPlayers();
  }
}

/**
 * Get a specific player by ID
 * Uses the PlayerDownloadService to retrieve cached data.
 */
export async function getPlayerById(playerId: string): Promise<Player | null> {
  try {
    console.log('Data/playerData: Fetching player by ID via service:', playerId);
    const players = await getPlayers(); // Use the main getPlayers function which uses the service
    const player = players.find(p => p.id === playerId);
    if (player) {
      console.log('Data/playerData: Player found via service:', player.name);
      return player;
    }
    console.log('Data/playerData: Player not found via service');
    return null;
  } catch (error) {
    console.error('Data/playerData: Error fetching player by ID:', error);
    return null;
  }
}

/**
 * Search players by query
 * This logic remains the same, it just filters the provided array.
 */
export function searchPlayers(players: Player[], searchQuery: string): Player[] {
  if (!searchQuery.trim()) {
    return players;
  }
  const query = searchQuery.toLowerCase().trim();
  return players.filter(player =>
    player.name.toLowerCase().includes(query) ||
    player.fullName?.toLowerCase().includes(query) ||
    player.position.toLowerCase().includes(query) ||
    player.number.toString().includes(query)
  );
}

/**
 * Group players by position
 * This logic remains the same, it just groups the provided array.
 */
export const groupPlayersByPosition = (players: Player[]): Record<string, Player[]> => {
  const groups: Record<string, Player[]> = {
    'Вратарь': [],
    'Защитник': [],
    'Нападающий': [],
  };

  players.forEach((player) => {
    // --- ИСПРАВЛЕНО: Используем точное совпадение ---
    const position = player.position.trim(); // Убираем пробелы
    if (position === 'Вратарь' || position === 'Защитник' || position === 'Нападающий') {
      groups[position].push(player);
    } else {
      // Если позиция неизвестна, добавляем в "Нападающий" или другую группу по умолчанию
      groups['Нападающий'].push(player);
      console.warn(`Player ${player.id} has unknown position: "${player.position}", added to "Нападающий" group`);
    }
    // --- КОНЕЦ ИСПРАВЛЕНИЯ ---
  });

  // Сортируем каждую группу по номеру
  Object.keys(groups).forEach((position) => {
    groups[position].sort((a, b) => a.number - b.number);
  });

  console.log('Grouped players by position:', groups);
  return groups;
};

/**
 * Refresh players data (force reload from API)
 * Uses the PlayerDownloadService to clear cache and reload.
 */
export async function refreshPlayersData(): Promise<Player[]> {
  try {
    console.log('Data/playerData: Refreshing players data via service...');
    // Use the service's refresh method
    const players = await playerDownloadService.refreshPlayersData();
    console.log(`Data/playerData: Successfully refreshed and returned ${players.length} players via service`);
    return players;
  } catch (error) {
    console.error('Data/playerData: Error refreshing players data via service:', error);
    // Fallback to getPlayers which will try to load from cache or API again
    return await getPlayers();
  }
}

/**
 * Очищает все закэшированные данные об игроках.
 * Это включает данные в AsyncStorage и локальные файлы (фото).
 */
export async function clearPlayersData(): Promise<void> {
  console.log('Data/playerData: Initiating clear all player data...');
  try {
    // Делегируем очистку самому сервису
    await playerDownloadService.clearAllData();
    console.log('Data/playerData: All player data cleared successfully via PlayerDownloadService');
  } catch (error) {
    console.error('Data/playerData: Error clearing player data via PlayerDownloadService:', error);
    // Можно пробросить ошибку дальше, если нужно
    // throw error; 
    // Или обработать локально
  }
}

/**
 * Fallback players data for when API is unavailable
 * This is a simple list, ideally should come from a separate constant file.
 */
function getFallbackPlayers(): Player[] {
  // You can return an empty array or a predefined list if needed
  // For now, returning an empty array as the service should handle failures gracefully
  return [];
  /*
  return [
    // ... (fallback player objects if absolutely necessary)
  ];
  */
}