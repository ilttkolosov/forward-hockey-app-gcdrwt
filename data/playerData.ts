
import { apiService } from '../services/apiService';
import { Player } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const PLAYERS_CACHE_KEY = 'players_cache';
const PLAYER_IMAGES_CACHE_KEY = 'player_images_cache';

interface CachedData<T> {
  data: T;
  timestamp: number;
}

interface CachedImage {
  url: string;
  localPath: string;
  timestamp: number;
}

function isCacheValid(timestamp: number): boolean {
  return Date.now() - timestamp < CACHE_DURATION;
}

// Position mapping according to new API specification
function mapPositionToRussian(position: string): string {
  if (!position) return 'Игрок';
  
  const pos = position.toLowerCase();
  if (pos.includes('вратарь') || pos.includes('goalkeeper')) {
    return 'Вратарь';
  } else if (pos.includes('защитник') || pos.includes('defender')) {
    return 'Защитник';
  } else if (pos.includes('нападающий') || pos.includes('forward')) {
    return 'Нападающий';
  }
  
  return position;
}

// Remove patronymic (third word) from player name
function removePatronymic(fullName: string): string {
  if (!fullName) return '';
  
  const nameParts = fullName.trim().split(/\s+/);
  if (nameParts.length >= 3) {
    // Return first two parts (name and surname), remove patronymic
    return `${nameParts[0]} ${nameParts[1]}`;
  }
  return fullName;
}

// Calculate age from birth date
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

// Cache player image URL
async function cachePlayerImage(imageUrl: string): Promise<string> {
  try {
    if (!imageUrl) return '';
    
    // Get cached images
    const cachedImagesJson = await AsyncStorage.getItem(PLAYER_IMAGES_CACHE_KEY);
    const cachedImages: Record<string, CachedImage> = cachedImagesJson ? JSON.parse(cachedImagesJson) : {};
    
    // Check if image is already cached and still valid
    const cached = cachedImages[imageUrl];
    if (cached && isCacheValid(cached.timestamp)) {
      console.log('Using cached image for:', imageUrl);
      return cached.url;
    }
    
    // For now, just return the original URL since we can't download images in this environment
    // In a real app, you would download and store the image locally
    cachedImages[imageUrl] = {
      url: imageUrl,
      localPath: imageUrl, // In real implementation, this would be a local file path
      timestamp: Date.now()
    };
    
    await AsyncStorage.setItem(PLAYER_IMAGES_CACHE_KEY, JSON.stringify(cachedImages));
    console.log('Cached image URL for:', imageUrl);
    
    return imageUrl;
  } catch (error) {
    console.error('Error caching player image:', error);
    return imageUrl; // Return original URL as fallback
  }
}

export async function getPlayers(): Promise<Player[]> {
  try {
    console.log('Fetching players from new API...');
    
    // Check cache first
    const cachedDataJson = await AsyncStorage.getItem(PLAYERS_CACHE_KEY);
    if (cachedDataJson) {
      const cachedData: CachedData<Player[]> = JSON.parse(cachedDataJson);
      if (isCacheValid(cachedData.timestamp)) {
        console.log('Using cached players data');
        return cachedData.data;
      }
    }
    
    // Fetch from new API using apiService
    const apiPlayers = await apiService.fetchPlayers();
    console.log('Raw API players response:', apiPlayers);
    
    // No filtering needed as per new specification - API already returns only needed players
    console.log(`Processing ${apiPlayers.length} players from new API`);
    
    // Convert API data to our Player interface
    const players: Player[] = await Promise.all(
      apiPlayers.map(async (apiPlayer: any) => {
        const title = apiPlayer.post_title || '';
        const name = removePatronymic(title);
        const position = mapPositionToRussian(apiPlayer.positions || '');
        const age = calculateAge(apiPlayer.post_date);
        
        // Parse sp_metrics object
        const metrics = apiPlayer.sp_metrics || {};
        const weight = metrics.weight ? `${metrics.weight} кг` : undefined;
        const height = metrics.height ? `${metrics.height} см` : undefined;
        const grip = metrics.onetwofive || undefined;
        const captainStatus = metrics.ka || '';
        
        // Cache player image
        const cachedImageUrl = await cachePlayerImage(apiPlayer.player_image || '');
        
        return {
          id: (apiPlayer.ID || '').toString(),
          name,
          position,
          number: apiPlayer.sp_number || 0,
          age,
          height,
          weight,
          grip,
          captainStatus,
          nationality: 'Россия', // Default nationality
          photo: cachedImageUrl,
        };
      })
    );
    
    // Cache the processed data
    const cacheData: CachedData<Player[]> = {
      data: players,
      timestamp: Date.now()
    };
    await AsyncStorage.setItem(PLAYERS_CACHE_KEY, JSON.stringify(cacheData));
    
    console.log(`Successfully processed ${players.length} players`);
    return players;
    
  } catch (error) {
    console.error('Error fetching players:', error);
    
    // Return cached data if available, even if expired
    try {
      const cachedDataJson = await AsyncStorage.getItem(PLAYERS_CACHE_KEY);
      if (cachedDataJson) {
        const cachedData: CachedData<Player[]> = JSON.parse(cachedDataJson);
        console.log('Using expired cached data as fallback');
        return cachedData.data;
      }
    } catch (cacheError) {
      console.error('Error reading cached data:', cacheError);
    }
    
    // Return fallback mock data
    return getFallbackPlayers();
  }
}

