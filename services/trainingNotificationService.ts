import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';
import { loadTrainingsFromDatabase } from '../database/repository';
import type { Training } from '../types/training';

export const TRAINING_NOTIFICATIONS_ENABLED_KEY = 'training_notifications_enabled';
export const TRAINING_NOTIFICATION_LEAD_MINUTES_KEY = 'training_notification_lead_minutes';

const SCHEDULED_IDS_KEY = 'training_scheduled_notification_ids_v1';
const SCHEDULE_SIGNATURE_KEY = 'training_notification_schedule_signature_v1';
const ANDROID_CHANNEL_ID = 'training-reminders';
const DEFAULT_LEAD_MINUTES = 60;
const MAX_SCHEDULED_REMINDERS = 60;
let cleanupTimer: ReturnType<typeof setTimeout> | null = null;

export interface TrainingNotificationSettings {
  enabled: boolean;
  leadMinutes: number;
}

const supportedLeadMinutes = new Set([15, 30, 60, 120, 180]);

const normalizeLeadMinutes = (value: number): number => (
  supportedLeadMinutes.has(value) ? value : DEFAULT_LEAD_MINUTES
);

const leadText = (minutes: number): string => {
  if (minutes === 60) return 'за 1 час';
  if (minutes === 120) return 'за 2 часа';
  if (minutes === 180) return 'за 3 часа';
  return `за ${minutes} минут`;
};

const trainingTypeTitle = (training: Training): string => {
  if (training.type === 'ice') return 'Тренировка на льду';
  if (training.type === 'ofp') return 'Тренировка ОФП';
  return 'Игра';
};

const formatTime = (date: Date, timezone: string): string => {
  try {
    return date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone || 'Europe/Moscow',
    });
  } catch {
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }
};

interface TrainingNotificationRecord {
  identifier: string;
  trainingUid: string;
  startAt: string;
}

const getStoredRecords = async (): Promise<TrainingNotificationRecord[]> => {
  const raw = await AsyncStorage.getItem(SCHEDULED_IDS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap(item => {
      if (typeof item === 'string') {
        return [{ identifier: item, trainingUid: '', startAt: '' }];
      }
      if (
        item
        && typeof item === 'object'
        && typeof item.identifier === 'string'
        && typeof item.trainingUid === 'string'
        && typeof item.startAt === 'string'
      ) {
        return [item as TrainingNotificationRecord];
      }
      return [];
    });
  } catch {
    return [];
  }
};

const scheduleNextTrainingNotificationCleanup = (
  records: TrainingNotificationRecord[],
): void => {
  if (cleanupTimer) clearTimeout(cleanupTimer);
  cleanupTimer = null;
  if (AppState.currentState !== 'active') return;
  const now = Date.now();
  const nextStart = records
    .map(record => new Date(record.startAt).getTime())
    .filter(start => Number.isFinite(start) && start > now)
    .sort((left, right) => left - right)[0];
  if (!nextStart) return;
  cleanupTimer = setTimeout(() => {
    cleanupTimer = null;
    void dismissExpiredTrainingNotifications();
  }, Math.min(Math.max(0, nextStart - now + 250), 2_147_000_000));
};

export const dismissExpiredTrainingNotifications = async (): Promise<number> => {
  const now = Date.now();
  const records = await getStoredRecords();
  const expired = records.filter(record => {
    const start = new Date(record.startAt).getTime();
    return Number.isFinite(start) && start <= now;
  });
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    const expiredPresented = presented.filter(notification => {
      const data = notification.request.content.data as
        | Record<string, unknown>
        | undefined;
      const start = new Date(String(data?.trainingStartAt || '')).getTime();
      return data?.type === 'training.reminder'
        && Number.isFinite(start)
        && start <= now;
    });
    const identifiers = new Set([
      ...expired.map(record => record.identifier),
      ...expiredPresented.map(item => item.request.identifier),
    ]);
    await Promise.all(
      [...identifiers].map(identifier =>
        Notifications.dismissNotificationAsync(identifier).catch(() => undefined)
      )
    );
    const remaining = records.filter(record => !expired.includes(record));
    await AsyncStorage.setItem(SCHEDULED_IDS_KEY, JSON.stringify(remaining));
    scheduleNextTrainingNotificationCleanup(remaining);
    if (identifiers.size) {
      console.log(
        `[Тренировки] Удалено завершившихся уведомлений: ${identifiers.size}`
      );
    }
    return identifiers.size;
  } catch (error) {
    console.warn('[Тренировки] Не удалось очистить завершившиеся уведомления:', error);
    scheduleNextTrainingNotificationCleanup(records);
    return 0;
  }
};

export const startTrainingNotificationCleanup = (): (() => void) => {
  void dismissExpiredTrainingNotifications();
  const subscription = AppState.addEventListener('change', state => {
    if (state === 'active') void dismissExpiredTrainingNotifications();
    else if (cleanupTimer) {
      clearTimeout(cleanupTimer);
      cleanupTimer = null;
    }
  });
  return () => {
    subscription.remove();
    if (cleanupTimer) clearTimeout(cleanupTimer);
    cleanupTimer = null;
  };
};

const ensureAndroidChannel = async (): Promise<void> => {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'Напоминания о тренировках',
    description: 'Локальные напоминания перед тренировками команды',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
  });
};

export const getTrainingNotificationSettings = async (): Promise<TrainingNotificationSettings> => {
  const [enabledRaw, leadRaw] = await Promise.all([
    AsyncStorage.getItem(TRAINING_NOTIFICATIONS_ENABLED_KEY),
    AsyncStorage.getItem(TRAINING_NOTIFICATION_LEAD_MINUTES_KEY),
  ]);
  return {
    enabled: enabledRaw === 'true',
    leadMinutes: normalizeLeadMinutes(Number(leadRaw || DEFAULT_LEAD_MINUTES)),
  };
};

