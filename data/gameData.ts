
import { Game, GameStats, ApiUpcomingEvent, ApiPastEvent } from '../types';
import { apiService } from '../services/apiService';

const CACHE_DURATION = 5 * 60 * 1000; // 5 минут

interface CachedData<T> {
  data: T;
  timestamp: number;
}

let upcomingGamesCache: CachedData<Game[]> | null = null;
let pastGamesCache: CachedData<Game[]> | null = null;
let upcomingCountCache: CachedData<number> | null = null;
let pastCountCache: CachedData<number> | null = null;

function isCacheValid<T>(cache: CachedData<T> | null): boolean {
  if (!cache) return false;
  return Date.now() - cache.timestamp < CACHE_DURATION;
}

async function convertApiUpcomingEventToGame(apiEvent: ApiUpcomingEvent): Promise<Game> {
  console.log('Конвертация предстоящего события:', apiEvent);
  
  const { date, time } = apiService.formatDateTime(apiEvent.event_date);
  
  // Парсинг команд
  const teamIds = apiEvent.sp_teams.split(',').map(id => id.trim());
  console.log('ID команд:', teamIds);
  
  // Получение данных команд
  const teamPromises = teamIds.map(id => apiService.fetchTeam(id));
  const teams = await Promise.all(teamPromises);
  
  // Парсинг лиги
  const leagueInfo = apiService.parseIdNameString(apiEvent.Leagues);
  
  // Парсинг сезона
  const seasonInfo = apiService.parseIdNameString(apiEvent.seasons);
  
  // Парсинг арены
  const venueInfo = apiService.parseIdNameString(apiEvent.venues);
  
  const game: Game = {
    id: apiEvent.event_id,
    event_id: apiEvent.event_id,
    homeTeam: teams[0]?.name || `Команда ${teamIds[0]}`,
    awayTeam: teams[1]?.name || `Команда ${teamIds[1]}`,
    homeTeamId: teamIds[0],
    awayTeamId: teamIds[1],
    homeTeamLogo: teams[0]?.logo_url || '',
    awayTeamLogo: teams[1]?.logo_url || '',
    date,
    time,
    event_date: apiEvent.event_date,
    venue: venueInfo.name,
    venue_id: venueInfo.id,
    venue_name: venueInfo.name,
    status: 'upcoming',
    tournament: leagueInfo.name || 'Товарищеский матч',
    league_id: leagueInfo.id,
    league_name: leagueInfo.name,
    season_id: seasonInfo.id,
    season_name: seasonInfo.name,
  };
  
  console.log('Конвертированная игра:', game);
  return game;
}

async function convertApiPastEventToGame(apiEvent: ApiPastEvent): Promise<Game> {
  console.log('Конвертация архивного события с НОВОЙ структурой:', apiEvent);
  
  const { date, time } = apiService.formatDateTime(apiEvent.event_date);
  
  // Парсинг команд (НОВОЕ поле teams вместо sp_teams)
  const teamIds = apiEvent.teams.split(',').map(id => id.trim());
  console.log('ID команд из НОВОГО поля teams:', teamIds);
  
  // Получение данных команд
  const teamPromises = teamIds.map(id => apiService.fetchTeam(id));
  const teams = await Promise.all(teamPromises);
  
  // Парсинг лиги (сопоставляется с tournament в логике приложения)
  const leagueInfo = apiService.parseIdNameString(apiEvent.Leagues);
  
  // Парсинг сезона
  const seasonInfo = apiService.parseIdNameString(apiEvent.seasons);
  
  // Парсинг арены
  const venueInfo = apiService.parseIdNameString(apiEvent.venues);
  
  // Обработка НОВОЙ структуры Results
  const results = apiEvent.Results;
  console.log('НОВАЯ структура Results:', results);
  
  const game: Game = {
    id: apiEvent.event_id,
    event_id: apiEvent.event_id,
    homeTeam: teams[0]?.name || `Команда ${teamIds[0]}`,
    awayTeam: teams[1]?.name || `Команда ${teamIds[1]}`,
    homeTeamId: teamIds[0],
    awayTeamId: teamIds[1],
    homeTeamLogo: teams[0]?.logo_url || '',
    awayTeamLogo: teams[1]?.logo_url || '',
    homeScore: results?.homeTeam?.goals || 0,
    awayScore: results?.awayTeam?.goals || 0,
    date,
    time,
    event_date: apiEvent.event_date,
    venue: venueInfo.name,
    venue_id: venueInfo.id,
    venue_name: venueInfo.name,
    status: 'finished',
    tournament: leagueInfo.name || 'Товарищеский матч',
    league_id: leagueInfo.id,
    league_name: leagueInfo.name,
    season_id: seasonInfo.id,
    season_name: seasonInfo.name,
    // Добавляем результаты для каждой команды
    team1_goals: results?.homeTeam?.goals || 0,
    team2_goals: results?.awayTeam?.goals || 0,
    team1_outcome: results?.homeTeam?.outcome || '',
    team2_outcome: results?.awayTeam?.outcome || '',
  };
  
  console.log('Конвертированная архивная игра с НОВЫМИ полями:', game);
  return game;
}

