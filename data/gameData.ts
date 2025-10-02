// data/gameData.ts

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Game, Team } from '../types'; // Импортируем основные типы из существующего types/index.ts
import { apiService } from '../services/apiService';
import { ApiEvent, ApiGameDetailsResponse } from '../types/apiTypes'; // Импортируем новые типы
import { loadTeamLogo } from '../services/teamStorage';
// --- Локальное хранилище и флаги обновления ---

const LEAGUES_CACHE_KEY = 'leagues_cache';
const SEASONS_CACHE_KEY = 'seasons_cache';
const VENUES_CACHE_KEY = 'venues_cache';
const TEAMS_CACHE_KEY = 'teams_cache'; // Для кэширования команд, полученных через старый API

// --- КЭШ ДЛЯ getGames ---
let gamesCache: { [key: string]: { data: Game[]; timestamp: number } } = {};
const GAMES_CACHE_DURATION = 5 * 60 * 1000; // 5 минут
// --- КОНЕЦ КЭША ---


// Флаги обновления
let leaguesLoaded = false;
let seasonsLoaded = false;
let venuesLoaded = false;
let teamsLoaded = false; // Для команд

// Кэшированные данные в памяти (после загрузки из AsyncStorage)
let cachedLeagues: Record<string, any> = {}; // Тип будет ApiLeague из apiService
let cachedSeasons: Record<string, any> = {}; // Тип будет ApiSeason из apiService
let cachedVenues: Record<string, any> = {}; // Тип будет ApiVenue из apiService
let cachedTeams: Record<string, Team> = {}; // Тип из types/index.ts

// Вспомогательная функция для безопасного парсинга целых чисел
const safeInt = (value: any): number => {
  const num = parseInt(value as string, 10);
  return isNaN(num) ? 0 : num;
};

// --- Функции загрузки справочных данных ---

/**
 * Загружает и кэширует лиги из API и AsyncStorage
 */
export const loadLeagues = async (): Promise<void> => {
  if (leaguesLoaded) return;

  try {
    const cachedData = await AsyncStorage.getItem(LEAGUES_CACHE_KEY);
    if (cachedData) {
      const parsed = JSON.parse(cachedData);
      cachedLeagues = parsed.data.reduce((acc: Record<string, any>, league: any) => {
        acc[league.id] = league;
        return acc;
      }, {});
      leaguesLoaded = true;
      console.log('✅ Leagues loaded from cache');
      return;
    }

    const response = await apiService.fetchLeagues();
    cachedLeagues = response.data.reduce((acc: Record<string, any>, league: any) => {
      acc[league.id] = league;
      return acc;
    }, {});
    await AsyncStorage.setItem(LEAGUES_CACHE_KEY, JSON.stringify({ data: response.data, timestamp: Date.now() }));
    leaguesLoaded = true;
    console.log('✅ Leagues loaded and cached');
  } catch (error) {
    console.error('❌ Failed to load leagues:', error);
  }
};

/**
 * Загружает и кэширует сезоны из API и AsyncStorage
 */
export const loadSeasons = async (): Promise<void> => {
  if (seasonsLoaded) return;

  try {
    const cachedData = await AsyncStorage.getItem(SEASONS_CACHE_KEY);
    if (cachedData) {
      const parsed = JSON.parse(cachedData);
      cachedSeasons = parsed.data.reduce((acc: Record<string, any>, season: any) => {
        acc[season.id] = season;
        return acc;
      }, {});
      seasonsLoaded = true;
      console.log('✅ Seasons loaded from cache');
      return;
    }

    const response = await apiService.fetchSeasons();
    cachedSeasons = response.data.reduce((acc: Record<string, any>, season: any) => {
      acc[season.id] = season;
      return acc;
    }, {});
    await AsyncStorage.setItem(SEASONS_CACHE_KEY, JSON.stringify({ data: response.data, timestamp: Date.now() }));
    seasonsLoaded = true;
    console.log('✅ Seasons loaded and cached');
  } catch (error) {
    console.error('❌ Failed to load seasons:', error);
  }
};

/**
 * Загружает и кэширует места проведения из API и AsyncStorage
 */
