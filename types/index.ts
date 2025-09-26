
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
  // New fields for results
  team1_goals?: number;
  team2_goals?: number;
  team1_outcome?: string;
  team2_outcome?: string;
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

// API Response Types
export interface ApiUpcomingEvent {
  event_id: string;
  event_date: string;
  sp_teams: string;
  Leagues: string;
  seasons: string;
  venues: string;
}

export interface ApiPastEvent {
  event_id: string;
  event_date: string;
  teams: string; // Changed from sp_teams to teams
  Leagues: string;
  seasons: string;
  venues: string;
  Results: {
    homeTeam: {
      goals: number;
      outcome: string;
    };
    awayTeam: {
      goals: number;
      outcome: string;
    };
  };
}

export interface ApiUpcomingEventsResponse {
  data: ApiUpcomingEvent[];
  count: number;
}

export interface ApiPastEventsResponse {
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

export interface ApiPlayerResponse {
  id: string;
  post_title: string;
  position: string;
  sp_number: number;
  sp_nationality?: string;
  sp_birthdate?: string;
  sp_height?: string;
  sp_weight?: string;
  featured_image?: string;
  // New fields for captain status
  is_captain?: boolean;
  is_assistant_captain?: boolean;
}

export interface ApiGameDetailsResponse {
  event_id: string;
  event_date: string;
  teams: string;
  Leagues: string;
  seasons: string;
  venues: string;
  video_url?: string;
  Results?: {
    homeTeam: {
      goals: number;
      outcome: string;
    };
    awayTeam: {
      goals: number;
      outcome: string;
    };
  };
}