function getFallbackCurrentGame(): Game {
  return {
    id: 'current-1',
    event_id: 'current-1',
    homeTeam: 'ХК Форвард',
    awayTeam: 'Соперник',
    date: new Date().toISOString().split('T')[0],
    time: '19:00',
    event_date: new Date().toISOString(),
    venue: 'Домашняя арена',
    status: 'live',
    tournament: 'Чемпионат',
    homeScore: 2,
    awayScore: 1,
  };
}

function getFallbackUpcomingGames(): Game[] {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  return [
    {
      id: 'upcoming-1',
      event_id: 'upcoming-1',
      homeTeam: 'ХК Форвард',
      awayTeam: 'Команда А',
      date: tomorrow.toISOString().split('T')[0],
      time: '19:00',
      event_date: tomorrow.toISOString(),
      venue: 'Домашняя арена',
      status: 'upcoming',
      tournament: 'Чемпионат',
    },
  ];
}

function getFallbackPastGames(): Game[] {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  
  return [
    {
      id: 'past-1',
      event_id: 'past-1',
      homeTeam: 'ХК Форвард',
      awayTeam: 'Команда Б',
      homeScore: 3,
      awayScore: 2,
      date: yesterday.toISOString().split('T')[0],
      time: '19:00',
      event_date: yesterday.toISOString(),
      venue: 'Домашняя арена',
      status: 'finished',
      tournament: 'Чемпионат',
    },
  ];
}

function getFallbackGames(): Game[] {
  return [...getFallbackUpcomingGames(), ...getFallbackPastGames()];
}

function getFallbackGameById(gameId: string): Game | null {
  const games = getFallbackGames();
  return games.find(game => game.id === gameId) || null;
}

function getFallbackGameStats(gameId: string): GameStats | null {
  return {
    gameId,
    homeTeamStats: [],
    awayTeamStats: [],
    gameHighlights: ['Игра завершена'],
  };
}

export async function getCurrentGame(): Promise<Game | null> {
  try {
    console.log('Получение текущей игры...');
    
    // Сначала пробуем получить предстоящие игры
    const upcomingGames = await getUpcomingGames();
    if (upcomingGames && upcomingGames.length > 0) {
      // Ищем игру, которая идет сейчас или скоро начнется
      const now = new Date();
      const currentGame = upcomingGames.find(game => {
        const gameDate = new Date(game.event_date);
        const diffInHours = Math.abs(now.getTime() - gameDate.getTime()) / (1000 * 60 * 60);
        return diffInHours <= 3; // Игра в течение 3 часов
      });
      
      if (currentGame) {
        console.log('Найдена текущая игра:', currentGame);
        return currentGame;
      }
    }
    
    // Если нет текущей игры, возвращаем null
    console.log('Текущая игра не найдена');
    return null;
  } catch (error) {
    console.error('Ошибка получения текущей игры:', error);
    return null;
  }
}

export async function getUpcomingGames(): Promise<Game[]> {
  try {
    if (isCacheValid(upcomingGamesCache)) {
      console.log('Возврат предстоящих игр из кэша');
      return upcomingGamesCache!.data;
    }

    console.log('Загрузка предстоящих игр из API...');
    const response = await apiService.fetchUpcomingEvents();
    
    if (!response.data || !Array.isArray(response.data)) {
      console.log('Нет данных о предстоящих играх, используем fallback');
      return getFallbackUpcomingGames();
    }

    const games = await Promise.all(
      response.data.map(event => convertApiUpcomingEventToGame(event))
    );

    // Сортировка по дате
    games.sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime());

    upcomingGamesCache = {
      data: games,
      timestamp: Date.now(),
    };

    console.log(`Загружено ${games.length} предстоящих игр`);
    return games;
  } catch (error) {
    console.error('Ошибка загрузки предстоящих игр:', error);
    return getFallbackUpcomingGames();
  }
}

