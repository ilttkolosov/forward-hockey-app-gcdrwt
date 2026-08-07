import { apiService } from './apiService';
import {
  loadTrainingsFromDatabase,
  replaceTrainingsInRange,
} from '../database/repository';
import type { Training, TrainingQuery, TrainingType } from '../types/training';
import { rescheduleTrainingNotifications } from './trainingNotificationService';

export const TRAINING_TEAM_ID = 'forward-2014';
const PAST_DAYS = 7;
const FUTURE_DAYS = 90;

export interface TrainingSyncResult {
  trainings: Training[];
  source: 'network' | 'database';
  updated: boolean;
  error?: Error;
}

type TrainingListener = (trainings: Training[]) => void;
const listeners = new Set<TrainingListener>();
let synchronizationPromise: Promise<TrainingSyncResult> | null = null;

const toLocalIsoDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setHours(12, 0, 0, 0);
  result.setDate(result.getDate() + days);
  return result;
};

export const getTrainingSyncWindow = (now = new Date()): TrainingQuery => ({
  date_from: toLocalIsoDate(addDays(now, -PAST_DAYS)),
  date_to: toLocalIsoDate(addDays(now, FUTURE_DAYS)),
  team: TRAINING_TEAM_ID,
});

const isTrainingType = (value: unknown): value is TrainingType => value === 'ice' || value === 'ofp';

const normalizeTraining = (item: Training): Training => {
  if (!item || !item.id || !item.uid || !isTrainingType(item.type)) {
    throw new Error('У занятия отсутствуют обязательные id, uid или type');
  }
  const start = new Date(item.start_at);
  const end = new Date(item.end_at);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    throw new Error(`Некорректное время занятия ${item.uid}`);
  }
  return {
    id: String(item.id),
    uid: String(item.uid),
    type: item.type,
    title: String(item.title || (item.type === 'ice' ? 'Тренировка на льду' : 'Тренировка ОФП')),
    // Сохраняем исходное ISO со смещением зоны: календарная дата в SQLite
    // должна совпадать с датой тренировки в Санкт-Петербурге.
    start_at: String(item.start_at),
    end_at: String(item.end_at),
    timezone: String(item.timezone || 'Europe/Moscow'),
    location: String(item.location || ''),
    note: String(item.note || ''),
    team: {
      id: String(item.team?.id || TRAINING_TEAM_ID),
      name: String(item.team?.name || 'Динамо-Форвард 2014'),
    },
    updated_at: String(item.updated_at || new Date().toISOString()),
  };
};

const notifyListeners = (trainings: Training[]): void => {
  listeners.forEach(listener => listener(trainings));
};

export const subscribeTrainingUpdates = (listener: TrainingListener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const loadCachedTrainings = async (query = getTrainingSyncWindow()): Promise<Training[]> => (
  loadTrainingsFromDatabase(query)
);

/**
 * Локальный набор возвращается даже при сетевой ошибке. Замена окна SQLite
 * происходит только после полностью успешного и валидного ответа сервера.
 */
export const synchronizeTrainings = async (
  canUseNetwork = true,
  force = false
): Promise<TrainingSyncResult> => {
  if (synchronizationPromise) return synchronizationPromise;

  const query = getTrainingSyncWindow();
  const task = (async (): Promise<TrainingSyncResult> => {
    const cached = await loadCachedTrainings(query);
    console.log(`[Тренировки] В SQLite найдено занятий: ${cached.length}`);
    if (!canUseNetwork) {
      console.log('[Тренировки] Сетевая синхронизация пропущена: интернет недоступен');
      void rescheduleTrainingNotifications();
      return { trainings: cached, source: 'database', updated: false };
    }

    const startedAt = Date.now();
    try {
      const response = await apiService.fetchTrainings(query);
      const normalized = response.data.map(normalizeTraining);
      if (normalized.some(item => item.team.id !== query.team)) {
        throw new Error('Сервер вернул расписание другой команды');
      }
      await replaceTrainingsInRange(normalized, query.date_from, query.date_to, query.team || '');
      console.log(
        `[Тренировки] SQLite обновлён: ${normalized.length} занятий, `
        + `диапазон ${query.date_from}—${query.date_to}, ${Date.now() - startedAt} мс`
      );
      notifyListeners(normalized);
      void rescheduleTrainingNotifications();
      return { trainings: normalized, source: 'network', updated: true };
    } catch (unknownError) {
      const error = unknownError instanceof Error ? unknownError : new Error(String(unknownError));
      console.warn(
        `[Тренировки] Серверное расписание не обновлено за ${Date.now() - startedAt} мс; `
        + 'используется SQLite:',
        error
      );
      void rescheduleTrainingNotifications();
      return { trainings: cached, source: 'database', updated: false, error };
    }
  })();

  synchronizationPromise = task;
  try {
    return await task;
  } finally {
    if (synchronizationPromise === task) synchronizationPromise = null;
  }
};
