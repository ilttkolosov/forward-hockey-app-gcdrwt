
// Team logos cache utility
import AsyncStorage from '@react-native-async-storage/async-storage';

interface TeamLogoCache {
  [teamId: string]: {
    url: string;
    localPath?: string;
    timestamp: number;
  };
}

const TEAM_LOGOS_CACHE_KEY = 'team_logos_cache';
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

// Static team logos mapping (add more as needed)
export const teamLogos: Record<string, string> = {
  // Add known team logos here
  // '74': require('../assets/logos/forward.png'),
  // '249': require('../assets/logos/dinamo.png'),
};

export const getCachedTeamLogo = async (teamId: string, apiUrl: string): Promise<string> => {
  try {
    // Check if we have a static logo for this team
    if (teamLogos[teamId]) {
      return teamLogos[teamId];
    }

    // Check cache
    const cacheData = await AsyncStorage.getItem(TEAM_LOGOS_CACHE_KEY);
    const cache: TeamLogoCache = cacheData ? JSON.parse(cacheData) : {};

    const cachedLogo = cache[teamId];
    
    // If cached and not expired, return cached URL
    if (cachedLogo && (Date.now() - cachedLogo.timestamp) < CACHE_DURATION) {
      return cachedLogo.url;
    }

    // Cache the new URL
    cache[teamId] = {
      url: apiUrl,
      timestamp: Date.now()
    };

    await AsyncStorage.setItem(TEAM_LOGOS_CACHE_KEY, JSON.stringify(cache));
    return apiUrl;
  } catch (error) {
    console.error('Error caching team logo:', error);
    return apiUrl; // Fallback to API URL
  }
};

export const clearTeamLogosCache = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(TEAM_LOGOS_CACHE_KEY);
  } catch (error) {
    console.error('Error clearing team logos cache:', error);
  }
};
