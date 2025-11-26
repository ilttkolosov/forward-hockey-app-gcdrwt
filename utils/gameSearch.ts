// src/utils/gameSearch.ts
import { Game } from '../types';

/**
 * Выполняет поиск по играм
 * @param games — массив всех игр
 * @param query — поисковый запрос (регистронезависимый)
 * @returns отфильтрованный массив
 */
export const searchGames = (games: Game[], query: string): Game[] => {
  if (!query.trim()) return [];
  const normalizedQuery = query.trim().toLowerCase();

  return games.filter(game => {
    // Названия команд
    const homeTeamName = (game.homeTeam?.name || '').toLowerCase();
    const awayTeamName = (game.awayTeam?.name || '').toLowerCase();

    // Названия через fallback-поля (на случай, если homeTeam/awayTeam не загружены)
    const homeTeamFallback = (game.homeTeamLogo?.split('/').pop()?.replace(/\.[^/.]+$/, '') || '').toLowerCase();
    const awayTeamFallback = (game.awayTeamLogo?.split('/').pop()?.replace(/\.[^/.]+$/, '') || '').toLowerCase();

    // Турнир / лига
    const tournament = (game.tournament || game.league?.name || game.league_name || '').toLowerCase();

    // Дата (YYYY-MM-DD)
    const date = game.event_date.split('T')[0];

    // Счёт
    const score = game.homeScore !== undefined && game.awayScore !== undefined
      ? `${game.homeScore}:${game.awayScore}`
      : '';

    // Дополнительно: venue, video, статус
    const venue = (game.venue?.name || game.venue_name || '').toLowerCase();
    const video = (game.videoUrl || game.sp_video || '').toLowerCase();

    return (
      homeTeamName.includes(normalizedQuery) ||
      awayTeamName.includes(normalizedQuery) ||
      homeTeamFallback.includes(normalizedQuery) ||
      awayTeamFallback.includes(normalizedQuery) ||
      tournament.includes(normalizedQuery) ||
      date.includes(normalizedQuery) ||
      score.includes(normalizedQuery) ||
      venue.includes(normalizedQuery) ||
      video.includes(normalizedQuery)
    );
  });
};