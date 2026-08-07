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
import { apiService } from '../services/apiService';
import { loadTeamList, saveTeamList, saveTeamLogo } from '../services/teamStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { getUpcomingGamesMasterData } from '../data/gameData';
//import SplashScreen from '../components/SplashScreen';
import { loadStartupConfig, StartupConfig } from '../services/startupApi';
import { fetchTournamentTable, getCachedTournamentConfig } from '../services/tournamentsApi';
import { getGames, getPastGamesForTeam74 } from '../data/gameData';
import Constants from 'expo-constants';
import type { Player } from '../types';
import { initAnalytics, trackEvent } from '../services/analyticsService';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Buffer } from 'buffer';
import NetInfo from '@react-native-community/netinfo';
import { dataAvailability } from '../services/dataAvailability';
import { NetworkStatusProvider } from '../contexts/NetworkStatusContext';
global.Buffer = Buffer;

// === КОНСТАНТЫ ===
const TOURNAMENTS_NOW_KEY = 'tournaments_now';
const TOURNAMENTS_PAST_KEY = 'tournaments_past';
const CURRENT_TOURNAMENT_ID_KEY = 'current_tournament_id';
const TEAMS_VERSION_KEY = 'teams_version';
const PLAYERS_VERSION_KEY = 'players_version';
const APP_VERSION_KEY = 'app_version';
// === КОНСТАНТЫ ДЛЯ СПРАВОЧНИКОВ ===
const LEAGUES_CACHE_KEY = 'api_leagues_cache';
const SEASONS_CACHE_KEY = 'api_seasons_cache';
const VENUES_CACHE_KEY = 'api_venues_cache';

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

