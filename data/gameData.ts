// data/gameData.ts

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Game, Team } from '../types'; // Импортируем основные типы из существующего types/index.ts
import { apiService } from '../services/apiService';
import { ApiEvent, ApiGameDetailsResponse, ApiVenue} from '../types/apiTypes'; // Импортируем новые типы
import { loadTeamLogo, loadTeamList, saveTeamList } from '../services/teamStorage';
import { dataAvailability } from '../services/dataAvailability';
import { readPersistentCache, writePersistentCache } from '../services/persistentCache';
import NetInfo from '@react-native-community/netinfo';
// --- Локальное хранилище и флаги обновления ---

const LEAGUES_CACHE_KEY = 'leagues_cache';
const SEASONS_CACHE_KEY = 'seasons_cache';
const VENUES_CACHE_KEY = 'venues_cache';

// УДАЛЯЕМ: TEAMS_CACHE_KEY — больше не нужен
//const TEAMS_CACHE_KEY = 'teams_cache'; // Для кэширования команд, полученных через старый API



// --- КЭШ ДЛЯ getGames ---
let gamesCache: { [key: string]: { data: Game[]; timestamp: number } } = {};
const GAMES_CACHE_DURATION = 5 * 60 * 1000; // 5 минут
const GAMES_STORAGE_PREFIX = '@offline/games/v1/';
// --- КОНЕЦ КЭША ---

// --- КЭШ ДЛЯ ДЕТАЛЕЙ ИГР ---
let gameDetailsCache: { [gameId: string]: { data: Game; timestamp: number } } = {};
const GAME_DETAILS_CACHE_DURATION = 10 * 60 * 1000; // 10 минут
const GAME_DETAIL_STORAGE_PREFIX = '@offline/game-detail/v1/';
// --- КОНЕЦ КЭША ---

// --- КЭШ ДЛЯ МАСТЕР-ДАННЫХ ПРЕДСТОЯЩИХ ИГР ---
let upcomingGamesMasterCache: { data: Game[]; timestamp: number } | null = null;
const UPCOMING_MASTER_CACHE_DURATION = 5 * 60 * 1000; // 5 минут
let isMasterDataLoading = false; // <-- Флаг загрузки
let masterDataLoadPromise: Promise<Game[]> | null = null; // <-- Promise для ожидания текущей загрузки
// --- КОНЕЦ КЭША ---

// --- КОНСТАНТЫ ---
const CACHE_DURATION = 5 * 60 * 1000; // 5 минут
const PAST_GAMES_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 часа (или больше)
// --- КОНЕЦ КОНСТАНТ ---

// --- ТИПЫ ДЛЯ КЭША ---
interface CachedData<T> {
  data: T; // <-- Правильно: используем T
  timestamp: number;
}
// --- КОНЕЦ ТИПОВ ДЛЯ КЭША ---

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
  if (teamsLoaded) return;

  try {
    // ← Используем teamStorage.ts для загрузки
    let teams = await loadTeamList();

    if (teams && teams.length > 0) {
      cachedTeams = teams.reduce((acc, team) => {
        acc[team.id] = team;
        return acc;
      }, {} as Record<string, Team>);
      teamsLoaded = true;
      console.log('✅ Teams loaded from teamStorage');
      return;
    }

    // Если команд нет — загружаем из API и сохраняем через teamStorage
    console.log('📥 Fetching team list from API (not in storage)...');
    const response = await apiService.fetchTeamList();
    console.log(`✅ Fetched ${response.length} teams from API`);

    // Сохраняем через teamStorage
    await saveTeamList(response);

    cachedTeams = response.reduce((acc, team) => {
      acc[team.id] = team;
      return acc;
    }, {} as Record<string, Team>);

    teamsLoaded = true;
    console.log('✅ Teams loaded from API and saved via teamStorage');
  } catch (error) {
    console.error('❌ Failed to load teams:', error);
    teamsLoaded = true; // ← предотвращаем повторные попытки
  }
};

/**
 * Получает команду из кэша
 */
