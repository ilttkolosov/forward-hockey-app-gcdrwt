// _layout.tsx
import React, { useCallback, useEffect, useState, useRef } from 'react';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { colors } from '../styles/commonStyles';
import { playerDownloadService } from '../services/playerDataService';
import PlayerDataLoadingScreen from '../components/PlayerDataLoadingScreen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getUpcomingGamesMasterData } from '../data/gameData';
//import SplashScreen from '../components/SplashScreen';
import { loadStartupConfig, StartupConfig } from '../services/startupApi';
import { fetchTournamentTable, getCachedTournamentConfig } from '../services/tournamentsApi';
import { getGames } from '../data/gameData';
import type { Player } from '../types';
import { initAnalytics, trackEvent } from '../services/analyticsService';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Buffer } from 'buffer';
import NetInfo from '@react-native-community/netinfo';
import { dataAvailability } from '../services/dataAvailability';
import { NetworkStatusProvider } from '../contexts/NetworkStatusContext';
import { SQLiteProvider } from 'expo-sqlite';
import { DATABASE_ASSET_SOURCE, DATABASE_NAME, migrateDatabase } from '../database';
import { initializeReferenceData } from '../services/referenceDataService';
import { syncCompletedHistoricalGames } from '../services/historicalSync';
import { showAppUpdateNotice } from '../services/appUpdateService';
global.Buffer = Buffer;

// === КОНСТАНТЫ ===
const TOURNAMENTS_NOW_KEY = 'tournaments_now';
const TOURNAMENTS_PAST_KEY = 'tournaments_past';
const CURRENT_TOURNAMENT_ID_KEY = 'current_tournament_id';
const PLAYERS_VERSION_KEY = 'players_version';

// --- ФОНОВЫЕ ФУНКЦИИ ---
const initializeTournamentsInBackground = async (config: StartupConfig) => {
  try {
    await AsyncStorage.setItem(TOURNAMENTS_NOW_KEY, JSON.stringify(config.tournamentsNow || []));
    await AsyncStorage.setItem(TOURNAMENTS_PAST_KEY, JSON.stringify(config.tournamentsPast || []));
    const allTournaments = [...(config.tournamentsNow || []), ...(config.tournamentsPast || [])];
    if (allTournaments.length > 0) {
      await Promise.all(
        allTournaments.map(async (t) => {
          await fetchTournamentTable(t.tournament_ID);
        })
      );
    }
    const currentTournament = config.tournamentsNow?.[0];
    if (currentTournament) {
      await AsyncStorage.setItem(CURRENT_TOURNAMENT_ID_KEY, currentTournament.tournament_ID);
    } else {
      await AsyncStorage.removeItem(CURRENT_TOURNAMENT_ID_KEY);
    }
  } catch (e) {
    console.error('Failed to initialize tournaments in background:', e);
  }
};

const preloadCurrentTournamentGames = async (config: StartupConfig) => {
  try {
    const currentTournament = config.tournamentsNow?.[0];
    if (!currentTournament?.tournament_ID) return;
    const tournamentId = currentTournament.tournament_ID;
    console.log(`[Preload] Loading full config for tournament ${tournamentId}...`);
    const fullConfig = await getCachedTournamentConfig(tournamentId);
    if (!fullConfig?.league_id || !fullConfig?.season_id) {
      console.warn(`[Preload] Missing league_id or season_id for tournament ${tournamentId}`);
      return;
    }
    const league = String(fullConfig.league_id);
    const season = String(fullConfig.season_id);
    console.log(`[Preload] 🎮 Загрузка игр для турнира ${tournamentId} (лига=${league}, сезон=${season})`);
    await getGames({ league, season, useCache: true });
    console.log(`[Preload] ✅ Игры для турнира ${tournamentId} предзагружены и закэшированы`);
  } catch (error) {
    console.warn('[Preload] Ошибка предзагрузки игр текущего турнира:', error);
  }
};

