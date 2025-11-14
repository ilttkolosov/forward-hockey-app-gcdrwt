// app/about.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { commonStyles, colors } from '../styles/commonStyles';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LoadingSpinner from '../components/LoadingSpinner';
import { getOrCreateDeviceId } from '../services/analyticsService';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  text: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
    marginBottom: 8,
  },
  licenseText: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  developerLink: {
    color: colors.primary,
    textDecorationLine: 'underline',
  },
});

export default function AboutScreen() {
  const [licenseText, setLicenseText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [playersVersion, setPlayersVersion] = useState<number | null>(null);
  const [teamsVersion, setTeamsVersion] = useState<number | null>(null);

  // Загрузка лицензии
  useEffect(() => {
    const loadLicense = async () => {
      try {
        const response = await fetch('https://www.hc-forward.com/wp-content/themes/marquee/inc/license.txt');
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const text = await response.text();
        setLicenseText(text);
      } catch (err) {
        console.error('Не удалось загрузить лицензионное соглашение:', err);
        setError('Не удалось загрузить лицензионное соглашение.');
      } finally {
        setLoading(false);
      }
    };

    loadLicense();
  }, []);

  // Загрузка Device ID из аналитики
  useEffect(() => {
    const loadDeviceId = async () => {
      const id = await getOrCreateDeviceId();
      setDeviceId(id);
    };
    loadDeviceId();
  }, []);

  // Загрузка версий из AsyncStorage
  useEffect(() => {
    const loadVersions = async () => {
      try {
        const [playersVer, teamsVer] = await Promise.all([
          AsyncStorage.getItem('players_version'),
          AsyncStorage.getItem('teams_version'),
        ]);
        setPlayersVersion(playersVer ? parseInt(playersVer, 10) : null);
        setTeamsVersion(teamsVer ? parseInt(teamsVer, 10) : null);
      } catch (err) {
        console.warn('Не удалось загрузить версии данных:', err);
      }
    };
    loadVersions();
  }, []);

  // === ДАННЫЕ ОБ УСТРОЙСТВЕ И ОКРУЖЕНИИ ===
  const appVersion = Constants.expoConfig?.version || Constants.manifest?.version || '1.0.0';
  const deviceModel = Device.modelName || 'Unknown';
  const osVersion = `${Device.osName || 'Unknown'} ${Device.osVersion || ''}`;
  const expoSdkVersion = Constants.expoSdkVersion || '—';
  const expoRuntimeVersion = Constants.expoRuntimeVersion || Constants.manifest?.runtimeVersion || '—';

  const handleEmailPress = () => {
    Linking.openURL('mailto:ilttkolosov@gmail.com');
  };

  const handleWebsitePress = () => {
    Linking.openURL('https://www.hc-forward.com');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>О приложении</Text>
          <Text style={styles.text}>Название: ХК Динамо Форвард 2014</Text>
          <Text style={styles.text}>Версия приложения: {appVersion}</Text>
          <Text style={styles.text}>Версия данных игроков: {playersVersion ?? '—'}</Text>
          <Text style={styles.text}>Версия данных команд: {teamsVersion ?? '—'}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Устройство</Text>
          <Text style={styles.text}>Модель: {deviceModel}</Text>
          <Text style={styles.text}>ОС: {osVersion}</Text>
          <Text style={styles.text}>ID устройства: {deviceId || '—'}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Окружение</Text>
          <Text style={styles.text}>Expo SDK: {expoSdkVersion}</Text>
          <Text style={styles.text}>Expo Runtime: {expoRuntimeVersion}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Разработчик</Text>
          <Text style={styles.text}>
            Aleksandr Kolosov, e-mail:{' '}
            <Text style={styles.developerLink} onPress={handleEmailPress}>
              ilttkolosov@gmail.com
            </Text>
            , сайт:{' '}
            <Text style={styles.developerLink} onPress={handleWebsitePress}>
              https://www.hc-forward.com
            </Text>
            , St.-Petersburg, 2025 г.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Лицензионное соглашение</Text>
          {loading ? (
            <LoadingSpinner />
          ) : error ? (
            <Text style={[styles.text, { color: colors.error }]}>{error}</Text>
          ) : licenseText ? (
            <Text style={styles.licenseText}>{licenseText}</Text>
          ) : (
            <Text style={styles.text}>Лицензионное соглашение отсутствует.</Text>
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}