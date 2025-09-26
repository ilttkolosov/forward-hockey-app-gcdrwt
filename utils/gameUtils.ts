
/**
 * Game utilities for season determination and filtering
 */

import { SEASONS_MAP, getSeasonByDate, getSeasonIdFromString } from './seasons';

export interface GameWithSeason {
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
  date: string;
  time: string;
  event_date: string;
  tournamentName: string | null;
  arenaName: string | null;
  seasonName: string | null;
  seasonId?: number; // Calculated season ID
}

/**
 * Determines the season for a game based on seasons field or event_date
 * @param game - Game object
 * @returns Season ID or null if not found
 */
export const determineGameSeason = (game: GameWithSeason): number | null => {
  // First, try to get season from seasons field
  if (game.seasonName) {
    const seasonId = getSeasonIdFromString(game.seasonName);
    if (seasonId !== null) {
      return seasonId;
    }
  }
  
  // If seasons field is null or not found in SEASONS_MAP, calculate by date
  return getSeasonByDate(game.event_date);
};

/**
 * Enriches games with season information
 * @param games - Array of games
 * @returns Array of games with season IDs
 */
export const enrichGamesWithSeasons = (games: GameWithSeason[]): GameWithSeason[] => {
  return games.map(game => ({
    ...game,
    seasonId: determineGameSeason(game)
  }));
};

/**
 * Filters games by season ID
 * @param games - Array of games with season IDs
 * @param seasonId - Season ID to filter by
 * @returns Filtered array of games
 */
export const filterGamesBySeason = (games: GameWithSeason[], seasonId: number): GameWithSeason[] => {
  return games.filter(game => game.seasonId === seasonId);
};

/**
 * Gets unique seasons from games array
 * @param games - Array of games with season IDs
 * @returns Array of unique season IDs sorted by newest first
 */
export const getUniqueSeasonsFromGames = (games: GameWithSeason[]): number[] => {
  const seasonIds = new Set<number>();
  
  games.forEach(game => {
    if (game.seasonId !== null && game.seasonId !== undefined) {
      seasonIds.add(game.seasonId);
    }
  });
  
  // Sort by season start date (newest first)
  return Array.from(seasonIds).sort((a, b) => {
    const seasonA = SEASONS_MAP[a];
    const seasonB = SEASONS_MAP[b];
    if (!seasonA || !seasonB) return 0;
    return seasonB.start.getTime() - seasonA.start.getTime();
  });
};
