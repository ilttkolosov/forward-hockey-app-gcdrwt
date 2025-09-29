import { Player } from '../types';
import { apiService } from '../services/apiService';
import { getShortName, calculateAge } from '../utils/playerUtils';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
const { documentDirectory } = FileSystem;

// Storage keys
const PLAYERS_DIRECTORY = `${documentDirectory || ''}players/`;
const PLAYERS_DATA_LOADED_KEY = 'playersDataLoaded';
const PLAYERS_STORAGE_KEY = 'localPlayersData';

/**
 * Check if data has been loaded and cached locally
 */
async function isDataLoaded(): Promise<boolean> {
  try {
    const loaded = await AsyncStorage.getItem(PLAYERS_DATA_LOADED_KEY);
    return loaded === 'true';
  } catch (error) {
    console.error('Error checking if data is loaded:', error);
    return false;
  }
}

/**
 * Set the data loaded flag
 */
async function setDataLoaded(loaded: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(PLAYERS_DATA_LOADED_KEY, loaded.toString());
  } catch (error) {
    console.error('Error setting data loaded flag:', error);
  }
}

/**
 * Ensure the players directory exists for photo storage
 */
async function ensurePlayersDirectoryExists(): Promise<void> {
  try {
    const dirInfo = await FileSystem.getInfoAsync(PLAYERS_DIRECTORY);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(PLAYERS_DIRECTORY, { intermediates: true });
      console.log('Created players directory:', PLAYERS_DIRECTORY);
    }
  } catch (error) {
    console.error('Error creating players directory:', error);
  }
}

/**
 * Download and cache a player photo locally
 */
async function downloadAndCachePhoto(photoUrl: string, playerId: string): Promise<string | null> {
  try {
    if (!photoUrl?.trim()) return null;
    await ensurePlayersDirectoryExists();
    const filename = `player_${playerId}.jpg`;
    const fileUri = PLAYERS_DIRECTORY + filename;
    console.log(`Downloading photo for player ${playerId} from ${photoUrl}`);
    const downloadResult = await FileSystem.downloadAsync(photoUrl.trim(), fileUri);
    if (downloadResult.status === 200) {
      console.log(`Successfully downloaded photo for player ${playerId} to ${downloadResult.uri}`);
      return downloadResult.uri;
    } else {
      console.error(`Failed to download photo for player ${playerId}, status: ${downloadResult.status}`);
      return null;
    }
  } catch (error) {
    console.error(`Error downloading photo for player ${playerId}:`, error);
    return null;
  }
}

/**
 * Convert API player data to internal Player format
 */
function convertApiPlayerToPlayer(
  basicData: { id: string; name: string; number: number; position: string; birth_date: string },
  detailedData: any,
  photoPath: string | null
): Player {
  const age = calculateAge(basicData.birth_date);
  const shortName = getShortName(basicData.name);
  return {
    id: basicData.id,
    name: shortName,
    fullName: basicData.name,
    position: basicData.position,
    number: basicData.number,
    age,
    height: String(detailedData.metrics?.height || ''),
    weight: String(detailedData.metrics?.weight || ''),
    photo: photoPath || '',
    birthDate: basicData.birth_date,
    handedness: detailedData.metrics?.onetwofive || '',
    captainStatus: detailedData.metrics?.ka || '',
    isCaptain: detailedData.metrics?.ka === 'К',
    isAssistantCaptain: detailedData.metrics?.ka === 'А',
    nationality: detailedData.nationality || '',
  };
}

/**
 * Save players data to local storage
 */
async function savePlayersToStorage(players: Player[]): Promise<void> {
  try {
    const playersData = JSON.stringify(players);
    await AsyncStorage.setItem(PLAYERS_STORAGE_KEY, playersData);
    console.log(`Saved ${players.length} players to local storage`);
  } catch (error) {
    console.error('Error saving players to storage:', error);
    throw error;
  }
}

/**
 * Load players data from local storage
 */
async function getPlayersFromStorage(): Promise<Player[]> {
  try {
    const playersData = await AsyncStorage.getItem(PLAYERS_STORAGE_KEY);
    if (playersData) {
      const players = JSON.parse(playersData);
      console.log(`Loaded ${players.length} players from local storage`);
      return players;
    }
    return [];
  } catch (error) {
    console.error('Error loading players from storage:', error);
    return [];
  }
}

/**
 * Load all players data from API and cache locally
 */
