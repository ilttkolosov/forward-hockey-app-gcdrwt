
import { Game, GameStats, ApiUpcomingEvent, ApiPastEvent } from '../types';
import { apiService } from '../services/apiService';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

interface CachedData<T> {
  data: T;
  timestamp: number;
}

let upcomingGamesCache: CachedData<Game[]> | null = null;
let pastGamesCache: CachedData<Game[]> | null = null;
let upcomingCountCache: CachedData<number> | null = null;
let pastCountCache: CachedData<number> | null = null;

function isCacheValid<T>(cache: CachedData<T> | null): boolean {
  if (!cache) return false;
  return Date.now() - cache.timestamp < CACHE_DURATION;
}

async function convertApiUpcomingEventToGame(apiEvent: ApiUpcomingEvent): Promise<Game> {
  console.log('Converting upcoming event:', apiEvent);
  
  const { date, time } = apiService.formatDateTime(apiEvent.event_date);
  
  // Parse teams using sp_teams field for upcoming events
  const teamIds = apiEvent.sp_teams.split(',').map(id => id.trim());
  console.log('Team IDs from sp_teams:', teamIds);
  
  // Fetch team data concurrently
  const teamPromises = teamIds.map(id => apiService.fetchTeam(id));
  const teams = await Promise.all(teamPromises);
  
  // Parse league information
  const leagueInfo = apiService.parseIdNameString(apiEvent.leagues);
  
  // Parse season information
  const seasonInfo = apiService.parseIdNameString(apiEvent.seasons);
  
  // Parse venue information
  const venueInfo = apiService.parseIdNameString(apiEvent.venues);
  
  const game: Game = {
    id: apiEvent.event_id,
    event_id: apiEvent.event_id,
    homeTeam: teams[0]?.name || `Team ${teamIds[0]}`,
    awayTeam: teams[1]?.name || `Team ${teamIds[1]}`,
    homeTeamId: teamIds[0],
    awayTeamId: teamIds[1],
    homeTeamLogo: teams[0]?.logo_url || '',
    awayTeamLogo: teams[1]?.logo_url || '',
    date,
    time,
    event_date: apiEvent.event_date,
    venue: venueInfo.name || '',
    venue_id: venueInfo.id,
    venue_name: venueInfo.name,
    status: 'upcoming',
    tournament: leagueInfo.name || 'Товарищеский матч',
    league_id: leagueInfo.id,
    league_name: leagueInfo.name,
    season_id: seasonInfo.id,
    season_name: seasonInfo.name,
  };
  
  console.log('Converted upcoming game:', game);
  return game;
}

