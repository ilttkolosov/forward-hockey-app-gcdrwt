
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
  id: string;
  post_title: string;
  post_date: string;
  sp_current_team?: string;
  sp_number: string;
  sp_metrics: {
    ka?: string;
    onetwofive?: string;
    height?: string;
    weight?: string;
  };
  positions: string[];
  player_image: string;
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

  async fetchPlayers(): Promise<ApiPlayer[]> {
    try {
      console.log('Получение всех игроков из единого API эндпоинта:', this.playersUrl);
      
      // Проверяем доступность эндпоинта
      const response = await fetch(this.playersUrl);
      
      if (!response.ok) {
        const errorMessage = `Ошибка доступа к API игроков! Статус: ${response.status}`;
        console.error(errorMessage);
        throw new Error(errorMessage);
      }
      
      const data = await response.json();
      console.log('Данные всех игроков получены из единого эндпоинта:', data);
      
      // Проверяем, что данные являются массивом
      if (!Array.isArray(data)) {
        console.error('Полученные данные не являются массивом:', data);
        throw new Error('Неверный формат данных от API');
      }
      
      return data;
    } catch (error) {
      console.error('Ошибка получения игроков из единого эндпоинта:', error);
      throw error;
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

  // Вспомогательный метод для парсинга названия игры и извлечения команд
  parseGameTitle(title: string): { homeTeam: string; awayTeam: string } {
    console.log('Парсинг названия игры:', title);
    
    // Пытаемся парсить названия вида "Команда А vs Команда Б" или "Команда А - Команда Б"
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
    
    // Резервный вариант, если парсинг не удался
    return {
      homeTeam: 'ХК Форвард 2014',
      awayTeam: title.trim()
    };
  }

  // Вспомогательный метод для извлечения счета из main_results
  parseScore(mainResults?: string): { homeScore?: number; awayScore?: number } {
    if (!mainResults) {
      return {};
    }
    
    console.log('Парсинг счета из main_results:', mainResults);
    
    // Ищем паттерны счета вида "3:2", "3-2", или "3 - 2"
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

  // Вспомогательный метод для определения статуса игры
  determineGameStatus(date: string, hasScore: boolean, isFromPastCalendar: boolean = false): 'upcoming' | 'live' | 'finished' {
    if (isFromPastCalendar || hasScore) {
      return 'finished';
    }
    
    const gameDate = new Date(date);
    const now = new Date();
    
    if (gameDate > now) {
      return 'upcoming';
    }
    
    // Если игра сегодня или в прошлом, но нет счета, она может быть в прямом эфире
    const diffInHours = (now.getTime() - gameDate.getTime()) / (1000 * 60 * 60);
    if (diffInHours >= 0 && diffInHours <= 3) {
      return 'live';
    }
    
    return 'finished';
  }

  // Конвертация API события календаря в наш интерфейс Game
  convertCalendarEventToGame(event: ApiCalendarEvent, isFromPastCalendar: boolean = false): import('../types').Game {
    const title = event.post_title || event.title;
    const { homeTeam, awayTeam } = this.parseGameTitle(title);
    
    const date = event.post_date || new Date().toISOString();
    const status = this.determineGameStatus(date, false, isFromPastCalendar);
    
    return {
      id: event.ID.toString(),
      homeTeam,
      awayTeam,
      date: date.split('T')[0], // Извлекаем часть с датой
      time: '19:00', // Время по умолчанию
      venue: 'TBD',
      status,
      tournament: 'Чемпионат',
    };
  }

  // Конвертация деталей API события в наш интерфейс Game с полными деталями
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
      date: date.split('T')[0], // Извлекаем часть с датой
      time: date.split('T')[1]?.split(':').slice(0, 2).join(':') || '19:00', // Извлекаем часть с временем
      venue: 'TBD',
      status,
      tournament: 'Чемпионат',
      videoUrl: eventDetails.sp_video,
    };
  }

  // Конвертация API игрока в наш интерфейс Player
  convertApiPlayerToPlayer(apiPlayer: ApiPlayer): import('../types').Player {
    console.log('Конвертация API игрока:', apiPlayer);
    
    // Убираем отчество из имени (последнее слово)
    const fullName = apiPlayer.post_title || '';
    const nameParts = fullName.trim().split(' ');
    const nameWithoutPatronymic = nameParts.length > 2 
      ? nameParts.slice(0, -1).join(' ') 
      : fullName;
    
    // Извлекаем дату рождения без времени
    const birthDate = apiPlayer.post_date ? apiPlayer.post_date.split('T')[0] : '';
    
    // Определяем позицию на русском языке
    let position = 'Игрок';
    if (apiPlayer.positions && apiPlayer.positions.length > 0) {
      const pos = apiPlayer.positions[0].toLowerCase();
      if (pos.includes('вратарь') || pos.includes('goalkeeper')) {
        position = 'Вратарь';
      } else if (pos.includes('защитник') || pos.includes('defense')) {
        position = 'Защитник';
      } else if (pos.includes('нападающий') || pos.includes('forward')) {
        position = 'Нападающий';
      }
    }
    
    // Извлекаем метрики
    const metrics = apiPlayer.sp_metrics || {};
    
    return {
      id: apiPlayer.id,
      name: nameWithoutPatronymic,
      position: position,
      number: parseInt(apiPlayer.sp_number) || 0,
      birthDate: birthDate,
      height: metrics.height ? parseInt(metrics.height) : undefined,
      weight: metrics.weight ? parseInt(metrics.weight) : undefined,
      photo: apiPlayer.player_image,
      captainStatus: metrics.ka || '',
      handedness: metrics.onetwofive || '',
    };
  }

  // Проверка доступности API эндпоинта игроков
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
}

export const apiService = new ApiService();
