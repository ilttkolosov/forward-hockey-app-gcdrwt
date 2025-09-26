
import { apiService } from '../services/apiService';
import { Game, ApiPastEvent, ApiTeam } from '../types';
import { colors } from '../styles/commonStyles';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCachedTeamLogo } from '../utils/teamLogos';
import { formatGameDate } from '../utils/dateUtils';

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
    event_date: string;
}

const CACHE_DURATION = 60 * 60 * 1000; // 1 hour
const PAST_GAMES_CACHE_KEY = 'past_games';
const PAST_GAMES_COUNT_CACHE_KEY = 'past_games_count';

const isCacheValid = (timestamp: number): boolean => {
    return Date.now() - timestamp < CACHE_DURATION;
};

const getCachedData = async <T>(key: string): Promise<CachedData<T> | null> => {
    try {
        const cachedData = await AsyncStorage.getItem(key);
        if (cachedData) {
            return JSON.parse(cachedData) as CachedData<T>;
        }
        return null;
    } catch (error) {
        console.error("Error retrieving cached data:", error);
        return null;
    }
};

const setCachedData = async <T>(key: string, data: T): Promise<void> => {
    try {
        const cache: CachedData<T> = {
            data: data,
            timestamp: Date.now(),
        };
        await AsyncStorage.setItem(key, JSON.stringify(cache));
    } catch (error) {
        console.error("Error setting cached data:", error);
    }
};

const parseGoals = (goalsString: string | number): number => {
    const goals = typeof goalsString === 'string' ? parseInt(goalsString) : goalsString;
    return isNaN(goals) ? 0 : goals;
};

// Universal function to handle both string and string[] for teams
const parseTeamIds = (teams: string | string[]): string[] => {
    if (Array.isArray(teams)) {
        // If it's already an array, filter out null/undefined values and convert to strings
        return teams.filter(teamId => teamId !== null && teamId !== undefined).map(String);
    }
    // If it's a string, split by comma and trim
    return (teams || '').split(',').map(s => s.trim()).filter(s => s !== '');
};

// Updated parseIdNameString to handle multiple formats
const parseIdNameString = (idNameString: any): { id: string; name: string } | null => {
    if (!idNameString) {
        return null;
    }

    // Handle array of objects - take the first element
    if (Array.isArray(idNameString)) {
        if (idNameString.length === 0) {
            return null;
        }
        idNameString = idNameString[0]; // Take the first element
    }

    // Handle object with id and name properties
    if (typeof idNameString === 'object' && idNameString !== null && 'id' in idNameString && 'name' in idNameString) {
        return {
            id: String(idNameString.id).trim(),
            name: String(idNameString.name).trim()
        };
    }

    // Handle string format "ID: Название"
    if (typeof idNameString === 'string') {
        const [id, ...nameParts] = idNameString.split(':');
        const name = nameParts.join(':').trim();
        return {
            id: id.trim(),
            name: name
        };
    }

    console.warn("Unexpected format for idNameString:", idNameString);
    return null;
};

// Updated to use event_date and new date formatting utility
const formatDateTimeWithoutSeconds = (eventDate: string): { date: string; time: string } => {
    try {
        const date = new Date(eventDate);
        
        // Check if the date is valid
        if (isNaN(date.getTime())) {
            console.error('Invalid event date:', eventDate);
            return { date: eventDate, time: '00:00' };
        }
        
        const dateString = date.toLocaleDateString('ru-RU');
        const timeString = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        return { date: dateString, time: timeString };
    } catch (error) {
        console.error('Error formatting event date:', error);
        return { date: eventDate, time: '00:00' };
    }
};

const fetchTeamSafely = async (teamId: string): Promise<ApiTeam> => {
    try {
        const teamData = await apiService.fetchTeam(teamId);
        return teamData;
    } catch (error) {
        console.error(`Error fetching team ${teamId}:`, error);
        return {
            id: teamId,
            name: 'Команда не найдена',
            logo_url: null,
        };
    }
};

// Helper function to extract outcome from array or string
const extractOutcome = (outcome: string | string[]): string => {
    if (Array.isArray(outcome)) {
        return outcome.length > 0 ? outcome[0] : '';
    }
    return outcome || '';
};