async function convertApiPastEventToGame(apiEvent: ApiPastEvent): Promise<Game> {
  console.log('Converting past event with Results structure:', apiEvent);
  
  const { date, time } = apiService.formatDateTime(apiEvent.event_date);
  
  // Parse teams using 'teams' field for past events
  const teamIds = apiEvent.teams.split(',').map(id => id.trim());
  console.log('Team IDs from teams field:', teamIds);
  
  // Fetch team data concurrently
  const teamPromises = teamIds.map(id => apiService.fetchTeam(id));
  const teams = await Promise.all(teamPromises);
  
  // Parse league information
  const leagueInfo = apiService.parseIdNameString(apiEvent.leagues);
  
  // Parse season information
  const seasonInfo = apiService.parseIdNameString(apiEvent.seasons);
  
  // Parse venue information
  const venueInfo = apiService.parseIdNameString(apiEvent.venues);
  
  // Process Results structure with period scores
  const results = apiEvent.Results;
  console.log('Results structure with periods:', results);
  
  const game: Game = {
    id: apiEvent.event_id,
    event_id: apiEvent.event_id,
    homeTeam: teams[0]?.name || `Team ${teamIds[0]}`,
    awayTeam: teams[1]?.name || `Team ${teamIds[1]}`,
    homeTeamId: teamIds[0],
    awayTeamId: teamIds[1],
    homeTeamLogo: teams[0]?.logo_url || '',
    awayTeamLogo: teams[1]?.logo_url || '',
    homeScore: results?.homeTeam?.goals || 0,
    awayScore: results?.awayTeam?.goals || 0,
    date,
    time,
    event_date: apiEvent.event_date,
    venue: venueInfo.name || '',
    venue_id: venueInfo.id,
    venue_name: venueInfo.name,
    status: 'finished',
    tournament: leagueInfo.name || 'Товарищеский матч',
    league_id: leagueInfo.id,
    league_name: leagueInfo.name,
    season_id: seasonInfo.id,
    season_name: seasonInfo.name,
    // Add results for each team
    team1_goals: results?.homeTeam?.goals || 0,
    team2_goals: results?.awayTeam?.goals || 0,
    team1_outcome: results?.homeTeam?.outcome || '',
    team2_outcome: results?.awayTeam?.outcome || '',
    // Add period scores
    team1_first: results?.homeTeam?.first || 0,
    team1_second: results?.homeTeam?.second || 0,
    team1_third: results?.homeTeam?.third || 0,
    team2_first: results?.awayTeam?.first || 0,
    team2_second: results?.awayTeam?.second || 0,
    team2_third: results?.awayTeam?.third || 0,
  };
  
  console.log('Converted past game with period scores:', game);
  return game;
}

function getFallbackCurrentGame(): Game {
  return {
    id: 'current-1',
    event_id: 'current-1',
    homeTeam: 'ХК Форвард',
    awayTeam: 'Соперник',
    date: new Date().toISOString().split('T')[0],
    time: '19:00',
    event_date: new Date().toISOString(),
    venue: 'Домашняя арена',
    status: 'live',
    tournament: 'Чемпионат',
    homeScore: 2,
    awayScore: 1,
  };
}

function getFallbackUpcomingGames(): Game[] {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  return [
    {
      id: 'upcoming-1',
      event_id: 'upcoming-1',
      homeTeam: 'ХК Форвард',
      awayTeam: 'Команда А',
      date: tomorrow.toISOString().split('T')[0],
      time: '19:00',
      event_date: tomorrow.toISOString(),
      venue: 'Домашняя арена',
      status: 'upcoming',
      tournament: 'Чемпионат',
    },
  ];
}

function getFallbackPastGames(): Game[] {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  
  return [
    {
      id: 'past-1',
      event_id: 'past-1',
      homeTeam: 'ХК Форвард',
      awayTeam: 'Команда Б',
      homeScore: 3,
      awayScore: 2,
      date: yesterday.toISOString().split('T')[0],
      time: '19:00',
      event_date: yesterday.toISOString(),
      venue: 'Домашняя арена',
      status: 'finished',
      tournament: 'Чемпионат',
    },
  ];
}

function getFallbackGames(): Game[] {
  return [...getFallbackUpcomingGames(), ...getFallbackPastGames()];
}

function getFallbackGameById(gameId: string): Game | null {
  const games = getFallbackGames();
  return games.find(game => game.id === gameId) || null;
}

function getFallbackGameStats(gameId: string): GameStats | null {
  return {
    gameId,
    homeTeamStats: [],
    awayTeamStats: [],
    gameHighlights: ['Игра завершена'],
  };
}

export async function getCurrentGame(): Promise<Game | null> {
  try {
    console.log('Getting current game...');
    
    // First try to get upcoming games
    const upcomingGames = await getUpcomingGames();
    if (upcomingGames && upcomingGames.length > 0) {
      // Look for a game that is happening now or starting soon
      const now = new Date();
      const currentGame = upcomingGames.find(game => {
        const gameDate = new Date(game.event_date);
        const diffInHours = Math.abs(now.getTime() - gameDate.getTime()) / (1000 * 60 * 60);
        return diffInHours <= 3; // Game within 3 hours
      });
      
      if (currentGame) {
        console.log('Found current game:', currentGame);
        return currentGame;
      }
    }
    
    // If no current game, return null
    console.log('No current game found');
    return null;
  } catch (error) {
    console.error('Error getting current game:', error);
    return null;
  }
}

