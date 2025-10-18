// services/apiService.ts

// Импорты из старого файла типов (для совместимости со старыми методами и компонентами)
import { 
  ApiPlayerResponse, 
  ApiUpcomingEventsResponse, 
  ApiPastEventsResponse, 
  ApiLeague, 
  Game,
  ApiGameDetailsResponse as LegacyApiGameDetailsResponse // Переименовываем, чтобы избежать конфликта
} from '../types';

// Импорты из нового файла типов (для новых методов)
import { 
  ApiEventsResponse, 
  ApiEvent, 
  ApiSeason, 
  ApiVenue, 
  ApiGameDetailsResponse, // Новый тип для /event-by-id/{id}
  ApiLeaguesResponse, 
  ApiSeasonsResponse, 
  ApiVenuesResponse 
} from '../types/apiTypes';

// --- Старые интерфейсы для игроков (оставлены для совместимости) ---
interface ApiPlayerListItem {
  id: string;
  name: string;
  number: number;
  position: string;
  birth_date: string;
}

export interface ApiTeam {
  id: string;
  name: string;
  logo_url: string; // может быть пустой строкой
}

interface ApiPlayerDetailsResponse {
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

interface ApiPlayerPhotoResponse {
  photo_url: string;
}

//export const BASE_URL = "https://www.hc-forward.com/wp-json/app/v1";

class ApiService {
  private baseUrl = "https://www.hc-forward.com/wp-json/app/v1";

  // Кэши для данных, чтобы избежать повторных запросов
  private teamCache: { [key: string]: ApiTeam } = {};
  private leagueCache: { [key: string]: ApiLeague } = {};
  private seasonCache: { [key: string]: ApiSeason } = {};
  private venueCache: { [key: string]: ApiVenue } = {};
  private teamListCache: ApiTeam[] | null = null;

  // --- НОВЫЕ МЕТОДЫ для новых эндпоинтов ---

  /**
 * Получает список игр с фильтрацией
 */
async fetchEvents(params: {
  date_from?: string;
  date_to?: string;
  league?: string;
  season?: string;
  teams?: string;
}): Promise<ApiEventsResponse> {
  const url = new URL(`${this.baseUrl}/get-events`);

  // Явно указываем тип ключей
  const keys = Object.keys(params) as (keyof typeof params)[];
  for (const key of keys) {
    if (params[key]) {
      url.searchParams.append(key, params[key]);
    }
  }

  console.log('API Service: Fetching events with URL:', url.toString());

  try {
    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const result: ApiEventsResponse = await response.json();
    console.log('API Service: Events response status:', result.status);
    console.log('API Service: Total events count:', result.count);
    return result;
  } catch (error) {
    console.error('API Service: Error fetching events:', error);
    throw error;
  }
}

  /**
   * Получает детальную информацию об одной игре по ID
   */
  async fetchEventById(id: string): Promise<ApiGameDetailsResponse> {
    const url = `${this.baseUrl}/event-by-id/${id}`;
    console.log('API Service: Fetching event by ID:', url);

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result: ApiGameDetailsResponse = await response.json();
      console.log('API Service: Event details response:', result);
      return result;
    } catch (error) {
      console.error('API Service: Error fetching event by ID:', error);
      throw error;
    }
  }

