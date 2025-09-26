
export interface Game {
  id: string;
  event_id: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamId?: string;
  awayTeamId?: string;
  homeTeamLogo?: string;
  awayTeamLogo?: string;
  homeScore?: number;
  awayScore?: number;
  date: string;
  time: string;
  event_date: string;
  venue: string;
  venue_id?: string;
  venue_name?: string;
  status: 'upcoming' | 'live' | 'finished';
  tournament?: string;
  league_id?: string;
  league_name?: string;
  season_id?: string;
  season_name?: string;
  videoUrl?: string;
  sp_video?: string; // New field for VK video URL
  // New fields for detailed results
  team1_goals?: number;
  team2_goals?: number;
  team1_outcome?: string;
  team2_outcome?: string;
  // New fields for period scores
  team1_first?: number;
  team1_second?: number;
  team1_third?: number;
  team2_first?: number;
  team2_second?: number;
  team2_third?: number;
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

export interface ApiSeason {
  id: string;
  name: string;
}

export interface ApiVenue {
  id: string;
  name: string;
}

// Updated API Player Response based on new requirements
export interface ApiPlayerResponse {
  id: number;
  post_title: string; // Full name with patronymic
  post_date: string; // Birth date in format "2014-06-14 12:44:40"
  sp_number: number; // Jersey number
  position: "Вратарь" | "Защитник" | "Нападающий"; // Position
  sp_metrics: {
    ka: "К" | "А" | ""; // Captain status
    onetwofive: "Левый" | "Правый"; // Handedness
    height: string; // Height (can be empty)
    weight: string; // Weight (can be empty)
  };
  player_image: string; // Avatar URL (can be empty)
}

// Updated API Game Details Response based on new requirements
export interface ApiGameDetailsResponse {
  id: string; // Game ID
  date: string; // Date and time in format "YYYY-MM-DD HH:mm:ss"
  teams: string[]; // Array of team IDs (always 2 elements)
  leagues: Array<{ id: string; name: string }> | []; // Array of league objects (sometimes empty)
  seasons: Array<{ id: string; name: string }> | []; // Array of season objects (sometimes empty)
  venues: Array<{ id: string; name: string }> | []; // Array of venue objects (sometimes empty)
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
