import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { StartupConfig } from '../services/startupApi';
import { fetchStartupConfig } from '../services/startupApi';
import {
  getUpdateRequirement,
  getUpdateUrl,
  type AppPlatform,
} from '../services/startupConfigPolicy';
import { colors } from '../styles/commonStyles';
import Icon from './Icon';

const ANNOUNCEMENT_KEY = '@app/startup-announcement-dismissed-id';

interface Props {
  config: StartupConfig | null;
  onConfigRefresh: (config: StartupConfig) => void;
}

export default function StartupConfigGate({ config, onConfigRefresh }: Props) {
  const appPlatform: AppPlatform = Platform.OS === 'ios' ? 'ios' : 'android';
  const currentVersion = Constants.nativeAppVersion || Constants.expoConfig?.version || '0.0.0';
  const [optionalUpdateHandled, setOptionalUpdateHandled] = useState(false);
  const [dismissedAnnouncementId, setDismissedAnnouncementId] = useState<string | null | undefined>();
  const [retrying, setRetrying] = useState(false);
  const [retryAvailableAt, setRetryAvailableAt] = useState(0);
  const [retryCycle, setRetryCycle] = useState(0);
  const [secondsUntilRetry, setSecondsUntilRetry] = useState(0);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    void AsyncStorage.getItem(ANNOUNCEMENT_KEY).then(setDismissedAnnouncementId);
  }, []);

  const requirement = useMemo(
    () => config ? getUpdateRequirement(config, appPlatform, currentVersion) : 'none',
    [appPlatform, config, currentVersion],
  );
  const maintenanceEnabled = config?.maintenance?.enabled === true;

  useEffect(() => {
    if (!maintenanceEnabled) {
      setRetryAvailableAt(0);
      setSecondsUntilRetry(0);
      return undefined;
    }
    const delay = Math.max(30, Number(config?.maintenance?.retry_after_seconds) || 300);
    const availableAt = Date.now() + delay * 1_000;
    setRetryAvailableAt(availableAt);
    const updateCountdown = () => setSecondsUntilRetry(Math.max(0, Math.ceil((availableAt - Date.now()) / 1_000)));
    updateCountdown();
    const interval = setInterval(updateCountdown, 1_000);
    return () => clearInterval(interval);
  }, [config?.config_revision, config?.maintenance?.retry_after_seconds, maintenanceEnabled, retryCycle]);

  if (!config) return null;

  const latestVersion = config.app?.latest_version?.[appPlatform];
  const updateUrl = getUpdateUrl(config, appPlatform);
  const announcement = config.announcement;
  const announcementVisible = (
    requirement === 'none'
    && !maintenanceEnabled
    && announcement?.enabled === true
    && Boolean(announcement.id)
    && dismissedAnnouncementId !== undefined
    && dismissedAnnouncementId !== announcement.id
  );
  const optionalUpdateVisible = requirement === 'optional' && !optionalUpdateHandled && !maintenanceEnabled;
  const visible = maintenanceEnabled || requirement === 'required' || optionalUpdateVisible || announcementVisible;
  if (!visible) return null;

  const retryMaintenance = async () => {
    if (retrying || Date.now() < retryAvailableAt) return;
    setRetrying(true);
    setLinkError(null);
    try {
      onConfigRefresh(await fetchStartupConfig());
    } catch {
      setLinkError('Не удалось получить свежую конфигурацию. Проверьте интернет и повторите позже.');
    } finally {
      setRetrying(false);
      setRetryCycle(current => current + 1);
    }
  };

  const openExternalUrl = async (url?: string) => {
    if (!url) {
      setLinkError('Администратор ещё не указал ссылку для этой платформы.');
      return;
    }
    setLinkError(null);
    try {
      await Linking.openURL(url);
    } catch {
      setLinkError('Не удалось открыть ссылку. Повторите попытку позже.');
    }
  };

  const dismissAnnouncement = async () => {
    const id = announcement?.id;
    if (!id) return;
    await AsyncStorage.setItem(ANNOUNCEMENT_KEY, id);
    setDismissedAnnouncementId(id);
  };

  const title = maintenanceEnabled
    ? 'Технические работы'
    : requirement === 'required'
      ? 'Требуется обновление'
      : optionalUpdateVisible
        ? 'Доступно обновление'
        : announcement?.title || 'Объявление';
  const message = maintenanceEnabled
    ? config.maintenance?.message || 'Сервис временно недоступен. Мы уже работаем над восстановлением.'
    : requirement === 'required' || optionalUpdateVisible
      ? config.app?.update_message || `Доступна версия ${latestVersion}. Установлена версия ${currentVersion}.`
      : announcement?.message || '';

  return (
    <Modal animationType="fade" onRequestClose={() => {
      if (optionalUpdateVisible) setOptionalUpdateHandled(true);
      else if (announcementVisible) void dismissAnnouncement();
    }} transparent visible>
      <SafeAreaView style={styles.backdrop}>
        <View accessibilityViewIsModal style={styles.card}>
          <View style={styles.iconCircle}>
            <Icon
              color={colors.primary}
              name={maintenanceEnabled ? 'construct-outline' : requirement !== 'none' ? 'cloud-download-outline' : 'megaphone-outline'}
              size={34}
            />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          {(requirement === 'required' || optionalUpdateVisible) && (
            <Text style={styles.version}>Установлена {currentVersion} · доступна {latestVersion}</Text>
          )}
          {linkError && <Text style={styles.error}>{linkError}</Text>}

          {maintenanceEnabled ? (
            <Pressable
              accessibilityRole="button"
              disabled={retrying || secondsUntilRetry > 0}
              onPress={() => void retryMaintenance()}
              style={[styles.primaryButton, (retrying || secondsUntilRetry > 0) && styles.disabledButton]}
            >
              {retrying ? <ActivityIndicator color="#FFFFFF" /> : (
                <Text style={styles.primaryButtonText}>
                  {secondsUntilRetry > 0 ? `Проверить через ${secondsUntilRetry} с` : 'Проверить снова'}
                </Text>
              )}
            </Pressable>
          ) : requirement === 'required' || optionalUpdateVisible ? (
            <>
              <Pressable accessibilityRole="button" onPress={() => void openExternalUrl(updateUrl)} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Обновить</Text>
              </Pressable>
              {optionalUpdateVisible && (
                <Pressable accessibilityRole="button" onPress={() => setOptionalUpdateHandled(true)} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>При следующем запуске</Text>
                </Pressable>
              )}
            </>
          ) : (
            <>
              {announcement?.url && (
                <Pressable accessibilityRole="link" onPress={() => void openExternalUrl(announcement.url)} style={styles.primaryButton}>
                  <Text style={styles.primaryButtonText}>Подробнее</Text>
                </Pressable>
              )}
              <Pressable accessibilityRole="button" onPress={() => void dismissAnnouncement()} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Закрыть</Text>
              </Pressable>
            </>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(10,18,28,0.62)' },
  card: { width: '100%', maxWidth: 420, borderRadius: 24, padding: 24, backgroundColor: colors.surface, alignItems: 'center' },
  iconCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 16, backgroundColor: '#FDECEF' },
  title: { color: colors.text, fontSize: 22, fontWeight: '800', textAlign: 'center', marginBottom: 10 },
  message: { color: colors.textSecondary, fontSize: 16, lineHeight: 23, textAlign: 'center' },
  version: { color: colors.textSecondary, fontSize: 13, marginTop: 12, textAlign: 'center' },
  error: { color: colors.error, fontSize: 13, lineHeight: 18, marginTop: 12, textAlign: 'center' },
  primaryButton: { width: '100%', minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 22, paddingHorizontal: 16, backgroundColor: colors.primary },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  secondaryButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', marginTop: 6, paddingHorizontal: 20 },
  secondaryButtonText: { color: colors.primary, fontSize: 15, fontWeight: '700' },
  disabledButton: { opacity: 0.55 },
});