export async function getPastGames(): Promise<Game[]> {
  try {
    if (isCacheValid(pastGamesCache)) {
      console.log('Возврат архивных игр из кэша');
      return pastGamesCache!.data;
    }

    console.log('Загрузка архивных игр из НОВОГО API...');
    const response = await apiService.fetchPastEvents();
    
    if (!response.data || !Array.isArray(response.data)) {
      console.log('Нет данных об архивных играх, используем fallback');
      return getFallbackPastGames();
    }

    const games = await Promise.all(
      response.data.map(event => convertApiPastEventToGame(event))
    );

    // Сортировка по дате (новые сначала)
    games.sort((a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime());

    pastGamesCache = {
      data: games,
      timestamp: Date.now(),
    };

    console.log(`Загружено ${games.length} архивных игр с НОВОЙ структурой`);
    return games;
  } catch (error) {
    console.error('Ошибка загрузки архивных игр из НОВОГО API:', error);
    return getFallbackPastGames();
  }
}

export async function getFutureGames(): Promise<Game[]> {
  const upcomingGames = await getUpcomingGames();
  return upcomingGames.slice(0, 5); // Возвращаем только первые 5 игр для главного экрана
}

export async function getUpcomingGamesCount(): Promise<number> {
  try {
    if (isCacheValid(upcomingCountCache)) {
      console.log('Возврат количества предстоящих игр из кэша');
      return upcomingCountCache!.data;
    }

    console.log('Получение количества предстоящих игр...');
    const response = await apiService.fetchUpcomingEvents();
    const count = response.count || 0;

    upcomingCountCache = {
      data: count,
      timestamp: Date.now(),
    };

    console.log('Количество предстоящих игр:', count);
    return count;
  } catch (error) {
    console.error('Ошибка получения количества предстоящих игр:', error);
    return 0;
  }
}

export async function getPastGamesCount(): Promise<number> {
  try {
    if (isCacheValid(pastCountCache)) {
      console.log('Возврат количества архивных игр из кэша');
      return pastCountCache!.data;
    }

    console.log('Получение количества архивных игр из НОВОГО API...');
    const response = await apiService.fetchPastEvents();
    const count = response.count || 0;

    pastCountCache = {
      data: count,
      timestamp: Date.now(),
    };

    console.log('Количество архивных игр из НОВОГО API:', count);
    return count;
  } catch (error) {
    console.error('Ошибка получения количества архивных игр:', error);
    return 0;
  }
}

export async function getGameById(gameId: string): Promise<Game | null> {
  try {
    console.log('Поиск игры по ID:', gameId);
    
    // Ищем в предстоящих играх
    const upcomingGames = await getUpcomingGames();
    const upcomingGame = upcomingGames.find(game => game.id === gameId || game.event_id === gameId);
    if (upcomingGame) {
      console.log('Игра найдена в предстоящих:', upcomingGame);
      return upcomingGame;
    }
    
    // Ищем в архивных играх
    const pastGames = await getPastGames();
    const pastGame = pastGames.find(game => game.id === gameId || game.event_id === gameId);
    if (pastGame) {
      console.log('Игра найдена в архиве:', pastGame);
      return pastGame;
    }
    
    console.log('Игра не найдена, используем fallback');
    return getFallbackGameById(gameId);
  } catch (error) {
    console.error('Ошибка поиска игры по ID:', error);
    return getFallbackGameById(gameId);
  }
}

export async function getGameStatsById(gameId: string): Promise<GameStats | null> {
  try {
    console.log('Получение статистики игры для ID:', gameId);
    // В текущей версии API нет детальной статистики игры
    // Возвращаем fallback данные
    return getFallbackGameStats(gameId);
  } catch (error) {
    console.error('Ошибка получения статистики игры:', error);
    return getFallbackGameStats(gameId);
  }
}
