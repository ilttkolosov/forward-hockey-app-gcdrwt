import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import Icon from '../components/Icon';
import { commonStyles, colors } from '../styles/commonStyles';
import {
  getTrainingNotificationSettings,
  setTrainingNotificationLeadMinutes,
  setTrainingNotificationsEnabled,
} from '../services/trainingNotificationService';
import { useMessengerAuth } from '../contexts/MessengerAuthContext';
import {
  disableMessengerPush,
  enableMessengerPush,
  getProjectExpoPushToken,
  messengerPushStatus,
} from '../services/messengerPush';
import {
  REMOTE_PUSH_UNAVAILABLE_MESSAGE,
  remotePushNotificationsSupported,
} from '../services/runtimeEnvironment';

const PUSH_ENABLED_KEY = 'push_notifications_enabled';
const OPERATION_TIMEOUT_MS = 6_000;
const LEAD_OPTIONS = [15, 30, 60, 120, 180] as const;

const formatLead = (minutes: number): string => {
  if (minutes === 60) return '1 час';
  if (minutes === 120) return '2 часа';
  if (minutes === 180) return '3 часа';
  return `${minutes} мин`;
};

const sendTokenToYourServer = async (token: string) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OPERATION_TIMEOUT_MS);

  try {
    const osVersion = Platform.Version?.toString() || 'unknown';
    const deviceModel = Constants.deviceName || 'Unknown device';
    const appVersion = Constants.expoConfig?.version || '1.0.0';
    const deviceInfo = `${Platform.OS} ${osVersion}, ${deviceModel}, v${appVersion}`;

    const response = await fetch('https://www.hc-forward.com/wp-json/app/v1/push-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        subscriptions: ['team:74'],
        device_info: deviceInfo,
      }),
      signal: controller.signal,
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Не удалось сохранить токен');
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Превышено время ожидания');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

const deleteTokenFromServer = async (token: string) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OPERATION_TIMEOUT_MS);

  try {
    const response = await fetch('https://www.hc-forward.com/wp-json/app/v1/push-token', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      signal: controller.signal,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Не удалось удалить токен');
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Превышено время ожидания');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

const ensurePushPermissions = async (): Promise<boolean> => {
  if (!remotePushNotificationsSupported) {
    throw new Error(REMOTE_PUSH_UNAVAILABLE_MESSAGE);
  }
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    finalStatus = requested.status;
  }
  if (finalStatus !== 'granted') return false;

  const token = await getProjectExpoPushToken();
  await sendTokenToYourServer(token);
  await AsyncStorage.setItem('expo_push_token', token);
  return true;
};

const getMatchPushSubscriptionStatus = async (): Promise<boolean> => {
  if (!remotePushNotificationsSupported) return false;
  const permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted') return false;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OPERATION_TIMEOUT_MS);
  try {
    const token = await getProjectExpoPushToken();
    const response = await fetch(
      'https://www.hc-forward.com/wp-json/app/v1/push-subscription',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
        signal: controller.signal,
      },
    );
    const result = await response.json();
    if (!response.ok || result.status !== 'success') {
      throw new Error(result.error || 'Не удалось проверить подписку');
    }
    return result.data?.is_subscribed === true;
  } finally {
    clearTimeout(timeoutId);
  }
};

const errorMessage = (error: unknown, fallback: string): string => (
  error instanceof Error ? error.message : fallback
);

