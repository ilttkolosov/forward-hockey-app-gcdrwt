
export interface Game {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeScore?: number;
  awayScore?: number;
  date: string;
  time: string;
  venue: string;
  status: 'upcoming' | 'live' | 'finished';
  tournament?: string;
  videoUrl?: string;
}

export interface Player {
  id: string;
  name: string;
  position: string;
  number: number;
  birthDate?: string;
  age?: number;
  height?: number;
  weight?: number;
  handedness?: string;
  captainStatus?: string;
  nationality?: string;
  photo?: string;
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

export interface ApiPlayerResponse {
  id: string;
  sp_current_team?: number;
  post_date: string;
  post_title: string;
  sp_number: number | string;
  sp_metrics: {
    ka?: string;
    onetwofive?: string;
    height?: string;
    weight?: string;
  };
  sp_nationality?: string;
  position: string;
  player_image?: string;
}
