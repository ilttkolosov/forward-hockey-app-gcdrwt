import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';

type AnalyticsPrimitive = string | number | boolean;
export type AnalyticsParameters = Record<
  string,
  AnalyticsPrimitive | null | undefined
>;

type AnalyticsEventName =
  | 'screen_view'
  | 'schedule_action'
  | 'mobile_game_action'
  | 'messenger_action';

export type ScheduleAnalyticsAction =
  | 'week_changed'
  | 'past_visibility_changed'
  | 'manual_refresh'
  | 'notification_opened';

export type MobileGameAnalyticsAction =
  | 'selected'
  | 'started'
  | 'completed'
  | 'restarted'
  | 'records_reset'
  | 'settings_changed';

export type MobileGameAnalyticsName =
  | 'memory'
  | 'ice_resurfacing'
  | 'five_in_row'
  | 'hockey';

export type MessengerAnalyticsAction =
  | 'auth_completed'
  | 'chat_opened'
  | 'message_sent'
  | 'reaction_changed'
  | 'message_edited'
  | 'message_deleted'
  | 'message_forwarded'
  | 'message_saved'
  | 'search_completed'
  | 'search_result_opened'
  | 'author_filter_changed'
  | 'notifications_changed'
  | 'private_group_created'
  | 'private_reply_opened'
  | 'share_sheet_opened'
  | 'share_sheet_sent'
  | 'push_opened';

interface AppMetricaConfig {
  apiKey: string;
  appOpenTrackingEnabled?: boolean;
  appVersion?: string;
  crashReporting?: boolean;
  locationTracking?: boolean;
  logs?: boolean;
  sessionTimeout?: number;
  sessionsAutoTracking?: boolean;
  statisticsSending?: boolean;
}

interface AppMetricaModule {
  activate(config: AppMetricaConfig): void;
  reportError(identifier: string, message: string): void;
  reportEvent(eventName: string, params?: Record<string, AnalyticsPrimitive>): void;
}

interface QueuedEvent {
  eventName: AnalyticsEventName;
  params: Record<string, AnalyticsPrimitive>;
}

const APP_METRICA_API_KEY = '2a2cbf5f-f609-4a7b-80c6-99ba84d59501';
const DEVICE_ID_STORAGE_KEY = 'analytics_device_id';
const MAX_QUEUED_EVENTS = 100;
const MAX_PARAMETER_STRING_LENGTH = 100;
const BLOCKED_PARAMETER_KEYS = new Set([
  'client_message_id',
  'display_name',
  'email',
  'latitude',
  'longitude',
  'message_id',
  'query',
  'room_id',
  'text',
  'title',
  'token',
  'user_id',
  'username',
]);

const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

let AppMetrica: AppMetricaModule | undefined;
let initializationPromise: Promise<void> | null = null;
let isInitialized = false;
let deviceId: string | null = null;
let messengerRole = 'anonymous';
const eventQueue: QueuedEvent[] = [];

if (!isExpoGo) {
  try {
    // AppMetrica is a native module and therefore unavailable in Expo Go and
    // in the static web bundle. Lazy loading keeps both environments usable.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    AppMetrica = require('@appmetrica/react-native-analytics')
      .default as AppMetricaModule;
  } catch {
    if (__DEV__) {
      console.info('[Analytics] AppMetrica недоступна в этой среде');
    }
  }
}

function safeParameters(
  params: AnalyticsParameters,
): Record<string, AnalyticsPrimitive> {
  const result: Record<string, AnalyticsPrimitive> = {};
  Object.entries(params).forEach(([key, value]) => {
    if (
      BLOCKED_PARAMETER_KEYS.has(key) ||
      key.endsWith('_id') ||
      value === null ||
      value === undefined
    ) {
      return;
    }
    if (typeof value === 'number') {
      if (Number.isFinite(value)) result[key] = value;
      return;
    }
    if (typeof value === 'boolean') {
      result[key] = value;
      return;
    }
    const normalized = value.trim().slice(0, MAX_PARAMETER_STRING_LENGTH);
    if (normalized) result[key] = normalized;
  });
  return result;
}

function sendEvent(event: QueuedEvent): void {
  try {
    AppMetrica?.reportEvent(event.eventName, event.params);
    if (__DEV__) {
      console.debug(`[Analytics] ${event.eventName}`, event.params);
    }
  } catch (error) {
    console.warn('[Analytics] Не удалось отправить событие:', error);
  }
}

