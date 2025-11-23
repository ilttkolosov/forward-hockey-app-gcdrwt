// app/settings.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Switch,
  StyleSheet,
  Platform,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { commonStyles, colors } from '../styles/commonStyles';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import Icon from '../components/Icon';
import { trackScreenView } from '../services/analyticsService';

const PUSH_ENABLED_KEY = 'push_notifications_enabled';
const OPERATION_TIMEOUT_MS = 6000; // 6 секунд

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const sendTokenToYourServer = async (token: string) => {
  const osVersion = Platform.Version?.toString() || 'unknown';
  const deviceModel = Constants.deviceName || 'Unknown device';
  const appVersion = Constants.expoConfig?.version || '1.0.0';
  const deviceInfo = `${Platform.OS} ${osVersion}, ${deviceModel}, v${appVersion}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OPERATION_TIMEOUT_MS);

  try {
    const response = await fetch('https://www.hc-forward.com/wp-json/app/v1/push-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: token,
        subscriptions: ['team:74'],
        device_info: deviceInfo,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Не удалось сохранить токен');
    }
  } catch (e) {
    clearTimeout(timeoutId);
    if (e.name === 'AbortError') {
      throw new Error('Превышено время ожидания');
    }
    throw e;
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

    clearTimeout(timeoutId);
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Не удалось удалить токен');
    }
  } catch (e) {
    clearTimeout(timeoutId);
    if (e.name === 'AbortError') {
      throw new Error('Превышено время ожидания');
    }
    throw e;
  }
};

const ensurePushPermissions = async (): Promise<boolean> => {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return false;
  }

  try {
    const projectId = Constants?.expoConfig?.extra?.eas?.projectId;
    const tokenObj = await Notifications.getExpoPushTokenAsync({ projectId });
    await sendTokenToYourServer(tokenObj.data);
    await AsyncStorage.setItem('expo_push_token', tokenObj.data);
    return true;
  } catch (e) {
    throw e;
  }
};

export default function SettingsScreen() {
  const [isEnabled, setIsEnabled] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMessage, setModalMessage] = useState('');
  const [showError, setShowError] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const loadSetting = async () => {
      try {
        const value = await AsyncStorage.getItem(PUSH_ENABLED_KEY);
        const enabled = value === 'true';
        setIsEnabled(enabled);
      } catch (err) {
        console.warn('Не удалось загрузить настройки push:', err);
      } finally {
        setIsChecking(false);
      }
    };
    loadSetting();
    trackScreenView('Настройки приложения');
  }, []);

  const togglePush = async (value: boolean) => {
    if (value) {
      // Включение
      setIsEnabled(true);
      setModalMessage('Включение push-уведомлений…');
      setShowError(false);
      setModalVisible(true);

      try {
        const success = await ensurePushPermissions();
        setModalVisible(false); // просто закрываем при успехе
        if (!success) {
          setIsEnabled(false);
          await AsyncStorage.setItem(PUSH_ENABLED_KEY, 'false');
        } else {
          await AsyncStorage.setItem(PUSH_ENABLED_KEY, 'true');
        }
      } catch (error: any) {
        // Показ ошибки в том же модальном окне
        setModalMessage(error.message || 'Неизвестная ошибка');
        setShowError(true);
        setTimeout(() => setModalVisible(false), 2000);
        setIsEnabled(false);
        await AsyncStorage.setItem(PUSH_ENABLED_KEY, 'false');
      }
    } else {
      // Отключение
      setIsEnabled(false);
      setModalMessage('Отключение push-уведомлений…');
      setShowError(false);
      setModalVisible(true);

      try {
        const token = await AsyncStorage.getItem('expo_push_token');
        if (token) {
          await deleteTokenFromServer(token);
          await AsyncStorage.removeItem('expo_push_token');
        }
        await AsyncStorage.setItem(PUSH_ENABLED_KEY, 'false');
        setModalVisible(false); // просто закрываем при успехе
      } catch (error: any) {
        setModalMessage(error.message || 'Не удалось отключить');
        setShowError(true);
        setTimeout(() => setModalVisible(false), 2000);
        // Состояние остаётся выключенным
        await AsyncStorage.setItem(PUSH_ENABLED_KEY, 'false');
      }
    }
  };

  return (
    <SafeAreaView edges={['top']} style={commonStyles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Icon name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[commonStyles.title, { marginLeft: 8 }]}>Настройки приложения</Text>
      </View>

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.settingItem}>
          <View style={styles.settingText}>
            <Text style={styles.settingTitle}>Push-уведомления</Text>
            <Text style={styles.settingSubtitle}>
              Уведомления о матчах команды «Динамо-Форвард»
            </Text>
          </View>
          {isChecking ? (
            <Text style={styles.switchPlaceholder}>Загрузка...</Text>
          ) : (
            <Switch
              value={isEnabled}
              onValueChange={togglePush}
              trackColor={{ false: '#888888', true: colors.primary }}
              thumbColor={isEnabled ? colors.white : '#888888'}
              disabled={modalVisible}
            />
          )}
        </View>
      </View>

      {/* Единое модальное окно */}
      <Modal transparent visible={modalVisible} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {showError ? (
              <Icon name="alert-circle" size={32} color={colors.error} />
            ) : (
              <ActivityIndicator size="large" color={colors.primary} />
            )}
            <Text
              style={[
                styles.modalText,
                { color: showError ? colors.error : colors.text },
              ]}
            >
              {modalMessage}
            </Text>
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
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: 16,
  },
  backButton: {
    padding: 4,
  },
  content: {
    flex: 1,
    padding: 16,
    backgroundColor: colors.background,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  settingText: {
    flex: 1,
    marginRight: 12,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  settingSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  switchPlaceholder: {
    fontSize: 14,
    color: colors.textSecondary,
  },
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
  modalText: {
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
  },
});