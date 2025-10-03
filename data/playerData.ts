// data/playerData.ts

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Player } from '../types';
import { playerDownloadService } from '../services/playerDataService';
import { ApiPlayerResponse } from '../types/apiTypes';

// --- ГЛОБАЛЬНЫЕ МАССИВЫ ДЛЯ ГРУППИРОВКИ ---
let massiv1: Player[] = []; // Вратари
let massiv2: Player[] = []; // Защитники
let massiv3: Player[] = []; // Нападающие
// --- КОНЕЦ ГЛОБАЛЬНЫХ МАССИВОВ ---

// --- ФУНКЦИЯ ДЛЯ ГРУППИРОВКИ ИГРОКОВ ---
/**
 * Группирует игроков по позициям в глобальные массивы massiv1, massiv2, massiv3
 * @param players - Массив всех игроков
 */
export const splitPlayersIntoGroups = (players: Player[]) => {
  console.log('Data/playerData: Splitting players into groups...');
  
  // Очищаем глобальные массивы перед заполнением
  massiv1 = [];
  massiv2 = [];
  massiv3 = [];

  players.forEach((player) => {
    const position = player.position?.trim();
    console.log(`Data/playerData: Processing player ${player.id} (${player.name}), position: "${position}"`);

    switch (position) {
      case 'Вратарь':
        massiv1.push(player);
        console.log(`Data/playerData: Added player ${player.id} to massiv1 (Вратарь)`);
        break;
      case 'Защитник':
        massiv2.push(player);
        console.log(`Data/playerData: Added player ${player.id} to massiv2 (Защитник)`);
        break;
      case 'Нападающий':
        massiv3.push(player);
        console.log(`Data/playerData: Added player ${player.id} to massiv3 (Нападающий)`);
        break;
      default:
        // Если позиция неизвестна, добавляем в "Нападающие" или другую группу по умолчанию
        massiv3.push(player);
        console.warn(`Data/playerData: Player ${player.id} has unknown position: "${player.position}", added to massiv3 (Нападающие)`);
        break;
    }
  });

  // Сортируем каждую группу по номеру
  massiv1.sort((a, b) => a.number - b.number);
  massiv2.sort((a, b) => a.number - b.number);
  massiv3.sort((a, b) => a.number - b.number);

  console.log(`Data/playerData: Players split into groups: Вратари: ${massiv1.length}, Защитники: ${massiv2.length}, Нападающие: ${massiv3.length}`);
};
// --- КОНЕЦ ФУНКЦИИ ДЛЯ ГРУППИРОВКИ ---

// --- ЭКСПОРТИРУЕМ ГЛОБАЛЬНЫЕ МАССИВЫ ---
/**
 * Возвращает массив вратарей (massiv1)
 */
export const getMassiv1 = (): Player[] => {
  return massiv1;
};

/**
 * Возвращает массив защитников (massiv2)
 */
export const getMassiv2 = (): Player[] => {
  return massiv2;
};

/**
 * Возвращает массив нападающих (massiv3)
 */
export const getMassiv3 = (): Player[] => {
  return massiv3;
};
// --- КОНЕЦ ЭКСПОРТА ГЛОБАЛЬНЫХ МАССИВОВ ---

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
        // --- ДОБАВЛЕНО: Вызываем splitPlayersIntoGroups после загрузки ---
        splitPlayersIntoGroups(players);
        // --- КОНЕЦ ДОБАВЛЕНИЯ ---
        return players;
      }
    }

    console.log('Data/playerData: First launch or no cached data via service — loading from API...');
    // If not loaded, use the service to load everything
    // We can pass a dummy progress callback or null if we don't need UI updates here
    const players = await playerDownloadService.loadAllPlayersData();
    console.log(`Data/playerData: Successfully loaded and returned ${players.length} players via service`);
    // --- ДОБАВЛЕНО: Вызываем splitPlayersIntoGroups после загрузки ---
    splitPlayersIntoGroups(players);
    // --- КОНЕЦ ДОБАВЛЕНИЯ ---
    return players;
  } catch (error) {
    console.error('Data/playerData: Error getting players:', error);
    // Fallback to service's stored data if initial load fails
    try {
      const cachedPlayers = await playerDownloadService.getPlayersFromStorage();
      if (cachedPlayers.length > 0) {
        console.log('Data/playerData: Returning cached players from service as fallback');
        // --- ДОБАВЛЕНО: Вызываем splitPlayersIntoGroups после загрузки ---
        splitPlayersIntoGroups(cachedPlayers);
        // --- КОНЕЦ ДОБАВЛЕНИЯ ---
        return cachedPlayers;
      }
    } catch (cacheError) {
      console.error('Data/playerData: Error loading cached players from service:', cacheError);
    }
    console.log('Data/playerData: Using fallback players data (empty array or predefined)');
    // Return an empty array or a predefined fallback list if service fails completely
    const fallbackPlayers = getFallbackPlayers();
    // --- ДОБАВЛЕНО: Вызываем splitPlayersIntoGroups для фолбэка ---
    splitPlayersIntoGroups(fallbackPlayers);
    // --- КОНЕЦ ДОБАВЛЕНИЯ ---
    return fallbackPlayers;
  }
}

/**
 * Gets a specific player by ID
 */
export async function getPlayerById(playerId: string): Promise<Player | null> {
  try {
    console.log('Data/playerData: Attempting to get player by ID:', playerId);
    const players = await getPlayers();
    const player = players.find(p => p.id === playerId);
    if (player) {
      console.log('Data/playerData: Player found:', player.name);
      return player;
    }
    console.log('Data/playerData: Player not found');
    return null;
  } catch (error) {
    console.error('Data/playerData: Error fetching player by ID:', error);
    return null;
  }
}

/**
 * Searches players by query
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
 * Groups players by position
 */
export function groupPlayersByPosition(players: Player[]): { [position: string]: Player[] } {
  return players.reduce((acc, player) => {
    if (!acc[player.position]) {
      acc[player.position] = [];
    }
    acc[player.position].push(player);
    return acc;
  }, {} as { [position: string]: Player[] });
}

/**
 * Refreshes players data (force reload from API)
 */
export async function refreshPlayersData(): Promise<Player[]> {
  try {
    console.log('Data/playerData: Refreshing players data...');
    await playerDownloadService.setDataLoaded(false);
    return await getPlayers();
  } catch (error) {
    console.error('Data/playerData: Error refreshing players data:', error);
    throw error;
  }
}

/**
 * Clears all cached player data
 */
export async function clearPlayersData(): Promise<void> {
  try {
    console.log('Data/playerData: Clearing all player data...');
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
 */
function getFallbackPlayers(): Player[] {
  return [
    // ... (ваш фолбэк)
  ];
}