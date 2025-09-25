
export interface ApiCalendarResponse {
  data: ApiCalendarEvent[];
}

export interface ApiCalendarEvent {
  ID: number;
  title: string;
  post_date?: string;
  post_title?: string;
}

export interface ApiEventDetails {
  id: number;
  title: {
    rendered: string;
  };
  date: string;
  sp_video?: string;
  leagues?: any[];
  teams?: any[];
  main_results?: string;
  outcome?: string;
  winner?: string;
  players?: any[];
  offense?: any[];
  defense?: any[];
  results?: any[];
  performance?: any[];
}

export interface ApiTeam {
  id: number;
  title: {
    rendered: string;
  };
  team_logo?: string;
}

export interface ApiPlayer {
  ID?: number;
  id?: number;
  post_title?: string;
  post_date?: string;
  sp_current_team?: string | number;
  sp_number?: number;
  sp_metrics?: {
    ka?: string;
    onetwofive?: string;
    height?: string;
    weight?: string;
  };
  positions?: string;
  player_image?: string;
  title?: {
    rendered: string;
  } | string;
  number?: number;
  metrics?: string[];
  current_teams?: number[] | string | number;
  date?: string;
}

export interface ApiLeague {
  id: number;
  title: {
    rendered: string;
  };
}

class ApiService {
  private baseUrl = 'https://www.hc-forward.com/wp-json';
  private playersUrl = 'https://www.hc-forward.com/wp-json/app/v1/players';
  private username = 'mobile_app';
  private password = '1234567890';

  private getAuthHeaders(): HeadersInit {
    const credentials = btoa(`${this.username}:${this.password}`);
    return {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/json',
    };
  }

