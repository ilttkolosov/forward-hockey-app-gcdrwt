
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
      console.log('Returning cached games');
      return [...futureGamesCache, ...pastGamesCache];
    }

    console.log('Fetching all games from API...');
    const [futureEventsApi, pastEventsApi] = await Promise.all([
      apiService.fetchFutureGames(),
      apiService.fetchPastGames()
    ]);

    futureGamesCache = futureEventsApi.map(event => 
      apiService.convertCalendarEventToGame(event, false)
    );
    pastGamesCache = pastEventsApi.map(event => 
      apiService.convertCalendarEventToGame(event, true)
    );
    
    cacheTimestamp = Date.now();
    console.log('Games cached successfully');

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
      console.log('Returning cached future games');
      return futureGamesCache;
    }

    console.log('Fetching future games from API...');
    const futureEventsApi = await apiService.fetchFutureGames();
    futureGamesCache = futureEventsApi.map(event => 
      apiService.convertCalendarEventToGame(event, false)
    );
    cacheTimestamp = Date.now();
    console.log('Future games cached successfully');

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
      console.log('Returning cached past games');
      return pastGamesCache;
    }

    console.log('Fetching past games from API...');
    const pastEventsApi = await apiService.fetchPastGames();
    pastGamesCache = pastEventsApi.map(event => 
      apiService.convertCalendarEventToGame(event, true)
    );
    cacheTimestamp = Date.now();
    console.log('Past games cached successfully');

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
      console.log('Found live game:', liveGame);
      return liveGame;
    }

    // Then, look for the next upcoming game
    const upcomingGames = allGames
      .filter(game => game.status === 'upcoming')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    if (upcomingGames.length > 0) {
      console.log('Found upcoming game:', upcomingGames[0]);
      return upcomingGames[0];
    }

    // Finally, return the most recent finished game
    const finishedGames = allGames
      .filter(game => game.status === 'finished')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    const currentGame = finishedGames.length > 0 ? finishedGames[0] : null;
    console.log('Found current game:', currentGame);
    return currentGame;
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
      console.log('Returning cached game details for ID:', gameId);
      return gameDetailsCache[gameId];
    }

    console.log('Fetching game details from API for ID:', gameId);
    const eventDetailsApi = await apiService.fetchEventDetails(gameId);
    const game = apiService.convertEventDetailsToGame(eventDetailsApi);
    
    // Cache the result
    gameDetailsCache[gameId] = game;
    console.log('Game details cached for ID:', gameId);
    
    return game;
  } catch (error) {
    console.error('Error fetching game details:', error);
    
    // Try to find the game in cached data
    const allCachedGames = [...(futureGamesCache || []), ...(pastGamesCache || [])];
    const cachedGame = allCachedGames.find(game => game.id === gameId);
    
    if (cachedGame) {
      console.log('Found game in cache:', cachedGame);
      return cachedGame;
    }
    
    // Return fallback mock data
    return getFallbackGameById(gameId);
  }
};

// Mock game statistics (since the API structure for detailed stats is not fully defined)
export const getGameStatsById = (gameId: string): GameStats | null => {
  console.log('Getting game stats for ID:', gameId);
  // This would need to be implemented based on the actual API structure
  // For now, return mock data for demonstration
  return getFallbackGameStats(gameId);
};

// Fallback data when API is unavailable
const getFallbackCurrentGame = (): Game => ({
  id: '1',
  homeTeam: 'Динамо-Форвард',
  awayTeam: 'Варяги',
  homeScore: 2,
  awayScore: 1,
  date: '2024-01-15',
  time: '19:30',
  venue: 'Арена Форвард',
  status: 'live',
  tournament: 'Чемпионат',
  videoUrl: 'https://www.hc-forward.com/broadcast/live-stream',
});

const getFallbackUpcomingGames = (): Game[] => [
  {
    id: '2',
    homeTeam: 'Спартак',
    awayTeam: 'Форвард',
    date: '2024-01-18',
    time: '20:00',
    venue: 'Ледовый дворец Спартак',
    status: 'upcoming',
    tournament: 'Чемпионат',
  },
  {
    id: '3',
    homeTeam: 'Форвард',
    awayTeam: 'ЦСКА',
    date: '2024-01-22',
    time: '19:30',
    venue: 'Арена Форвард',
    status: 'upcoming',
    tournament: 'Чемпионат',
  },
];

const getFallbackPastGames = (): Game[] => [
  {
    id: '5',
    homeTeam: 'Форвард',
    awayTeam: 'Локомотив',
    homeScore: 3,
    awayScore: 2,
    date: '2024-01-10',
    time: '19:30',
    venue: 'Арена Форвард',
    status: 'finished',
    tournament: 'Чемпионат',
    videoUrl: 'https://www.hc-forward.com/broadcast/replay-1',
  },
  {
    id: '6',
    homeTeam: 'Металлург',
    awayTeam: 'Форвард',
    homeScore: 1,
    awayScore: 4,
    date: '2024-01-05',
    time: '20:00',
    venue: 'Арена Металлург',
    status: 'finished',
    tournament: 'Чемпионат',
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
          playerName: 'Александр Петров',
          position: 'Нападающий',
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
          playerName: 'Павел Козлов',
          position: 'Нападающий',
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
          playerName: 'Виктор Орлов',
          position: 'Нападающий',
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
        'Захватывающий матч с отличными играми от обеих команд',
        'Сильная защитная игра',
        'Отличная игра вратарей на протяжении всего матча',
      ],
    };
  }
  
  return null;
};