const preloadPastGamesInBackground = async () => {
  try {
    console.log('[Preload] 🕰️ Запуск фоновой загрузки архивных игр (последний год)...');
    const now = new Date();
    const startDate = new Date(now);
    startDate.setFullYear(startDate.getFullYear() - 1);
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = now.toISOString().split('T')[0];
    await getGames({
      date_from: startDateStr,
      date_to: endDateStr,
      teams: '74',
      useCache: true,
    });
    console.log('[Preload] ✅ Архивные игры (последний год) загружены и закэшированы');
  } catch (error) {
    console.warn('[Preload] ❌ Ошибка фоновой загрузки архивных игр:', error);
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

// === УЛУЧШЕННАЯ ФУНКЦИЯ ЗАГРУЗКИ КОМАНД С ПРОГРЕССОМ ===
const initializeTeams = async (onTeamLoaded: (loaded: number, total: number) => void): Promise<number> => {
  try {
    const teams = await apiService.fetchTeamList();
    const total = teams.length;
    onTeamLoaded(0, total);
    await saveTeamList(teams);

    let documentDir = FileSystem.documentDirectory;
    if (!documentDir) {
      await new Promise(resolve => setTimeout(resolve, 150));
      documentDir = FileSystem.documentDirectory;
    }
    if (!documentDir) return 0;

    const logoDirPath = `${documentDir}team_logos`;
    const dirInfo = await FileSystem.getInfoAsync(logoDirPath);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(logoDirPath, { intermediates: true });
    } else {
      const files = await FileSystem.readDirectoryAsync(logoDirPath);
      await Promise.all(
        files.map(file => FileSystem.deleteAsync(`${logoDirPath}/${file}`, { idempotent: true }))
      );
    }

    const logoKeys = teams.map(team => `team_logo_${team.id}`);
    await AsyncStorage.multiRemove(logoKeys);

    let loadedCount = 0;
    const downloadPromises = teams.map(async (team) => {
      if (team.logo_url) {
        const fileName = `team_${team.id}.jpg`;
        const fileUri = `${logoDirPath}/${fileName}`;
        try {
          const result = await FileSystem.downloadAsync(team.logo_url, fileUri);
          if (result.status === 200) {
            await saveTeamLogo(team.id, result.uri);
          }
        } catch (err) {
          console.warn(`Failed to download logo for team ${team.id}:`, err);
        }
      }
      loadedCount++;
      onTeamLoaded(loadedCount, total);
      return true;
    });

    await Promise.all(downloadPromises);
    return teams.length;
  } catch (error) {
    console.error('💥 Failed to initialize teams:', error);
    throw error;
  }
};

const restoreReferenceDataFromStorage = async (): Promise<boolean> => {
  try {
    const [leaguesJson, seasonsJson, venuesJson] = await Promise.all([
      AsyncStorage.getItem(LEAGUES_CACHE_KEY),
      AsyncStorage.getItem(SEASONS_CACHE_KEY),
      AsyncStorage.getItem(VENUES_CACHE_KEY),
    ]);
    let hasAll = true;
    if (leaguesJson) {
      const leagues = JSON.parse(leaguesJson);
      leagues.forEach((league: any) => {
        apiService['leagueCache'][league.id] = league;
      });
    } else hasAll = false;
    if (seasonsJson) {
      const seasons = JSON.parse(seasonsJson);
      seasons.forEach((season: any) => {
        apiService['seasonCache'][season.id] = season;
      });
    } else hasAll = false;
    if (venuesJson) {
      const venues = JSON.parse(venuesJson);
      venues.forEach((venue: any) => {
        apiService['venueCache'][venue.id] = venue;
      });
    } else hasAll = false;
    return hasAll;
  } catch (error) {
    console.warn('Failed to restore reference data from storage:', error);
    return false;
  }
};

const forceReloadReferenceData = async () => {
  const [leaguesRes, seasonsRes, venuesRes] = await Promise.all([
    apiService.fetchLeagues(),
    apiService.fetchSeasons(),
    apiService.fetchVenues(),
  ]);
  await Promise.all([
    AsyncStorage.setItem(LEAGUES_CACHE_KEY, JSON.stringify(leaguesRes.data)),
    AsyncStorage.setItem(SEASONS_CACHE_KEY, JSON.stringify(seasonsRes.data)),
    AsyncStorage.setItem(VENUES_CACHE_KEY, JSON.stringify(venuesRes.data)),
  ]);
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
      const networkState = await NetInfo.fetch();
      const canUseNetwork = networkState.isConnected !== false && networkState.isInternetReachable !== false;
      if (configResult.source === 'cache') {
        setDynamicStatus('Используется последняя сохранённая конфигурация');
      }
      const currentAppVersion = Constants.expoConfig?.version || '1.0.0';
      const lastAppVersion = await AsyncStorage.getItem(APP_VERSION_KEY);
      const appWasUpdated = currentAppVersion !== lastAppVersion;
      const localTeamsVersion = parseInt(await AsyncStorage.getItem(TEAMS_VERSION_KEY) || '0');
      const shouldUpdateTeams = canUseNetwork && (config.teams_version > localTeamsVersion || appWasUpdated);
      
      console.log("Начали Восстановление справочников из AsyncStorage");
      // === 2. Восстановление справочников из AsyncStorage ===
      let referenceDataRestored = false;
      if (!shouldUpdateTeams) {
        referenceDataRestored = await restoreReferenceDataFromStorage();
        setProgress(15);
      }

      // === 3. Команды и справочники ===
      console.log("Начали загрузку списка команд");
      const existingTeams = await loadTeamList();
      const hasCachedTeams = existingTeams && existingTeams.length > 0;
      let teamsCount = existingTeams?.length || 0;

      if (shouldUpdateTeams || !hasCachedTeams) {
        if (!canUseNetwork && !hasCachedTeams) {
          throw new Error('Нет сохранённых данных команд. Для первого запуска требуется интернет.');
        }
        try {
          setInitializationMessage('Обновление команд...');
          setProgress(20);
          teamsCount = await initializeTeams((loaded, total) => {
            setDynamicStatus(`Загружено команд ${loaded} из ${total}`);
          });
          await forceReloadReferenceData();
          await AsyncStorage.setItem(TEAMS_VERSION_KEY, String(config.teams_version));
          await AsyncStorage.setItem(APP_VERSION_KEY, currentAppVersion);
        } catch (error) {
          if (!hasCachedTeams) throw error;
          dataAvailability.markCachedDataUsed('Не удалось обновить команды и справочники');
          teamsCount = existingTeams?.length || 0;
          await restoreReferenceDataFromStorage();
        }
      } else {
        if (!referenceDataRestored) {
          if (canUseNetwork) {
            setInitializationMessage('Восстановление справочников...');
            setProgress(25);
            try {
              await forceReloadReferenceData();
            } catch {
              dataAvailability.markCachedDataUsed('Справочники не удалось обновить');
            }
          } else {
            dataAvailability.markCachedDataUsed();
          }
        }
        setDynamicStatus(`Загружено команд ${teamsCount}`);
        setProgress(30);
      }


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

      // === 4.  Фоновая предзагрузка прошедших игр для команды 74
      setDynamicStatus(`Загрузка основных данных программы`);
      setInitializationMessage('Фоновая загрузка прошедших игр...');
      setProgress(40);
      getPastGamesForTeam74()
        .then(games => {
          console.log(`✅ Preloaded ${games.length} past games for team 74 in background`);
        })
        .catch(err => {
          console.warn('⚠️ Failed to preload past games for team 74:', err);
        });

      // === 5. Игроки ===
      const localPlayersVersion = parseInt(await AsyncStorage.getItem(PLAYERS_VERSION_KEY) || '0');
      const shouldUpdatePlayers = canUseNetwork && config.players_version > localPlayersVersion;
      console.log('🔍 Players version check:', {
        configVersion: config.players_version,
        localVersion: localPlayersVersion,
        shouldUpdate: shouldUpdatePlayers
      });
      const playersDataLoaded = await playerDownloadService.isDataLoaded();
      let playersList: Player[] = [];
      if (shouldUpdatePlayers || !playersDataLoaded) {
        if (!canUseNetwork && !playersDataLoaded) {
          throw new Error('Нет сохранённых данных игроков. Для первого запуска требуется интернет.');
        }
        console.log('🔄 Запуск ПРИНУДИТЕЛЬНОЙ перезагрузки игроков (версия обновлена)');
        setInitializationMessage('Загрузка данных игроков...');
        setProgress(55);
        try {
          playersList = await playerDownloadService.refreshPlayersData(config.players_version, (stage, message) => {
            setDynamicStatus(message || stage);
          });
          await AsyncStorage.setItem(PLAYERS_VERSION_KEY, String(config.players_version));
          console.log('✅ Версия игроков сохранена:', config.players_version);
        } catch (error) {
          playersList = await playerDownloadService.getPlayersFromStorage();
          if (playersList.length === 0) throw error;
          await playerDownloadService.setDataLoaded(true);
          dataAvailability.markCachedDataUsed('Не удалось обновить данные игроков');
        }
      } else {
        playersList = await playerDownloadService.getPlayersFromStorage();
        setDynamicStatus(`Загружено игроков ${playersList.length}`);
        console.log('📦 Игроки загружены из кэша');
      }

      // ✅ Проверяем фото ТОЛЬКО если игроки были загружены из кэша (не при полной перезагрузке)
      if (canUseNetwork && playersList.length > 0 && !(shouldUpdatePlayers || !playersDataLoaded)) {
        setInitializationMessage('Проверка фото игроков...');
        setProgress(70);
        setDynamicStatus('Анализ целостности фото...');

        try {
          await playerDownloadService.verifyAndRestorePlayerPhotosFromApi(
            playersList,
            (current, total) => {
              if (total === 0) {
                setDynamicStatus('Все фото на месте — восстановление не требуется');
              } else if (current < total) {
                setDynamicStatus(`Восстанавливаем фото: ${current} из ${total}`);
              } else {
                setDynamicStatus(`✅ Восстановлено ${total} фото`);
              }
            }
          );
        } catch (err) {
          console.warn('⚠️ Ошибка при проверке фото игроков:', err);
          setDynamicStatus('Ошибка при восстановлении фото');
        }
      }

      // === 7. Фоновые задачи (запускаем после основного прогресса) ===
      setDynamicStatus(`Запуск фоновых задач`);
      setInitializationMessage('Финальная настройка...');
      setProgress(80);
      initializeTournamentsInBackground(config);
      preloadCurrentTournamentGames(config);
      preloadPastGamesInBackground();

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
    <NetworkStatusProvider>
      <RootLayoutContent />
    </NetworkStatusProvider>
  );
}