export async function getUpcomingGames(): Promise<Game[]> {
  try {
    if (isCacheValid(upcomingGamesCache)) {
      console.log('Returning upcoming games from cache');
      return upcomingGamesCache!.data;
    }

    console.log('Loading upcoming games from API...');
    const response = await apiService.fetchUpcomingEvents();
    
    if (!response.data || !Array.isArray(response.data)) {
      console.log('No upcoming games data, using fallback');
      return getFallbackUpcomingGames();
    }

    console.log(`Processing ${response.data.length} upcoming events...`);
    
    // Process events concurrently but with some delay to avoid overwhelming the API
    const games: Game[] = [];
    for (const event of response.data) {
      try {
        const game = await convertApiUpcomingEventToGame(event);
        games.push(game);
      } catch (error) {
        console.error('Error converting event:', event.event_id, error);
        // Continue with other events
      }
    }

    // Sort by date
    games.sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime());

    upcomingGamesCache = {
      data: games,
      timestamp: Date.now(),
    };

    console.log(`Successfully loaded ${games.length} upcoming games`);
    return games;
  } catch (error) {
    console.error('Error loading upcoming games:', error);
    return getFallbackUpcomingGames();
  }
}

export async function getPastGames(): Promise<Game[]> {
  try {
    if (isCacheValid(pastGamesCache)) {
      console.log('Returning past games from cache');
      return pastGamesCache!.data;
    }

    console.log('Loading past games from API...');
    const response = await apiService.fetchPastEvents();
    
    if (!response.data || !Array.isArray(response.data)) {
      console.log('No past games data, using fallback');
      return getFallbackPastGames();
    }

    console.log(`Processing ${response.data.length} past events...`);
    
    // Process events concurrently but with some delay to avoid overwhelming the API
    const games: Game[] = [];
    for (const event of response.data) {
      try {
        const game = await convertApiPastEventToGame(event);
        games.push(game);
      } catch (error) {
        console.error('Error converting event:', event.event_id, error);
        // Continue with other events
      }
    }

    // Sort by date (newest first)
    games.sort((a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime());

    pastGamesCache = {
      data: games,
      timestamp: Date.now(),
    };

    console.log(`Successfully loaded ${games.length} past games with period scores`);
    return games;
  } catch (error) {
    console.error('Error loading past games:', error);
    return getFallbackPastGames();
  }
}

export async function getFutureGames(): Promise<Game[]> {
  const upcomingGames = await getUpcomingGames();
  return upcomingGames.slice(0, 5); // Return only first 5 games for main screen
}

export async function getUpcomingGamesCount(): Promise<number> {
  try {
    if (isCacheValid(upcomingCountCache)) {
      console.log('Returning upcoming games count from cache');
      return upcomingCountCache!.data;
    }

    console.log('Getting upcoming games count...');
    const response = await apiService.fetchUpcomingEvents();
    const count = response.count || 0;

    upcomingCountCache = {
      data: count,
      timestamp: Date.now(),
    };

    console.log('Upcoming games count:', count);
    return count;
  } catch (error) {
    console.error('Error getting upcoming games count:', error);
    return 0;
  }
}

export async function getPastGamesCount(): Promise<number> {
  try {
    if (isCacheValid(pastCountCache)) {
      console.log('Returning past games count from cache');
      return pastCountCache!.data;
    }

    console.log('Getting past games count...');
    const response = await apiService.fetchPastEvents();
    const count = response.count || 0;

    pastCountCache = {
      data: count,
      timestamp: Date.now(),
    };

    console.log('Past games count:', count);
    return count;
  } catch (error) {
    console.error('Error getting past games count:', error);
    return 0;
  }
}

export async function getGameById(gameId: string): Promise<Game | null> {
  try {
    console.log('Searching for game by ID:', gameId);
    
    // Try to fetch from API first
    try {
      const apiGame = await apiService.fetchGameById(gameId);
      console.log('Game fetched from API:', apiGame);
      
      // Convert API response to Game object
      const { date, time } = apiService.formatDateTime(apiGame.date);
      
      // Parse teams
      const teamIds = apiGame.teams.split(',').map(id => id.trim());
      const teamPromises = teamIds.map(id => apiService.fetchTeam(id));
      const teams = await Promise.all(teamPromises);
      
      // Parse other fields
      const leagueInfo = apiService.parseIdNameString(apiGame.leagues);
      const seasonInfo = apiService.parseIdNameString(apiGame.seasons);
      const venueInfo = apiService.parseIdNameString(apiGame.venues);
      
      const game: Game = {
        id: apiGame.id,
        event_id: apiGame.id,
        homeTeam: teams[0]?.name || `Team ${teamIds[0]}`,
        awayTeam: teams[1]?.name || `Team ${teamIds[1]}`,
        homeTeamId: teamIds[0],
        awayTeamId: teamIds[1],
        homeTeamLogo: teams[0]?.logo_url || '',
        awayTeamLogo: teams[1]?.logo_url || '',
        homeScore: apiGame.Results?.homeTeam?.goals,
        awayScore: apiGame.Results?.awayTeam?.goals,
        date,
        time,
        event_date: apiGame.date,
        venue: venueInfo.name || '',
        venue_id: venueInfo.id,
        venue_name: venueInfo.name,
        status: apiGame.Results ? 'finished' : apiService.determineGameStatus(apiGame.date, !!apiGame.Results),
        tournament: leagueInfo.name || 'Товарищеский матч',
        league_id: leagueInfo.id,
        league_name: leagueInfo.name,
        season_id: seasonInfo.id,
        season_name: seasonInfo.name,
        sp_video: apiGame.sp_video, // VK video URL
        team1_goals: apiGame.Results?.homeTeam?.goals,
        team2_goals: apiGame.Results?.awayTeam?.goals,
        team1_outcome: apiGame.Results?.homeTeam?.outcome,
        team2_outcome: apiGame.Results?.awayTeam?.outcome,
        // Add period scores
        team1_first: apiGame.Results?.homeTeam?.first,
        team1_second: apiGame.Results?.homeTeam?.second,
        team1_third: apiGame.Results?.homeTeam?.third,
        team2_first: apiGame.Results?.awayTeam?.first,
        team2_second: apiGame.Results?.awayTeam?.second,
        team2_third: apiGame.Results?.awayTeam?.third,
      };
      
      return game;
    } catch (apiError) {
      console.log('API fetch failed, searching in cached games...');
    }
    
    // Search in upcoming games
    const upcomingGames = await getUpcomingGames();
    const upcomingGame = upcomingGames.find(game => game.id === gameId || game.event_id === gameId);
    if (upcomingGame) {
      console.log('Game found in upcoming:', upcomingGame);
      return upcomingGame;
    }
    
    // Search in past games
    const pastGames = await getPastGames();
    const pastGame = pastGames.find(game => game.id === gameId || game.event_id === gameId);
    if (pastGame) {
      console.log('Game found in past:', pastGame);
      return pastGame;
    }
    
    console.log('Game not found, using fallback');
    return getFallbackGameById(gameId);
  } catch (error) {
    console.error('Error searching for game by ID:', error);
    return getFallbackGameById(gameId);
  }
}

export async function getGameStatsById(gameId: string): Promise<GameStats | null> {
  try {
    console.log('Getting game stats for ID:', gameId);
    // In current API version there's no detailed game stats
    // Return fallback data
    return getFallbackGameStats(gameId);
  } catch (error) {
    console.error('Error getting game stats:', error);
    return getFallbackGameStats(gameId);
  }
}
