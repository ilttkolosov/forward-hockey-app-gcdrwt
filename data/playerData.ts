
import { Player, ApiPlayerResponse } from '../types';
import { apiService } from '../services/apiService';
import { getShortName, calculateAge } from '../utils/playerUtils';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface CachedData<T> {
  data: T;
  timestamp: number;
}

interface CachedImage {
  url: string;
  timestamp: number;
}

const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
const PLAYERS_CACHE_KEY = 'players_cache';
const PLAYER_IMAGES_CACHE_KEY = 'player_images_cache';

function isCacheValid(timestamp: number): boolean {
  return Date.now() - timestamp < CACHE_DURATION;
}

async function cachePlayerImage(imageUrl: string): Promise<void> {
  try {
    const cached: CachedImage = {
      url: imageUrl,
      timestamp: Date.now()
    };
    
    const existingCache = await AsyncStorage.getItem(PLAYER_IMAGES_CACHE_KEY);
    const imageCache = existingCache ? JSON.parse(existingCache) : {};
    
    imageCache[imageUrl] = cached;
    await AsyncStorage.setItem(PLAYER_IMAGES_CACHE_KEY, JSON.stringify(imageCache));
  } catch (error) {
    console.error('Error caching player image:', error);
  }
}

function convertApiPlayerToPlayer(apiPlayer: ApiPlayerResponse): Player {
  const shortName = getShortName(apiPlayer.post_title);
  const age = calculateAge(apiPlayer.post_date);
  
  // Cache image if available
  if (apiPlayer.player_image) {
    cachePlayerImage(apiPlayer.player_image);
  }
  
  return {
    id: apiPlayer.id.toString(),
    name: shortName,
    fullName: apiPlayer.post_title,
    position: apiPlayer.position,
    number: apiPlayer.sp_number,
    age,
    height: apiPlayer.sp_metrics?.height || '',
    weight: apiPlayer.sp_metrics?.weight || '',
    photo: apiPlayer.player_image || '',
    birthDate: apiPlayer.post_date,
    handedness: apiPlayer.sp_metrics?.onetwofive || '',
    captainStatus: apiPlayer.sp_metrics?.ka || '',
    isCaptain: apiPlayer.sp_metrics?.ka === 'К',
    isAssistantCaptain: apiPlayer.sp_metrics?.ka === 'А',
  };
}

async function checkApiAvailability(): Promise<boolean> {
  try {
    return await apiService.checkPlayersApiAvailability();
  } catch (error) {
    console.error('Error checking API availability:', error);
    return false;
  }
}

async function preloadPlayerImages(players: Player[]): Promise<void> {
  const imageUrls = players
    .map(player => player.photo)
    .filter((url): url is string => !!url);
  
  console.log(`Preloading ${imageUrls.length} player images...`);
  
  const promises = imageUrls.map(url => cachePlayerImage(url));
  await Promise.allSettled(promises);
  
  console.log('Player images preloading completed');
}

export async function getPlayers(): Promise<Player[]> {
  try {
    // Check cache first
    const cachedData = await AsyncStorage.getItem(PLAYERS_CACHE_KEY);
    if (cachedData) {
      const parsed: CachedData<Player[]> = JSON.parse(cachedData);
      if (isCacheValid(parsed.timestamp)) {
        console.log('Returning players from cache');
        return parsed.data;
      }
    }

    console.log('Fetching players from API...');
    
    // Check if API is available
    const isApiAvailable = await checkApiAvailability();
    if (!isApiAvailable) {
      console.log('API not available, using fallback players');
      return getFallbackPlayers();
    }

    const apiPlayers = await apiService.fetchPlayers();
    const players = apiPlayers.map(convertApiPlayerToPlayer);
    
    // Sort players by number
    players.sort((a, b) => a.number - b.number);
    
    // Cache the result
    const cacheData: CachedData<Player[]> = {
      data: players,
      timestamp: Date.now()
    };
    await AsyncStorage.setItem(PLAYERS_CACHE_KEY, JSON.stringify(cacheData));
    
    // Preload images in background
    preloadPlayerImages(players);
    
    console.log(`Loaded ${players.length} players from API`);
    return players;
  } catch (error) {
    console.error('Error fetching players:', error);
    return getFallbackPlayers();
  }
}

export async function getPlayerById(playerId: string): Promise<Player | null> {
  try {
    console.log('Fetching player by ID:', playerId);
    
    // Try to get from API first
    try {
      const apiPlayer = await apiService.fetchPlayerById(playerId);
      const player = convertApiPlayerToPlayer(apiPlayer);
      console.log('Player fetched from API:', player);
      return player;
    } catch (apiError) {
      console.log('API fetch failed, searching in cached players...');
    }
    
    // Fallback to cached players
    const players = await getPlayers();
    const player = players.find(p => p.id === playerId);
    
    if (player) {
      console.log('Player found in cache:', player);
      return player;
    }
    
    console.log('Player not found');
    return null;
  } catch (error) {
    console.error('Error fetching player by ID:', error);
    return null;
  }
}

export function searchPlayers(players: Player[], searchQuery: string): Player[] {
  if (!searchQuery.trim()) {
    return players;
  }
  
  const query = searchQuery.toLowerCase().trim();
  
  return players.filter(player => 
    player.name.toLowerCase().includes(query) ||
    player.position.toLowerCase().includes(query) ||
    player.number.toString().includes(query)
  );
}

export function groupPlayersByPosition(players: Player[]): { [position: string]: Player[] } {
  return players.reduce((acc, player) => {
    if (!acc[player.position]) {
      acc[player.position] = [];
    }
    acc[player.position].push(player);
    return acc;
  }, {} as { [position: string]: Player[] });
}

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
    },
  ];
}
