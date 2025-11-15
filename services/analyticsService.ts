// services/analyticsService.ts
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Ленивая загрузка AppMetrica — только в нативных сборках (не в Expo Go)
let AppMetrica: any = undefined;
let isInitialized = false;
let deviceId: string | null = null;

// Попытка импорта только если мы НЕ в Expo Go
if (!__DEV__ || Device.isDevice) {
  try {
    // @ts-ignore
    AppMetrica = require('@appmetrica/react-native-analytics').default;
  } catch (e) {
    console.warn('[Analytics] AppMetrica не запущена в этой сборке');
  }
}

export const getOrCreateDeviceId = async (): Promise<string> => {
  if (deviceId) return deviceId;
  if (Device.deviceId) {
    deviceId = Device.deviceId;
  } else {
    deviceId = await AsyncStorage.getItem('analytics_device_id');
    if (!deviceId) {
      deviceId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
      await AsyncStorage.setItem('analytics_device_id', deviceId);
    }
  }
  return deviceId;
};

export const initAnalytics = async () => {
  if (isInitialized || !AppMetrica) return;

  try {
    const uniqueDeviceId = await getOrCreateDeviceId();
    const APP_METRICA_API_KEY = '2a2cbf5f-f609-4a7b-80c6-99ba84d59501';
    const config = {
      apiKey: APP_METRICA_API_KEY,
      sessionTimeout: 120,
      logs: __DEV__, // будет true только в dev-сборках
      userProfileID: uniqueDeviceId,
      appVersion: Constants.expoConfig?.version || '1.0.0',
    };

    AppMetrica.activate(config);
    AppMetrica.reportEvent('App_Started', {
      device_os: Device.osName || 'unknown',
      device_os_version: Device.osVersion || 'unknown',
      device_model: Device.modelName || 'unknown',
      app_version: config.appVersion,
    });

    isInitialized = true;
    console.log('[Analytics] AppMetrica initialized with Device ID:', uniqueDeviceId);
  } catch (e) {
    console.warn('[Analytics] AppMetrica не инициализирована:', e);
  }
};

export const trackEvent = (eventName: string, params: Record<string, any> = {}) => {
  if (!AppMetrica || !isInitialized) {
    // В Expo Go или при ошибке — просто логируем, не крашим 
    if (__DEV__) {
      console.log(`[Analytics DEV] Would send event: ${eventName}`, params);
    }
    return;
  }
  try {
    AppMetrica.reportEvent(eventName, params);
  } catch (e) {
    console.warn('[Analytics] Failed to send event:', e);
  }
};

export const trackScreenView = (screenName: string, params: Record<string, any> = {}) => {
  trackEvent('screen_view', { screen_name: screenName, ...params });
};