  async fetchFutureGames(): Promise<ApiCalendarEvent[]> {
    try {
      console.log('Fetching future games from calendar 467...');
      const response = await fetch(`${this.baseUrl}/wp/v2/calendars/467`, {
        headers: this.getAuthHeaders(),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result: ApiCalendarResponse = await response.json();
      console.log('Future games response:', result);
      
      return result.data || [];
    } catch (error) {
      console.error('Error fetching future games:', error);
      throw error;
    }
  }

  async fetchPastGames(): Promise<ApiCalendarEvent[]> {
    try {
      console.log('Fetching past games from calendar 466...');
      const response = await fetch(`${this.baseUrl}/wp/v2/calendars/466`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result: ApiCalendarResponse = await response.json();
      console.log('Past games response:', result);
      
      return result.data || [];
    } catch (error) {
      console.error('Error fetching past games:', error);
      throw error;
    }
  }

  async fetchEventDetails(eventId: string): Promise<ApiEventDetails> {
    try {
      console.log('Fetching event details for ID:', eventId);
      const response = await fetch(`${this.baseUrl}/wp/v2/events/${eventId}`, {
        headers: this.getAuthHeaders(),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Event details fetched:', data);
      return data;
    } catch (error) {
      console.error('Error fetching event details:', error);
      throw error;
    }
  }

  async fetchPlayers(): Promise<ApiPlayer[]> {
    try {
      console.log('Fetching all players from single API endpoint:', this.playersUrl);
      const response = await fetch(this.playersUrl);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('All players data fetched from single endpoint:', data);
      return data;
    } catch (error) {
      console.error('Error fetching players from single endpoint:', error);
      throw error;
    }
  }

  async fetchLeague(leagueId: string): Promise<ApiLeague> {
    try {
      console.log('Fetching league details for ID:', leagueId);
      const response = await fetch(`${this.baseUrl}/wp/v2/leagues/${leagueId}`, {
        headers: this.getAuthHeaders(),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('League details fetched:', data);
      return data;
    } catch (error) {
      console.error('Error fetching league details:', error);
      throw error;
    }
  }

  // Helper method to parse game title and extract teams
  parseGameTitle(title: string): { homeTeam: string; awayTeam: string } {
    console.log('Parsing game title:', title);
    
    // Try to parse titles like "Team A vs Team B" or "Team A - Team B"
    const vsMatch = title.match(/(.+?)\s+vs\s+(.+)/i);
    const dashMatch = title.match(/(.+?)\s+-\s+(.+)/i);
    
    if (vsMatch) {
      return {
        homeTeam: vsMatch[1].trim(),
        awayTeam: vsMatch[2].trim()
      };
    } else if (dashMatch) {
      return {
        homeTeam: dashMatch[1].trim(),
        awayTeam: dashMatch[2].trim()
      };
    }
    
    // Fallback if parsing fails
    return {
      homeTeam: 'HC Forward',
      awayTeam: title.trim()
    };
  }

  // Helper method to extract score from main_results
  parseScore(mainResults?: string): { homeScore?: number; awayScore?: number } {
    if (!mainResults) {
      return {};
    }
    
    console.log('Parsing score from main_results:', mainResults);
    
    // Look for score patterns like "3:2", "3-2", or "3 - 2"
    const scorePattern = /(\d+)[\s\-:]+(\d+)/;
    const match = mainResults.match(scorePattern);
    
    if (match) {
      return {
        homeScore: parseInt(match[1]),
        awayScore: parseInt(match[2])
      };
    }
    
    return {};
  }

  // Helper method to determine game status
  determineGameStatus(date: string, hasScore: boolean, isFromPastCalendar: boolean = false): 'upcoming' | 'live' | 'finished' {
    if (isFromPastCalendar || hasScore) {
      return 'finished';
    }
    
    const gameDate = new Date(date);
    const now = new Date();
    
    if (gameDate > now) {
      return 'upcoming';
    }
    
    // If the game is today or in the past but no score, it might be live
    const diffInHours = (now.getTime() - gameDate.getTime()) / (1000 * 60 * 60);
    if (diffInHours >= 0 && diffInHours <= 3) {
      return 'live';
    }
    
    return 'finished';
  }

  // Convert API calendar event to our Game interface
  convertCalendarEventToGame(event: ApiCalendarEvent, isFromPastCalendar: boolean = false): import('../types').Game {
    const title = event.post_title || event.title;
    const { homeTeam, awayTeam } = this.parseGameTitle(title);
    
    const date = event.post_date || new Date().toISOString();
    const status = this.determineGameStatus(date, false, isFromPastCalendar);
    
    return {
      id: event.ID.toString(),
      homeTeam,
      awayTeam,
      date: date.split('T')[0], // Extract date part
      time: '19:00', // Default time
      venue: 'TBD',
      status,
      tournament: 'Чемпионат',
    };
  }

  // Convert API event details to our Game interface with full details
  convertEventDetailsToGame(eventDetails: ApiEventDetails): import('../types').Game {
    const title = eventDetails.title.rendered;
    const { homeTeam, awayTeam } = this.parseGameTitle(title);
    const { homeScore, awayScore } = this.parseScore(eventDetails.main_results);
    
    const date = eventDetails.date;
    const status = this.determineGameStatus(date, homeScore !== undefined);
    
    return {
      id: eventDetails.id.toString(),
      homeTeam,
      awayTeam,
      homeScore,
      awayScore,
      date: date.split('T')[0], // Extract date part
      time: date.split('T')[1]?.split(':').slice(0, 2).join(':') || '19:00', // Extract time part
      venue: 'TBD',
      status,
      tournament: 'Чемпионат',
      videoUrl: eventDetails.sp_video,
    };
  }

  // Convert API player to our Player interface
  convertApiPlayerToPlayer(apiPlayer: ApiPlayer): import('../types').Player {
    const metrics = apiPlayer.metrics || [];
    const title = typeof apiPlayer.title === 'string' ? apiPlayer.title : apiPlayer.title?.rendered || '';
    
    return {
      id: (apiPlayer.ID || apiPlayer.id || 0).toString(),
      name: title,
      position: 'Игрок',
      number: apiPlayer.number || 0,
      height: metrics[2] || undefined, // Рост
      weight: metrics[1] || undefined, // Вес
      photo: apiPlayer.player_image,
    };
  }
}

export const apiService = new ApiService();