const getTeamFromCache = (teamId: string): Team | undefined => {
  //console.log(`Looking up team in cache by ID: ${teamId}, Cache size: ${Object.keys(cachedTeams).length}`);
  const team = cachedTeams[teamId];
  //console.log(`Found team by [getTeamFromCache]. Team ID is:`, team.id);
  return team;
};


// Служебная
// Извлекает число из строки вида "3", "3Б", "10П" → 3, 3, 10
export const extractNumericScore = (score: string | number | null | undefined): number => {
  if (score == null) return 0;
  const scoreStr = String(score).trim();
  const match = scoreStr.match(/^\d+/);
  return match ? parseInt(match[0], 10) : 0;
};

// --- Внутренние функции преобразования данных ---

/**
 * Преобразует ApiEvent (из fetchEvents) в Game, заполняя информацию из кэшей
 */
// data/gameData.ts

const convertApiEventToGame = async (
  apiEvent: ApiEvent | ApiGameDetailsResponse
): Promise<Game> => {
  const teamIds: string[] = apiEvent.teams;
  const leagueId: string = apiEvent.leagues[0]?.toString() || '';
  const seasonId: string = apiEvent.seasons[0]?.toString() || '';
  const venueId: string = apiEvent.venues[0]?.toString() || '';


  const homeTeamInfo = getTeamFromCache(teamIds[0]);
  const awayTeamInfo = getTeamFromCache(teamIds[1]);

  const leagueInfo = cachedLeagues[leagueId];
  const seasonInfo = cachedSeasons[seasonId];
  const venueInfo = cachedVenues[venueId];

  const hasResults = apiEvent.results && typeof apiEvent.results === 'object' && Object.keys(apiEvent.results).length > 0;
  const status = apiService.determineGameStatus(apiEvent.date, hasResults);

  // --- РЕЗУЛЬТАТЫ ---
  let homeScoreRaw = '0';
  let awayScoreRaw = '0';
  let homeOutcome, awayOutcome;
  let team1_first, team1_second, team1_third;
  let team2_first, team2_second, team2_third;

  if (hasResults && homeTeamInfo && awayTeamInfo) {
    const homeTeamResults = (apiEvent.results as any)[homeTeamInfo.id];
    const awayTeamResults = (apiEvent.results as any)[awayTeamInfo.id];

    if (homeTeamResults && awayTeamResults) {
      homeScoreRaw = homeTeamResults.goals?.toString() || '0';
      awayScoreRaw = awayTeamResults.goals?.toString() || '0';

      homeOutcome = apiService.getOutcomeFromResult(homeTeamResults.outcome);
      awayOutcome = apiService.getOutcomeFromResult(awayTeamResults.outcome);

      team1_first = homeTeamResults.first?.toString() || '0';
      team1_second = homeTeamResults.second?.toString() || '0';
      team1_third = homeTeamResults.third?.toString() || '0';

      team2_first = awayTeamResults.first?.toString() || '0';
      team2_second = awayTeamResults.second?.toString() || '0';
      team2_third = awayTeamResults.third?.toString() || '0';
    }
  }

  // --- ФОРМАТИРОВАНИЕ ДАТЫ ---
  const isoDateString = apiEvent.date.replace(' ', 'T');
  const { date, time } = apiService.formatDateTime(isoDateString);

  // --- ЛОГОТИПЫ ---
  const homeTeamLogoUri = homeTeamInfo ? await loadTeamLogo(homeTeamInfo.id) ?? '' : '';
  const awayTeamLogoUri = awayTeamInfo ? await loadTeamLogo(awayTeamInfo.id) ?? '' : '';

  return {
    id: apiEvent.id.toString(),
    event_date: apiEvent.date,
    date,
    time,
    status,
    // Команды
    homeTeamId: teamIds[0],
    awayTeamId: teamIds[1],
    homeTeam: homeTeamInfo || undefined,
    awayTeam: awayTeamInfo || undefined,
    homeTeamLogo: homeTeamLogoUri,
    awayTeamLogo: awayTeamLogoUri,
    // Результаты — ВСЕ КАК СТРОКИ
    homeScore: homeScoreRaw,
    awayScore: awayScoreRaw,
    homeGoals: extractNumericScore(homeScoreRaw),
    awayGoals: extractNumericScore(awayScoreRaw),
    homeOutcome,
    awayOutcome,
    // Периоды — КАК СТРОКИ
    team1_first,
    team1_second,
    team1_third,
    team2_first,
    team2_second,
    team2_third,
    team1_goals: homeScoreRaw,   // ← строка
    team2_goals: awayScoreRaw,   // ← строка
    team1_outcome: homeOutcome,
    team2_outcome: awayOutcome,
    // Место проведения
    venue: venueInfo?.name || '',
    venue_name: venueInfo?.name || '',
    venueId,
    // Турнир и сезон
    tournament: leagueInfo?.name || 'Товарищеский матч',
    league: leagueInfo || undefined,
    leagueId,
    league_name: leagueInfo?.name || 'Товарищеский матч',
    season: seasonInfo || undefined,
    seasonId,
    season_name: seasonInfo?.name || '',
    // Видео
    sp_video: (apiEvent as any).sp_video || '',
    videoUrl: (apiEvent as any).sp_video || '',
    protocol: (apiEvent as any).protocol || null,
    player_stats: (apiEvent as any).player_stats || null,
  };
};

