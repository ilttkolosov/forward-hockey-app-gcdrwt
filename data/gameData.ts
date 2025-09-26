
import { Game, GameStats, ApiUpcomingEvent, ApiPastEvent } from '../types';
import { apiService } from '../services/apiService';

// Cache for API data
let upcomingGamesCache: Game[] | null = null;
let pastGamesCache: Game[] | null = null;
let upcomingCountCache: number = 0;
let pastCountCache: number = 0;
let gameDetailsCache: { [key: string]: Game } = {};
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Check if cache is valid
const isCacheValid = () => {
  return Date.now() - cacheTimestamp < CACHE_DURATION;
};

// Convert API upcoming event to Game object
const convertApiUpcomingEventToGame = async (apiEvent: ApiUpcomingEvent): Promise<Game> => {
  console.log('Converting API upcoming event to game:', apiEvent);
  
  // Parse team IDs from sp_teams field
  const teamIds = apiEvent.sp_teams.split(',').map(id => id.trim());
  const homeTeamId = teamIds[0] || '';
  const awayTeamId = teamIds[1] || '';
  
  // Fetch team details
  let homeTeam = 'Home Team';
  let awayTeam = 'Away Team';
  let homeTeamLogo = '';
  let awayTeamLogo = '';
  
  try {
    const [homeTeamData, awayTeamData] = await Promise.all([
      homeTeamId ? apiService.fetchTeam(homeTeamId) : null,
      awayTeamId ? apiService.fetchTeam(awayTeamId) : null
    ]);
    
    if (homeTeamData) {
      homeTeam = homeTeamData.name;
      homeTeamLogo = homeTeamData.logo_url;
    }
    
    if (awayTeamData) {
      awayTeam = awayTeamData.name;
      awayTeamLogo = awayTeamData.logo_url;
    }
  } catch (error) {
    console.error('Error fetching team details:', error);
  }
  
  // Format date and time
  const { date, time } = apiService.formatDateTime(apiEvent.event_date);
  
  // Determine status
  const status = apiService.determineGameStatus(apiEvent.event_date, false);
  
  // Simple venue parsing
  const venue = apiService.parseIdNameString(apiEvent.venues || '');
  
  const game: Game = {
    id: apiEvent.event_id,
    event_id: apiEvent.event_id,
    event_date: apiEvent.event_date,
    homeTeam,
    awayTeam,
    homeTeamId,
    awayTeamId,
    homeTeamLogo,
    awayTeamLogo,
    date,
    time,
    venue: venue.name || 'Арена',
    status,
    tournament: 'Чемпионат' // Default tournament name
  };
  
  console.log('Converted upcoming game:', game);
  return game;
};

// Convert API past event to Game object with new results structure
const convertApiPastEventToGame = async (apiEvent: ApiPastEvent): Promise<Game> => {
  console.log('Converting API past event to game with new results structure:', apiEvent);
  
  // Parse team IDs from teams field (updated field name)
  const teamIds = apiEvent.teams.split(',').map(id => id.trim());
  const homeTeamId = teamIds[0] || '';
  const awayTeamId = teamIds[1] || '';
  
  // Fetch team details
  let homeTeam = 'Home Team';
  let awayTeam = 'Away Team';
  let homeTeamLogo = '';
  let awayTeamLogo = '';
  
  try {
    const [homeTeamData, awayTeamData] = await Promise.all([
      homeTeamId ? apiService.fetchTeam(homeTeamId) : null,
      awayTeamId ? apiService.fetchTeam(awayTeamId) : null
    ]);
    
    if (homeTeamData) {
      homeTeam = homeTeamData.name;
      homeTeamLogo = homeTeamData.logo_url;
    }
    
    if (awayTeamData) {
      awayTeam = awayTeamData.name;
      awayTeamLogo = awayTeamData.logo_url;
    }
  } catch (error) {
    console.error('Error fetching team details:', error);
  }
  
  // Parse results using new structure
  const { homeScore, awayScore, homeOutcome, awayOutcome } = apiService.parseNewResults(apiEvent.results, teamIds);
  
  console.log('Parsed match results:', {
    homeScore,
    awayScore,
    homeOutcome,
    awayOutcome
  });
  
  // Format date and time
  const { date, time } = apiService.formatDateTime(apiEvent.event_date);
  
  // Determine status (should be finished for past events)
  const status = 'finished';
  
  // Simple venue parsing
  const venue = apiService.parseIdNameString(apiEvent.venues || '');
  
  const game: Game = {
    id: apiEvent.event_id,
    event_id: apiEvent.event_id,
    event_date: apiEvent.event_date,
    homeTeam,
    awayTeam,
    homeTeamId,
    awayTeamId,
    homeTeamLogo,
    awayTeamLogo,
    homeScore,
    awayScore,
    date,
    time,
    venue: venue.name || 'Арена',
    status,
    tournament: 'Чемпионат', // Default tournament name
    results: apiEvent.results // Store the full results object for detailed display
  };
  
  console.log('Converted past game with results:', game);
  return game;
};

