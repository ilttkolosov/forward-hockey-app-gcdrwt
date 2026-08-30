import { getGames, getUpcomingGamesMasterData } from '../data/gameData';
import { getActiveStartupConfig } from './startupConfigRuntime';
import type { StartupConfig } from './startupApi';
import {
  fetchTournamentConfig,
  getConfiguredTournamentVersion,
  type TournamentConfig,
} from './tournamentsApi';
import { publishReferenceDataUpdate } from './referenceDataUpdates';

type RefreshReason = 'home_button' | 'startup';

export interface PrimaryDataRefreshResult {
  upcomingGames: number;
  tournamentGames: number;
  tournamentId: string | null;
}

const homeScrollListeners = new Set<() => void>();
const tournamentTableRefreshes = new Map<string, Promise<TournamentConfig>>();
let primaryDataRefreshPromise: Promise<PrimaryDataRefreshResult> | null = null;

export const subscribeHomeScrollToTop = (listener: () => void): (() => void) => {
  homeScrollListeners.add(listener);
  return () => homeScrollListeners.delete(listener);
};

export const requestHomeScrollToTop = (): void => {
  homeScrollListeners.forEach(listener => {
    try {
      listener();
    } catch (error) {
      console.warn('[Главная] Не удалось прокрутить страницу наверх:', error);
    }
  });
};

const getCurrentTournamentId = (config: StartupConfig): string | null => {
  const tournamentId = String(config.tournamentsNow?.[0]?.tournament_ID || '').trim();
  return /^\d+$/.test(tournamentId) ? tournamentId : null;
};

/**
 * Выполняет не более одного одновременного запроса таблицы для турнира.
 * Эту функцию совместно используют стартовая синхронизация и центральная кнопка.
 */
export const refreshCurrentTournamentTable = (
  config: StartupConfig,
  reason: RefreshReason,
): Promise<TournamentConfig> | null => {
  const tournamentId = getCurrentTournamentId(config);
  if (!tournamentId) return null;

  const running = tournamentTableRefreshes.get(tournamentId);
  if (running) {
    console.log(`[Обновление данных] Таблица турнира ${tournamentId} уже обновляется; повторный запрос пропущен`);
    return running;
  }

  const targetVersion = getConfiguredTournamentVersion(config);
  const refresh = fetchTournamentConfig(tournamentId, targetVersion)
    .then(tournamentConfig => {
      console.log(
        `[Обновление данных] Таблица текущего турнира ${tournamentId} обновлена `
        + `(причина=${reason}, строк=${tournamentConfig.tables.length})`
      );
      return tournamentConfig;
    })
    .finally(() => {
      tournamentTableRefreshes.delete(tournamentId);
    });

  tournamentTableRefreshes.set(tournamentId, refresh);
  return refresh;
};

/**
 * Центральная кнопка обновляет три набора данных. Пока цикл выполняется,
 * повторные нажатия получают тот же Promise и не создают новые API-запросы.
 */
export const refreshPrimaryDataInBackground = (): Promise<PrimaryDataRefreshResult> => {
  if (primaryDataRefreshPromise) {
    console.log('[Обновление данных] Цикл центральной кнопки уже выполняется');
    return primaryDataRefreshPromise;
  }

  primaryDataRefreshPromise = (async () => {
    const startedAt = Date.now();
    const config = getActiveStartupConfig();
    console.log('[Обновление данных] Центральная кнопка: фоновое обновление запущено');

    const upcomingPromise = getUpcomingGamesMasterData(true);
    const tournamentId = config ? getCurrentTournamentId(config) : null;
    const tournamentPromise = config && tournamentId
      ? (async () => {
          const tablePromise = refreshCurrentTournamentTable(config, 'home_button');
          const tournamentConfig = tablePromise ? await tablePromise : null;
          if (!tournamentConfig?.league_id || !tournamentConfig?.season_id) return 0;

          // Запрос запускается до публикации ревизии. Поэтому открытые экраны,
          // реагирующие на обновление, присоединяются к тому же сетевому Promise.
          const gamesPromise = getGames({
            league: String(tournamentConfig.league_id),
            season: String(tournamentConfig.season_id),
            useCache: false,
          });
          publishReferenceDataUpdate(
            ['tournaments'],
            { tournaments: getConfiguredTournamentVersion(config) },
          );
          return (await gamesPromise).length;
        })()
      : Promise.resolve(0);

    const [upcomingResult, tournamentResult] = await Promise.allSettled([
      upcomingPromise,
      tournamentPromise,
    ]);
    if (upcomingResult.status === 'rejected') {
      console.warn('[Обновление данных] Не удалось обновить актуальные игры:', upcomingResult.reason);
    }
    if (tournamentResult.status === 'rejected') {
      console.warn('[Обновление данных] Не удалось обновить текущий турнир:', tournamentResult.reason);
    }

    const result: PrimaryDataRefreshResult = {
      upcomingGames: upcomingResult.status === 'fulfilled' ? upcomingResult.value.length : 0,
      tournamentGames: tournamentResult.status === 'fulfilled' ? tournamentResult.value : 0,
      tournamentId,
    };
    console.log(
      `[Обновление данных] Центральная кнопка: цикл завершён за ${Date.now() - startedAt} мс; `
      + `актуальных игр=${result.upcomingGames}, турнир=${tournamentId || 'не задан'}, `
      + `игр турнира=${result.tournamentGames}`
    );
    return result;
  })().finally(() => {
    primaryDataRefreshPromise = null;
  });

  return primaryDataRefreshPromise;
};