/**
 * !!!НЕ ИСПОЛЬЗУЕТСЯ!!!
 * Преобразует ApiGameDetailsResponse (из fetchEventById) в Game, заполняя информацию из кэшей
 * Эта функция используется для получения одной детальной игры.
 * !!!НЕ ИСПОЛЬЗУЕТСЯ!!!
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

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ СОРТИРОВКИ И ФОЛБЭКА ---

/**
 * Сортирует предстоящие игры по приоритету: live -> сегодня -> скоро -> по дате
 * --- ОБНОВЛЕНО: Корректная сортировка ---
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
// Глобальный Map для дедупликации запросов
const ongoingRequests = new Map<string, Promise<Game[]>>();

interface GetGamesParams {
  date_from?: string;
  date_to?: string;
  league?: string;
  season?: string;
  teams?: string;
  useCache?: boolean;
  f2f?: boolean;
}

const getPersistentGamesKey = (cacheKey: string) => `${GAMES_STORAGE_PREFIX}${cacheKey}`;

const fetchAndCacheGames = async (
  params: GetGamesParams,
  cacheKey: string
): Promise<Game[]> => {
  await loadLeagues();
  await loadSeasons();
  await loadVenues();
  await loadTeams();

  const apiParams: Record<string, string> = {};
  for (const key in params) {
    if (key !== 'teams' && key !== 'useCache' && key !== 'f2f' && params[key as keyof typeof params] !== undefined) {
      apiParams[key] = String(params[key as keyof typeof params]);
    }
  }
  if (params.teams) {
    const teamList = params.teams.split(/[,| ]+/).filter(id => id.trim() !== '');
    apiParams.teams = teamList.join(params.f2f ? '|' : ',');
  }

  const response = await apiService.fetchEvents(apiParams);
  const games = await Promise.all(response.data.map(convertApiEventToGame));
  const sortedGames = sortUpcomingGames(games);
  const entry = { data: sortedGames, timestamp: Date.now() };
  gamesCache[cacheKey] = entry;
  await writePersistentCache(getPersistentGamesKey(cacheKey), sortedGames);
  dataAvailability.markNetworkSuccess();
  return sortedGames;
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
export async function getGames(params: GetGamesParams): Promise<Game[]> {
  const { useCache: _useCache, ...cacheParams } = params;
  const cacheKey = JSON.stringify(cacheParams);
  const now = Date.now();

  // 1. Проверяем кэш, если useCache !== false
  if (params.useCache !== false) {
    const cachedEntry = gamesCache[cacheKey];
    if (cachedEntry && now - cachedEntry.timestamp < GAMES_CACHE_DURATION) {
      console.log('✅ Returning games from memory cache for key:', cacheKey);
      return cachedEntry.data;
    }
  }

  // Постоянный кэш переживает перезапуск приложения. Возвращаем его сразу,
  // а актуализацию выполняем в фоне (stale-while-revalidate).
  if (params.useCache !== false) {
    const persistent = await readPersistentCache<Game[]>(getPersistentGamesKey(cacheKey));
    if (persistent) {
      gamesCache[cacheKey] = { data: persistent.data, timestamp: persistent.savedAt };
      dataAvailability.markCachedDataUsed();
      const network = await NetInfo.fetch();
      const canRefresh = network.isConnected !== false && network.isInternetReachable !== false;
      if (canRefresh && !ongoingRequests.has(cacheKey)) {
        const refresh = fetchAndCacheGames(params, cacheKey)
          .catch(error => {
            console.warn('Не удалось обновить сохранённые матчи:', error);
            dataAvailability.markCachedDataUsed('Не удалось обновить матчи');
            return persistent.data;
          })
          .finally(() => ongoingRequests.delete(cacheKey));
        ongoingRequests.set(cacheKey, refresh);
      }
      return persistent.data;
    }
  }

  const network = await NetInfo.fetch();
  if (network.isConnected === false || network.isInternetReachable === false) {
    throw new Error('Нет подключения к интернету и сохранённых матчей для этого раздела.');
  }

  // 2. Проверяем, не идёт ли уже такой запрос
  if (ongoingRequests.has(cacheKey)) {
    console.log('⏳ Waiting for ongoing request for key:', cacheKey);
    return await ongoingRequests.get(cacheKey)!;
  }

  // 3. Создаём новый запрос
  const requestPromise = (async (): Promise<Game[]> => {
    try {
      return await fetchAndCacheGames(params, cacheKey);
    } catch (error) {
      console.error('❌ Error in getGames:', error);
      const persistent = await readPersistentCache<Game[]>(getPersistentGamesKey(cacheKey));
      if (persistent) {
        gamesCache[cacheKey] = { data: persistent.data, timestamp: persistent.savedAt };
        dataAvailability.markCachedDataUsed('Не удалось обновить матчи');
        return persistent.data;
      }
      throw new Error('Не удалось получить данные матчей с сервера.', { cause: error });
    } finally {
      // Удаляем промис из ongoingRequests
      ongoingRequests.delete(cacheKey);
    }
  })();

  // Сохраняем промис в ongoingRequests
  ongoingRequests.set(cacheKey, requestPromise);

  return await requestPromise;
}

// Кэш для прошедших игр Динамо-Форвард
let pastGamesForTeam74Cache: { data: Game[]; timestamp: number } | null = null;

/**
 * Получает прошедшие игры ТОЛЬКО для команды 74 (Динамо-Форвард) за последние 3 года
 */
