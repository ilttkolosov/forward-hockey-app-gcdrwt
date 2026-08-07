import { getMetadata, setMetadata, upsertEvents } from '../database/repository';
import type { ApiEvent } from '../types/apiTypes';
import { apiService } from './apiService';
import type { StartupConfig } from './startupApi';

const FIRST_DYNAMIC_ARCHIVE_DATE = '2026-08-01';
const INITIAL_ARCHIVE_THROUGH = '2026-07-31';
const SAFETY_DELAY_DAYS = 7;

const addDays = (value: string, days: number): string => {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const hasFinalResult = (event: ApiEvent): boolean => {
  if (!event.results || Array.isArray(event.results)) return false;
  return Object.keys(event.results).length > 0;
};

export interface HistoricalSyncResult {
  requestedFrom: string | null;
  requestedTo: string;
  received: number;
  stored: number;
  skipped: boolean;
}

export const syncCompletedHistoricalGames = async (
  settings?: StartupConfig['sync']
): Promise<HistoricalSyncResult> => {
  const firstDynamicArchiveDate = settings?.historical_start_date || FIRST_DYNAMIC_ARCHIVE_DATE;
  const safetyDelayDays = settings?.historical_delay_days ?? SAFETY_DELAY_DAYS;
  const safeThroughDate = new Date();
  safeThroughDate.setDate(safeThroughDate.getDate() - safetyDelayDays);
  const requestedTo = safeThroughDate.toISOString().slice(0, 10);
  const previousThrough = await getMetadata('historical_events_through') || INITIAL_ARCHIVE_THROUGH;
  if (requestedTo <= previousThrough || requestedTo < firstDynamicArchiveDate) {
    return { requestedFrom: null, requestedTo, received: 0, stored: 0, skipped: true };
  }

  const requestedFrom = previousThrough < firstDynamicArchiveDate
    ? firstDynamicArchiveDate
    : addDays(previousThrough, -1);
  const chunkDays = Math.max(7, Math.min(365, settings?.event_chunk_days ?? 180));
  let cursor = requestedFrom;
  let received = 0;
  let stored = 0;
  while (cursor <= requestedTo) {
    const candidateEnd = addDays(cursor, chunkDays - 1);
    const chunkEnd = candidateEnd < requestedTo ? candidateEnd : requestedTo;
    console.log(`[HistoricalSync] Проверка завершённых матчей ${cursor} — ${chunkEnd}`);
    const response = await apiService.fetchEvents({ date_from: cursor, date_to: chunkEnd });
    const completed = response.data.filter(hasFinalResult);
    received += response.data.length;
    stored += await upsertEvents(completed);
    await setMetadata('historical_events_through', chunkEnd);
    cursor = addDays(chunkEnd, 1);
  }
  await setMetadata('historical_events_last_sync_at', new Date().toISOString());
  console.log(`[HistoricalSync] Получено ${received}, сохранено ${stored}, архив по ${requestedTo}`);
  return { requestedFrom, requestedTo, received, stored, skipped: false };
};
