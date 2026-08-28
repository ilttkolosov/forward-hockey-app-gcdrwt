import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getReferenceVersion,
  loadLeaguesFromDatabase,
  loadSeasonsFromDatabase,
  loadTeamsFromDatabase,
  loadVenuesFromDatabase,
  replaceLeagues,
  replaceSeasons,
  replaceTeams,
  replaceVenues,
  type ReferenceEntity,
} from '../database/repository';
import type { StartupConfig } from './startupApi';
import { apiService } from './apiService';
import { saveTeamList, verifyAndRestoreTeamLogos } from './teamStorage';
import { dataAvailability } from './dataAvailability';
import { refreshGameReferenceCaches } from '../data/gameData';
import { publishReferenceDataUpdate } from './referenceDataUpdates';

const versionFor = (config: StartupConfig, entity: ReferenceEntity): number => {
  const nestedVersion = config.data_versions?.[entity];
  if (nestedVersion !== undefined) return nestedVersion;
  if (entity === 'players') return config.players_version;
  if (entity === 'venues') return config.venues_version ?? config.reference_version ?? config.teams_version;
  if (entity === 'leagues') return config.leagues_version ?? config.reference_version ?? config.teams_version;
  if (entity === 'seasons') return config.seasons_version ?? config.reference_version ?? config.teams_version;
  return config.teams_version;
};

export const getConfiguredReferenceVersion = versionFor;

const REFERENCE_ENTITIES = ['teams', 'venues', 'leagues', 'seasons'] as const;
type StartupReferenceEntity = typeof REFERENCE_ENTITIES[number];

export interface ReferenceDataLocalState {
  localVersions: Record<StartupReferenceEntity, number>;
  targetVersions: Record<StartupReferenceEntity, number>;
  itemCounts: Record<StartupReferenceEntity, number>;
  changedEntities: StartupReferenceEntity[];
  missingEntities: StartupReferenceEntity[];
  canStartUpcomingImmediately: boolean;
}

export interface ReferenceDataRefreshResult {
  updatedEntities: StartupReferenceEntity[];
  failedEntities: StartupReferenceEntity[];
}

export interface ReferenceDataInitializationResult {
  teamsCount: number;
  backgroundRefresh: () => Promise<ReferenceDataRefreshResult>;
}

