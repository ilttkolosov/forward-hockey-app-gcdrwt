// types/index.ts

import { ApiSeason, ApiVenue } from './apiTypes'; // Импортируем типы из apiTypes.ts

export interface Game {
  id: string;
  event_date: string;
  homeTeamId: string;
  awayTeamId: string;
  leagueId: string;
  seasonId: string;
  venueId: string;
  status: 'upcoming' | 'live' | 'finished';
  // Поля, которые будут заполняться из локального хранилища после сопоставления по ID
  homeTeam?: Team;
  awayTeam?: Team;
  league?: Tournament;
  season?: ApiSeason;
  venue?: ApiVenue;
  // Поля для завершенных игр
  homeGoals?: number;
  awayGoals?: number;
  homeOutcome?: string;
  awayOutcome?: string;
  // Поля для детальной информации (если игра завершена)
  team1_first?: number;
  team1_second?: number;
  team1_third?: number;
  team2_first?: number;
  team2_second?: number;
  team2_third?: number;
  // Дополнительные поля (если нужны)
  videoUrl?: string;
  // Поля из старого типа, оставлены для совместимости
  homeTeamLogo?: string | null; // ← Изменено на string | null
  awayTeamLogo?: string | null; // ← Изменено на string | null
  homeScore?: number;
  awayScore?: number;
  date: string;
  time: string;
  venue_name?: string;
  tournament?: string; // ← Это поле используется в app_season_[id].tsx
  season_name?: string; // ← Это поле используется в app_season_[id].tsx
  sp_video?: string;
  team1_goals?: number;
  team2_goals?: number;
  team1_outcome?: string;
  team2_outcome?: string;
  // Новое поле для названия лиги (league_name)
  league_name?: string; // ← Добавлено
  protocol?: any;
  player_stats?: any;
}


export interface Player {
  id: string;
  name: string;
  position: string;
  number: number;
  age?: number;
  height?: string;
  weight?: string;
  nationality?: string;
  photo?: string;
  // New properties as requested
  isCaptain?: boolean;
  isAssistantCaptain?: boolean;
  // Additional fields from API
  fullName?: string;
  birthDate?: string;
  handedness?: string;
  captainStatus?: 'К' | 'А' | '';
}

export interface GamePlayerStats {
  playerId: string;
  playerName: string;
  position: string;
  number: number;
  goals: number;
  assists: number;
  points: number;
  penaltyMinutes: number;
  shots: number;
  hits: number;
  blockedShots: number;
  faceoffWins?: number;
  faceoffLosses?: number;
  timeOnIce: string;
}

export interface GameStats {
  gameId: string;
  homeTeamStats: GamePlayerStats[];
  awayTeamStats: GamePlayerStats[];
  gameHighlights?: string[];
}

export interface Coach {
  id: string;
  name: string;
  role: string;
  experience?: string;
  photo?: string;
}

export interface Tournament {
  id: string;
  name: string;
  season: string;
  status: 'active' | 'finished' | 'upcoming';
  teams?: number;
  games?: number;
}

export interface TeamStats {
  wins: number;
  losses: number;
  draws: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  position: number;
}

export interface Team {
  id: string;
  name: string;
  logo_url: string;
  // Дополнительные поля, если есть
}


// API Response Types - Updated for new specifications
export interface ApiUpcomingEvent {
  event_id: string;
  event_date: string;
  sp_teams: string; // Comma-separated team IDs for upcoming events
  leagues: string | null; // League ID:League Name or null
  seasons: string | null; // Season ID:Season Name or null
  venues: string | null; // Venue ID:Venue Name or null
}

export interface ApiPastEvent {
  event_id: string;
  event_date: string;
  teams: string; // Comma-separated team IDs for past events (different field name)
  leagues: string | null; // League ID:League Name or null
  seasons: string | null; // Season ID:Season Name or null
  venues: string | null; // Venue ID:Venue Name or null
  results: { [teamId: string]: { goals: string; outcome: 'nich' | 'win' | 'loss' } }; // Updated structure
}

export interface ApiUpcomingEventsResponse {
  status: string;
  data: ApiUpcomingEvent[];
  count: number;
}

export interface ApiPastEventsResponse {
  status: string;
  data: ApiPastEvent[];
  count: number;
}

export interface ApiTeam {
  id: string;
  name: string;
  logo_url: string;
}

export interface ApiLeague {
  id: string;
  name: string;
}


// Updated API Player Response based on new requirements
export interface ApiPlayerResponse {
  id: number;
  name: string; // Full name with patronymic
  birth_date: string; // Birth date in format "2014-06-14 12:44:40"
  number: number; // Jersey number
  position: "Вратарь" | "Защитник" | "Нападающий"; // Position
  metrics: {
    ka: "К" | "А" | ""; // Captain status
    onetwofive: "Левый" | "Правый"; // Handedness
    height: string; // Height (can be empty)
    weight: string; // Weight (can be empty)
  };
  player_image: string; // Avatar URL (can be empty)
}

// NEW API INTERFACES FOR UPDATED PLAYER ENDPOINTS

/**
 * Response from GET /get-player/ (basic player list)
 */
export interface ApiPlayerListItem {
  id: string;
  name: string;
  number: number;
  position: string;
  birth_date: string;
}

/**
 * Response from GET /get-player/{id} (detailed player data)
 */
export interface ApiPlayerDetailsResponse {
  id: string;
  name: string;
  number: number;
  position: string;
  birth_date: string;
  nationality?: string;
  metrics: {
    ka: string; // captain status
    onetwofive: string; // handedness
    height: string;
    weight: string;
  };
}

/**
 * Response from GET /get-photo-players/{id} (player photo)
 */
export interface ApiPlayerPhotoResponse {
  photo_url: string;
}

// Updated API Game Details Response based on new requirements
export interface ApiGameDetailsResponse {
  id: string; // Game ID
  date: string; // Date and time in format "YYYY-MM-DD HH:mm:ss"
  teams: string[]; // Array of team IDs (always 2 elements)
  leagues: { id: string; name: string }[] | []; // Array of league objects (sometimes empty)
  seasons: { id: string; name: string }[] | []; // Array of season objects (sometimes empty)
  venues: { id: string; name: string }[] | []; // Array of venue objects (sometimes empty)
  results: {
    [teamId: string]: {
      goals: string; // Total goals as string
      first?: string; // First period goals (can be empty)
      second?: string; // Second period goals (can be empty)
      third?: string; // Third period goals (can be empty)
      outcome: string[]; // Array of strings like ["win"], take first element
    };
  };
  sp_video?: string; // VK video URL
}

// Enhanced Game interface for match details
export interface EnrichedGameDetails {
  id: string;
  date: string; // Formatted date without seconds
  time: string; // Formatted time without seconds
  homeTeam: {
    id: string;
    name: string;
    logo: string;
    goals: number;
    firstPeriod?: number;
    secondPeriod?: number;
    thirdPeriod?: number;
    outcome: string;
  };
  awayTeam: {
    id: string;
    name: string;
    logo: string;
    goals: number;
    firstPeriod?: number;
    secondPeriod?: number;
    thirdPeriod?: number;
    outcome: string;
  };
  league?: string;
  season?: string;
  venue?: string;
  videoUrl?: string;
}