// --- СПЛАШ-СКРИН С ДИНАМИЧЕСКИМ СТАТУСОМ ПРОГРЕССА ---
const SplashScreenWithProgress = ({ 
  message, 
  progressAnimated,
  dynamicStatus 
}: { 
  message: string; 
  progressAnimated: Animated.Value;
  dynamicStatus: string;
}) => {
  const progressInterpolated = progressAnimated.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={progressStyles.container}>
      {/* Логотип: расположен "между верхом и заголовком" */}
      <Image
        source={require('../assets/icons/myIcon.png')} 
        style={progressStyles.logo}
        resizeMode="contain"
      />
      <Text style={progressStyles.title}>ХК Динамо Форвард 2014</Text>
      <Text style={progressStyles.message}>{message}</Text>
      <Text style={[progressStyles.message, { marginTop: 8, fontSize: 13, color: colors.text }]}>
        {dynamicStatus}
      </Text>
      <View style={progressStyles.progressBarContainer}>
        <Animated.View style={[progressStyles.progressBar, { width: progressInterpolated }]} />
      </View>
    </View>
  );
};

const progressStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-start', // ← теперь не центрируем всё, а начинаем сверху
    alignItems: 'center',
    backgroundColor: colors.background,
    paddingTop: 100, // ← отступ сверху, чтобы логотип не упирался в статус-бар
    paddingHorizontal: 32,
  },
  logo: {
    width: 200,
    height: 200,
    marginBottom: 50, // ← отступ до заголовка
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
  },
  progressBarContainer: {
    height: 4,
    width: '80%',
    backgroundColor: colors.border,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 8,
  },
  progressBar: {
    height: '100%',
    backgroundColor: colors.primary,
  },
});

/**
 * Фоновая проверка статуса push-уведомлений и обновление локального флага
 */
const syncPushSubscriptionStatus = async () => {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      await AsyncStorage.setItem('push_notifications_enabled', 'false');
      console.log('✅ Push disabled: permission not granted');
      return;
    }

    const tokenObj = await Notifications.getExpoPushTokenAsync();
    const token = tokenObj.data;

    // Отправляем запрос на проверку подписки
    const response = await fetch('https://www.hc-forward.com/wp-json/app/v1/push-subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });

    const result = await response.json();

    if (!response.ok || result.status !== 'success') {
      throw new Error(result.error || 'Неизвестная ошибка');
    }

    const isEnabled = result.data.is_subscribed;
    await AsyncStorage.setItem('push_notifications_enabled', String(isEnabled));
    console.log('✅ Push subscription status synced:', isEnabled ? 'enabled' : 'disabled');
  } catch (error) {
    console.warn('⚠️ Failed to sync push subscription status:', error);
  }
};