  /**
   * Получает список всех лиг
   */
  async fetchLeagues(): Promise<ApiLeaguesResponse> {
    const url = `${this.baseUrl}/get-league`;
    console.log('API Service: Fetching all leagues:', url);

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result: ApiLeaguesResponse = await response.json();
      console.log('API Service: Leagues response status:', result.status);
      console.log('API Service: Total leagues count:', result.count);

      // Обновляем кэш в памяти
      result.data.forEach(league => {
        this.leagueCache[league.id] = league;
      });

      return result;
    } catch (error) {
      console.error('API Service: Error fetching leagues:', error);
      throw error;
    }
  }

  /**
   * Получает список всех сезонов
   */
  async fetchSeasons(): Promise<ApiSeasonsResponse> {
    const url = `${this.baseUrl}/get-season`;
    console.log('API Service: Fetching all seasons:', url);

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result: ApiSeasonsResponse = await response.json();
      console.log('API Service: Seasons response status:', result.status);
      console.log('API Service: Total seasons count:', result.count);

      // Обновляем кэш в памяти
      result.data.forEach(season => {
        this.seasonCache[season.id] = season;
      });

      return result;
    } catch (error) {
      console.error('API Service: Error fetching seasons:', error);
      throw error;
    }
  }

  /**
   * Получает список всех мест проведения
   */
  async fetchVenues(): Promise<ApiVenuesResponse> {
    const url = `${this.baseUrl}/get-venue`;
    console.log('API Service: Fetching all venues:', url);

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result: ApiVenuesResponse = await response.json();
      console.log('API Service: Venues response status:', result.status);
      console.log('API Service: Total venues count:', result.count);

      // Обновляем кэш в памяти
      result.data.forEach(venue => {
        this.venueCache[venue.id] = venue;
      });

      return result;
    } catch (error) {
      console.error('API Service: Error fetching venues:', error);
      throw error;
    }
  }

  // --- МЕТОДЫ для получения данных из кэша ---
  getLeagueById(id: string): ApiLeague | undefined {
    return this.leagueCache[id];
  }

  getSeasonById(id: string): ApiSeason | undefined {
    return this.seasonCache[id];
  }

  getVenueById(id: string): ApiVenue | undefined {
    return this.venueCache[id];
  }


  // --- СТАРЫЕ МЕТОДЫ для игроков (оставлены) ---

  async fetchPlayers(): Promise<ApiPlayerResponse[]> {
    console.log("API Service: [LOG] fetchPlayers - Начало загрузки списка игроков с /players/"); // <-- НОВОЕ ЛОГИРОВАНИЕ
    try {
      console.log("API Service: Fetching all players from API..."); // <-- Старое логирование
      const response = await fetch(`${this.baseUrl}/players/`);
      if (!response.ok) {
        const errorMessage = `API Service: Error accessing players API! Status: ${response.status}`;
        console.error(errorMessage);
        throw new Error(errorMessage);
      }
      const data: ApiPlayerResponse[] = await response.json();
      console.log("API Service: [LOG] fetchPlayers - Raw API response data:", data); // <-- НОВОЕ ЛОГИРОВАНИЕ - смотрим сырой ответ
      console.log("API Service: All player data fetched. Count:", data.length);

      if (!Array.isArray(data)) {
        console.error("API Service: Received data is not an array:", data);
        throw new Error("Invalid data format from API");
      }

      // Log first few players for debugging
      data.slice(0, 3).forEach((player, index) => {
        console.log(`API Service: Player ${index + 1} from API:`, {
          id: player.id,
          // name: player.name, // <-- Старое логирование
          // post_title: player.post_title, // <-- Добавьте, если ожидаете post_title
          name: player.name, // <-- Логируем name
          post_title: player.post_title, // <-- Логируем post_title для сравнения
          position: player.position,
        });
      });

      console.log("API Service: [LOG] fetchPlayers - Конец загрузки списка игроков"); // <-- НОВОЕ ЛОГИРОВАНИЕ
      return data;
    } catch (error) {
      console.error("API Service: [LOG] fetchPlayers - Ошибка загрузки списка игроков:", error); // <-- НОВОЕ ЛОГИРОВАНИЕ
      console.error("API Service: Error fetching players:", error);
      throw error;
    }
  }

  async fetchPlayerDetails(id: string): Promise<ApiPlayerDetailsResponse | null> {
    try {
      console.log(`API Service: Fetching player details for ID: ${id}`);
      const response = await fetch(`${this.baseUrl}/player/${id}`);
      if (!response.ok) {
        if (response.status === 404) {
          console.log(`API Service: Player not found for ID: ${id}`);
          return null;
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result: ApiPlayerDetailsResponse = await response.json();
      console.log("API Service: Player details response:", result);
      return result;
    } catch (error) {
      console.error("API Service: Error fetching player details:", error);
      throw error;
    }
  }

  async fetchPlayerPhoto(id: string): Promise<ApiPlayerPhotoResponse | null> {
    try {
      console.log(`API Service: Fetching photo for player ID: ${id}`);
      const response = await fetch(`${this.baseUrl}/player/${id}/photo`);
      if (!response.ok) {
        if (response.status === 404) {
          console.log(`API Service: Photo not found for player ID: ${id}`);
          return null;
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result: ApiPlayerPhotoResponse = await response.json();

      const cleanPhotoUrl = result.photo_url?.trim();
      if (!cleanPhotoUrl) {
        console.log(`API Service: Photo URL is empty for player ${id}`);
        return null;
      }
      console.log(`API Service: Photo URL fetched for player ${id}:`, cleanPhotoUrl);
      return { photo_url: cleanPhotoUrl };
    } catch (error) {
      console.error(`API Service: Error fetching photo for player ${id}:`, error);
      return null;
    }
  }

  // LEGACY PLAYER API METHODS (kept for backward compatibility)
  async checkPlayersApiAvailability(): Promise<boolean> {
    try {
      console.log("API Service: Checking players API endpoint availability...");
      const response = await fetch(`${this.baseUrl}/players/`, {
        method: "HEAD",
      });
      const isAvailable = response.ok;
      console.log("API Service: Players API endpoint available:", isAvailable);
      return isAvailable;
    } catch (error) {
      console.error("API Service: Error checking players API endpoint availability:", error);
      return false;
    }
  }


  // --- СТАРЫЕ МЕТОДЫ для команд (оставлены для получения логотипов/названий) ---

  async fetchTeamList(): Promise<ApiTeam[]> {
    if (this.teamListCache) {
      console.log('API Service: Returning cached team list');
      return this.teamListCache;
    }

    try {
      console.log('API Service: Fetching full team list from /get-team');
      const response = await fetch(`${this.baseUrl}/get-team`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result = await response.json();

      if (result.status !== 'success' || !result.data || !Array.isArray(result.data)) {
        console.error('API Service: Invalid team list format:', result);
        throw new Error('Invalid team list format');
      }

      const teams: ApiTeam[] = result.data.map((rawTeam: any) => ({
        id: String(rawTeam.id),
        name: rawTeam.name || `Team ${rawTeam.id}`,
        logo_url: rawTeam.logo_url?.trim() || "",
      }));

      this.teamListCache = teams;
      console.log(`API Service: Fetched and cached ${teams.length} teams`);
      return teams;
    } catch (error) {
      console.error('API Service: Error fetching team list:', error);
      throw error;
    }
  }

  async fetchTeam(teamId: string): Promise<ApiTeam> {
    // Check cache first
    if (this.teamCache[teamId]) {
      console.log(`API Service: Returning cached team data for ID: ${teamId} (${this.teamCache[teamId].name})`);
      return this.teamCache[teamId];
    }

    try {
      console.log(`API Service: Fetching team details for ID: ${teamId} from /get-team/${teamId}`);
      const response = await fetch(`${this.baseUrl}/get-team/${teamId}`);
      if (!response.ok) {
        console.error(`API Service: Team fetch failed for ID ${teamId}, status: ${response.status}`);
        // Возвращаем fallback, чтобы приложение не ломалось
        return {
          id: teamId,
          name: `Team ${teamId}`,
          logo_url: '',
        };
      }
      const result = await response.json();

      if (result.status !== 'success' || !result.data) {
        console.error(`API Service: Invalid team data for ID ${teamId}:`, result);
        throw new Error('Invalid team data format');
      }

      const team: ApiTeam = {
        id: String(result.data.id),
        name: result.data.name || `Team ${teamId}`,
        logo_url: result.data.logo_url?.trim() || '',
      };

      this.teamCache[teamId] = team;
      return team;
    } catch (error) {
      console.error(`API Service: Error fetching team ${teamId}:`, error);
      // Возвращаем fallback
      return {
        id: teamId,
        name: `Team ${teamId}`,
        logo_url: '',
      };
    }
  }

  // Алиас для fetchTeam (оставлен для совместимости, если используется)
  async fetchTeamById(id: string): Promise<ApiTeam> {
    return this.fetchTeam(id);
  }


  // --- ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ (оставлены, но parseIdNameString может не использоваться для лиг/сезонов/мест) ---

  // Вспомогательный метод для парсинга строки ID:Name (может использоваться для старых API или вспомогательных функций)
  // БОЛЬШЕ НЕ ИСПОЛЬЗУЕТСЯ для получения названий лиг/сезонов/мест из новых API-ответов
  parseIdNameString(idNameString: string | null): { id: string | null; name: string | null } {
    if (!idNameString || typeof idNameString !== 'string') {
      return { id: null, name: null };
    }

    // Проверяем, содержит ли строка двоеточие
    const colonIndex = idNameString.indexOf(':');
    if (colonIndex === -1) {
      // Если двоеточия нет, возвращаем строку как ID, а имя как пустую строку или само ID
      return { id: idNameString.trim(), name: null };
    }

    const id = idNameString.substring(0, colonIndex).trim();
    const name = idNameString.substring(colonIndex + 1).trim();

    // Убираем кавычки из имени, если они есть
    const cleanedName = name.replace(/^"|"$/g, '');

    return { id, name: cleanedName };
  }

  // Форматирование даты и времени (для совместимости)
  formatDateTime(dateString: string): { date: string; time: string } {
    try {
      const date = new Date(dateString);
      const dateStringFormatted = date.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
      const timeStringFormatted = date.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
      });
      return { date: dateStringFormatted, time: timeStringFormatted };
    } catch (error) {
      console.error('API Service: Error formatting date/time:', error, dateString);
      return { date: dateString, time: '00:00' };
    }
  }

  /**
   * Определяет статус игры на основе даты и наличия результатов
   * --- ОБНОВЛЕНО: Корректная логика определения статуса ---
   */
  determineGameStatus(eventDateStr: string, hasResults: boolean): Game['status'] {
    // Если есть результаты, игра завершена
    if (hasResults) {
      return 'finished';
    }

    // Преобразуем строку даты в объект Date
    // !! ИСПРАВЛЕНО: Приведение к ISO для форматирования !!
    const isoDateString = eventDateStr.replace(' ', 'T');
    const eventDate = new Date(isoDateString);
    const now = new Date();

    // Если дата события в будущем, игра предстоящая
    if (eventDate > now) {
      return 'upcoming';
    }

    // Если дата события в прошлом, но результатов нет, игра считается завершённой (без результата)
    // Это может быть для очень старых игр или игр, которые были отменены
    if (eventDate < now) {
      return 'finished';
    }

    // Если дата события совпадает с текущей, но результатов нет, игра предстоящая
    return 'upcoming';
  }


  // Получение результата из массива (для совместимости)
  getOutcomeFromResult(outcomeArray: any): string {
    if (Array.isArray(outcomeArray) && outcomeArray.length > 0) {
      const outcome = outcomeArray[0].toLowerCase();
      if (outcome === 'w' || outcome === 'win') return 'win';
      if (outcome === 'l' || outcome === 'loss') return 'loss';
      if (outcome === 't' || outcome === 'tie' || outcome === 'draw' || outcome === 'nich') return 'draw';
      if (outcome === 'bullitwin') return 'bullitwin';
      if (outcome === 'bullitlose') return 'bullitlose';
    }
    return 'unknown';
  }

  // Получение названия турнира из строки (ОБНОВЛЁН для работы с кэшем)
  // Теперь используется для получения названия турнира из кэша по ID, полученному из нового API
  getTournamentNameFromId(leagueId: string): string {
    const league = this.getLeagueById(leagueId);
    if (league) {
      return league.name;
    }
    return "Товарищеский матч"; // или другой fallback
  }

  // Старый метод для получения названия турнира из строки (ID:Name) - БОЛЬШЕ НЕ ИСПОЛЬЗУЕТСЯ для новых API
  // getTournamentName(leaguesString: string): string {
  //   if (!leaguesString || leaguesString.trim() === "") {
  //     return "Товарищеский матч";
  //   }
  //   const parsed = this.parseIdNameString(leaguesString);
  //   return parsed.name || "Товарищеский матч";
  // }

  // Универсальный GET-метод для произвольных эндпоинтов
  async get<T = any>(endpoint: string): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    console.log('API Service: GET request to', url);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    return response.json() as Promise<T>;
  }

}

export const apiService = new ApiService();