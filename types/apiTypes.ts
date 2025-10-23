// types/apiTypes.ts

// Тип для списка игр (ответ от /wp-json/app/v1/get-events)
export interface ApiEventsResponse {
  status: string;
  data: ApiEvent[];
  count: number;
}

export interface ApiEvent {
  id: number;
  title: string;
  date: string;
  leagues: number[];
  seasons: number[];
  venues: number[];
  teams: string[];
  results: any[] | { [teamId: string]: any };
  protocol?: any;    
  player_stats?: any;
}

// Тип для детальной информации об игре (ответ от /wp-json/app/v1/get-events?event_id=${id})
export interface ApiGameDetailsResponse {
  id: string;
  title: string;
  date: string;
  results: { [teamId: string]: { first: string; second: string; third: string; ot: string; ppg: string; ppo: string; goals: string; outcome: string[] } };
  teams: string[];
  leagues: number[];
  seasons: number[];
  venues: number[];
  sp_video?: string;
  protocol?: any;    
  player_stats?: any;  
}

// Тип для списка лиг (ответ от /wp-json/app/v1/get-league)
export interface ApiLeague {
  id: string;
  name: string;
  slug: string;
}

export interface ApiLeaguesResponse {
  status: string;
  data: ApiLeague[];
  count: number;
}

// Тип для списка сезонов (ответ от /wp-json/app/v1/get-season)
export interface ApiSeason {
  id: string;
  name: string;
  slug: string;
}

export interface ApiSeasonsResponse {
  status: string;
  data: ApiSeason[];
  count: number;
}

// Тип для списка мест проведения (ответ от /wp-json/app/v1/get-venue)
export interface ApiVenue {
  id: string;
  name: string;
  slug: string;
  address?: string;           // ← добавлено
  coordinates?: {             // ← добавлено
    latitude: number;
    longitude: number;
  };
}

export interface ApiVenuesResponse {
  status: string;
  data: ApiVenue[];
  count: number;
}