export const requestTrainingNotificationPermission = async (): Promise<boolean> => {
  await ensureAndroidChannel();
  const existing = await Notifications.getPermissionsAsync();
  if (existing.status === 'granted') return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.status === 'granted';
};

export const cancelTrainingNotifications = async (): Promise<void> => {
  const records = await getStoredRecords();
  const identifiers = records.map(record => record.identifier);
  await Promise.all(identifiers.map(identifier => (
    Notifications.cancelScheduledNotificationAsync(identifier).catch(error => {
      console.warn(`[Тренировки] Не удалось отменить напоминание ${identifier}:`, error);
    })
  )));
  await Promise.all([
    AsyncStorage.removeItem(SCHEDULED_IDS_KEY),
    AsyncStorage.removeItem(SCHEDULE_SIGNATURE_KEY),
  ]);
  console.log(`[Тренировки] Отменено локальных напоминаний: ${identifiers.length}`);
};

const buildScheduleSignature = (trainings: Training[], leadMinutes: number): string => (
  `${leadMinutes}|${trainings.map(item => `${item.uid}:${item.start_at}`).join('|')}`
);

export const rescheduleTrainingNotifications = async (force = false): Promise<number> => {
  const settings = await getTrainingNotificationSettings();
  if (!settings.enabled) {
    await cancelTrainingNotifications();
    console.log('[Тренировки] Напоминания отключены; планирование пропущено');
    return 0;
  }

  const permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted') {
    await AsyncStorage.setItem(TRAINING_NOTIFICATIONS_ENABLED_KEY, 'false');
    await cancelTrainingNotifications();
    console.warn('[Тренировки] Напоминания отключены: отсутствует разрешение ОС');
    return 0;
  }
  await ensureAndroidChannel();

  const now = Date.now();
  const leadMilliseconds = settings.leadMinutes * 60_000;
  const trainings = (await loadTrainingsFromDatabase())
    .filter(item => new Date(item.start_at).getTime() - leadMilliseconds > now + 5_000)
    .sort((left, right) => (
      new Date(left.start_at).getTime() - new Date(right.start_at).getTime()
    ))
    .slice(0, MAX_SCHEDULED_REMINDERS);
  const signature = buildScheduleSignature(trainings, settings.leadMinutes);
  const previousSignature = await AsyncStorage.getItem(SCHEDULE_SIGNATURE_KEY);
  if (!force && signature === previousSignature) {
    const existingRecords = await getStoredRecords();
    await dismissExpiredTrainingNotifications();
    scheduleNextTrainingNotificationCleanup(existingRecords);
    console.log(`[Тренировки] План напоминаний не изменился: ${existingRecords.length}`);
    return existingRecords.length;
  }

  await cancelTrainingNotifications();
  const records: TrainingNotificationRecord[] = [];
  for (const training of trainings) {
    const start = new Date(training.start_at);
    const triggerDate = new Date(start.getTime() - leadMilliseconds);
    try {
      const identifier = await Notifications.scheduleNotificationAsync({
        content: {
          title: `${trainingTypeTitle(training)} ${leadText(settings.leadMinutes)}`,
          body: [
            `Начало в ${formatTime(start, training.timezone)}`,
            training.location,
            training.note,
          ].filter(Boolean).join(' · '),
          sound: 'default',
          data: {
            type: 'training.reminder',
            route: '/trainings',
            trainingId: training.id,
            trainingUid: training.uid,
            trainingStartAt: training.start_at,
          },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: triggerDate,
          ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
        },
      });
      records.push({
        identifier,
        trainingUid: training.uid,
        startAt: training.start_at,
      });
    } catch (error) {
      console.warn(`[Тренировки] Не удалось запланировать занятие ${training.uid}:`, error);
    }
  }

  await AsyncStorage.setItem(SCHEDULED_IDS_KEY, JSON.stringify(records));
  scheduleNextTrainingNotificationCleanup(records);
  if (records.length === trainings.length) {
    await AsyncStorage.setItem(SCHEDULE_SIGNATURE_KEY, signature);
  } else {
    await AsyncStorage.removeItem(SCHEDULE_SIGNATURE_KEY);
  }
  console.log(
    `[Тренировки] Запланировано локальных напоминаний: ${records.length}; `
    + `опережение=${settings.leadMinutes} мин.`
  );
  return records.length;
};

export const setTrainingNotificationsEnabled = async (enabled: boolean): Promise<number> => {
  if (!enabled) {
    await AsyncStorage.setItem(TRAINING_NOTIFICATIONS_ENABLED_KEY, 'false');
    await cancelTrainingNotifications();
    return 0;
  }
  const granted = await requestTrainingNotificationPermission();
  if (!granted) throw new Error('Разрешение на уведомления не выдано');
  await AsyncStorage.setItem(TRAINING_NOTIFICATIONS_ENABLED_KEY, 'true');
  return rescheduleTrainingNotifications(true);
};

export const setTrainingNotificationLeadMinutes = async (minutes: number): Promise<number> => {
  const normalized = normalizeLeadMinutes(minutes);
  await AsyncStorage.setItem(TRAINING_NOTIFICATION_LEAD_MINUTES_KEY, String(normalized));
  await AsyncStorage.removeItem(SCHEDULE_SIGNATURE_KEY);
  return rescheduleTrainingNotifications(true);
};