export const initializeReferenceData = async (
  config: StartupConfig,
  canUseNetwork: boolean,
  onLocalStateReady?: (state: ReferenceDataLocalState) => void
): Promise<ReferenceDataInitializationResult> => {
  let [teams, venues, leagues, seasons] = await Promise.all([
    loadTeamsFromDatabase(),
    loadVenuesFromDatabase(),
    loadLeaguesFromDatabase(),
    loadSeasonsFromDatabase(),
  ]);

  const localVersions = Object.fromEntries(await Promise.all(
    REFERENCE_ENTITIES.map(async entity => [
      entity,
      await getReferenceVersion(entity),
    ])
  )) as Record<StartupReferenceEntity, number>;

  const targetVersions = Object.fromEntries(
    REFERENCE_ENTITIES.map(entity => [entity, versionFor(config, entity)])
  ) as Record<StartupReferenceEntity, number>;
  const itemCounts: Record<StartupReferenceEntity, number> = {
    teams: teams.length,
    venues: venues.length,
    leagues: leagues.length,
    seasons: seasons.length,
  };
  const changedEntities = REFERENCE_ENTITIES.filter(
    entity => localVersions[entity] !== targetVersions[entity]
  );
  const missingEntities = REFERENCE_ENTITIES.filter(entity => itemCounts[entity] === 0);
  onLocalStateReady?.({
    localVersions,
    targetVersions,
    itemCounts,
    changedEntities,
    missingEntities,
    // An older complete snapshot is enough to render the application. A
    // version mismatch schedules a background replacement and never keeps the
    // splash screen mounted.
    canStartUpcomingImmediately: missingEntities.length === 0,
  });

  const refreshEntity = async (entity: StartupReferenceEntity): Promise<void> => {
    const targetVersion = versionFor(config, entity);
    if (entity === 'teams') {
      const fresh = await apiService.fetchTeamList(true);
      await replaceTeams(fresh, targetVersion);
      teams = fresh;
    } else if (entity === 'venues') {
      const fresh = (await apiService.fetchVenues()).data;
      await replaceVenues(fresh, targetVersion);
      venues = fresh;
    } else if (entity === 'leagues') {
      const fresh = (await apiService.fetchLeagues()).data;
      await replaceLeagues(fresh, targetVersion);
      leagues = fresh;
    } else {
      const fresh = (await apiService.fetchSeasons()).data;
      await replaceSeasons(fresh, targetVersion);
      // Seasons are historical reference data: a new API snapshot may contain
      // only additions, so rebuild every projection from the merged SQLite set.
      seasons = await loadSeasonsFromDatabase();
    }
    localVersions[entity] = targetVersion;
    console.log(`[Database] ${entity}: обновлено до версии ${targetVersion}`);
  };

  const persistSnapshots = async (): Promise<void> => {
    apiService.hydrateReferenceCaches({ teams, venues, leagues, seasons });
    const writes = await Promise.allSettled([
      saveTeamList(teams),
      AsyncStorage.setItem('teams_version', String(localVersions.teams)),
      AsyncStorage.setItem('api_venues_cache', JSON.stringify(venues)),
      AsyncStorage.setItem('api_leagues_cache', JSON.stringify(leagues)),
      AsyncStorage.setItem('api_seasons_cache', JSON.stringify(seasons)),
    ]);
    const failedWrites = writes.filter((result) => result.status === 'rejected');
    if (failedWrites.length > 0) {
      console.warn(
        `[Справочники] ${failedWrites.length} вспомогательных снимков AsyncStorage не сохранено; SQLite остаётся основным источником`,
      );
    }
  };

  // A missing table is the only case that must be completed before rendering;
  // otherwise the affected screens have no valid fallback at all.
  for (const entity of missingEntities) {
    if (!canUseNetwork) {
      throw new Error(`В локальной базе отсутствует справочник ${entity}`);
    }
    await refreshEntity(entity);
  }

  await persistSnapshots();
  REFERENCE_ENTITIES.forEach((entity) => {
    if (!changedEntities.includes(entity)) {
      console.log(`[Database] ${entity}: версия ${localVersions[entity]}, используется SQLite`);
    }
  });

  const backgroundRefresh = async (): Promise<ReferenceDataRefreshResult> => {
    const updatedEntities: StartupReferenceEntity[] = [];
    const failedEntities: StartupReferenceEntity[] = [];
    const refreshCandidates = canUseNetwork
      ? changedEntities.filter((entity) => !missingEntities.includes(entity))
      : [];

    for (const entity of refreshCandidates) {
      try {
        await refreshEntity(entity);
        updatedEntities.push(entity);
      } catch (error) {
        failedEntities.push(entity);
        dataAvailability.markCachedDataUsed(`Не удалось обновить справочник ${entity}`);
        console.warn(`[Database] ${entity}: фоновое обновление отложено`, error);
      }
    }

    if (updatedEntities.length) {
      await persistSnapshots();
    }
    // Logo discovery and downloads are deliberately detached from startup.
    // A failed optional logo must not suppress the revision event for the
    // reference rows that were already committed successfully.
    try {
      await verifyAndRestoreTeamLogos(teams);
    } catch (error) {
      console.warn('[Справочники] Проверка логотипов отложена:', error);
    }
    if (updatedEntities.length) {
      try {
        await refreshGameReferenceCaches();
      } catch (error) {
        console.warn('[Справочники] Не удалось сразу перестроить кэш матчей:', error);
      }
      publishReferenceDataUpdate(
        updatedEntities,
        Object.fromEntries(
          updatedEntities.map((entity) => [entity, localVersions[entity]]),
        ),
      );
    }
    return { updatedEntities, failedEntities };
  };

  return { teamsCount: teams.length, backgroundRefresh };
};
