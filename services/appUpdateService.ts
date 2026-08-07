import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Alert, Linking, Platform } from 'react-native';
import type { StartupConfig } from './startupApi';

const UPDATE_NOTICE_KEY = '@app/update-notice-version';

const compareVersions = (left: string, right: string): number => {
  const normalize = (value: string) => value.split(/[+-]/)[0].split('.').map(part => Number(part) || 0);
  const a = normalize(left);
  const b = normalize(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if ((a[index] || 0) !== (b[index] || 0)) return (a[index] || 0) > (b[index] || 0) ? 1 : -1;
  }
  return 0;
};

export const showAppUpdateNotice = async (config: StartupConfig): Promise<void> => {
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const current = Constants.expoConfig?.version || '0.0.0';
  const latest = config.app?.latest_version?.[platform];
  const minimum = config.app?.minimum_supported_version?.[platform];
  if (!latest || compareVersions(current, latest) >= 0) return;

  const required = Boolean(minimum && compareVersions(current, minimum) < 0);
  const lastShown = await AsyncStorage.getItem(UPDATE_NOTICE_KEY);
  if (!required && lastShown === latest) return;
  await AsyncStorage.setItem(UPDATE_NOTICE_KEY, latest);

  const updateUrl = platform === 'ios'
    ? config.app?.app_store_url
    : config.app?.google_play_url || config.app?.android_download_url;
  const buttons = [];
  if (!required) buttons.push({ text: 'Позже', style: 'cancel' as const });
  if (updateUrl) {
    buttons.push({ text: 'Обновить', onPress: () => void Linking.openURL(updateUrl) });
  } else {
    buttons.push({ text: 'Понятно' });
  }
  Alert.alert(
    required ? 'Требуется обновление' : 'Доступно обновление',
    config.app?.update_message || `Доступна версия ${latest}. Установлена версия ${current}.`,
    buttons,
    { cancelable: !required }
  );
};
