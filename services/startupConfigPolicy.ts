import type { StartupConfig } from './startupApi';

export type AppPlatform = 'ios' | 'android';
export type UpdateRequirement = 'none' | 'optional' | 'required';

export const compareAppVersions = (left: string, right: string): number => {
  const normalize = (value: string) => value
    .trim()
    .split(/[+-]/)[0]
    .split('.')
    .map(part => Number.parseInt(part, 10) || 0);
  const a = normalize(left);
  const b = normalize(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] || 0) - (b[index] || 0);
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }
  return 0;
};

export const getUpdateRequirement = (
  config: StartupConfig,
  platform: AppPlatform,
  currentVersion: string,
): UpdateRequirement => {
  const latest = config.app?.latest_version?.[platform];
  const minimum = config.app?.minimum_supported_version?.[platform];
  if (minimum && compareAppVersions(currentVersion, minimum) < 0) return 'required';
  if (latest && compareAppVersions(currentVersion, latest) < 0) return 'optional';
  return 'none';
};

export const getUpdateUrl = (config: StartupConfig, platform: AppPlatform): string | undefined => (
  platform === 'ios'
    ? config.app?.app_store_url
    : config.app?.android_download_url || config.app?.google_play_url
);
