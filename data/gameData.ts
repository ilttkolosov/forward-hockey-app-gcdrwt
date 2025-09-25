
import { Game, GameStats, ApiEvent, ApiGameDetails, GameResult } from '../types';
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

// Convert API event to Game object with enhanced result parsing for sp_results
const convertApiEventToGame = async (apiEvent: ApiEvent, isPastEvent: boolean = false): Promise<Game> => {
  console.log('Converting API event to game with enhanced sp_results parsing:', apiEvent);
  
  // Parse team IDs
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
  
  // Parse enhanced results for past events using sp_results
  let homeScore: number | undefined;
  let awayScore: number | undefined;
  let homeOutcome: 'win' | 'loss' | 'nich' | undefined;
  let awayOutcome: 'win' | 'loss' | 'nich' | undefined;
  
  if (isPastEvent && apiEvent.sp_results) {
    console.log('Parsing sp_results for past event:', apiEvent.sp_results);
    const spResults = apiService.parseSpResults(apiEvent.sp_results);
    console.log('Parsed sp_results:', spResults);
    
    if (spResults.length >= 2) {
      // Map results to home/away teams based on team IDs or order
      let homeResult = spResults.find(r => r.teamId === homeTeamId);
      let awayResult = spResults.find(r => r.teamId === awayTeamId);
      
      // If no exact match by team ID, use order (first result = home, second = away)
      if (!homeResult || !awayResult) {
        homeResult = spResults[0];
        awayResult = spResults[1];
      }
      
      homeScore = homeResult.goals;
      awayScore = awayResult.goals;
      homeOutcome = homeResult.outcome;
      awayOutcome = awayResult.outcome;
      
      console.log(`Mapped results: Home(${homeTeam}): ${homeScore} goals, ${homeOutcome}; Away(${awayTeam}): ${awayScore} goals, ${awayOutcome}`);
    } else if (spResults.length === 1) {
      // Only one result found, try to determine which team it belongs to
      const result = spResults[0];
      if (result.teamId === homeTeamId) {
        homeScore = result.goals;
        homeOutcome = result.outcome;
        // Infer away team result
        awayScore = 0; // Default, might need adjustment based on actual data
        awayOutcome = result.outcome === 'win' ? 'loss' : result.outcome === 'loss' ? 'win' : 'nich';
      } else {
        awayScore = result.goals;
        awayOutcome = result.outcome;
        // Infer home team result
        homeScore = 0; // Default, might need adjustment based on actual data
        homeOutcome = result.outcome === 'win' ? 'loss' : result.outcome === 'loss' ? 'win' : 'nich';
      }
    }
  }
  
  // Format date and time
  const { date, time } = apiService.formatDateTime(apiEvent.event_date);
  
  // Determine status
  const status = apiService.determineGameStatus(apiEvent.event_date, isPastEvent || (homeScore !== undefined && awayScore !== undefined));
  
  // Parse venue, league, and season
  const venue = apiService.parseIdNameString(apiEvent.venues || '');
  const league = apiService.parseIdNameString(apiEvent.Leagues || '');
  const season = apiService.parseIdNameString(apiEvent.seasons || '');
  
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
    homeOutcome,
    awayOutcome,
    date,
    time,
    venue: venue.name || 'Арена',
    status,
    tournament: league.name || 'Товарищеский матч',
    league: league.name,
    season: season.name,
    sp_results: apiEvent.sp_results
  };
  
  console.log('Converted game with enhanced sp_results:', game);
  return game;
};