function flushQueuedEvents(): void {
  if (!isInitialized || !AppMetrica) return;
  eventQueue.splice(0).forEach(sendEvent);
}

function queueOrSend(
  eventName: AnalyticsEventName,
  params: AnalyticsParameters,
): void {
  const event: QueuedEvent = {
    eventName,
    params: safeParameters({ messenger_role: messengerRole, ...params }),
  };
  if (isInitialized && AppMetrica) {
    sendEvent(event);
    return;
  }
  if (!AppMetrica) {
    if (__DEV__) console.debug(`[Analytics DEV] ${eventName}`, event.params);
    return;
  }
  if (eventQueue.length >= MAX_QUEUED_EVENTS) eventQueue.shift();
  eventQueue.push(event);
}

/**
 * Local anonymous identifier shown on the About screen for support purposes.
 * It is deliberately not sent to AppMetrica and is not tied to a person.
 */
export const getOrCreateDeviceId = async (): Promise<string> => {
  if (deviceId) return deviceId;
  deviceId = await AsyncStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (!deviceId) {
    deviceId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const random = (Math.random() * 16) | 0;
      const value = c === 'x' ? random : (random & 0x3) | 0x8;
      return value.toString(16);
    });
    await AsyncStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
  }
  return deviceId;
};

export function initAnalytics(): Promise<void> {
  if (isInitialized || !AppMetrica) return Promise.resolve();
  if (initializationPromise) return initializationPromise;

  initializationPromise = Promise.resolve()
    .then(() => {
      AppMetrica?.activate({
        apiKey: APP_METRICA_API_KEY,
        appOpenTrackingEnabled: true,
        appVersion: Constants.expoConfig?.version || 'unknown',
        crashReporting: true,
        // The messenger can send a location, but analytics must never collect it.
        locationTracking: false,
        logs: __DEV__,
        sessionTimeout: 120,
        sessionsAutoTracking: true,
        statisticsSending: true,
      });
      isInitialized = true;
      flushQueuedEvents();
      if (__DEV__) console.info('[Analytics] AppMetrica инициализирована');
    })
    .catch((error) => {
      console.warn('[Analytics] AppMetrica не инициализирована:', error);
    })
    .finally(() => {
      initializationPromise = null;
    });

  return initializationPromise;
}

export function setAnalyticsMessengerRole(roleCodes: readonly string[]): void {
  const normalized = new Set(roleCodes.map((role) => role.trim().toLowerCase()));
  const roleGroups: readonly [string, readonly string[]][] = [
    ['coach', ['coach', 'head_coach', 'assistant_coach']],
    ['player', ['player']],
    ['parent', ['parent', 'parent_committee', 'guardian']],
    ['fan', ['fan']],
    ['admin', ['team_admin', 'admin', 'system_admin']],
  ];
  messengerRole =
    roleGroups.find(([, codes]) =>
      codes.some((code) => normalized.has(code)),
    )?.[0] ||
    (normalized.size > 0 ? 'other' : 'anonymous');
}

export function trackEvent(
  eventName: AnalyticsEventName,
  params: AnalyticsParameters = {},
): void {
  queueOrSend(eventName, params);
}

export function trackScreenView(screenName: string): void {
  trackEvent('screen_view', { screen_name: screenName });
}

export function trackScheduleAction(
  action: ScheduleAnalyticsAction,
  params: AnalyticsParameters = {},
): void {
  trackEvent('schedule_action', { action, ...params });
}

export function trackMobileGameAction(
  game: MobileGameAnalyticsName,
  action: MobileGameAnalyticsAction,
  params: AnalyticsParameters = {},
): void {
  trackEvent('mobile_game_action', { game, action, ...params });
}

export function trackMessengerAction(
  action: MessengerAnalyticsAction,
  params: AnalyticsParameters = {},
): void {
  trackEvent('messenger_action', { action, ...params });
}

/** Reports only a stable identifier and the error class, never user content. */
export function reportAnalyticsError(
  identifier: string,
  error: unknown,
): void {
  if (!AppMetrica || !isInitialized) return;
  const safeIdentifier = identifier.replace(/[^a-z0-9_.-]/gi, '_').slice(0, 80);
  const errorClass = error instanceof Error ? error.name : 'UnknownError';
  try {
    AppMetrica.reportError(safeIdentifier, errorClass);
  } catch (reportingError) {
    console.warn('[Analytics] Не удалось отправить ошибку:', reportingError);
  }
}