export async function getPlayerById(playerId: string): Promise<Player | null> {
  try {
    console.log('Fetching player details for ID:', playerId);
    
    const apiPlayer = await apiService.fetchPlayer(playerId);
    console.log('Player details fetched:', apiPlayer);
    
    const title = apiPlayer.post_title || '';
    const name = removePatronymic(title);
    const position = mapPositionToRussian(apiPlayer.positions || '');
    const age = calculateAge(apiPlayer.post_date || '');
    
    // Parse sp_metrics object
    const metrics = apiPlayer.sp_metrics || {};
    const weight = metrics.weight ? `${metrics.weight} кг` : undefined;
    const height = metrics.height ? `${metrics.height} см` : undefined;
    const grip = metrics.onetwofive || undefined;
    const captainStatus = metrics.ka || '';
    
    // Cache player image
    const cachedImageUrl = await cachePlayerImage(apiPlayer.player_image || '');
    
    return {
      id: (apiPlayer.ID || playerId).toString(),
      name,
      position,
      number: apiPlayer.sp_number || 0,
      age,
      height,
      weight,
      grip,
      captainStatus,
      nationality: 'Россия', // Default nationality
      photo: cachedImageUrl,
    };
    
  } catch (error) {
    console.error('Error fetching player details:', error);
    return null;
  }
}

// Fallback data when API is not available
function getFallbackPlayers(): Player[] {
  return [
    {
      id: '1',
      name: 'Александр Петров',
      position: 'Нападающий',
      number: 10,
      age: 28,
      height: '185 см',
      weight: '85 кг',
      nationality: 'Россия',
      photo: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400&h=400&fit=crop&crop=face',
    },
    {
      id: '2',
      name: 'Дмитрий Иванов',
      position: 'Защитник',
      number: 5,
      age: 26,
      height: '190 см',
      weight: '90 кг',
      nationality: 'Россия',
      photo: 'https://images.unsplash.com/photo-1566492031773-4f4e44671d66?w=400&h=400&fit=crop&crop=face',
    },
    {
      id: '3',
      name: 'Сергей Козлов',
      position: 'Вратарь',
      number: 1,
      age: 30,
      height: '188 см',
      weight: '82 кг',
      nationality: 'Россия',
      photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop&crop=face',
    },
    {
      id: '4',
      name: 'Павел Козлов',
      position: 'Нападающий',
      number: 17,
      age: 24,
      height: '180 см',
      weight: '78 кг',
      nationality: 'Россия',
      photo: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&h=400&fit=crop&crop=face',
    },
    {
      id: '5',
      name: 'Андрей Смирнов',
      position: 'Защитник',
      number: 22,
      age: 27,
      height: '192 см',
      weight: '88 кг',
      nationality: 'Россия',
      photo: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=400&fit=crop&crop=face',
    },
    {
      id: '6',
      name: 'Михаил Волков',
      position: 'Нападающий',
      number: 91,
      age: 25,
      height: '183 см',
      weight: '81 кг',
      nationality: 'Россия',
      photo: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=400&h=400&fit=crop&crop=face',
    },
  ];
}