// Get upcoming games
export const getFutureGames = async (): Promise<Game[]> => {
  try {
    if (isCacheValid() && upcomingGamesCache) {
      console.log('Returning cached upcoming games');
      return upcomingGamesCache;
    }

    console.log('Fetching upcoming games from API...');
    const response = await apiService.fetchUpcomingEvents();
    
    // Convert API events to Game objects
    const games = await Promise.all(
      response.data.map(event => convertApiUpcomingEventToGame(event))
    );
    
    upcomingGamesCache = games;
    upcomingCountCache = response.count;
    cacheTimestamp = Date.now();
    console.log('Upcoming games cached successfully. Count:', response.count);

    return games;
  } catch (error) {
    console.error('Error fetching upcoming games:', error);
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

    console.log('Fetching past games from updated API...');
    const response = await apiService.fetchPastEvents();
    
    // Convert API events to Game objects using new structure
    const games = await Promise.all(
      response.data.map(event => convertApiPastEventToGame(event))
    );
    
    pastGamesCache = games;
    pastCountCache = response.count;
    cacheTimestamp = Date.now();
    console.log('Past games cached successfully with new results structure. Count:', response.count);

    return games;
  } catch (error) {
    console.error('Error fetching past games:', error);
    return getFallbackPastGames();
  }
};

// Get all games (future + past)
export const getAllGames = async (): Promise<Game[]> => {
  try {
    console.log('Fetching all games...');
    const [upcomingGames, pastGames] = await Promise.all([
      getFutureGames(),
      getPastGames()
    ]);

    return [...upcomingGames, ...pastGames];
  } catch (error) {
    console.error('Error fetching all games:', error);
    return getFallbackGames();
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
      .sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime());
    
    if (upcomingGames.length > 0) {
      console.log('Found upcoming game:', upcomingGames[0]);
      return upcomingGames[0];
    }

    // Finally, return the most recent finished game
    const finishedGames = allGames
      .filter(game => game.status === 'finished')
      .sort((a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime());
    
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

    console.log('Searching for game with ID:', gameId);
    
    // Try to find the game in cached data first
    const allCachedGames = [...(upcomingGamesCache || []), ...(pastGamesCache || [])];
    const cachedGame = allCachedGames.find(game => game.id === gameId || game.event_id === gameId);
    
    if (cachedGame) {
      console.log('Found game in cache:', cachedGame);
      gameDetailsCache[gameId] = cachedGame;
      return cachedGame;
    }
    
    // If not in cache, fetch all games and search
    const allGames = await getAllGames();
    const game = allGames.find(game => game.id === gameId || game.event_id === gameId);
    
    if (game) {
      gameDetailsCache[gameId] = game;
      console.log('Found game in all games:', game);
      return game;
    }
    
    console.log('Game not found, returning fallback');
    return getFallbackGameById(gameId);
  } catch (error) {
    console.error('Error fetching game details:', error);
    return getFallbackGameById(gameId);
  }
};

// Get counts for display on main screen
export const getUpcomingGamesCount = (): number => {
  return upcomingCountCache;
};

export const getPastGamesCount = (): number => {
  return pastCountCache;
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
  event_id: '1',
  event_date: '2024-01-15 19:30:00',
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
  results: {
    '1': { goals: 2, outcome: 'win' },
    '2': { goals: 1, outcome: 'loss' }
  }
});

const getFallbackUpcomingGames = (): Game[] => [
  {
    id: '2',
    event_id: '2',
    event_date: '2024-01-18 20:00:00',
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
    event_id: '3',
    event_date: '2024-01-22 19:30:00',
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
    event_id: '5',
    event_date: '2024-01-10 19:30:00',
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
    results: {
      '1': { goals: 3, outcome: 'win' },
      '2': { goals: 2, outcome: 'loss' }
    }
  },
  {
    id: '6',
    event_id: '6',
    event_date: '2024-01-05 20:00:00',
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
    results: {
      '3': { goals: 1, outcome: 'loss' },
      '1': { goals: 4, outcome: 'win' }
    }
  },
];

const getFallbackGames = (): Game[] => [
  getFallbackCurrentGame(),
  ...getFallbackUpcomingGames(),
  ...getFallbackPastGames(),
];

const getFallbackGameById = (gameId: string): Game | null => {
  const allFallbackGames = getFallbackGames();
  return allFallbackGames.find(game => game.id === gameId || game.event_id === gameId) || null;
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