// --- ОСНОВНОЙ КОМПОНЕНТ ---
function RootLayoutContent() {
  const [isInitializing, setIsInitializing] = useState(true);
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const [initializationMessage, setInitializationMessage] = useState('Запуск приложения...');
  const [dynamicStatus, setDynamicStatus] = useState<string>('Подготовка данных...');
  const progressAnimated = useRef(new Animated.Value(0)).current;

  const setProgress = useCallback((value: number) => {
    Animated.timing(progressAnimated, {
      toValue: value,
      duration: 300,
      easing: Easing.out(Easing.ease),
      useNativeDriver: false,
    }).start();
  }, [progressAnimated]);

  const initializeApp = useCallback(async () => {
    setInitializationError(null);
    setIsInitializing(true);

    // Инициализация аналитики — делаем ДО загрузки конфига
    await initAnalytics();

    // Фоновая синхронизация статуса push-подписки
    syncPushSubscriptionStatus();

    // === Отслеживаем загрузку предстоящих игр ===
    let upcomingGamesPromise: Promise<void> | null = null;
    let upcomingGamesFinished = false;

    try {
      // === 1. Конфигурация ===
      setInitializationMessage('Получение конфигурации...');
      setProgress(5);
      console.log("Начали инициализацию приложения");
      const configResult = await loadStartupConfig();
      const config = configResult.data;
      void showAppUpdateNotice(config);
      const networkState = await NetInfo.fetch();
      const canUseNetwork = networkState.isConnected !== false && networkState.isInternetReachable !== false;
      if (configResult.source === 'cache') {
        setDynamicStatus('Используется последняя сохранённая конфигурация');
      }
      console.log('Начали загрузку справочников из SQLite');
      setInitializationMessage('Подготовка локальных справочников...');
      setProgress(15);
      const { teamsCount } = await initializeReferenceData(config, canUseNetwork);
      setDynamicStatus(`Загружено команд ${teamsCount}`);
      setProgress(30);


      // === 3.1 ЗАПУСКАЕМ загрузку предстоящих игр в фоне (не ждём) ===
      console.log('🚀 Запуск фоновой загрузки предстоящих игр...');
      upcomingGamesPromise = getUpcomingGamesMasterData()
      .then(() => {
        upcomingGamesFinished = true;
        console.log('✅ Предстоящие игры загружены в фоне');
      })
      .catch(err => {
        upcomingGamesFinished = true; // даже при ошибке считаем "завершённой"
        console.warn('⚠️ Ошибка фоновой загрузки предстоящих игр:', err);
      });

      // === 5. Игроки ===
      setInitializationMessage('Подготовка игроков и фотографий...');
      setProgress(55);
      let playersList: Player[] = [];
      try {
        playersList = await playerDownloadService.initializeFromDatabase(
          config.players_version,
          canUseNetwork,
          (stage, message) => setDynamicStatus(message || stage)
        );
        await AsyncStorage.setItem(PLAYERS_VERSION_KEY, String(config.players_version));
      } catch (error) {
        playersList = await playerDownloadService.getPlayersFromStorage();
        if (playersList.length === 0) throw error;
        dataAvailability.markCachedDataUsed('Не удалось обновить данные игроков');
      }
      setDynamicStatus(`Загружено игроков ${playersList.length}`);
      setProgress(70);

      if (canUseNetwork) {
        void syncCompletedHistoricalGames(config.sync).catch(error => {
          console.warn('[HistoricalSync] Фоновая синхронизация не выполнена:', error);
        });
      }

      // === 7. Фоновые задачи (запускаем после основного прогресса) ===
      setDynamicStatus(`Запуск фоновых задач`);
      setInitializationMessage('Финальная настройка...');
      setProgress(80);
      initializeTournamentsInBackground(config);
      preloadCurrentTournamentGames(config);

      // === Ожидаем завершения загрузки предстоящих игр, если ещё не готово ===
      if (!upcomingGamesFinished && upcomingGamesPromise) {
        setInitializationMessage('Ожидание загрузки предстоящих игр...');
        setDynamicStatus('Завершение загрузки данных игр...');
        setProgress(95);
        await upcomingGamesPromise;
      }


      setInitializationMessage('Готово!');
      setProgress(100);
      setTimeout(() => setIsInitializing(false), 200);

    } catch (error) {
      console.error('💥 App initialization failed:', error);
      setInitializationError(error instanceof Error ? error.message : 'Ошибка инициализации приложения');
      setIsInitializing(false);
    }
  }, [setProgress]);

  useEffect(() => {
    initializeApp();
  }, [initializeApp]);

  if (isInitializing) {
    return <SplashScreenWithProgress 
      message={initializationMessage} 
      progressAnimated={progressAnimated}
      dynamicStatus={dynamicStatus}
    />;
  }

  if (initializationError) {
    return <PlayerDataLoadingScreen error={initializationError} onRetry={initializeApp} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="dark" backgroundColor={colors.background} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="players" />
        <Stack.Screen name="player/[id]" />
        <Stack.Screen name="upcoming" />
        <Stack.Screen name="game/[id]" />
        <Stack.Screen name="season/[id]" />
        <Stack.Screen name="tournaments/[id]" />
        <Stack.Screen name="command/[id]" />
        <Stack.Screen name="mobilegames/[id]" />
      </Stack>
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  return (
    <SQLiteProvider
      databaseName={DATABASE_NAME}
      assetSource={DATABASE_ASSET_SOURCE}
      onInit={migrateDatabase}
    >
      <NetworkStatusProvider>
        <RootLayoutContent />
      </NetworkStatusProvider>
    </SQLiteProvider>
  );
}
