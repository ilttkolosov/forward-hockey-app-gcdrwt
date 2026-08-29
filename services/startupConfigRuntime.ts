import { useSyncExternalStore } from 'react';
import type { StartupConfig } from './startupApi';
import { apiService } from './apiService';
import { setDefaultRequestTimeout } from './httpClient';
import { playerDownloadService } from './playerDataService';
import { configureTournamentApi } from './tournamentsApi';

type FeatureName = 'push_notifications' | 'live_scores' | 'f2f' | 'mobile_games';

let activeConfig: StartupConfig | null = null;
const listeners = new Set<() => void>();
const FALLBACK_API_BASE_URL = 'https://www.hc-forward.com/wp-json/app/v1';

const safeApiBaseUrl = (candidate?: string): string => {
  const normalized = candidate?.trim().replace(/\/+$/, '') || '';
  const allowed = /^https:\/\//i.test(normalized) || (__DEV__ && /^http:\/\//i.test(normalized));
  return allowed ? normalized : FALLBACK_API_BASE_URL;
};

export const applyStartupConfig = (config: StartupConfig): void => {
  activeConfig = config;
  const timeoutSeconds = Number(config.api?.request_timeout_seconds);
  if (Number.isFinite(timeoutSeconds) && timeoutSeconds > 0) {
    setDefaultRequestTimeout(timeoutSeconds * 1_000);
  }
  if (config.api?.base_url) {
    const baseUrl = safeApiBaseUrl(config.api.base_url);
    apiService.configure(baseUrl);
    playerDownloadService.configure(baseUrl);
    configureTournamentApi(baseUrl);
  }
  listeners.forEach(listener => listener());
};

export const getActiveStartupConfig = (): StartupConfig | null => activeConfig;

export const getConfiguredApiUrl = (path: string): string => {
  const baseUrl = safeApiBaseUrl(activeConfig?.api?.base_url);
  return `${baseUrl}/${path.replace(/^\/+/, '')}`;
};

export const isStartupFeatureEnabled = (name: FeatureName): boolean => (
  activeConfig?.features?.[name] !== false
);

export const useStartupFeature = (name: FeatureName): boolean => useSyncExternalStore(
  callback => {
    listeners.add(callback);
    return () => listeners.delete(callback);
  },
  () => isStartupFeatureEnabled(name),
  () => true,
);
