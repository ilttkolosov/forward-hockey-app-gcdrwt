
/**
 * Season mapping and utilities for the hockey app
 */

export interface Season {
  id: number;
  name: string;
  start: Date;
  end: Date;
}

export const SEASONS_MAP: Record<number, Season> = {
  99: { id: 99, name: 'Сезон 2025-2026', start: new Date('2025-07-01'), end: new Date('2026-05-31') },
  76: { id: 76, name: 'Сезон 2024-2025', start: new Date('2024-07-01'), end: new Date('2025-05-31') },
  6:  { id: 6,  name: 'Сезон 2023-2024', start: new Date('2023-07-01'), end: new Date('2024-05-31') },
  41: { id: 41, name: 'Сезон 2022-2023', start: new Date('2022-07-01'), end: new Date('2023-05-31') }
};

/**
 * Gets season by date
 * @param dateString - Date string from API
 * @returns Season ID or null if not found
 */
export const getSeasonByDate = (dateString: string): number | null => {
  const gameDate = new Date(dateString.split(' ')[0]);
  for (const [id, season] of Object.entries(SEASONS_MAP)) {
    if (gameDate >= season.start && gameDate <= season.end) {
      return Number(id);
    }
  }
  return null; // если не попал ни в один сезон
};

/**
 * Gets season by ID from seasons field
 * @param seasonsString - Seasons string from API (e.g., "99: Сезон 2025-2026")
 * @returns Season ID or null if not found
 */
export const getSeasonIdFromString = (seasonsString: string | null): number | null => {
  if (!seasonsString) return null;
  
  // Extract ID from format "99: Сезон 2025-2026"
  const match = seasonsString.match(/^(\d+):/);
  if (match) {
    const seasonId = Number(match[1]);
    return SEASONS_MAP[seasonId] ? seasonId : null;
  }
  
  return null;
};

/**
 * Gets all available seasons sorted by newest first
 * @returns Array of season objects
 */
export const getAllSeasons = (): Season[] => {
  return Object.values(SEASONS_MAP).sort((a, b) => b.start.getTime() - a.start.getTime());
};
