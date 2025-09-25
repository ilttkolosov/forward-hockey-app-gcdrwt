
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
  position: string; // Используем position как основное поле
  positions?: string; // Добавляем positions как альтернативное поле
  player_image?: string;
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
      console.log('Получение будущих игр из календаря 467...');
      const response = await fetch(`${this.baseUrl}/wp/v2/calendars/467`, {
        headers: this.getAuthHeaders(),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ошибка! статус: ${response.status}`);
      }
      
      const result: ApiCalendarResponse = await response.json();
      console.log('Ответ будущих игр:', result);
      
      return result.data || [];
    } catch (error) {
      console.error('Ошибка получения будущих игр:', error);
      throw error;
    }
  }

  async fetchPastGames(): Promise<ApiCalendarEvent[]> {
    try {
      console.log('Получение прошедших игр из календаря 466...');
      const response = await fetch(`${this.baseUrl}/wp/v2/calendars/466`);
      
      if (!response.ok) {
        throw new Error(`HTTP ошибка! статус: ${response.status}`);
      }
      
      const result: ApiCalendarResponse = await response.json();
      console.log('Ответ прошедших игр:', result);
      
      return result.data || [];
    } catch (error) {
      console.error('Ошибка получения прошедших игр:', error);
      throw error;
    }
  }

  async fetchEventDetails(eventId: string): Promise<ApiEventDetails> {
    try {
      console.log('Получение деталей события для ID:', eventId);
      const response = await fetch(`${this.baseUrl}/wp/v2/events/${eventId}`, {
        headers: this.getAuthHeaders(),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ошибка! статус: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Детали события получены:', data);
      return data;
    } catch (error) {
      console.error('Ошибка получения деталей события:', error);
      throw error;
    }
  }

  async fetchPlayers(): Promise<ApiPlayerResponse[]> {
    try {
      console.log('Получение всех игроков из API эндпоинта:', this.playersUrl);
      
      const response = await fetch(this.playersUrl);
      
      if (!response.ok) {
        const errorMessage = `Ошибка доступа к API игроков! Статус: ${response.status}`;
        console.error(errorMessage);
        throw new Error(errorMessage);
      }
      
      const data = await response.json();
      console.log('Данные всех игроков получены. Количество:', data.length);
      
      if (!Array.isArray(data)) {
        console.error('Полученные данные не являются массивом:', data);
        throw new Error('Неверный формат данных от API');
      }
      
      // Логируем первые несколько игроков для отладки
      data.slice(0, 3).forEach((player: any, index: number) => {
        console.log(`Игрок ${index + 1} из API:`, {
          id: player.id,
          name: player.post_title,
          position: player.position,
          positions: player.positions,
          number: player.sp_number
        });
      });
      
      return data;
    } catch (error) {
      console.error('Ошибка получения игроков:', error);
      throw error;
    }
  }

  async checkPlayersApiAvailability(): Promise<boolean> {
    try {
      console.log('Проверка доступности API эндпоинта игроков...');
      const response = await fetch(this.playersUrl, { method: 'HEAD' });
      const isAvailable = response.ok;
      console.log('API эндпоинт игроков доступен:', isAvailable);
      return isAvailable;
    } catch (error) {
      console.error('Ошибка проверки доступности API эндпоинта игроков:', error);
      return false;
    }
  }

  async fetchLeague(leagueId: string): Promise<ApiLeague> {
    try {
      console.log('Получение деталей лиги для ID:', leagueId);
      const response = await fetch(`${this.baseUrl}/wp/v2/leagues/${leagueId}`, {
        headers: this.getAuthHeaders(),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ошибка! статус: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Детали лиги получены:', data);
      return data;
    } catch (error) {
      console.error('Ошибка получения деталей лиги:', error);
      throw error;
    }
  }

  parseGameTitle(title: string): { homeTeam: string; awayTeam: string } {
    console.log('Парсинг названия игры:', title);
    
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
    
    return {
      homeTeam: 'ХК Форвард 2014',
      awayTeam: title.trim()
    };
  }

  parseScore(mainResults?: string): { homeScore?: number; awayScore?: number } {
    if (!mainResults) {
      return {};
    }
    
    console.log('Парсинг счета из main_results:', mainResults);
    
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

  determineGameStatus(date: string, hasScore: boolean, isFromPastCalendar: boolean = false): 'upcoming' | 'live' | 'finished' {
    if (isFromPastCalendar || hasScore) {
      return 'finished';
    }
    
    const gameDate = new Date(date);
    const now = new Date();
    
    if (gameDate > now) {
      return 'upcoming';
    }
    
    const diffInHours = (now.getTime() - gameDate.getTime()) / (1000 * 60 * 60);
    if (diffInHours >= 0 && diffInHours <= 3) {
      return 'live';
    }
    
    return 'finished';
  }

  convertCalendarEventToGame(event: ApiCalendarEvent, isFromPastCalendar: boolean = false): import('../types').Game {
    const title = event.post_title || event.title;
    const { homeTeam, awayTeam } = this.parseGameTitle(title);
    
    const date = event.post_date || new Date().toISOString();
    const status = this.determineGameStatus(date, false, isFromPastCalendar);
    
    return {
      id: event.ID.toString(),
      homeTeam,
      awayTeam,
      date: date.split('T')[0],
      time: '19:00',
      venue: 'TBD',
      status,
      tournament: 'Чемпионат',
    };
  }

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
      date: date.split('T')[0],
      time: date.split('T')[1]?.split(':').slice(0, 2).join(':') || '19:00',
      venue: 'TBD',
      status,
      tournament: 'Чемпионат',
      videoUrl: eventDetails.sp_video,
    };
  }
}

export const apiService = new ApiService();