export async function getPastGamesForTeam74(): Promise<Game[]> {
  const now = Date.now();

  // Проверяем кэш
  if (pastGamesForTeam74Cache && now - pastGamesForTeam74Cache.timestamp < PAST_GAMES_CACHE_DURATION) {
    console.log('✅ Returning past games for team 74 from dedicated cache');
    return pastGamesForTeam74Cache.data;
  }

  try {
    console.log('Getting past games for team 74...');
    const nowDate = new Date();
    const pastDate = new Date(nowDate);
    pastDate.setFullYear(pastDate.getFullYear() - 3);
    const pastDateString = pastDate.toISOString().split('T')[0];
    const todayString = nowDate.toISOString().split('T')[0];

    // Запрашиваем через getGames (без кэширования в общем кэше, чтобы не мешать другим запросам)
    const games = await getGames({
      date_from: pastDateString,
      date_to: todayString,
      teams: '74',
      useCache: true,
    });

    // Сортируем по убыванию даты (сначала самые свежие)
    games.sort((a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime());

    // Сохраняем в свой кэш
    pastGamesForTeam74Cache = {
      data: games,
      timestamp: now,
    };

    console.log(`Loaded and cached ${games.length} past games for team 74`);
    return games;
  } catch (error) {
    console.error('Error loading past games for team 74:', error);
    return [];
  }
}


/**
 * Получает одну игру по ID с детальной информацией и кэшированием.
 * Сначала ищет в кэше общих игр (gamesCache и upcomingGamesMasterCache),
 * и только при отсутствии — запрашивает через event-by-id.
 * Если useCache = false — игнорирует ВСЕ кэши и всегда идёт в API.
 */
export const getGameById = async (id: string, useCache = true): Promise<Game | null> => {
  const now = Date.now();
  console.log(`🔍 getGameById called for ID ${id}, useCache=${useCache}`);

  // 🔥 Если useCache = false — пропускаем ВСЕ кэши и идём сразу в API
  if (!useCache) {
    console.log(`🚀 Bypassing all caches for ID ${id} (force refresh)`);
  } else {
    // 1. Проверяем кэш деталей (gameDetailsCache)
    if (gameDetailsCache[id]) {
      const cached = gameDetailsCache[id];
      if (now - cached.timestamp < GAME_DETAILS_CACHE_DURATION) {
        console.log(`✅ Game details for ID ${id} returned from gameDetailsCache`);
        return cached.data;
      }
    }

    const persistent = await readPersistentCache<Game>(`${GAME_DETAIL_STORAGE_PREFIX}${id}`);
    if (persistent) {
      gameDetailsCache[id] = { data: persistent.data, timestamp: persistent.savedAt };
      dataAvailability.markCachedDataUsed();
      return persistent.data;
    }

    // 2. Ищем игру в ОБЩЕМ кэше игр (gamesCache)
    for (const cacheKey in gamesCache) {
      const entry = gamesCache[cacheKey];
      if (entry && now - entry.timestamp < GAMES_CACHE_DURATION) {
        const found = entry.data.find(g => g.id === id);
        if (found) {
          console.log(`✅ Game ID ${id} found in gamesCache (key: ${cacheKey})`);
          gameDetailsCache[id] = { data: found, timestamp: now };
          return found;
        }
      }
    }

    // 3. Ищем в мастер-кэше предстоящих игр
    if (upcomingGamesMasterCache && now - upcomingGamesMasterCache.timestamp < UPCOMING_MASTER_CACHE_DURATION) {
      const found = upcomingGamesMasterCache.data.find(g => g.id === id);
      if (found) {
        console.log(`✅ Game ID ${id} found in upcomingGamesMasterCache`);
        gameDetailsCache[id] = { data: found, timestamp: now };
        return found;
      }
    }
  }

  // 4. Загружаем из API (либо потому что useCache=false, либо потому что не нашли в кэшах)
  try {
    await loadLeagues();
    await loadSeasons();
    await loadVenues();
    await loadTeams();

    const apiGameDetails = await apiService.fetchEventById(id);
    if (!apiGameDetails) {
      const persistent = await readPersistentCache<Game>(`${GAME_DETAIL_STORAGE_PREFIX}${id}`);
      return persistent?.data || null;
    }
    const game = await convertApiEventToGame(apiGameDetails);

    // Сохраняем в кэш только если useCache !== false
    if (useCache) {
      gameDetailsCache[id] = { data: game, timestamp: now };
      await writePersistentCache(`${GAME_DETAIL_STORAGE_PREFIX}${id}`, game);
      console.log(`💾 Game details for ID ${id} saved to memory cache (from API)`);
    } else {
      console.log(`💾 Game details for ID ${id} loaded from API (not cached due to useCache=false)`);
    }
    return game;
  } catch (error) {
    console.error(`❌ Failed to get game by ID ${id} from API:`, error);
    const persistent = await readPersistentCache<Game>(`${GAME_DETAIL_STORAGE_PREFIX}${id}`);
    if (persistent) {
      dataAvailability.markCachedDataUsed('Не удалось обновить данные матча');
      return persistent.data;
    }
    throw error;
  }
};

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
/**
 * Проверяет, действителен ли кэш
 */
function isCacheValid<T>(cache: CachedData<T> | null): boolean {
  if (!cache) return false;
  return Date.now() - cache.timestamp < CACHE_DURATION;
}
// --- КОНЕЦ ВСПОМОГАТЕЛЬНЫХ ФУНКЦИЙ ---


// --- Мастер-функция для получения предстоящих игр ---
//let upcomingGamesMasterCache: { data: Game[]; timestamp: number } | null = null;
//const UPCOMING_MASTER_CACHE_DURATION = 5 * 60 * 1000; // 5 минут
//let isMasterDataLoading = false; // <-- Эта переменная должна существовать
//let masterDataLoadPromise: Promise<Game[]> | null = null; // <-- И эта тоже
/**
* Мастер-функция для получения всех предстоящих игр команды 74.
* Делает единственный запрос к API и возвращает сырые данные.
* --- ОБНОВЛЕНО: Использует getGames с фильтром по дате ---
* Диапазон: с сегодня на 37 дней вперёд.
*/
export async function getUpcomingGamesMasterData(forceRefresh = false): Promise<Game[]> {
  const now = Date.now();

  // ✅ ВСЕГДА проверяем, не идёт ли уже загрузка (даже при forceRefresh)
  if (isMasterDataLoading && masterDataLoadPromise) {
    console.log('⏳ Master data loading is already in progress, waiting... (even with forceRefresh)');
    return await masterDataLoadPromise;
  }

  // Проверяем кэш, если не принудительное обновление
  if (!forceRefresh && isCacheValid(upcomingGamesMasterCache)) {
    console.log('✅ Returning master upcoming games data from cache');
    return upcomingGamesMasterCache!.data;
  }

  // Запускаем загрузку
  isMasterDataLoading = true;
  masterDataLoadPromise = (async () => {
    try {
      console.log(forceRefresh ? '🔄 Force-refreshing master upcoming games from API...' : '🔄 Loading master upcoming games from API...');
      const nowDate = new Date();
      const futureDate = new Date(nowDate);
      futureDate.setDate(futureDate.getDate() + 137);
      const todayString = nowDate.toISOString().split('T')[0];
      const futureDateString = futureDate.toISOString().split('T')[0];

      const games = await getGames({
        date_from: todayString,
        date_to: futureDateString,
        teams: '74',
        useCache: !forceRefresh,
      });

      const sortedGames = sortUpcomingGames(games);
      console.log(`Loaded ${sortedGames.length} master upcoming games`);

      // Обновляем кэш ВСЕГДА при успешной загрузке
      upcomingGamesMasterCache = {
        data: sortedGames,
        timestamp: now,
      };

      return sortedGames;
    } catch (error) {
      console.error('❌ Failed to load master upcoming games:', error);
      if (upcomingGamesMasterCache) {
        dataAvailability.markCachedDataUsed('Не удалось обновить предстоящие матчи');
        return upcomingGamesMasterCache.data;
      }
      throw error;
    } finally {
      isMasterDataLoading = false;
      masterDataLoadPromise = null;
    }
  })();

  return await masterDataLoadPromise;
}
// --- КОНЕЦ МАСТЕР-ФУНКЦИИ ---

// --- ЭКСПОРТИРУЕМЫЕ ФУНКЦИИ ---

/**
 * Получает текущую игру.
 * Игра считается текущей, если текущая дата попадает в диапазон:
 * с 00:00 предыдущего дня (относительно дня игры)
 * до 23:59 следующего дня (относительно дня игры).
 */
export async function getCurrentGame(forceRefresh = false): Promise<Game | null> {
  try {
    console.log('Getting current game from master data...');
    const allUpcomingGames = await getUpcomingGamesMasterData(forceRefresh);
    if (!allUpcomingGames || allUpcomingGames.length === 0) {
      return null;
    }

    const now = new Date();

    // Найдём игру, для которой текущая дата попадает в [gameDay - 1 день, gameDay + 1 день]
    const currentGame = allUpcomingGames.find(game => {
      const gameDate = new Date(game.event_date);
      // Нормализуем gameDate к 00:00 дня игры
      const gameDay = new Date(gameDate.getFullYear(), gameDate.getMonth(), gameDate.getDate());

      // Диапазон: с 00:00 предыдущего дня
      const rangeStart = new Date(gameDay);
      rangeStart.setDate(gameDay.getDate() - 1); // 00:00 дня перед игрой

      // ...по 23:59:59 следующего дня
      const rangeEnd = new Date(gameDay);
      rangeEnd.setDate(gameDay.getDate() + 2); // 00:00 через два дня
      rangeEnd.setMilliseconds(-1); // → 23:59:59.999 следующего дня

      return now >= rangeStart && now <= rangeEnd;
    });

    if (currentGame) {
      console.log('Found current game:', currentGame.id);
      return currentGame;
    }

    console.log('No current game found in ±1 day window');
    return null;
  } catch (error) {
    console.error('Error getting current game from master data:', error);
    return null;
  }
}


/**
 * Получает список будущих игр (до 5 штук), исключая игры, которые считаются "текущими".
 * "Текущая" игра определяется как игра, чья дата попадает в диапазон
 * с 00:00 предыдущего дня по 23:59 следующего дня.
 */
export async function getFutureGames(forceRefresh = false): Promise<Game[]> {
  try {
    console.log('Getting future games from master data...');
    const allUpcomingGames = await getUpcomingGamesMasterData(forceRefresh);
    if (!allUpcomingGames) {
      return [];
    }

    const now = new Date();

    // Фильтруем: оставляем ТОЛЬКО те игры, которые НЕ являются "текущими"
    const filteredGames = allUpcomingGames.filter(game => {
      const gameDate = new Date(game.event_date);
      // Нормализуем gameDate к 00:00 дня игры
      const gameDay = new Date(gameDate.getFullYear(), gameDate.getMonth(), gameDate.getDate());

      // Диапазон "актуальности" игры: с 00:00 предыдущего дня по 23:59 следующего дня
      const rangeStart = new Date(gameDay);
      rangeStart.setDate(gameDay.getDate() - 1); // 00:00 дня перед игрой

      const rangeEnd = new Date(gameDay);
      rangeEnd.setDate(gameDay.getDate() + 2); // 00:00 через два дня
      rangeEnd.setMilliseconds(-1); // → 23:59:59.999 следующего дня

      // Если текущая дата НЕ попадает в этот диапазон, игра идёт в "Ближайшие"
      return !(now >= rangeStart && now <= rangeEnd);
    });

    // Сортируем по дате (ближайшие первыми)
    filteredGames.sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime());

    // Берём первые 5
    const futureGames = filteredGames.slice(0, 5);
    console.log(`Loaded ${futureGames.length} future games (after excluding current)`);
    return futureGames;
  } catch (error) {
    console.error('Error loading future games from master data:', error);
    return [];
  }
}

