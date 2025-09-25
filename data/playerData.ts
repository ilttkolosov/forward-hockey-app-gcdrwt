
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiService, ApiPlayerResponse } from '../services/apiService';
import { Player } from '../types';

const CACHE_DURATION = 5 * 60 * 1000; // 5 минут
const PLAYERS_CACHE_KEY = 'new_players_cache';
const PLAYER_IMAGES_CACHE_KEY = 'new_player_images_cache';

interface CachedData<T> {
  data: T;
  timestamp: number;
}

interface CachedImage {
  url: string;
  timestamp: number;
}

let playersMemoryCache: Player[] = [];
let playersCacheTimestamp = 0;

function isCacheValid(timestamp: number): boolean {
  return Date.now() - timestamp < CACHE_DURATION;
}

function removePatronymic(fullName: string): string {
  if (!fullName) return '';
  
  const nameParts = fullName.trim().split(/\s+/);
  if (nameParts.length >= 3) {
    return `${nameParts[0]} ${nameParts[1]}`;
  }
  return fullName;
}

function calculateAge(birthDate: string): number | undefined {
  if (!birthDate) return undefined;
  
  const birth = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  
  return age > 0 ? age : undefined;
}

function mapPositionFromApi(positions: string): string {
  if (!positions) {
    console.log('Позиция пустая, возвращаем "Игрок"');
    return 'Игрок';
  }
  
  const pos = positions.toLowerCase().trim();
  
  console.log('Маппинг позиции из API:', `"${positions}"`, '-> нормализованная:', `"${pos}"`);
  
  // Точное соответствие для основных позиций
  if (pos === 'вратарь') {
    console.log('Точное соответствие: Вратарь -> Вратари');
    return 'Вратари';
  }
  if (pos === 'защитник') {
    console.log('Точное соответствие: Защитник -> Защитники');
    return 'Защитники';
  }
  if (pos === 'нападающий') {
    console.log('Точное соответствие: Нападающий -> Нападающие');
    return 'Нападающие';
  }
  
  // Поиск по вхождению подстроки
  if (pos.includes('вратар')) {
    console.log('Найдено вхождение "вратар" -> Вратари');
    return 'Вратари';
  }
  if (pos.includes('защитник')) {
    console.log('Найдено вхождение "защитник" -> Защитники');
    return 'Защитники';
  }
  if (pos.includes('нападающ')) {
    console.log('Найдено вхождение "нападающ" -> Нападающие');
    return 'Нападающие';
  }
  
  // Дополнительные варианты
  if (pos.includes('голкипер') || pos.includes('goalkeeper') || pos.includes('goalie')) {
    console.log('Найдено альтернативное название вратаря -> Вратари');
    return 'Вратари';
  }
  if (pos.includes('защита') || pos.includes('defense') || pos.includes('defender')) {
    console.log('Найдено альтернативное название защитника -> Защитники');
    return 'Защитники';
  }
  if (pos.includes('нападение') || pos.includes('forward') || pos.includes('attacker')) {
    console.log('Найдено альтернативное название нападающего -> Нападающие');
    return 'Нападающие';
  }
  
  console.warn('Позиция не распознана, возвращаем как есть:', `"${positions}"`);
  // Если позиция не распознана, возвращаем как есть
  return positions;
}

async function cachePlayerImage(imageUrl: string): Promise<string> {
  try {
    if (!imageUrl) return '';
    
    const cachedImagesJson = await AsyncStorage.getItem(PLAYER_IMAGES_CACHE_KEY);
    const cachedImages: Record<string, CachedImage> = cachedImagesJson ? JSON.parse(cachedImagesJson) : {};
    
    const cached = cachedImages[imageUrl];
    if (cached && isCacheValid(cached.timestamp)) {
      console.log('Используется кэшированное изображение для:', imageUrl);
      return imageUrl;
    }
    
    cachedImages[imageUrl] = {
      url: imageUrl,
      timestamp: Date.now()
    };
    
    await AsyncStorage.setItem(PLAYER_IMAGES_CACHE_KEY, JSON.stringify(cachedImages));
    console.log('Изображение кэшировано для:', imageUrl);
    
    return imageUrl;
  } catch (error) {
    console.error('Ошибка кэширования изображения игрока:', error);
    return imageUrl;
  }
}

function convertApiPlayerToPlayer(apiPlayer: ApiPlayerResponse): Player {
  const name = removePatronymic(apiPlayer.post_title);
  const position = mapPositionFromApi(apiPlayer.positions); // Используем поле positions из API
  const birthDate = apiPlayer.post_date ? apiPlayer.post_date.split('T')[0] : undefined;
  const age = calculateAge(apiPlayer.post_date);
  
  const metrics = apiPlayer.sp_metrics || {};
  const height = metrics.height ? parseInt(metrics.height) : undefined;
  const weight = metrics.weight ? parseInt(metrics.weight) : undefined;
  
  // Преобразуем sp_number в число
  const number = typeof apiPlayer.sp_number === 'string' 
    ? parseInt(apiPlayer.sp_number) || 0 
    : apiPlayer.sp_number || 0;
  
  console.log(`Конвертация игрока: ${name}, позиция API: "${apiPlayer.positions}", категория: "${position}", номер: ${number}`);
  
  return {
    id: apiPlayer.id,
    name,
    position,
    number,
    birthDate,
    age,
    height,
    weight,
    handedness: metrics.onetwofive || undefined,
    captainStatus: metrics.ka || undefined, // Используем поле ka из sp_metrics
    nationality: apiPlayer.sp_nationality || undefined,
    photo: apiPlayer.player_image || undefined,
  };
}

