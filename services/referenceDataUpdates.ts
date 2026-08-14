import { useCallback, useSyncExternalStore } from 'react';
import type { ReferenceEntity } from '../database/repository';

export interface ReferenceDataUpdate {
  entities: ReferenceEntity[];
  versions: Partial<Record<ReferenceEntity, number>>;
  completedAt: string;
}

type ReferenceDataUpdateListener = (update: ReferenceDataUpdate) => void;

const listeners = new Set<ReferenceDataUpdateListener>();
const revisions: Record<ReferenceEntity, number> = {
  teams: 0,
  venues: 0,
  leagues: 0,
  seasons: 0,
  players: 0,
  tournaments: 0,
};

export function publishReferenceDataUpdate(
  entities: readonly ReferenceEntity[],
  versions: Partial<Record<ReferenceEntity, number>> = {},
): void {
  const uniqueEntities = [...new Set(entities)];
  if (!uniqueEntities.length) return;
  uniqueEntities.forEach((entity) => {
    revisions[entity] += 1;
  });
  const update: ReferenceDataUpdate = {
    entities: uniqueEntities,
    versions,
    completedAt: new Date().toISOString(),
  };
  listeners.forEach((listener) => {
    try {
      listener(update);
    } catch (error) {
      console.warn('[Справочники] Ошибка обработчика обновления:', error);
    }
  });
}

export function subscribeReferenceDataUpdates(
  listener: ReferenceDataUpdateListener,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function revisionFor(entities: readonly ReferenceEntity[]): number {
  return entities.reduce((total, entity) => total + revisions[entity], 0);
}

/**
 * Causes an open screen to reload only when one of its data dependencies was
 * atomically replaced in SQLite. The local snapshot remains visible while the
 * network refresh is running.
 */
export function useReferenceDataRevision(
  entityOrEntities: ReferenceEntity | readonly ReferenceEntity[],
): number {
  const entities = Array.isArray(entityOrEntities)
    ? entityOrEntities
    : [entityOrEntities];
  const entityKey = entities.join('|');
  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      subscribeReferenceDataUpdates((update) => {
        if (update.entities.some((entity) => entities.includes(entity))) {
          onStoreChange();
        }
      }),
    // entityKey is the stable semantic identity of an inline entity array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entityKey],
  );
  const getSnapshot = useCallback(
    () => revisionFor(entities),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entityKey],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
