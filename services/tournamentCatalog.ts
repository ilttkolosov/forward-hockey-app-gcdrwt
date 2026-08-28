import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  loadTournamentCatalogFromDatabase,
  replaceTournamentCatalog,
  type TournamentCatalog,
  type TournamentCatalogItem,
} from '../database/repository';
import { publishReferenceDataUpdate } from './referenceDataUpdates';

const TOURNAMENTS_NOW_KEY = 'tournaments_now';
const TOURNAMENTS_PAST_KEY = 'tournaments_past';
const CURRENT_TOURNAMENT_ID_KEY = 'current_tournament_id';

const parseLegacyList = (raw: string | null): TournamentCatalogItem[] => {
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const loadTournamentCatalog = async (): Promise<TournamentCatalog> => {
  const stored = await loadTournamentCatalogFromDatabase();
  if (stored.current.length > 0 || stored.past.length > 0) return stored;

  // Upgrade existing installations without losing the last usable snapshot.
  const [[, nowJson], [, pastJson]] = await AsyncStorage.multiGet([
    TOURNAMENTS_NOW_KEY,
    TOURNAMENTS_PAST_KEY,
  ]);
  const legacy: TournamentCatalog = {
    current: parseLegacyList(nowJson),
    past: parseLegacyList(pastJson),
  };
  if (legacy.current.length > 0 || legacy.past.length > 0) {
    await replaceTournamentCatalog(legacy.current, legacy.past);
  }
  return legacy;
};

export const saveTournamentCatalog = async (
  current: TournamentCatalogItem[],
  past: TournamentCatalogItem[],
  configRevision: number,
  tournamentVersion: number,
): Promise<void> => {
  await replaceTournamentCatalog(current, past, configRevision);

  // Keep the legacy keys while older routes/builds may still read them.
  const currentTournament = current[0];
  await AsyncStorage.multiSet([
    [TOURNAMENTS_NOW_KEY, JSON.stringify(current)],
    [TOURNAMENTS_PAST_KEY, JSON.stringify(past)],
  ]);
  if (currentTournament) {
    await AsyncStorage.setItem(CURRENT_TOURNAMENT_ID_KEY, String(currentTournament.tournament_ID));
  } else {
    await AsyncStorage.removeItem(CURRENT_TOURNAMENT_ID_KEY);
  }

  publishReferenceDataUpdate(['tournaments'], { tournaments: tournamentVersion });
};