export const loadVenues = async (): Promise<void> => {
  if (venuesLoaded) return;

  try {
    const cachedData = await AsyncStorage.getItem(VENUES_CACHE_KEY);
    if (cachedData) {
      const parsed = JSON.parse(cachedData);
      cachedVenues = parsed.data.reduce((acc: Record<string, any>, venue: any) => {
        acc[venue.id] = venue;
        return acc;
      }, {});
      venuesLoaded = true;
      console.log('✅ Venues loaded from cache');
      return;
    }

    const response = await apiService.fetchVenues();
    cachedVenues = response.data.reduce((acc: Record<string, any>, venue: any) => {
      acc[venue.id] = venue;
      return acc;
    }, {});
    await AsyncStorage.setItem(VENUES_CACHE_KEY, JSON.stringify({ data: response.data, timestamp: Date.now() }));
    venuesLoaded = true;
    console.log('✅ Venues loaded and cached');
  } catch (error) {
    console.error('❌ Failed to load venues:', error);
  }
};


export const loadTeams = async (): Promise<void> => {
  if (teamsLoaded) return; // <-- Если уже загружено, выходим

  try {
    // 1. Проверяем AsyncStorage
    const cachedData = await AsyncStorage.getItem(TEAMS_CACHE_KEY);
    if (cachedData) {
      const parsed = JSON.parse(cachedData);
      // 2. Заполняем кэш в памяти
      cachedTeams = parsed.data.reduce((acc: Record<string, Team>, team: Team) => {
        acc[team.id] = team;
        return acc;
      }, {});
      teamsLoaded = true; // <-- Устанавливаем флаг
      console.log('✅ Teams loaded from cache');
      return;
    }

    // 3. Если нет в кэше, загружаем с API
    console.log('📥 Fetching team list from API...');
    const response = await apiService.fetchTeamList(); // <-- Старый API для получения списка команд
    console.log(`✅ Fetched ${response.length} teams from API`);

    // 4. Заполняем кэш в памяти
    cachedTeams = response.reduce((acc: Record<string, Team>, team: Team) => {
      acc[team.id] = team;
      return acc;
    }, {});
    
    // 5. Сохраняем в AsyncStorage
    await AsyncStorage.setItem(TEAMS_CACHE_KEY, JSON.stringify({ data: response, timestamp: Date.now() }));
    teamsLoaded = true; // <-- Устанавливаем флаг
    console.log('✅ Teams loaded and cached');
  } catch (error) {
    console.error('❌ Failed to load teams:', error);
  }
};

/**
 * Получает команду из кэша
 */
const getTeamFromCache = (teamId: string): Team | undefined => {
  console.log(`Looking up team in cache by ID: ${teamId}, Cache size: ${Object.keys(cachedTeams).length}`);
  const team = cachedTeams[teamId];
  console.log(`Found team:`, team);
  return team;
};

// --- Внутренние функции преобразования данных ---

/**
 * Преобразует ApiEvent (из fetchEvents) в Game, заполняя информацию из кэшей
 */