export default function SettingsScreen() {
  const router = useRouter();
  const { isAuthenticated: isMessengerAuthenticated } = useMessengerAuth();
  const [matchNotificationsEnabled, setMatchNotificationsEnabled] = useState(false);
  const [messengerNotificationsEnabled, setMessengerNotificationsEnabled] = useState(false);
  const [messengerPermissionGranted, setMessengerPermissionGranted] = useState(false);
  const [trainingNotificationsEnabled, setTrainingNotificationsState] = useState(false);
  const [trainingLeadMinutes, setTrainingLeadState] = useState(60);
  const [isChecking, setIsChecking] = useState(true);
  const [messengerChecking, setMessengerChecking] = useState(true);
  const [trainingOperation, setTrainingOperation] = useState(false);
  const [messengerOperation, setMessengerOperation] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMessage, setModalMessage] = useState('');
  const [showError, setShowError] = useState(false);

  useEffect(() => {
    let active = true;
    const loadLocalSettings = async () => {
      try {
        const [pushValue, trainingSettings] = await Promise.all([
          AsyncStorage.getItem(PUSH_ENABLED_KEY),
          getTrainingNotificationSettings(),
        ]);
        if (!active) return;
        setMatchNotificationsEnabled(
          remotePushNotificationsSupported && pushValue === 'true',
        );
        setTrainingNotificationsState(trainingSettings.enabled);
        setTrainingLeadState(trainingSettings.leadMinutes);
        console.log(
          `[Настройки] Напоминания о тренировках: `
          + `${trainingSettings.enabled ? 'включены' : 'выключены'}, `
          + `за ${trainingSettings.leadMinutes} мин.`
        );
      } catch (error) {
        console.warn('[Настройки] Не удалось загрузить параметры уведомлений:', error);
      } finally {
        if (active) setIsChecking(false);
      }
    };

    // The page is rendered from local state immediately. Network checks then
    // reconcile the switches without delaying navigation to Settings.
    void loadLocalSettings();
    void messengerPushStatus()
      .then((state) => {
        if (active) {
          setMessengerNotificationsEnabled(state.enabled);
          setMessengerPermissionGranted(state.permissionGranted);
        }
      })
      .catch((error) => {
        console.warn('[Настройки] Проверка PUSH мессенджера отложена:', error);
      })
      .finally(() => {
        if (active) setMessengerChecking(false);
      });
    void getMatchPushSubscriptionStatus()
      .then(async (enabled) => {
        await AsyncStorage.setItem(PUSH_ENABLED_KEY, String(enabled));
        if (active) setMatchNotificationsEnabled(enabled);
      })
      .catch((error) => {
        console.warn('[Настройки] Проверка подписки на матчи отложена:', error);
      });
    return () => {
      active = false;
    };
  }, []);

  const showOperation = (message: string) => {
    setModalMessage(message);
    setShowError(false);
    setModalVisible(true);
  };

  const showOperationError = (error: unknown, fallback: string) => {
    setModalMessage(errorMessage(error, fallback));
    setShowError(true);
    setModalVisible(true);
    setTimeout(() => setModalVisible(false), 2_000);
  };

  const toggleMatchNotifications = async (value: boolean) => {
    if (!remotePushNotificationsSupported) {
      setMatchNotificationsEnabled(false);
      await AsyncStorage.setItem(PUSH_ENABLED_KEY, 'false');
      return;
    }
    if (value) {
      setMatchNotificationsEnabled(true);
      showOperation('Включение уведомлений о матчах…');
      try {
        const success = await ensurePushPermissions();
        setModalVisible(false);
        setMatchNotificationsEnabled(success);
        await AsyncStorage.setItem(PUSH_ENABLED_KEY, String(success));
      } catch (error) {
        showOperationError(error, 'Не удалось включить уведомления');
        setMatchNotificationsEnabled(false);
        await AsyncStorage.setItem(PUSH_ENABLED_KEY, 'false');
      }
      return;
    }

    setMatchNotificationsEnabled(false);
    showOperation('Отключение уведомлений о матчах…');
    try {
      const token = await AsyncStorage.getItem('expo_push_token');
      if (token) {
        await deleteTokenFromServer(token);
        await AsyncStorage.removeItem('expo_push_token');
      }
      await AsyncStorage.setItem(PUSH_ENABLED_KEY, 'false');
      setModalVisible(false);
    } catch (error) {
      showOperationError(error, 'Не удалось отключить уведомления');
      await AsyncStorage.setItem(PUSH_ENABLED_KEY, 'false');
    }
  };

  const toggleMessengerNotifications = async (value: boolean) => {
    if (!remotePushNotificationsSupported) {
      setMessengerNotificationsEnabled(false);
      return;
    }
    if (!isMessengerAuthenticated) {
      showOperationError(
        new Error('Сначала активируйте учётную запись командного мессенджера'),
        'Необходим вход в мессенджер',
      );
      return;
    }
    setMessengerOperation(true);
    setMessengerNotificationsEnabled(value);
    showOperation(
      value
        ? 'Включение уведомлений о сообщениях…'
        : 'Отключение уведомлений о сообщениях…',
    );
    try {
      if (value) {
        await enableMessengerPush(true);
        setMessengerPermissionGranted(true);
      } else {
        await disableMessengerPush();
      }
      setModalVisible(false);
    } catch (error) {
      setMessengerNotificationsEnabled(!value);
      showOperationError(error, 'Не удалось изменить уведомления мессенджера');
    } finally {
      setMessengerOperation(false);
    }
  };

  const toggleTrainingNotifications = async (value: boolean) => {
    setTrainingOperation(true);
    showOperation(value
      ? 'Планирование напоминаний о тренировках…'
      : 'Отключение напоминаний о тренировках…');
    try {
      const scheduled = await setTrainingNotificationsEnabled(value);
      setTrainingNotificationsState(value);
      setModalVisible(false);
      console.log(
        `[Настройки] Напоминания о тренировках ${value ? 'включены' : 'выключены'}; `
        + `запланировано=${scheduled}`
      );
    } catch (error) {
      await setTrainingNotificationsEnabled(false).catch(cancelError => {
        console.warn('[Настройки] Не удалось очистить тренировочные напоминания:', cancelError);
      });
      setTrainingNotificationsState(false);
      showOperationError(error, 'Не удалось изменить напоминания о тренировках');
    } finally {
      setTrainingOperation(false);
    }
  };

  const changeTrainingLead = async (minutes: number) => {
    if (minutes === trainingLeadMinutes || trainingOperation) return;
    const previous = trainingLeadMinutes;
    setTrainingLeadState(minutes);
    setTrainingOperation(true);
    if (trainingNotificationsEnabled) showOperation('Обновление времени напоминаний…');
    try {
      const scheduled = await setTrainingNotificationLeadMinutes(minutes);
      if (trainingNotificationsEnabled) setModalVisible(false);
      console.log(`[Настройки] Новое опережение: ${minutes} мин.; запланировано=${scheduled}`);
    } catch (error) {
      await setTrainingNotificationLeadMinutes(previous).catch(restoreError => {
        console.warn('[Настройки] Не удалось восстановить прежний интервал:', restoreError);
      });
      setTrainingLeadState(previous);
      showOperationError(error, 'Не удалось изменить время напоминания');
    } finally {
      setTrainingOperation(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={commonStyles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Icon name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Настройки</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>PUSH-уведомления</Text>
        <View style={styles.settingSection}>
          <View style={styles.settingItem}>
            <View style={styles.settingText}>
              <Text style={styles.settingTitle}>Сообщения команды</Text>
              <Text style={styles.settingSubtitle}>
                {!remotePushNotificationsSupported
                  ? 'Недоступны в Expo Go — используйте development или preview-сборку'
                  : messengerNotificationsEnabled && !messengerPermissionGranted
                  ? 'Включены в учётной записи, но запрещены в настройках этого устройства'
                  : isMessengerAuthenticated
                  ? 'Получать новые сообщения мессенджера со звуком и бейджем непрочитанных'
                  : 'Станет доступно после активации учётной записи мессенджера'}
              </Text>
            </View>
            {messengerChecking ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Switch
                value={messengerNotificationsEnabled}
                onValueChange={toggleMessengerNotifications}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={messengerNotificationsEnabled ? colors.white : colors.textSecondary}
                ios_backgroundColor={colors.border}
                disabled={
                  !remotePushNotificationsSupported
                  || !isMessengerAuthenticated
                  || messengerOperation
                  || modalVisible
                }
              />
            )}
          </View>

          <View style={styles.divider} />

          <View style={styles.settingItem}>
            <View style={styles.settingText}>
              <Text style={styles.settingTitle}>Уведомления о матчах</Text>
              <Text style={styles.settingSubtitle}>
                {remotePushNotificationsSupported
                  ? 'Получать серверные уведомления о предстоящих и текущих играх команды'
                  : 'Недоступны в Expo Go — используйте development или preview-сборку'}
              </Text>
            </View>
            {isChecking ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Switch
                value={matchNotificationsEnabled}
                onValueChange={toggleMatchNotifications}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={matchNotificationsEnabled ? colors.white : colors.textSecondary}
                ios_backgroundColor={colors.border}
                disabled={!remotePushNotificationsSupported || modalVisible}
              />
            )}
          </View>

          <View style={styles.divider} />

          <View style={styles.settingItem}>
            <View style={styles.settingText}>
              <Text style={styles.settingTitle}>Уведомления о тренировках</Text>
              <Text style={styles.settingSubtitle}>
                Локальное напоминание перед каждым занятием из сохранённого расписания
              </Text>
            </View>
            {isChecking ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Switch
                value={trainingNotificationsEnabled}
                onValueChange={toggleTrainingNotifications}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={trainingNotificationsEnabled ? colors.white : colors.textSecondary}
                ios_backgroundColor={colors.border}
                disabled={trainingOperation || modalVisible}
              />
            )}
          </View>

          <View style={styles.leadBlock}>
            <Text style={styles.leadLabel}>Напомнить до начала</Text>
            <View style={styles.leadOptions}>
              {LEAD_OPTIONS.map(minutes => {
                const active = trainingLeadMinutes === minutes;
                return (
                  <TouchableOpacity
                    key={minutes}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active, disabled: trainingOperation }}
                    onPress={() => changeTrainingLead(minutes)}
                    disabled={trainingOperation}
                    style={[styles.leadOption, active && styles.leadOptionActive]}
                  >
                    <Text style={[styles.leadOptionText, active && styles.leadOptionTextActive]}>
                      {formatLead(minutes)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>

        <Text style={styles.footnote}>
          Напоминания о тренировках хранятся на устройстве и продолжают работать без интернета.
          После изменения расписания они автоматически перепланируются.
        </Text>
      </ScrollView>

      <Modal transparent visible={modalVisible} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {showError ? (
              <Icon name="alert-circle" size={32} color={colors.error} />
            ) : (
              <ActivityIndicator size="large" color={colors.primary} />
            )}
            <Text style={[styles.modalText, showError && styles.modalError]}>{modalMessage}</Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: { padding: 4 },
  headerTitle: { marginLeft: 8, fontSize: 28, fontWeight: '800', color: colors.text },
  content: { padding: 16, paddingBottom: 40 },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 16 },
  settingSection: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  settingItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  settingText: { flex: 1, marginRight: 16 },
  settingTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 4 },
  settingSubtitle: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 18 },
  leadBlock: { marginTop: 18 },
  leadLabel: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 10 },
  leadOptions: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  leadOption: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
    margin: 4,
    backgroundColor: colors.background,
  },
  leadOptionActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  leadOptionText: { fontSize: 13, fontWeight: '600', color: colors.text },
  leadOptionTextActive: { color: colors.white },
  footnote: { marginTop: 14, fontSize: 12, lineHeight: 18, color: colors.textSecondary },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '80%',
    padding: 24,
    backgroundColor: colors.surface,
    borderRadius: 16,
    alignItems: 'center',
  },
  modalText: { marginTop: 16, fontSize: 16, color: colors.text, textAlign: 'center' },
  modalError: { color: colors.error },
});
