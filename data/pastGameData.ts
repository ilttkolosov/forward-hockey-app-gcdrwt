
import { apiService } from '../services/apiService';
import { Game, ApiPastEvent, ApiTeam } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../styles/commonStyles';

interface CachedData<T> {
    data: T;
    timestamp: number;
}

interface EnrichedPastGame {
    id: string;
    event_id: string;
    homeTeam: string;
    awayTeam: string;
    homeTeamLogo: string;
    awayTeamLogo: string;
    homeGoals: number;
    awayGoals: number;
    homeOutcome: string;
    awayOutcome: string;
    tournamentName: string | null;
    arenaName: string | null;
    seasonName: string | null;
    date: string;
    time: string;
    event_date: string; // Добавляем для сортировки
}

const CACHE_DURATION = 60 * 60 * 1000; // 1 hour
const PAST_GAMES_CACHE_KEY = 'past_games';
const PAST_GAMES_COUNT_CACHE_KEY = 'past_games_count';

const isCacheValid = (timestamp: number): boolean => {
    return (Date.now() - timestamp) < CACHE_DURATION;
};

const getCachedData = async <T>(key: string): Promise<CachedData<T> | null> => {
    try {
        const cachedString = await AsyncStorage.getItem(key);
        if (cachedString) {
            return JSON.parse(cachedString) as CachedData<T>;
        }
        return null;
    } catch (error) {
        console.error("Error retrieving cached data:", error);
        return null;
    }
};

const setCachedData = async <T>(key: string, data: T): Promise<void> => {
    try {
        const cachedData: CachedData<T> = {
            data: data,
            timestamp: Date.now()
        };
        await AsyncStorage.setItem(key, JSON.stringify(cachedData));
    } catch (error) {
        console.error("Error caching data:", error);
    }
};

const parseGoals = (goalsString: string | number): number => {
    const parsed = parseInt(String(goalsString), 10);
    return isNaN(parsed) ? 0 : parsed;
};

const parseTeamIds = (teamsString: string): string[] => {
    if (!teamsString) {
        console.warn('Empty teams string provided');
        return [];
    }
    return teamsString.split(',').map(s => s.trim()).filter(Boolean);
};

const parseIdNameString = (idNameString: string | null): { id: string, name: string } | null => {
    if (!idNameString || idNameString === 'null') {
        return null;
    }
    const [id, ...nameParts] = idNameString.split(':');
    return {
        id: id.trim(),
        name: nameParts.join(':').trim()
    };
};

const formatDateTimeWithoutSeconds = (eventDate: string): { date: string, time: string } => {
    try {
        const [datePart, timePart] = eventDate.split(' ');
        
        let formattedTime = '';
        if (timePart) {
            const timeParts = timePart.split(':');
            if (timeParts.length >= 2) {
                formattedTime = `${timeParts[0]}:${timeParts[1]}`;
            }
        }
        
        // Don't show time if it's 00:00 (unknown time)
        if (formattedTime === '00:00') {
            formattedTime = '';
        }
        
        return {
            date: datePart || eventDate,
            time: formattedTime
        };
    } catch (error) {
        console.error('Error formatting date/time:', error);
        return {
            date: eventDate,
            time: ''
        };
    }
};

const fetchTeamSafely = async (teamId: string): Promise<ApiTeam> => {
    try {
        if (!teamId) {
            throw new Error('Empty team ID');
        }
        const team = await apiService.fetchTeam(teamId);
        console.log(`Successfully fetched team ${teamId}:`, team.name);
        return team;
    } catch (error) {
        console.warn(`Failed to fetch team ${teamId}, using fallback:`, error);
        return {
            id: teamId,
            name: 'Команда не найдена',
            logo_url: ''
        };
    }
};

const convertApiPastEventToEnrichedGame = async (apiEvent: ApiPastEvent): Promise<EnrichedPastGame | null> => {
    console.log(`Processing past event ${apiEvent.event_id}...`);
    
    // Проверяем наличие команд
    const teamIds = parseTeamIds(apiEvent.teams);
    console.log(`Event ${apiEvent.event_id} teams string: "${apiEvent.teams}" -> parsed IDs:`, teamIds);

    if (teamIds.length !== 2) {
        console.warn(`Skipping event ${apiEvent.event_id}: Invalid number of teams (${teamIds.length}). Expected 2.`);
        return null;
    }

    const [homeTeamId, awayTeamId] = teamIds;
    console.log(`Event ${apiEvent.event_id}: Home team ID: ${homeTeamId}, Away team ID: ${awayTeamId}`);

    try {
        // Безопасная загрузка команд параллельно
        const [homeTeamData, awayTeamData] = await Promise.all([
            fetchTeamSafely(homeTeamId),
            fetchTeamSafely(awayTeamId)
        ]);

        // Обработка результатов с точным сопоставлением по ID команд
        let homeGoals = 0;
        let awayGoals = 0;
        let homeOutcome = '';
        let awayOutcome = '';

        if (apiEvent.results && typeof apiEvent.results === 'object') {
            const homeResult = apiEvent.results[homeTeamId];
            const awayResult = apiEvent.results[awayTeamId];

            if (homeResult) {
                homeGoals = parseGoals(homeResult.goals);
                homeOutcome = homeResult.outcome || '';
                console.log(`Home team ${homeTeamId} result: ${homeGoals} goals, outcome: ${homeOutcome}`);
            } else {
                console.warn(`No results found for home team ${homeTeamId} in event ${apiEvent.event_id}`);
            }

            if (awayResult) {
                awayGoals = parseGoals(awayResult.goals);
                awayOutcome = awayResult.outcome || '';
                console.log(`Away team ${awayTeamId} result: ${awayGoals} goals, outcome: ${awayOutcome}`);
            } else {
                console.warn(`No results found for away team ${awayTeamId} in event ${apiEvent.event_id}`);
            }
        } else {
            console.warn(`No results object found for event ${apiEvent.event_id}`);
        }

        // Парсинг дополнительной информации
        const leagueInfo = parseIdNameString(apiEvent.leagues);
        const seasonInfo = parseIdNameString(apiEvent.seasons);
        const venueInfo = parseIdNameString(apiEvent.venues);

        const { date, time } = formatDateTimeWithoutSeconds(apiEvent.event_date);

        const enrichedGame: EnrichedPastGame = {
            id: String(apiEvent.event_id),
            event_id: String(apiEvent.event_id),
            homeTeam: homeTeamData.name,
            awayTeam: awayTeamData.name,
            homeTeamLogo: homeTeamData.logo_url || '',
            awayTeamLogo: awayTeamData.logo_url || '',
            homeGoals: homeGoals,
            awayGoals: awayGoals,
            homeOutcome: homeOutcome,
            awayOutcome: awayOutcome,
            date: date,
            time: time,
            event_date: apiEvent.event_date, // Сохраняем для сортировки
            tournamentName: leagueInfo?.name || null,
            arenaName: venueInfo?.name || null,
            seasonName: seasonInfo?.name || null
        };

        console.log(`Successfully processed event ${apiEvent.event_id}: ${homeTeamData.name} ${homeGoals}:${awayGoals} ${awayTeamData.name}`);
        return enrichedGame;

    } catch (error) {
        console.error(`Error processing event ${apiEvent.event_id}:`, error);
        return null;
    }
};