const convertApiEventToGame = async (apiEvent: ApiEvent): Promise<Game> => {
  // Извлекаем ID команд, лиги, сезона, места проведения
  // В новом API teams - массив строк, leagues, seasons, venues - массивы чисел
  const teamIds: string[] = apiEvent.teams;
  const leagueId: string = apiEvent.leagues[0]?.toString() || '';
  const seasonId: string = apiEvent.seasons[0]?.toString() || '';
  const venueId: string = apiEvent.venues[0]?.toString() || '';

  console.log(`Converting ApiEvent ID: ${apiEvent.id}, Teams: ${teamIds}, League ID: ${leagueId}, Season ID: ${seasonId}, Venue ID: ${venueId}`);

  // Получаем информацию о командах из кэша
  const homeTeamInfo = getTeamFromCache(teamIds[0]);
  const awayTeamInfo = getTeamFromCache(teamIds[1]);

  console.log(`Team ID ${teamIds[0]} lookup result:`, homeTeamInfo);
  console.log(`Team ID ${teamIds[1]} lookup result:`, awayTeamInfo);

  // Получаем информацию о лиге, сезоне, месте проведения из кэша
  const leagueInfo = cachedLeagues[leagueId];
  const seasonInfo = cachedSeasons[seasonId];
  const venueInfo = cachedVenues[venueId];

  // Определяем статус игры
  // Пока простая логика: если в поле results есть данные, считаем игру завершенной
  const hasResults = apiEvent.results && typeof apiEvent.results === 'object' && Object.keys(apiEvent.results).length > 0;
  //const hasResults = apiEvent.results && Array.isArray(apiEvent.results) && apiEvent.results.length > 0;
  const status = apiService.determineGameStatus(apiEvent.date, hasResults);


  // Извлекаем результаты, если они есть
  let homeGoals, awayGoals, homeOutcome, awayOutcome, team1_first, team1_second, team1_third, team2_first, team2_second, team2_third;
  if (hasResults && homeTeamInfo && awayTeamInfo) {
    const homeTeamResults = (apiEvent.results as any)[homeTeamInfo.id];
    const awayTeamResults = (apiEvent.results as any)[awayTeamInfo.id];

    console.log(`Home team results for ID ${homeTeamInfo.id}:`, homeTeamResults); // <-- ДОБАВИЛ ЛОГ
    console.log(`Away team results for ID ${awayTeamInfo.id}:`, awayTeamResults); // <-- ДОБАВИЛ ЛОГ

    if (homeTeamResults && awayTeamResults) {
      homeGoals = safeInt(homeTeamResults.goals);
      awayGoals = safeInt(awayTeamResults.goals);
      homeOutcome = apiService.getOutcomeFromResult(homeTeamResults.outcome);
      awayOutcome = apiService.getOutcomeFromResult(awayTeamResults.outcome);
      team1_first = safeInt(homeTeamResults.first);
      team1_second = safeInt(homeTeamResults.second);
      team1_third = safeInt(homeTeamResults.third);
      team2_first = safeInt(awayTeamResults.first);
      team2_second = safeInt(awayTeamResults.second);
      team2_third = safeInt(awayTeamResults.third);
    }
  }

  // Форматируем дату и время
  // Используем apiService.formatDateTime, который ожидает строку в формате ISO или 'YYYY-MM-DD HH:MM:SS'
  // apiEvent.date уже в нужном формате, передаем его напрямую
  const { date, time } = apiService.formatDateTime(apiEvent.date); // <- ИСПРАВЛЕНО

  // --- ЗАГРУЖАЕМ URI ЛОГОТИПОВ ИЗ ЛОКАЛЬНОГО ХРАНИЛИЩА ---
  const homeTeamLogoUri = homeTeamInfo ? await loadTeamLogo(homeTeamInfo.id) ?? '' : '';
  const awayTeamLogoUri = awayTeamInfo ? await loadTeamLogo(awayTeamInfo.id) ?? '' : '';

  // Создаем объект Game
  const game: Game = {
    id: apiEvent.id.toString(),
    event_date: apiEvent.date,
    date: date,
    time: time,
    status: status,
    // Команды
    homeTeamId: teamIds[0],
    awayTeamId: teamIds[1],
    homeTeam: homeTeamInfo || undefined, // Убедимся, что это объект Team или undefined
    awayTeam: awayTeamInfo || undefined, // Убедимся, что это объект Team или undefined
    homeTeamLogo: homeTeamLogoUri, // <- Теперь URI из локального хранилища
    awayTeamLogo: awayTeamLogoUri, // <- Теперь URI из локального хранилища
    // Результаты (если есть)
    homeScore: homeGoals,
    awayScore: awayGoals,
    homeGoals: homeGoals,
    awayGoals: awayGoals,
    homeOutcome: homeOutcome,
    awayOutcome: awayOutcome,
    // Периоды (если есть)
    team1_first: team1_first,
    team1_second: team1_second,
    team1_third: team1_third,
    team2_first: team2_first,
    team2_second: team2_second,
    team2_third: team2_third,
    team1_goals: homeGoals,
    team2_goals: awayGoals,
    team1_outcome: homeOutcome,
    team2_outcome: awayOutcome,
    // Место проведения
    venue: venueInfo?.name || '',
    venue_name: venueInfo?.name || '',
    venueId: venueId, // Исправлено с venue_id
    // Турнир и сезон
    tournament: leagueInfo?.name || 'Товарищеский матч',
    league: leagueInfo || undefined,
    leagueId: leagueId, // Исправлено с league_id
    league_name: leagueInfo?.name || 'Товарищеский матч', // Новое поле
    season: seasonInfo || undefined,
    seasonId: seasonId, // Исправлено с season_id
    season_name: seasonInfo?.name || '',
    // Видео (если есть)
    sp_video: (apiEvent as any).sp_video || '', // Поле может быть в ApiEvent, если API его возвращает
    videoUrl: (apiEvent as any).sp_video || '',
  };

  console.log(`Converted Game object:`, game);

  return game;
};