// Enhanced function to get detailed game information from /events/{id} endpoint
const getEnhancedGameDetails = async (gameId: string): Promise<Game | null> => {
  try {
    console.log('Fetching enhanced game details from /events/{id} for ID:', gameId);
    
    // Fetch detailed game data from /events/{id} endpoint
    const gameDetails = await apiService.fetchGameDetails(gameId);
    if (!gameDetails) {
      console.log('No detailed game data found for ID:', gameId);
      return null;
    }
    
    console.log('Raw game details from API:', gameDetails);
    
    // Parse team IDs
    const teamIds = gameDetails.teams.split(',').map(id => id.trim());
    const homeTeamId = teamIds[0] || '';
    const awayTeamId = teamIds[1] || '';
    
    console.log('Team IDs:', { homeTeamId, awayTeamId });
    
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
        console.log('Home team data:', homeTeamData);
      }
      
      if (awayTeamData) {
        awayTeam = awayTeamData.name;
        awayTeamLogo = awayTeamData.logo_url;
        console.log('Away team data:', awayTeamData);
      }
    } catch (error) {
      console.error('Error fetching team details for enhanced game:', error);
    }
    
    // Parse detailed results with period information from the results field
    const detailedResults = apiService.parseDetailedResults(gameDetails.results);
    console.log('Enhanced game detailed results:', detailedResults);
    
    let homeScore: number | undefined;
    let awayScore: number | undefined;
    let homeOutcome: 'win' | 'loss' | 'nich' | undefined;
    let awayOutcome: 'win' | 'loss' | 'nich' | undefined;
    let homeFirstPeriod: number | undefined;
    let homeSecondPeriod: number | undefined;
    let homeThirdPeriod: number | undefined;
    let awayFirstPeriod: number | undefined;
    let awaySecondPeriod: number | undefined;
    let awayThirdPeriod: number | undefined;
    
    if (detailedResults.length >= 2) {
      // Map results to home/away teams based on team IDs or order
      let homeResult = detailedResults.find(r => r.teamId === homeTeamId);
      let awayResult = detailedResults.find(r => r.teamId === awayTeamId);
      
      // If no exact match by team ID, use order (first result = home, second = away)
      if (!homeResult || !awayResult) {
        console.log('No exact team ID match, using order-based mapping');
        homeResult = detailedResults[0];
        awayResult = detailedResults[1];
      }
      
      homeScore = homeResult.goals;
      awayScore = awayResult.goals;
      homeOutcome = homeResult.outcome;
      awayOutcome = awayResult.outcome;
      homeFirstPeriod = homeResult.first;
      homeSecondPeriod = homeResult.second;
      homeThirdPeriod = homeResult.third;
      awayFirstPeriod = awayResult.first;
      awaySecondPeriod = awayResult.second;
      awayThirdPeriod = awayResult.third;
      
      console.log('Mapped detailed results:', {
        home: { team: homeTeam, score: homeScore, outcome: homeOutcome, periods: [homeFirstPeriod, homeSecondPeriod, homeThirdPeriod] },
        away: { team: awayTeam, score: awayScore, outcome: awayOutcome, periods: [awayFirstPeriod, awaySecondPeriod, awayThirdPeriod] }
      });
    } else if (detailedResults.length === 1) {
      // Only one result found
      const result = detailedResults[0];
      console.log('Only one detailed result found:', result);
      
      if (result.teamId === homeTeamId) {
        homeScore = result.goals;
        homeOutcome = result.outcome;
        homeFirstPeriod = result.first;
        homeSecondPeriod = result.second;
        homeThirdPeriod = result.third;
      } else {
        awayScore = result.goals;
        awayOutcome = result.outcome;
        awayFirstPeriod = result.first;
        awaySecondPeriod = result.second;
        awayThirdPeriod = result.third;
      }
    }
    
    // Format date and time
    const { date, time } = apiService.formatDateTime(gameDetails.date);
    
    // Parse venue, league, and season
    const venue = apiService.parseIdNameString(gameDetails.venues || '');
    const league = apiService.parseIdNameString(gameDetails.Leagues || '');
    const season = apiService.parseIdNameString(gameDetails.seasons || '');
    
    console.log('Parsed metadata:', { venue: venue.name, league: league.name, season: season.name });
    
    // Determine status
    const status = apiService.determineGameStatus(gameDetails.date, homeScore !== undefined && awayScore !== undefined);
    
    const enhancedGame: Game = {
      id: gameDetails.id,
      event_id: gameDetails.id,
      event_date: gameDetails.date,
      homeTeam,
      awayTeam,
      homeTeamId,
      awayTeamId,
      homeTeamLogo,
      awayTeamLogo,
      homeScore,
      awayScore,
      homeOutcome,
      awayOutcome,
      homeFirstPeriod,
      homeSecondPeriod,
      homeThirdPeriod,
      awayFirstPeriod,
      awaySecondPeriod,
      awayThirdPeriod,
      date,
      time,
      venue: venue.name || 'Арена',
      status,
      tournament: league.name || 'Товарищеский матч',
      league: league.name,
      season: season.name,
      videoUrl: gameDetails.sp_video,
      sp_video: gameDetails.sp_video
    };
    
    console.log('Enhanced game details created:', enhancedGame);
    return enhancedGame;
  } catch (error) {
    console.error('Error fetching enhanced game details:', error);
    return null;
  }
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
      response.data.map(event => convertApiEventToGame(event, false))
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

