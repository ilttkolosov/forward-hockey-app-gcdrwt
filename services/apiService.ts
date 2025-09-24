
export interface ApiGame {
  id: number;
  title: {
    rendered: string;
  };
  date: string;
  meta: {
    sp_date?: string;
    sp_time?: string;
    sp_venue?: string;
    sp_event?: string;
    sp_video?: string;
  };
  acf?: {
    [key: string]: any;
  };
}

export interface ApiGameDetails {
  id: number;
  title: {
    rendered: string;
  };
  content: {
    rendered: string;
  };
  meta: {
    sp_video?: string;
    sp_date?: string;
    sp_time?: string;
    sp_venue?: string;
    sp_event?: string;
    [key: string]: any;
  };
  acf?: {
    [key: string]: any;
  };
}

class ApiService {
  private baseUrl = 'https://www.hc-forward.com/wp-json/wp/v2';

  async fetchFutureGames(): Promise<ApiGame[]> {
    try {
      console.log('Fetching future games...');
      const response = await fetch(`${this.baseUrl}/calendars/467`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      console.log('Future games fetched:', data);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error('Error fetching future games:', error);
      throw error;
    }
  }

  async fetchPastGames(): Promise<ApiGame[]> {
    try {
      console.log('Fetching past games...');
      const response = await fetch(`${this.baseUrl}/calendars/466`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      console.log('Past games fetched:', data);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error('Error fetching past games:', error);
      throw error;
    }
  }

  async fetchGameDetails(gameId: string): Promise<ApiGameDetails> {
    try {
      console.log('Fetching game details for ID:', gameId);
      const response = await fetch(`${this.baseUrl}/events/${gameId}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      console.log('Game details fetched:', data);
      return data;
    } catch (error) {
      console.error('Error fetching game details:', error);
      throw error;
    }
  }

  // Helper method to parse game title and extract teams
  parseGameTitle(title: string): { homeTeam: string; awayTeam: string } {
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

  // Helper method to extract score from title or content
  parseScore(title: string, content?: string): { homeScore?: number; awayScore?: number } {
    // Look for score patterns like "3:2", "3-2", or "3 - 2"
    const scorePattern = /(\d+)[\s\-:]+(\d+)/;
    
    let match = title.match(scorePattern);
    if (!match && content) {
      match = content.match(scorePattern);
    }
    
    if (match) {
      return {
        homeScore: parseInt(match[1]),
        awayScore: parseInt(match[2])
      };
    }
    
    return {};
  }

  // Helper method to determine game status
  determineGameStatus(date: string, hasScore: boolean): 'upcoming' | 'live' | 'finished' {
    const gameDate = new Date(date);
    const now = new Date();
    
    if (hasScore) {
      return 'finished';
    }
    
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

  // Convert API game to our Game interface
  convertApiGameToGame(apiGame: ApiGame): import('../types').Game {
    const title = apiGame.title.rendered;
    const { homeTeam, awayTeam } = this.parseGameTitle(title);
    const { homeScore, awayScore } = this.parseScore(title);
    
    const date = apiGame.meta.sp_date || apiGame.date;
    const time = apiGame.meta.sp_time || '19:00';
    const venue = apiGame.meta.sp_venue || 'TBD';
    const tournament = apiGame.meta.sp_event || 'Championship';
    const videoUrl = apiGame.meta.sp_video;
    
    const status = this.determineGameStatus(date, homeScore !== undefined);
    
    return {
      id: apiGame.id.toString(),
      homeTeam,
      awayTeam,
      homeScore,
      awayScore,
      date,
      time,
      venue,
      status,
      tournament,
      videoUrl
    };
  }

  // Convert API game details to our Game interface with additional details
  convertApiGameDetailsToGame(apiGameDetails: ApiGameDetails): import('../types').Game {
    const title = apiGameDetails.title.rendered;
    const content = apiGameDetails.content.rendered;
    const { homeTeam, awayTeam } = this.parseGameTitle(title);
    const { homeScore, awayScore } = this.parseScore(title, content);
    
    const date = apiGameDetails.meta.sp_date || apiGameDetails.date;
    const time = apiGameDetails.meta.sp_time || '19:00';
    const venue = apiGameDetails.meta.sp_venue || 'TBD';
    const tournament = apiGameDetails.meta.sp_event || 'Championship';
    const videoUrl = apiGameDetails.meta.sp_video;
    
    const status = this.determineGameStatus(date, homeScore !== undefined);
    
    return {
      id: apiGameDetails.id.toString(),
      homeTeam,
      awayTeam,
      homeScore,
      awayScore,
      date,
      time,
      venue,
      status,
      tournament,
      videoUrl
    };
  }
}

export const apiService = new ApiService();