/**
 * Преобразует ApiGameDetailsResponse (из fetchEventById) в Game, заполняя информацию из кэшей
 * Эта функция используется для получения одной детальной игры.
 */
const convertApiGameDetailsToGame = async (apiGameDetails: ApiGameDetailsResponse): Promise<Game> => {
  // Извлекаем ID команд, лиги, сезона, места проведения
  const teamIds: string[] = apiGameDetails.teams;
  const leagueId: string = apiGameDetails.leagues[0]?.toString() || '';
  const seasonId: string = apiGameDetails.seasons[0]?.toString() || '';
  const venueId: string = apiGameDetails.venues[0]?.toString() || '';

  // Получаем информацию о командах из кэша
  const homeTeamInfo = getTeamFromCache(teamIds[0]);
  const awayTeamInfo = getTeamFromCache(teamIds[1]);

  // Получаем информацию о лиге, сезоне, месте проведения из кэша
  const leagueInfo = cachedLeagues[leagueId];
  const seasonInfo = cachedSeasons[seasonId];
  const venueInfo = cachedVenues[venueId];

  // Определяем статус игры
  // Для детальной информации всегда считаем завершенной или запланированной, но не "живой"
  const hasResults = apiGameDetails.results && Object.keys(apiGameDetails.results).length > 0;
  const status = apiService.determineGameStatus(apiGameDetails.date, hasResults);

  // Извлекаем результаты
  let homeGoals, awayGoals, homeOutcome, awayOutcome, team1_first, team1_second, team1_third, team2_first, team2_second, team2_third;
  if (homeTeamInfo && awayTeamInfo) {
    const homeTeamResults = apiGameDetails.results[homeTeamInfo.id];
    const awayTeamResults = apiGameDetails.results[awayTeamInfo.id];

    if (homeTeamResults && awayTeamResults) {
      homeGoals = safeInt(homeTeamResults.goals);
      awayGoals = safeInt(awayTeamResults.goals);
      homeOutcome = apiService.getOutcomeFromResult(homeTeamResults.outcome);
      awayOutcome = apiService.getOutcomeFromResult(awayTeamResults.outcome);
      team1_first = safeInt(homeTeamResults.first);
      team1_second = safeInt(homeTeamResults.second);
      team1_third = safeInt(homeTeamResults.third);
      team2_first = safeInt(awayTeamResults.first);
      team2_second = safeInt(awayTeamResults.second);
      team2_third = safeInt(awayTeamResults.third);
    }
  }

  // Форматируем дату и время
  // Используем apiService.formatDateTime, который ожидает строку в формате ISO или 'YYYY-MM-DD HH:MM:SS'
  // apiGameDetails.date уже в нужном формате, передаем его напрямую
  const { date, time } = apiService.formatDateTime(apiGameDetails.date); // <- ИСПРАВЛЕНО

  // --- ЗАГРУЖАЕМ URI ЛОГОТИПОВ ИЗ ЛОКАЛЬНОГО ХРАНИЛИЩА ---
  const homeTeamLogoUri = homeTeamInfo ? await loadTeamLogo(homeTeamInfo.id) : '';
  const awayTeamLogoUri = awayTeamInfo ? await loadTeamLogo(awayTeamInfo.id) : '';

  // Создаем объект Game
  const game: Game = {
    id: apiGameDetails.id.toString(),
    event_date: apiGameDetails.date,
    date: date,
    time: time,
    status: status,
    // Команды
    homeTeamId: teamIds[0],
    awayTeamId: teamIds[1],
    homeTeam: homeTeamInfo || undefined,
    awayTeam: awayTeamInfo || undefined,
    homeTeamLogo: homeTeamLogoUri, // <- Теперь URI из локального хранилища
    awayTeamLogo: awayTeamLogoUri, // <- Теперь URI из локального хранилища
    // Результаты
    homeScore: homeGoals,
    awayScore: awayGoals,
    homeGoals: homeGoals,
    awayGoals: awayGoals,
    homeOutcome: homeOutcome,
    awayOutcome: awayOutcome,
    // Периоды
    team1_first: team1_first,
    team1_second: team1_second,
    team1_third: team1_third,
    team2_first: team2_first,
    team2_second: team2_second,
    team2_third: team2_third,
    team1_goals: homeGoals,
    team2_goals: awayGoals,
    team1_outcome: homeOutcome,
    team2_outcome: awayOutcome,
    // Место проведения
    venue: venueInfo?.name || '',
    venue_name: venueInfo?.name || '',
    venueId: venueId, // Исправлено с venue_id
    // Турнир и сезон
    tournament: leagueInfo?.name || 'Товарищеский матч',
    league: leagueInfo || undefined,
    leagueId: leagueId, // Исправлено с league_id
    league_name: leagueInfo?.name || 'Товарищеский матч', // Новое поле
    season: seasonInfo || undefined,
    seasonId: seasonId, // Исправлено с season_id
    season_name: seasonInfo?.name || '',
    // Видео (если есть)
    sp_video: apiGameDetails.sp_video || '',
    videoUrl: apiGameDetails.sp_video || '',
  };

  return game;
};

