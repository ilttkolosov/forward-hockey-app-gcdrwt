
import { Game, GameStats } from '../types';
import { apiService } from '../services/apiService';

// Cache for API data
let futureGamesCache: Game[] | null = null;
let pastGamesCache: Game[] | null = null;
let gameDetailsCache: { [key: string]: Game } = {};
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Check if cache is valid
const isCacheValid = () => {
  return Date.now() - cacheTimestamp < CACHE_DURATION;
};

// Get all games (future + past)
export const getAllGames = async (): Promise<Game[]> => {
  try {
    if (isCacheValid() && futureGamesCache && pastGamesCache) {
      return [...futureGamesCache, ...pastGamesCache];
    }

    console.log('Fetching all games from API...');
    const [futureGamesApi, pastGamesApi] = await Promise.all([
      apiService.fetchFutureGames(),
      apiService.fetchPastGames()
    ]);

    futureGamesCache = futureGamesApi.map(apiGame => apiService.convertApiGameToGame(apiGame));
    pastGamesCache = pastGamesApi.map(apiGame => apiService.convertApiGameToGame(apiGame));
    cacheTimestamp = Date.now();

    return [...futureGamesCache, ...pastGamesCache];
  } catch (error) {
    console.error('Error fetching all games:', error);
    // Return fallback mock data if API fails
    return getFallbackGames();
  }
};

// Get future games
export const getFutureGames = async (): Promise<Game[]> => {
  try {
    if (isCacheValid() && futureGamesCache) {
      return futureGamesCache;
    }

    console.log('Fetching future games from API...');
    const futureGamesApi = await apiService.fetchFutureGames();
    futureGamesCache = futureGamesApi.map(apiGame => apiService.convertApiGameToGame(apiGame));
    cacheTimestamp = Date.now();

    return futureGamesCache;
  } catch (error) {
    console.error('Error fetching future games:', error);
    return getFallbackUpcomingGames();
  }
};

// Get past games
export const getPastGames = async (): Promise<Game[]> => {
  try {
    if (isCacheValid() && pastGamesCache) {
      return pastGamesCache;
    }

    console.log('Fetching past games from API...');
    const pastGamesApi = await apiService.fetchPastGames();
    pastGamesCache = pastGamesApi.map(apiGame => apiService.convertApiGameToGame(apiGame));
    cacheTimestamp = Date.now();

    return pastGamesCache;
  } catch (error) {
    console.error('Error fetching past games:', error);
    return getFallbackPastGames();
  }
};

// Get current game (most recent live or upcoming game)
export const getCurrentGame = async (): Promise<Game | null> => {
  try {
    const allGames = await getAllGames();
    
    // First, look for live games
    const liveGame = allGames.find(game => game.status === 'live');
    if (liveGame) {
      return liveGame;
    }

    // Then, look for the next upcoming game
    const upcomingGames = allGames
      .filter(game => game.status === 'upcoming')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    if (upcomingGames.length > 0) {
      return upcomingGames[0];
    }

    // Finally, return the most recent finished game
    const finishedGames = allGames
      .filter(game => game.status === 'finished')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    return finishedGames.length > 0 ? finishedGames[0] : null;
  } catch (error) {
    console.error('Error fetching current game:', error);
    return getFallbackCurrentGame();
  }
};

// Get game by ID with detailed information
export const getGameById = async (gameId: string): Promise<Game | null> => {
  try {
    // Check cache first
    if (gameDetailsCache[gameId]) {
      return gameDetailsCache[gameId];
    }

    console.log('Fetching game details from API for ID:', gameId);
    const gameDetailsApi = await apiService.fetchGameDetails(gameId);
    const game = apiService.convertApiGameDetailsToGame(gameDetailsApi);
    
    // Cache the result
    gameDetailsCache[gameId] = game;
    
    return game;
  } catch (error) {
    console.error('Error fetching game details:', error);
    
    // Try to find the game in cached data
    const allCachedGames = [...(futureGamesCache || []), ...(pastGamesCache || [])];
    const cachedGame = allCachedGames.find(game => game.id === gameId);
    
    if (cachedGame) {
      return cachedGame;
    }
    
    // Return fallback mock data
    return getFallbackGameById(gameId);
  }
};