export async function checkApiAvailability(): Promise<boolean> {
  try {
    return await apiService.checkPlayersApiAvailability();
  } catch (error) {
    console.error('Ошибка проверки доступности API:', error);
    return false;
  }
}

export async function preloadPlayerImages(players: Player[]): Promise<void> {
  try {
    console.log('Предзагрузка изображений игроков...');
    
    const imagePromises = players
      .filter(player => player.photo)
      .map(player => cachePlayerImage(player.photo!));
    
    await Promise.all(imagePromises);
    console.log('Предзагрузка изображений завершена');
  } catch (error) {
    console.error('Ошибка предзагрузки изображений:', error);
  }
}

export async function getPlayers(): Promise<Player[]> {
  try {
    console.log('Получение игроков...');
    
    // Очищаем кэш для отладки
    console.log('Очищаем кэш для получения свежих данных...');
    playersMemoryCache = [];
    playersCacheTimestamp = 0;
    await AsyncStorage.removeItem(PLAYERS_CACHE_KEY);
    
    const apiPlayers = await apiService.fetchPlayers();
    console.log(`Получено ${apiPlayers.length} игроков из API`);
    
    // Логируем первые несколько игроков для отладки
    apiPlayers.slice(0, 3).forEach((player, index) => {
      console.log(`Игрок ${index + 1}:`, {
        id: player.id,
        name: player.post_title,
        positions: player.positions,
        number: player.sp_number
      });
    });
    
    const players = apiPlayers.map(convertApiPlayerToPlayer);
    
    // Сортируем игроков по номеру
    players.sort((a, b) => a.number - b.number);
    
    // Логируем распределение игроков по позициям
    const positionCounts = players.reduce((acc, player) => {
      acc[player.position] = (acc[player.position] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    console.log('Распределение игроков по позициям после конвертации:', positionCounts);
    
    // Логируем примеры игроков по каждой позиции
    ['Вратари', 'Защитники', 'Нападающие'].forEach(position => {
      const playersInPosition = players.filter(p => p.position === position);
      console.log(`Игроки в категории "${position}":`, playersInPosition.map(p => `${p.name} (#${p.number})`));
    });
    
    playersMemoryCache = players;
    playersCacheTimestamp = Date.now();
    
    const cacheData: CachedData<Player[]> = {
      data: players,
      timestamp: Date.now()
    };
    await AsyncStorage.setItem(PLAYERS_CACHE_KEY, JSON.stringify(cacheData));
    
    await preloadPlayerImages(players);
    
    console.log(`Успешно обработано ${players.length} игроков`);
    return players;
    
  } catch (error) {
    console.error('Ошибка получения игроков:', error);
    
    if (playersMemoryCache.length > 0) {
      console.log('Используется устаревший кэш в памяти');
      return playersMemoryCache;
    }
    
    try {
      const cachedDataJson = await AsyncStorage.getItem(PLAYERS_CACHE_KEY);
      if (cachedDataJson) {
        const cachedData: CachedData<Player[]> = JSON.parse(cachedDataJson);
        console.log('Используется устаревший кэш AsyncStorage');
        return cachedData.data;
      }
    } catch (cacheError) {
      console.error('Ошибка чтения кэша:', cacheError);
    }
    
    return getFallbackPlayers();
  }
}

export async function getPlayerById(playerId: string): Promise<Player | null> {
  try {
    console.log('Получение игрока по ID:', playerId);
    
    const allPlayers = await getPlayers();
    const player = allPlayers.find(p => p.id === playerId);
    
    if (player) {
      console.log('Игрок найден:', player);
      return player;
    } else {
      console.log('Игрок не найден для ID:', playerId);
      return null;
    }
    
  } catch (error) {
    console.error('Ошибка получения игрока по ID:', error);
    return null;
  }
}

export function searchPlayers(players: Player[], searchQuery: string): Player[] {
  if (!searchQuery || searchQuery.length < 1) {
    return players;
  }
  
  const query = searchQuery.toLowerCase().trim();
  
  return players.filter(player => {
    const name = player.name.toLowerCase();
    const position = player.position.toLowerCase();
    const number = player.number.toString();
    
    return name.includes(query) || 
           position.includes(query) || 
           number.includes(query);
  });
}

function getFallbackPlayers(): Player[] {
  return [
    {
      id: '1',
      name: 'Александр Петров',
      position: 'Нападающие',
      number: 10,
      age: 28,
      height: 185,
      weight: 85,
      photo: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400&h=400&fit=crop&crop=face',
    },
    {
      id: '2',
      name: 'Дмитрий Иванов',
      position: 'Защитники',
      number: 5,
      age: 26,
      height: 190,
      weight: 90,
      photo: 'https://images.unsplash.com/photo-1566492031773-4f4e44671d66?w=400&h=400&fit=crop&crop=face',
    },
    {
      id: '3',
      name: 'Сергей Козлов',
      position: 'Вратари',
      number: 1,
      age: 30,
      height: 188,
      weight: 82,
      photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop&crop=face',
    },
  ];
}