// --- Вспомогательные функции сортировки и фолбэка ---

/**
 * Сортирует предстоящие игры по приоритету: live -> сегодня -> скоро -> по дате
 * --- ИСПРАВЛЕНО: Корректная сортировка ---
 */
const sortUpcomingGames = (games: Game[]): Game[] => {
  const now = new Date();

  return games.sort((a, b) => {
    const dateA = new Date(a.event_date);
    const dateB = new Date(b.event_date);

    // 1. LIVE games first
    if (a.status === 'live' && b.status !== 'live') return -1;
    if (b.status === 'live' && a.status !== 'live') return 1;

    // 2. Today games second (but not LIVE)
    const isTodayA = dateA.toDateString() === now.toDateString();
    const isTodayB = dateB.toDateString() === now.toDateString();
    if (a.status === 'upcoming' && isTodayA && b.status !== 'live' && !isTodayB) return -1;
    if (b.status === 'upcoming' && isTodayB && a.status !== 'live' && !isTodayA) return 1;

    // 3. Within 3 days games third
    const daysDiffA = Math.ceil((dateA.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const isWithin3DaysA = daysDiffA >= 0 && daysDiffA <= 3;
    const daysDiffB = Math.ceil((dateB.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const isWithin3DaysB = daysDiffB >= 0 && daysDiffB <= 3;
    if (a.status === 'upcoming' && isWithin3DaysA && b.status !== 'live' && !isTodayB && !isWithin3DaysB) return -1;
    if (b.status === 'upcoming' && isWithin3DaysB && a.status !== 'live' && !isTodayA && !isWithin3DaysA) return 1;

    // 4. Rest by date
    return dateA.getTime() - dateB.getTime();
  });
};

/**
 * Возвращает фолбэк список предстоящих игр (пустой массив)
 */
const getFallbackUpcomingGames = (): Game[] => {
  console.warn('Using fallback upcoming games (empty array)');
  return [];
};

// --- Экспортируемые функции ---

/**
 * Получает список игр с фильтрацией
 * Использует apiService.fetchEvents и сопоставляет данные
 */
/**
 * Универсальная функция для получения списка игр с фильтрацией
 * --- ОБНОВЛЕНО: Добавлено кэширование ---
 */
export async function getGames(params: {
  date_from?: string;
  date_to?: string;
  league?: string;
  season?: string;
  teams?: string;
  useCache?: boolean; // <-- НОВЫЙ ПАРАМЕТР
  }): Promise<Game[]> {
  try {
    console.log('Data/gameData: Getting games with params:', params);

    // --- ДОБАВЛЕНО: Генерация ключа кэша ---
    const cacheKey = JSON.stringify(params);
    const now = Date.now();

    // Проверяем кэш, если useCache !== false
    if (params.useCache !== false) {
      const cachedEntry = gamesCache[cacheKey];
      if (cachedEntry && (now - cachedEntry.timestamp) < GAMES_CACHE_DURATION) {
        console.log('✅ Returning games from memory cache for key:', cacheKey);
        return cachedEntry.data;
      }
    }
    // --- КОНЕЦ ДОБАВЛЕНИЯ ---

    // Проверяем, загружены ли справочные данные
    await loadLeagues();
    await loadSeasons();
    await loadVenues();
    await loadTeams(); // Загружаем команды для логотипов

    // --- ИСПОЛЬЗУЕМ НОВЫЙ API ---
    const response = await apiService.fetchEvents(params);
    // --- КОНЕЦ ИСПОЛЬЗОВАНИЯ НОВОГО API ---

    const apiEvents = response.data;

    const games: Game[] = [];
    for (const apiEvent of apiEvents) {
      const game = await convertApiEventToGame(apiEvent);
      games.push(game);
    }

    // Сортируем игры по приоритету: live -> сегодня -> скоро -> по дате
    const sortedGames = sortUpcomingGames(games);
    console.log(`Data/gameData: Loaded ${sortedGames.length} games with params:`, params);

    // --- ДОБАВЛЕНО: Сохраняем в кэш, если useCache !== false ---
    if (params.useCache !== false) {
      gamesCache[cacheKey] = {
        data: sortedGames,
        timestamp: now,
      };
      console.log('💾 Games saved to memory cache for key:', cacheKey);
    }
    // --- КОНЕЦ ДОБАВЛЕНИЯ ---

    return sortedGames;
  } catch (error) {
    console.error('Data/gameData: Error getting games:', error);
    // Возврат фолбэка в случае ошибки
    return getFallbackUpcomingGames();
  }
}

/**
 * Получает одну игру по ID с детальной информацией
 * Использует apiService.fetchEventById и сопоставляет данные
 */
export const getGameById = async (id: string): Promise<Game | null> => {
  try {
    // Проверяем, загружены ли справочные данные
    await loadLeagues();
    await loadSeasons();
    await loadVenues();
    await loadTeams(); // Загружаем команды для логотипов

    const apiGameDetails = await apiService.fetchEventById(id);
    const game = await convertApiGameDetailsToGame(apiGameDetails);

    console.log(`Loaded game by ID: ${id}`);
    return game;
  } catch (error) {
    console.error('❌ Failed to get game by ID:', error);
    return null;
  }
};

// --- Мастер-функция для получения предстоящих игр ---
let upcomingGamesMasterCache: { data: Game[]; timestamp: number } | null = null;
const UPCOMING_MASTER_CACHE_DURATION = 5 * 60 * 1000; // 5 минут
let isMasterDataLoading = false; // <-- Эта переменная должна существовать
let masterDataLoadPromise: Promise<Game[]> | null = null; // <-- И эта тоже
/**
 * Мастер-функция для получения всех предстоящих игр команды 74.
 * Делает единственный запрос к API и возвращает сырые данные.
 * Используется другими функциями для извлечения нужной части данных.
 * Диапазон: с сегодня на 37 дней вперёд.
 */
async function getUpcomingGamesMasterData(): Promise<Game[]> {
  const now = Date.now();
  // 1. Проверяем кэш
  if (upcomingGamesMasterCache && (now - upcomingGamesMasterCache.timestamp) < UPCOMING_MASTER_CACHE_DURATION) {
    console.log('✅ Returning master upcoming games data from cache');
    return upcomingGamesMasterCache.data;
  }

  // 2. Проверяем, идет ли уже загрузка
  if (isMasterDataLoading && masterDataLoadPromise) {
    console.log('⏳ Master data loading is already in progress, waiting for it to finish...');
    // Дожидаемся завершения текущей загрузки
    return await masterDataLoadPromise;
  }

  // 3. Начинаем новую загрузку
  isMasterDataLoading = true;
  console.log('🔄 Starting new master upcoming games data loading process...');
  // Создаем Promise для этой загрузки
  masterDataLoadPromise = (async () => {
    try {
      console.log('🔄 Loading master upcoming games data from API...');

      // Проверяем, загружены ли справочные данные
      await loadLeagues();
      console.log('⏳ Вызываем запуск loadLeagues');
      await loadSeasons();
      console.log('⏳ Вызываем запуск loadSeasons');
      await loadVenues();
      console.log('⏳ Вызываем запуск loadVenues');
      await loadTeams(); // Загружаем команды для логотипов
      console.log('⏳ Вызываем запуск loadTeams');

      // --- ИЗМЕНЕНО: Диапазон с сегодня на 37 дней вперёд ---
      const nowDate = new Date();
      const futureDate = new Date(nowDate);
      futureDate.setDate(futureDate.getDate() + 37); 
      const todayString = nowDate.toISOString().split('T')[0];
      const futureDateString = futureDate.toISOString().split('T')[0];
      // --- КОНЕЦ ИЗМЕНЕНИЯ ---

      // --- ДОБАВЛЕНО ЛОГИРОВАНИЕ ---
      console.log(`API Service: Fetching events with URL: ${apiService.baseUrl}/get-events?date_from=${todayString}&date_to=${futureDateString}&teams=74`);
      // --- КОНЕЦ ЛОГИРОВАНИЯ ---

      const apiGames = await apiService.fetchEvents({
        date_from: todayString,
        date_to: futureDateString,
        teams: '74', // <-- Всегда фильтруем по команде 74
      });

      // --- ДОБАВЛЕНО ЛОГИРОВАНИЕ ---
      console.log('API Service: Events response status:', apiGames.status);
      console.log('API Service: Total events count:', apiGames.count);
      // --- КОНЕЦ ЛОГИРОВАНИЯ ---

      const games = await Promise.all(
        apiGames.data.map(async (apiGame) => {
          // --- ДОБАВЛЕНО ЛОГИРОВАНИЕ ---
          console.log(`Converting ApiEvent ID: ${apiGame.id}, Teams: ${apiGame.teams}, League ID: ${apiGame.leagues[0]}, Season ID: ${apiGame.seasons[0]}, Venue ID: ${apiGame.venues[0]}`);
          // --- КОНЕЦ ЛОГИРОВАНИЯ ---
          return await convertApiEventToGame(apiGame);
        })
      );

      // Сортируем по дате
      games.sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime());

      upcomingGamesMasterCache = {  games, timestamp: now };
      console.log(`✅ Loaded and cached ${games.length} master upcoming games`);
      return games;
    } catch (error) {
      console.error('❌ Error loading master upcoming games:', error);
      // Пытаемся вернуть кэш, даже если он устарел
      if (upcomingGamesMasterCache) {
        console.log('⚠️ Returning stale master upcoming games data from cache due to error');
        return upcomingGamesMasterCache.data;
      }
      return [];
    } finally {
      // Сбрасываем флаги и Promise после завершения
      isMasterDataLoading = false;
      masterDataLoadPromise = null;
      console.log('🔄 Master upcoming games data loading process finished.');
    }
  })();

  // Возвращаем Promise текущей загрузки
  return await masterDataLoadPromise;
}

// --- Обновлённые экспортируемые функции ---

/**
 * Получает текущую игру (ближайшая предстоящая или идущая)
 * Использует getUpcomingGamesMasterData
 * --- УТОЧНЕНИЕ: Игры, которые начинаются сегодня или в будущем (Дата Время > ТекущаяДата 00:00) ---
 */
export async function getCurrentGame(): Promise<Game | null> {
  try {
    console.log('Getting current game from master data...');
    const allUpcomingGames = await getUpcomingGamesMasterData();

    if (allUpcomingGames.length === 0) {
      console.log('No upcoming games found for current game lookup');
      return null;
    }

    const now = new Date();
    
    // --- ИЗМЕНЕНО: Фильтруем игры, которые ещё не начались ---
    // Ищем первую игру, у которой дата и время больше текущего момента и статус 'upcoming'
    const currentGame = allUpcomingGames.find(game => {
      const gameDateTime = new Date(game.event_date); // game.event_date уже содержит и дату, и время
      return game.status === 'upcoming' && gameDateTime > now;
    });
    // --- КОНЕЦ ИЗМЕНЕНИЯ ---

    if (currentGame) {
      console.log('Found current game:', currentGame.id);
      return currentGame;
    } else {
      console.log('No game found that starts after current time');
      return null;
    }
  } catch (error) {
    console.error('Error getting current game from master data:', error);
    return null;
  }
}

/**
 * Получает список будущих игр (до 5 штук)
 * Использует getUpcomingGamesMasterData
 * --- УТОЧНЕНИЕ: Игры у которых дата больше текущей ---
 */
export async function getFutureGames(): Promise<Game[]> {
  try {
    console.log('Getting future games from master data...');
    const allUpcomingGames = await getUpcomingGamesMasterData();
    
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // Текущая дата 00:00

    // --- ИЗМЕНЕНО: Фильтруем игры, дата которых больше или равна сегодняшней ---
    // Это включает все игры, начиная с сегодня 00:00
    const futureGames = allUpcomingGames.filter(game => {
      const gameDate = new Date(game.event_date);
      const gameDateOnly = new Date(gameDate.getFullYear(), gameDate.getMonth(), gameDate.getDate()); // Дата игры 00:00
      return gameDateOnly >= todayStart; // Игры с сегодняшней даты и далее
    });
    // --- КОНЕЦ ИЗМЕНЕНИЯ ---

    console.log(`Filtered ${futureGames.length} future games (date >= today)`);
    // Возвращаем первые 5 отфильтрованных игр
    return futureGames.slice(0, 5);
  } catch (error) {
    console.error('Error getting future games from master data:', error);
    return [];
  }
}


/**
 * Получает список предстоящих игр
 * Использует getGames с фильтром по дате
 */
export async function getUpcomingGames(): Promise<Game[]> {
  try {
    console.log('Getting upcoming games...');
    
    // --- ОБНОВЛЕНИЕ: Добавляем фильтр по команде 74 ---
    // Определяем диапазон дат: сегодня + 37 дней (как в вашем коде)
    const now = new Date();
    const futureDate = new Date(now);
    futureDate.setDate(futureDate.getDate() + 37);
    const todayString = now.toISOString().split('T')[0];
    const futureDateString = futureDate.toISOString().split('T')[0];

    // Передаем параметры фильтрации, включая teams=74
    const apiGames = await apiService.fetchEvents({
      date_from: todayString,
      //date_to: futureDateString,
      teams: '74', // <-- НОВЫЙ ПАРАМЕТР: Фильтр по команде с ID 74
    });
    // --- КОНЕЦ ОБНОВЛЕНИЯ ---

    const games = await Promise.all(
      apiGames.data.map(async (apiGame) => await convertApiEventToGame(apiGame))
    );

    // Сортируем игры по приоритету: live -> сегодня -> скоро -> по дате
    const sortedGames = sortUpcomingGames(games);
    console.log(`Loaded ${sortedGames.length} upcoming games`);
    return sortedGames;
  } catch (error) {
    console.error('Error loading upcoming games:', error);
    // Возврат фолбэка в случае ошибкиgetUpcomingGamesCount
    return getFallbackUpcomingGames();
  }
}

/**
 * Получает количество предстоящих игр
 * --- ОБНОВЛЕНО: Использует getUpcomingGamesMasterData ---
 */
export async function getUpcomingGamesCount(): Promise<number> {
  try {
    console.log('Getting upcoming games count via master data...');
    
    // --- ИЗМЕНЕНО: Используем мастер-функцию ---
    const allUpcomingGames = await getUpcomingGamesMasterData();
    // --- КОНЕЦ ИЗМЕНЕНИЯ ---
    
    // --- ДОБАВЛЕНО: Проверка типа результата ---
    if (!Array.isArray(allUpcomingGames)) {
      console.error('💥 getUpcomingGamesMasterData returned non-array:', allUpcomingGames);
      return 0;
    }
    // --- КОНЕЦ ПРОВЕРКИ ---
    
    const count = allUpcomingGames.length || 0;
    console.log('Upcoming games count via master data:', count);
    return count;
  } catch (error) {
    console.error('Error getting upcoming games count via master data:', error);
    return 0;
  }
}

// Функции для архивных (прошедших) игр
// Используют тот же apiService.fetchEvents, но с фильтром по дате "до сегодняшней"
// и сортировкой по убыванию даты

/**
 * Получает список прошедших игр
 * Использует getGames с фильтром по дате "до сегодняшней"
 */
export async function getPastGames(): Promise<Game[]> {
  try {
    console.log('Getting past games...');
    const now = new Date();
    const pastDate = new Date(now);
    pastDate.setMonth(pastDate.getMonth() - 6); // Получаем игры за последние 6 месяцев
    const pastDateString = pastDate.toISOString().split('T')[0];
    const todayString = now.toISOString().split('T')[0];

    // Получаем игры, дата которых меньше сегодняшней
    const games = await getGames({ date_from: pastDateString, date_to: todayString });
    // Сортируем по дате (сначала самые последние)
    games.sort((a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime());

    console.log(`Loaded ${games.length} past games`);
    return games;
  } catch (error) {
    console.error('Error loading past games:', error);
    return [];
  }
}

/**
 * Получает количество прошедших игр
 * Использует getGames с фильтром по дате "до сегодняшней" и возвращает .count из API
 */
export async function getPastGamesCount(): Promise<number> {
  try {
    console.log('Getting past games count...');
    const now = new Date();
    const pastDate = new Date(now);
    pastDate.setMonth(pastDate.getMonth() - 6); // Считаем игры за последние 6 месяцев
    const pastDateString = pastDate.toISOString().split('T')[0];
    const todayString = now.toISOString().split('T')[0];

    // Получаем только count, не загружая все данные
    const response = await apiService.fetchEvents({ date_from: pastDateString, date_to: todayString });
    const count = response.count || 0;
    console.log('Past games count:', count);
    return count;
  } catch (error) {
    console.error('Error getting past games count:', error);
    return 0;
  }
}