// Mock game statistics (since the API doesn't provide detailed player stats)
export const getGameStatsById = (gameId: string): GameStats | null => {
  // This would need to be implemented based on the actual API structure
  // For now, return mock data for demonstration
  return getFallbackGameStats(gameId);
};

// Fallback data when API is unavailable
const getFallbackCurrentGame = (): Game => ({
  id: '1',
  homeTeam: 'HC Forward',
  awayTeam: 'HC Dynamo',
  homeScore: 2,
  awayScore: 1,
  date: '2024-01-15',
  time: '19:30',
  venue: 'Forward Arena',
  status: 'live',
  tournament: 'Championship League',
  videoUrl: 'https://www.hc-forward.com/broadcast/live-stream',
});

const getFallbackUpcomingGames = (): Game[] => [
  {
    id: '2',
    homeTeam: 'HC Spartak',
    awayTeam: 'HC Forward',
    date: '2024-01-18',
    time: '20:00',
    venue: 'Spartak Ice Palace',
    status: 'upcoming',
    tournament: 'Championship League',
    videoUrl: 'https://www.hc-forward.com/broadcast/upcoming-stream',
  },
  {
    id: '3',
    homeTeam: 'HC Forward',
    awayTeam: 'HC CSKA',
    date: '2024-01-22',
    time: '19:30',
    venue: 'Forward Arena',
    status: 'upcoming',
    tournament: 'Championship League',
    videoUrl: 'https://www.hc-forward.com/broadcast/upcoming-stream-2',
  },
];

const getFallbackPastGames = (): Game[] => [
  {
    id: '5',
    homeTeam: 'HC Forward',
    awayTeam: 'HC Lokomotiv',
    homeScore: 3,
    awayScore: 2,
    date: '2024-01-10',
    time: '19:30',
    venue: 'Forward Arena',
    status: 'finished',
    tournament: 'Championship League',
    videoUrl: 'https://www.hc-forward.com/broadcast/replay-1',
  },
  {
    id: '6',
    homeTeam: 'HC Metallurg',
    awayTeam: 'HC Forward',
    homeScore: 1,
    awayScore: 4,
    date: '2024-01-05',
    time: '20:00',
    venue: 'Metallurg Arena',
    status: 'finished',
    tournament: 'Championship League',
    videoUrl: 'https://www.hc-forward.com/broadcast/replay-2',
  },
];

const getFallbackGames = (): Game[] => [
  getFallbackCurrentGame(),
  ...getFallbackUpcomingGames(),
  ...getFallbackPastGames(),
];

const getFallbackGameById = (gameId: string): Game | null => {
  const allFallbackGames = getFallbackGames();
  return allFallbackGames.find(game => game.id === gameId) || null;
};

const getFallbackGameStats = (gameId: string): GameStats | null => {
  // Mock stats for demonstration
  if (gameId === '1' || gameId === '5') {
    return {
      gameId,
      homeTeamStats: [
        {
          playerId: '1',
          playerName: 'Alexander Petrov',
          position: 'Forward',
          number: 10,
          goals: 1,
          assists: 1,
          points: 2,
          penaltyMinutes: 2,
          shots: 4,
          hits: 3,
          blockedShots: 0,
          faceoffWins: 8,
          faceoffLosses: 5,
          timeOnIce: '18:45',
        },
        {
          playerId: '4',
          playerName: 'Pavel Kozlov',
          position: 'Forward',
          number: 17,
          goals: 1,
          assists: 0,
          points: 1,
          penaltyMinutes: 0,
          shots: 3,
          hits: 2,
          blockedShots: 1,
          faceoffWins: 6,
          faceoffLosses: 4,
          timeOnIce: '16:22',
        },
      ],
      awayTeamStats: [
        {
          playerId: 'away1',
          playerName: 'Viktor Orlov',
          position: 'Forward',
          number: 9,
          goals: 1,
          assists: 0,
          points: 1,
          penaltyMinutes: 0,
          shots: 5,
          hits: 2,
          blockedShots: 0,
          faceoffWins: 7,
          faceoffLosses: 8,
          timeOnIce: '17:28',
        },
      ],
      gameHighlights: [
        'Exciting match with great plays from both teams',
        'Strong defensive performance',
        'Excellent goaltending throughout the game',
      ],
    };
  }
  
  return null;
};