const convertApiPastEventToEnrichedGame = async (apiEvent: ApiPastEvent): Promise<any> => {
    console.log('Processing API event:', apiEvent);
    
    const teamIds = parseTeamIds(apiEvent.teams);
    console.log('Parsed team IDs:', teamIds);

    // Check if we have at least 2 teams
    if (teamIds.length < 2) {
        console.warn(`Skipping game ${apiEvent.event_id}: Invalid team IDs - need at least 2 teams, got ${teamIds.length}`);
        return null;
    }

    const [homeTeamId, awayTeamId] = teamIds;

    try {
        const [homeTeamData, awayTeamData] = await Promise.all([
            fetchTeamSafely(homeTeamId),
            fetchTeamSafely(awayTeamId)
        ]);

        // Cache team logos
        const homeTeamLogo = await getCachedTeamLogo(homeTeamId, homeTeamData.logo_url || '');
        const awayTeamLogo = await getCachedTeamLogo(awayTeamId, awayTeamData.logo_url || '');

        const homeGoals = parseGoals(apiEvent.results?.[homeTeamId]?.goals || 0);
        const awayGoals = parseGoals(apiEvent.results?.[awayTeamId]?.goals || 0);

        // Extract outcomes, handling both array and string formats
        const homeOutcome = extractOutcome(apiEvent.results?.[homeTeamId]?.outcome);
        const awayOutcome = extractOutcome(apiEvent.results?.[awayTeamId]?.outcome);

        // Use event_date instead of date
        const { date, time } = formatDateTimeWithoutSeconds(apiEvent.event_date);

        console.log(`Processing game ${apiEvent.event_id}: ${homeTeamData.name} vs ${awayTeamData.name} (${homeGoals}:${awayGoals})`);

        return {
            id: String(apiEvent.event_id),
            event_id: String(apiEvent.event_id),
            homeTeam: homeTeamData.name,
            awayTeam: awayTeamData.name,
            homeTeamLogo: homeTeamLogo,
            awayTeamLogo: awayTeamLogo,
            homeGoals: homeGoals,
            awayGoals: awayGoals,
            homeOutcome: homeOutcome,
            awayOutcome: awayOutcome,
            date: date,
            time: time,
            event_date: apiEvent.event_date,
            tournamentName: parseIdNameString(apiEvent.leagues)?.name || null,
            arenaName: parseIdNameString(apiEvent.venues)?.name || null,
            seasonName: parseIdNameString(apiEvent.seasons)?.name || null
        };
    } catch (error) {
        console.error(`Error fetching team data for game ${apiEvent.event_id}:`, error);
        return null;
    }
};

const fetchPastGames = async (): Promise<any[]> => {
    try {
        console.log('Fetching past events from API...');
        const apiResponse = await apiService.fetchPastEvents();
        const apiEvents = apiResponse.data || apiResponse; // Handle both response formats
        
        console.log(`API returned ${apiEvents.length} past events`);
        
        const enrichedGames = [];

        for (const apiEvent of apiEvents) {
            const enrichedGame = await convertApiPastEventToEnrichedGame(apiEvent);
            if (enrichedGame) {
                enrichedGames.push(enrichedGame);
            }
        }

        await setCachedData(PAST_GAMES_CACHE_KEY, enrichedGames);
        console.log(`Successfully processed ${enrichedGames.length} past games from API`);
        return enrichedGames;
    } catch (error) {
        console.error("Error fetching past games:", error);
        const cachedData = await getCachedData<any[]>(PAST_GAMES_CACHE_KEY);
        if (cachedData && isCacheValid(cachedData.timestamp)) {
            console.log("Returning cached past games");
            return cachedData.data;
        }
        return [];
    }
};

const fetchPastGamesCount = async (): Promise<number> => {
    try {
        const apiResponse = await apiService.fetchPastEvents();
        const count = apiResponse.count || (apiResponse.data ? apiResponse.data.length : 0);
        await setCachedData(PAST_GAMES_COUNT_CACHE_KEY, count);
        console.log(`Fetched past games count: ${count}`);
        return count;
    } catch (error) {
        console.error("Error fetching past games count:", error);
        const cachedData = await getCachedData<number>(PAST_GAMES_COUNT_CACHE_KEY);
        if (cachedData && isCacheValid(cachedData.timestamp)) {
            console.log("Returning cached past games count");
            return cachedData.data;
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
            return colors.success;
        case 'loss':
            return colors.error;
        case 'nich':
            return colors.warning;
        default:
            return colors.text;
    }
};

export {
    isCacheValid,
    getCachedData,
    setCachedData,
    parseGoals,
    parseTeamIds,
    parseIdNameString,
    formatDateTimeWithoutSeconds,
    fetchTeamSafely,
    convertApiPastEventToEnrichedGame,
    fetchPastGames,
    fetchPastGamesCount,
    getOutcomeText,
    getOutcomeColor,
};
