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
import { saveTeamList } from './teamStorage';
import { dataAvailability } from './dataAvailability';

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

export const initializeReferenceData = async (
  config: StartupConfig,
  canUseNetwork: boolean,
  onLocalStateReady?: (state: ReferenceDataLocalState) => void
): Promise<{ teamsCount: number }> => {
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
  const requiresNetworkRefresh = canUseNetwork
    && (changedEntities.length > 0 || missingEntities.length > 0);

  onLocalStateReady?.({
    localVersions,
    targetVersions,
    itemCounts,
    changedEntities,
    missingEntities,
    canStartUpcomingImmediately: missingEntities.length === 0 && !requiresNetworkRefresh,
  });

  const update = async <T>(
    entity: StartupReferenceEntity,
    current: T[],
    fetcher: () => Promise<T[]>,
    replace: (items: T[], version: number) => Promise<void>
  ): Promise<T[]> => {
    const targetVersion = versionFor(config, entity);
    const shouldUpdate = canUseNetwork && targetVersion !== localVersions[entity];
    if (!shouldUpdate && current.length > 0) {
      console.log(`[Database] ${entity}: версия ${localVersions[entity]}, используется SQLite`);
      return current;
    }
    if (!canUseNetwork) {
      if (current.length > 0) return current;
      throw new Error(`В локальной базе отсутствует справочник ${entity}`);
    }
    try {
      const fresh = await fetcher();
      await replace(fresh, targetVersion);
      console.log(`[Database] ${entity}: обновлено до версии ${targetVersion}`);
      return fresh;
    } catch (error) {
      if (current.length === 0) throw error;
      dataAvailability.markCachedDataUsed(`Не удалось обновить справочник ${entity}`);
      console.warn(`[Database] ${entity}: используется локальная версия после ошибки`, error);
      return current;
    }
  };

  teams = await update('teams', teams, () => apiService.fetchTeamList(), replaceTeams);
  venues = await update('venues', venues, async () => (await apiService.fetchVenues()).data, replaceVenues);
  leagues = await update('leagues', leagues, async () => (await apiService.fetchLeagues()).data, replaceLeagues);
  seasons = await update('seasons', seasons, async () => (await apiService.fetchSeasons()).data, replaceSeasons);

  apiService.hydrateReferenceCaches({ teams, venues, leagues, seasons });
  await Promise.all([
    saveTeamList(teams),
    AsyncStorage.setItem('teams_version', String(versionFor(config, 'teams'))),
    AsyncStorage.setItem('api_venues_cache', JSON.stringify(venues)),
    AsyncStorage.setItem('api_leagues_cache', JSON.stringify(leagues)),
    AsyncStorage.setItem('api_seasons_cache', JSON.stringify(seasons)),
  ]);
  return { teamsCount: teams.length };
};
