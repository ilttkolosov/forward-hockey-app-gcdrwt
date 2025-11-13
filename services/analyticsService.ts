// src/services/analyticsService.ts
import * as Device from 'expo-device';
import Constants from 'expo-constants';

let AppMetrica: any = null;
let isInitialized = false;
let deviceId: string | null = null;

// Получаем или генерируем стабильный ID устройства
const getOrCreateDeviceId = async (): Promise<string> => {
  if (deviceId) return deviceId;

  // Device.deviceId доступен на Android и iOS
  if (Device.deviceId) {
    deviceId = Device.deviceId;
  } else {
    // Резервный вариант: генерируем UUID и сохраняем в AsyncStorage (редко нужно)
    const { getItem, setItem } = await import('@react-native-async-storage/async-storage');
    deviceId = await getItem('analytics_device_id');
    if (!deviceId) {
      // Генерация UUID v4
      deviceId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
      await setItem('analytics_device_id', deviceId);
    }
  }

  return deviceId;
};

// Инициализация аналитики
export const initAnalytics = async () => {
  if (isInitialized) return;

  try {
    AppMetrica = (await import('@appmetrica/react-native-analytics')).default;
    const APP_METRICA_API_KEY = '2a2cbf5f-f609-4a7b-80c6-99ba84d59501';

    // Получаем уникальный ID устройства
    const uniqueDeviceId = await getOrCreateDeviceId();

    // Активируем AppMetrica
    AppMetrica.activate({
      apiKey: APP_METRICA_API_KEY,
      sessionTimeout: 120,
      logs: __DEV__,
    });

    // Устанавливаем Device ID как User ID для группировки
    AppMetrica.setUserProfileID(uniqueDeviceId);

    // Отправляем событие инициализации с контекстом
    const context = {
      device_os: Device.osName || 'unknown',
      device_os_version: Device.osVersion || 'unknown',
      device_model: Device.modelName || 'unknown',
      app_version: Constants.expoConfig?.version || '1.0.0',
    };

    AppMetrica.reportEvent('App_Started', context);
    isInitialized = true;
    console.log('[Analytics] Initialized with Device ID:', uniqueDeviceId);
  } catch (e) {
    console.warn('[Analytics] AppMetrica not available (Expo Go). Skipping.');
    AppMetrica = null;
  }
};

// Универсальный трекинг событий
export const trackEvent = (eventName: string, params: Record<string, any> = {}) => {
  if (!AppMetrica) return;
  AppMetrica.reportEvent(eventName, params);
};

// Отслеживание просмотра экрана с контекстом (например, ID сущности)
export const trackScreenView = (
  screenName: string,
  params: Record<string, any> = {}
) => {
  trackEvent('screen_view', {
    screen_name: screenName,
    ...params, // ← сюда попадут gameId, tournamentId, teamId и т.д.
  });
};