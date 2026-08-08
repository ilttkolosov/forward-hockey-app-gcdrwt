import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { loadTrainingsFromDatabase } from '../database/repository';
import type { Training } from '../types/training';

export const TRAINING_NOTIFICATIONS_ENABLED_KEY = 'training_notifications_enabled';
export const TRAINING_NOTIFICATION_LEAD_MINUTES_KEY = 'training_notification_lead_minutes';

const SCHEDULED_IDS_KEY = 'training_scheduled_notification_ids_v1';
const SCHEDULE_SIGNATURE_KEY = 'training_notification_schedule_signature_v1';
const ANDROID_CHANNEL_ID = 'training-reminders';
const DEFAULT_LEAD_MINUTES = 60;
const MAX_SCHEDULED_REMINDERS = 60;

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

const getStoredIds = async (): Promise<string[]> => {
  const raw = await AsyncStorage.getItem(SCHEDULED_IDS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : [];
  } catch {
    return [];
  }
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
  const identifiers = await getStoredIds();
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
    const existingIds = await getStoredIds();
    console.log(`[Тренировки] План напоминаний не изменился: ${existingIds.length}`);
    return existingIds.length;
  }

  await cancelTrainingNotifications();
  const identifiers: string[] = [];
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
            route: '/trainings',
            trainingId: training.id,
            trainingUid: training.uid,
          },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: triggerDate,
          ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
        },
      });
      identifiers.push(identifier);
    } catch (error) {
      console.warn(`[Тренировки] Не удалось запланировать занятие ${training.uid}:`, error);
    }
  }

  await AsyncStorage.setItem(SCHEDULED_IDS_KEY, JSON.stringify(identifiers));
  if (identifiers.length === trainings.length) {
    await AsyncStorage.setItem(SCHEDULE_SIGNATURE_KEY, signature);
  } else {
    await AsyncStorage.removeItem(SCHEDULE_SIGNATURE_KEY);
  }
  console.log(
    `[Тренировки] Запланировано локальных напоминаний: ${identifiers.length}; `
    + `опережение=${settings.leadMinutes} мин.`
  );
  return identifiers.length;
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
