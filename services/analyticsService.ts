// src/services/analyticsService.ts
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AppMetrica, { AppMetricaConfig } from '@appmetrica/react-native-analytics';

let isInitialized = false;
let deviceId: string | null = null;

export const getOrCreateDeviceId = async (): Promise<string> => {
  if (deviceId) return deviceId;
  if (Device.deviceId) {
    deviceId = Device.deviceId;
  } else {
    const { getItem, setItem } = await import('@react-native-async-storage/async-storage');
    deviceId = await getItem('analytics_device_id');
    if (!deviceId) {
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

export const initAnalytics = async () => {
  if (isInitialized) return;

  try {
    const uniqueDeviceId = await getOrCreateDeviceId();
    const APP_METRICA_API_KEY = '2a2cbf5f-f609-4a7b-80c6-99ba84d59501';

    // Используем AppMetricaConfig с userProfileID при активации
    const config: AppMetricaConfig = {
      apiKey: APP_METRICA_API_KEY,
      sessionTimeout: 120,
      logs: __DEV__,
      userProfileID: uniqueDeviceId, // ← КЛЮЧЕВОЕ ИЗМЕНЕНИЕ
      appVersion: Constants.expoConfig?.version || '1.0.0',
    };

    AppMetrica.activate(config);

    const context = {
      device_os: Device.osName || 'unknown',
      device_os_version: Device.osVersion || 'unknown',
      device_model: Device.modelName || 'unknown',
      app_version: config.appVersion,
    };

    AppMetrica.reportEvent('App_Started', context);
    isInitialized = true;
    console.log('[Analytics] AppMetrica initialized with Device ID:', uniqueDeviceId);
  } catch (e) {
    console.warn('[Analytics] AppMetrica failed to initialize:', e);
    // Не устанавливаем AppMetrica = null — пусть остаётся undefined
  }
};

export const trackEvent = (eventName: string, params: Record<string, any> = {}) => {
  // НЕ проверяем AppMetrica, если она не импортирована — она undefined
  // Но если activate прошёл — reportEvent будет работать
  try {
    AppMetrica.reportEvent(eventName, params);
  } catch (e) {
    console.warn('[Analytics] Failed to send event:', e);
  }
};

export const trackScreenView = (screenName: string, params: Record<string, any> = {}) => {
  trackEvent('screen_view', {
    screen_name: screenName,
    ...params,
  });
};