const fetchPastGames = async (): Promise<EnrichedPastGame[]> => {
    console.log('=== Starting fetchPastGames ===');
    
    try {
        // Проверяем кэш
        const cached = await getCachedData<EnrichedPastGame[]>(PAST_GAMES_CACHE_KEY);
        if (cached && isCacheValid(cached.timestamp)) {
            console.log(`Returning ${cached.data.length} past games from cache`);
            return cached.data;
        }

        console.log('Fetching past games from API...');
        const response = await apiService.fetchPastEvents();
        
        if (!response.data || !Array.isArray(response.data)) {
            console.warn('No past games data available or invalid format');
            return [];
        }

        console.log(`API returned ${response.data.length} past events to process`);
        
        const enrichedGames: EnrichedPastGame[] = [];
        let processedCount = 0;
        let skippedCount = 0;

        // Обрабатываем события последовательно для лучшего контроля ошибок
        for (const apiEvent of response.data) {
            try {
                const enrichedGame = await convertApiPastEventToEnrichedGame(apiEvent);
                if (enrichedGame) {
                    enrichedGames.push(enrichedGame);
                    processedCount++;
                } else {
                    skippedCount++;
                }
            } catch (error) {
                console.error(`Failed to process event ${apiEvent.event_id}:`, error);
                skippedCount++;
            }
        }

        // Сортируем по дате (новые сначала)
        enrichedGames.sort((a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime());

        // Кэшируем результат
        await setCachedData(PAST_GAMES_CACHE_KEY, enrichedGames);

        console.log(`=== fetchPastGames completed ===`);
        console.log(`Processed: ${processedCount} games`);
        console.log(`Skipped: ${skippedCount} games`);
        console.log(`Total returned: ${enrichedGames.length} games`);

        return enrichedGames;
    } catch (error) {
        console.error('Error in fetchPastGames:', error);
        
        // Пытаемся вернуть кэшированные данные в случае ошибки
        const cached = await getCachedData<EnrichedPastGame[]>(PAST_GAMES_CACHE_KEY);
        if (cached) {
            console.log(`Returning ${cached.data.length} past games from stale cache due to error`);
            return cached.data;
        }
        
        return [];
    }
};

const fetchPastGamesCount = async (): Promise<number> => {
    try {
        // Проверяем кэш
        const cached = await getCachedData<number>(PAST_GAMES_COUNT_CACHE_KEY);
        if (cached && isCacheValid(cached.timestamp)) {
            console.log('Returning past games count from cache:', cached.data);
            return cached.data;
        }

        console.log('Fetching past games count from API...');
        const response = await apiService.fetchPastEvents();
        const count = response.count || 0;

        // Кэшируем количество
        await setCachedData(PAST_GAMES_COUNT_CACHE_KEY, count);

        console.log('Past games count from API:', count);
        return count;
    } catch (error) {
        console.error('Error fetching past games count:', error);
        
        // Пытаемся вернуть кэшированное значение
        const cached = await getCachedData<number>(PAST_GAMES_COUNT_CACHE_KEY);
        if (cached) {
            console.log('Returning past games count from stale cache:', cached.data);
            return cached.data;
        }
        
        return 0;
    }
};

const getOutcomeText = (outcome: string): string => {
    switch (outcome) {
        case 'win':
            return 'Победа';
        case 'loss':
            return 'Поражение';
        case 'nich':
            return 'Ничья';
        default:
            return '';
    }
};

const getOutcomeColor = (outcome: string): string => {
    switch (outcome) {
        case 'win':
            return colors.success || '#4CAF50';
        case 'loss':
            return colors.error || '#F44336';
        case 'nich':
            return colors.warning || '#FF9800';
        default:
            return colors.textSecondary || '#757575';
    }
};

export {
    fetchPastGames,
    fetchPastGamesCount,
    getOutcomeText,
    getOutcomeColor
};