// Get past games with enhanced sp_results parsing
export const getPastGames = async (): Promise<Game[]> => {
  try {
    if (isCacheValid() && pastGamesCache) {
      console.log('Returning cached past games');
      return pastGamesCache;
    }

    console.log('Fetching past games from API with enhanced sp_results parsing...');
    const response = await apiService.fetchPastEvents();
    
    // Convert API events to Game objects with enhanced sp_results parsing
    const games = await Promise.all(
      response.data.map(event => convertApiEventToGame(event, true))
    );
    
    pastGamesCache = games;
    pastCountCache = response.count;
    cacheTimestamp = Date.now();
    console.log('Past games cached successfully with enhanced sp_results. Count:', response.count);

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

// Enhanced function to get game by ID with detailed information from /events/{id}
export const getGameById = async (gameId: string): Promise<Game | null> => {
  try {
    // Check cache first
    if (gameDetailsCache[gameId]) {
      console.log('Returning cached game details for ID:', gameId);
      return gameDetailsCache[gameId];
    }

    console.log('Searching for game with ID using /events/{id} endpoint:', gameId);
    
    // First, try to get enhanced details from /events/{id} endpoint
    const enhancedGame = await getEnhancedGameDetails(gameId);
    if (enhancedGame) {
      gameDetailsCache[gameId] = enhancedGame;
      console.log('Found enhanced game details from /events/{id}:', enhancedGame);
      return enhancedGame;
    }
    
    // Fallback: try to find the game in cached data
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
  homeOutcome: 'win',
  awayOutcome: 'loss',
  homeFirstPeriod: 1,
  homeSecondPeriod: 0,
  homeThirdPeriod: 1,
  awayFirstPeriod: 0,
  awaySecondPeriod: 1,
  awayThirdPeriod: 0,
  date: '2024-01-15',
  time: '19:30',
  venue: 'Арена Форвард',
  status: 'live',
  tournament: 'Чемпионат',
  videoUrl: 'https://vk.com/video-123456789_456123789',
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
    homeOutcome: 'win',
    awayOutcome: 'loss',
    homeFirstPeriod: 1,
    homeSecondPeriod: 1,
    homeThirdPeriod: 1,
    awayFirstPeriod: 0,
    awaySecondPeriod: 2,
    awayThirdPeriod: 0,
    date: '2024-01-10',
    time: '19:30',
    venue: 'Арена Форвард',
    status: 'finished',
    tournament: 'Чемпионат',
    videoUrl: 'https://vk.com/video-123456789_456123790',
  },
  {
    id: '6',
    event_id: '6',
    event_date: '2024-01-05 20:00:00',
    homeTeam: 'Металлург',
    awayTeam: 'Форвард',
    homeScore: 1,
    awayScore: 4,
    homeOutcome: 'loss',
    awayOutcome: 'win',
    homeFirstPeriod: 0,
    homeSecondPeriod: 1,
    homeThirdPeriod: 0,
    awayFirstPeriod: 2,
    awaySecondPeriod: 1,
    awayThirdPeriod: 1,
    date: '2024-01-05',
    time: '20:00',
    venue: 'Арена Металлург',
    status: 'finished',
    tournament: 'Чемпионат',
    videoUrl: 'https://vk.com/video-123456789_456123791',
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