/**
 * Получает количество предстоящих игр
 * --- ОБНОВЛЕНО: Использует apiService.fetchEvents напрямую для получения count ---
 */
export async function getUpcomingGamesCount(): Promise<number> {
  try {
    console.log('Getting upcoming games count...');
    // Попробовать использовать мастер-кэш
    const allUpcomingGames = await getUpcomingGamesMasterData(); // Это использует кэш
    if (allUpcomingGames) {
      const count = allUpcomingGames.length;
      console.log('Upcoming games count (from master cache):', count);
      return count;
    }

    // Если мастер-кэш недоступен по какой-то причине, сделать отдельный вызов
    const now = new Date();
    const futureDate = new Date(now);
    futureDate.setDate(futureDate.getDate() + 37);
    const todayString = now.toISOString().split('T')[0];
    const futureDateString = futureDate.toISOString().split('T')[0];

    const response = await apiService.fetchEvents({
      date_from: todayString,
      date_to: futureDateString,
      teams: '74',
    });
    const count = response.count || 0;
    console.log('Upcoming games count (from API):', count);
    return count;
  } catch (error) {
    console.error('Error getting upcoming games count:', error);
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

export const getStaleGameById = (id: string): Game | null => {
  const cached = gameDetailsCache[id];
  if (cached) {
    console.log(`🎮 Returning STALE game details for ID ${id} (bypassing TTL)`);
    return cached.data;
  }
  return null;
};

// Проверяет, есть ли в кэше свежие данные для игры
export const isGameDetailsCacheFresh = (id: string): boolean => {
  const cached = gameDetailsCache[id];
  if (!cached) return false;
  return Date.now() - cached.timestamp < GAME_DETAILS_CACHE_DURATION;
};

export const getGameDetailsCacheKeys = (): string[] => {
  return Object.keys(gameDetailsCache);
};

// Экспортируем функцию для получения арены по ID из кэша
export const getVenueById = (id: string): ApiVenue | null => {
  return cachedVenues[id] || null;
};

export { gameDetailsCache, GAME_DETAILS_CACHE_DURATION };