async function loadAllPlayersFromApi(): Promise<Player[]> {
  try {
    console.log('Starting complete player data loading process from API...');
    const playersList = await apiService.fetchPlayersList();
    console.log(`Loaded ${playersList.length} players from list endpoint`);

    const allPlayers: Player[] = [];
    for (let i = 0; i < playersList.length; i++) {
      const basicPlayer = playersList[i];
      console.log(`Processing player ${i + 1}/${playersList.length}: ${basicPlayer.name} (ID: ${basicPlayer.id})`);
      try {
        const detailedData = await apiService.fetchPlayerDetails(basicPlayer.id);
        let photoPath: string | null = null;
        try {
          const photoData = await apiService.fetchPlayerPhoto(basicPlayer.id);
          if (photoData?.photo_url) {
            photoPath = await downloadAndCachePhoto(photoData.photo_url, basicPlayer.id);
          }
        } catch (photoError) {
          console.warn(`Failed to load photo for player ${basicPlayer.id}:`, photoError);
        }
        const player = convertApiPlayerToPlayer(basicPlayer, detailedData, photoPath);
        allPlayers.push(player);
        console.log(`Successfully processed player: ${player.name} (#${player.number})`);
      } catch (error) {
        console.error(`Failed to load detailed data for player ${basicPlayer.id}:`, error);
        const fallbackPlayer: Player = {
          id: basicPlayer.id,
          name: getShortName(basicPlayer.name),
          fullName: basicPlayer.name,
          position: basicPlayer.position,
          number: basicPlayer.number,
          age: calculateAge(basicPlayer.birth_date),
          height: '',
          weight: '',
          photo: '',
          birthDate: basicPlayer.birth_date,
          handedness: '',
          captainStatus: '',
          isCaptain: false,
          isAssistantCaptain: false,
          nationality: '',
        };
        allPlayers.push(fallbackPlayer);
      }
    }

    allPlayers.sort((a, b) => a.number - b.number);
    await savePlayersToStorage(allPlayers);
    await setDataLoaded(true);
    console.log(`Successfully loaded and cached ${allPlayers.length} players`);
    return allPlayers;
  } catch (error) {
    console.error('Error loading all players data from API:', error);
    throw error;
  }
}

/**
 * Main function to get players data
 * - On first launch: loads from API and caches.
 * - On subsequent launches: returns cached data without validation.
 */
export async function getPlayers(): Promise<Player[]> {
  try {
    const dataLoaded = await isDataLoaded();
    if (dataLoaded) {
      console.log('Data already loaded, using local storage...');
      const players = await getPlayersFromStorage();
      if (players.length > 0) {
        console.log(`Returning ${players.length} players from local storage`);
        return players;
      }
    }

    console.log('First launch or no cached data — loading from API...');
    return await loadAllPlayersFromApi();
  } catch (error) {
    console.error('Error in getPlayers:', error);
    try {
      const cachedPlayers = await getPlayersFromStorage();
      if (cachedPlayers.length > 0) {
        console.log('Returning cached players as fallback');
        return cachedPlayers;
      }
    } catch (cacheError) {
      console.error('Error loading cached players:', cacheError);
    }
    console.log('Using fallback players data');
    return getFallbackPlayers();
  }
}

/**
 * Get a specific player by ID
 */
export async function getPlayerById(playerId: string): Promise<Player | null> {
  try {
    console.log('Fetching player by ID:', playerId);
    const players = await getPlayers();
    const player = players.find(p => p.id === playerId);
    if (player) {
      console.log('Player found:', player.name);
      return player;
    }
    console.log('Player not found');
    return null;
  } catch (error) {
    console.error('Error fetching player by ID:', error);
    return null;
  }
}

/**
 * Search players by query
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
 * Refresh players data (force reload from API)
 */
export async function refreshPlayersData(): Promise<Player[]> {
  try {
    console.log('Refreshing players data...');
    await setDataLoaded(false);
    return await getPlayers();
  } catch (error) {
    console.error('Error refreshing players data:', error);
    throw error;
  }
}

/**
 * Clear all cached player data
 */
export async function clearPlayersData(): Promise<void> {
  try {
    console.log('Clearing all player data...');
    await AsyncStorage.removeItem(PLAYERS_DATA_LOADED_KEY);
    await AsyncStorage.removeItem(PLAYERS_STORAGE_KEY);
    try {
      const dirInfo = await FileSystem.getInfoAsync(PLAYERS_DIRECTORY);
      if (dirInfo.exists) {
        await FileSystem.deleteAsync(PLAYERS_DIRECTORY, { idempotent: true });
        console.log('Cleared players directory');
      }
    } catch (error) {
      console.warn('Error clearing players directory:', error);
    }
    console.log('All player data cleared');
  } catch (error) {
    console.error('Error clearing player data:', error);
    throw error;
  }
}

/**
 * Fallback players data for when API is unavailable
 */
function getFallbackPlayers(): Player[] {
  return [
    {
      id: '1',
      name: 'Александр Петров',
      fullName: 'Петров Александр Иванович',
      position: 'Нападающий',
      number: 10,
      age: 25,
      height: '180',
      weight: '75',
      handedness: 'Левый',
      captainStatus: 'К',
      isCaptain: true,
      isAssistantCaptain: false,
      photo: '',
      birthDate: '1999-01-15 00:00:00',
      nationality: 'Россия',
    },
    {
      id: '2',
      name: 'Михаил Иванов',
      fullName: 'Иванов Михаил Петрович',
      position: 'Защитник',
      number: 5,
      age: 28,
      height: '185',
      weight: '80',
      handedness: 'Правый',
      captainStatus: 'А',
      isCaptain: false,
      isAssistantCaptain: true,
      photo: '',
      birthDate: '1996-03-22 00:00:00',
      nationality: 'Россия',
    },
    {
      id: '3',
      name: 'Дмитрий Сидоров',
      fullName: 'Сидоров Дмитрий Александрович',
      position: 'Вратарь',
      number: 1,
      age: 30,
      height: '190',
      weight: '85',
      handedness: 'Левый',
      captainStatus: '',
      isCaptain: false,
      isAssistantCaptain: false,
      photo: '',
      birthDate: '1994-07-10 00:00:00',
      nationality: 'Россия',
    },
  ];
}