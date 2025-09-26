
import { Player } from '../types';
import { apiService, ApiPlayerResponse } from '../services/apiService';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface CachedData<T> {
  data: T;
  timestamp: number;
}

interface CachedImage {
  url: string;
  timestamp: number;
}

const CACHE_DURATION = 10 * 60 * 1000; // 10 минут
const PLAYERS_CACHE_KEY = 'players_cache';
const PLAYER_IMAGES_CACHE_KEY = 'player_images_cache';

function isCacheValid(timestamp: number): boolean {
  return Date.now() - timestamp < CACHE_DURATION;
}

function removePatronymic(fullName: string): string {
  const parts = fullName.trim().split(' ');
  if (parts.length >= 2) {
    return `${parts[0]} ${parts[1]}`;
  }
  return fullName;
}

function calculateAge(birthDate: string): number | undefined {
  if (!birthDate) return undefined;
  
  try {
    const birth = new Date(birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    
    return age > 0 ? age : undefined;
  } catch (error) {
    console.error('Ошибка вычисления возраста:', error);
    return undefined;
  }
}

async function cachePlayerImage(imageUrl: string): Promise<void> {
  try {
    const cachedImages = await AsyncStorage.getItem(PLAYER_IMAGES_CACHE_KEY);
    const imageCache: { [key: string]: CachedImage } = cachedImages ? JSON.parse(cachedImages) : {};
    
    imageCache[imageUrl] = {
      url: imageUrl,
      timestamp: Date.now(),
    };
    
    await AsyncStorage.setItem(PLAYER_IMAGES_CACHE_KEY, JSON.stringify(imageCache));
  } catch (error) {
    console.error('Ошибка кэширования изображения игрока:', error);
  }
}

function convertApiPlayerToPlayer(apiPlayer: ApiPlayerResponse): Player {
  console.log('Конвертация игрока из API:', apiPlayer);
  
  const player: Player = {
    id: apiPlayer.id,
    name: removePatronymic(apiPlayer.post_title || 'Неизвестный игрок'),
    position: apiPlayer.position || 'Неизвестно',
    number: typeof apiPlayer.sp_number === 'string' ? parseInt(apiPlayer.sp_number) || 0 : apiPlayer.sp_number || 0,
    birthDate: apiPlayer.post_date,
    age: calculateAge(apiPlayer.post_date),
    height: apiPlayer.sp_metrics?.height ? parseInt(apiPlayer.sp_metrics.height) || undefined : undefined,
    weight: apiPlayer.sp_metrics?.weight ? parseInt(apiPlayer.sp_metrics.weight) || undefined : undefined,
    handedness: apiPlayer.sp_metrics?.onetwofive || undefined,
    captainStatus: apiPlayer.sp_metrics?.ka || undefined,
    nationality: apiPlayer.sp_nationality || undefined,
    photo: apiPlayer.player_image || undefined,
  };
  
  console.log('Конвертированный игрок:', player);
  return player;
}

export async function checkApiAvailability(): Promise<boolean> {
  try {
    console.log('Проверка доступности API игроков...');
    const isAvailable = await apiService.checkPlayersApiAvailability();
    console.log('API игроков доступен:', isAvailable);
    return isAvailable;
  } catch (error) {
    console.error('Ошибка проверки доступности API:', error);
    return false;
  }
}

async function preloadPlayerImages(players: Player[]): Promise<void> {
  console.log('Предзагрузка изображений игроков...');
  const imagePromises = players
    .filter(player => player.photo)
    .map(player => cachePlayerImage(player.photo!));
  
  await Promise.allSettled(imagePromises);
  console.log('Предзагрузка изображений завершена');
}

export async function getPlayers(): Promise<Player[]> {
  try {
    // Проверяем кэш
    const cachedData = await AsyncStorage.getItem(PLAYERS_CACHE_KEY);
    if (cachedData) {
      const parsed: CachedData<Player[]> = JSON.parse(cachedData);
      if (isCacheValid(parsed.timestamp)) {
        console.log('Возврат игроков из кэша');
        return parsed.data;
      }
    }

    console.log('Загрузка игроков из API...');
    const apiPlayers = await apiService.fetchPlayers();
    
    if (!Array.isArray(apiPlayers) || apiPlayers.length === 0) {
      console.log('Нет данных об игроках, используем fallback');
      return getFallbackPlayers();
    }

    const players = apiPlayers.map(convertApiPlayerToPlayer);
    
    // Сортировка по номеру
    players.sort((a, b) => a.number - b.number);

    // Кэшируем результат
    const cacheData: CachedData<Player[]> = {
      data: players,
      timestamp: Date.now(),
    };
    await AsyncStorage.setItem(PLAYERS_CACHE_KEY, JSON.stringify(cacheData));

    // Предзагружаем изображения в фоне
    preloadPlayerImages(players);

    console.log(`Загружено ${players.length} игроков из API`);
    return players;
  } catch (error) {
    console.error('Ошибка загрузки игроков:', error);
    return getFallbackPlayers();
  }
}

export async function getPlayerById(playerId: string): Promise<Player | null> {
  try {
    console.log('Поиск игрока по ID:', playerId);
    const players = await getPlayers();
    const player = players.find(p => p.id === playerId);
    
    if (player) {
      console.log('Игрок найден:', player);
      return player;
    }
    
    console.log('Игрок не найден');
    return null;
  } catch (error) {
    console.error('Ошибка поиска игрока:', error);
    return null;
  }
}

export function searchPlayers(players: Player[], searchQuery: string): Player[] {
  if (!searchQuery.trim()) {
    return players;
  }

  const query = searchQuery.toLowerCase().trim();
  console.log('Поиск игроков по запросу:', query);

  const filtered = players.filter(player => {
    const name = player.name.toLowerCase();
    const position = player.position.toLowerCase();
    const number = player.number.toString();
    
    return name.includes(query) || 
           position.includes(query) || 
           number.includes(query);
  });

  console.log(`Найдено ${filtered.length} игроков по запросу "${query}"`);
  return filtered;
}

function getFallbackPlayers(): Player[] {
  return [
    {
      id: '1',
      name: 'Иван Петров',
      position: 'Вратарь',
      number: 1,
      age: 25,
      height: 185,
      weight: 80,
      captainStatus: 'captain',
    },
    {
      id: '2',
      name: 'Алексей Сидоров',
      position: 'Защитник',
      number: 2,
      age: 28,
      height: 180,
      weight: 85,
    },
    {
      id: '3',
      name: 'Михаил Козлов',
      position: 'Нападающий',
      number: 10,
      age: 24,
      height: 175,
      weight: 75,
      captainStatus: 'assistant',
    },
  ];
}
