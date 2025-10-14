// _layout.tsx
import React, { useEffect, useState, useRef } from 'react';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import { colors } from '../styles/commonStyles';
import { getPlayers, clearPlayersData } from '../data/playerData';
import { playerDownloadService } from '../services/playerDataService';
import PlayerDataLoadingScreen from '../components/PlayerDataLoadingScreen';
import { apiService } from '../services/apiService';
import { loadTeamList, saveTeamList, saveTeamLogo } from '../services/teamStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { getGames, getUpcomingGamesMasterData, getFutureGames, getGameById } from '../data/gameData';
import SplashScreen from '../components/SplashScreen';
import { fetchStartupConfig, StartupConfig } from '../services/startupApi';
import { fetchTournamentTable } from '../services/tournamentsApi';

// === КОНСТАНТЫ ===
const TOURNAMENTS_NOW_KEY = 'tournaments_now';
const TOURNAMENTS_PAST_KEY = 'tournaments_past';
const CURRENT_TOURNAMENT_ID_KEY = 'current_tournament_id';
const TEAMS_VERSION_KEY = 'teams_version';
const PLAYERS_VERSION_KEY = 'players_version';



// --- ФУНКЦИИ ИНИЦИАЛИЗАЦИИ ---
const initializePlayersInBackground = async () => {
  try {
    console.log('🔄 Starting background player data initialization...');
    // PlayerDownloadService сам решит, нужно ли очищать и перезагружать
    await playerDownloadService.refreshPlayersData();
    console.log('✅ Player data initialized in background');
  } catch (e) {
    console.error('❌ Failed to initialize players in background:', e);
  }
};

const initializeTeams = async (): Promise<number> => {
  try {
    const teams = await apiService.fetchTeamList();
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

    const downloadPromises = teams.map(async (team) => {
      if (team.logo_url) {
        const fileName = `team_${team.id}.jpg`;
        const fileUri = `${logoDirPath}/${fileName}`;
        try {
          const result = await FileSystem.downloadAsync(team.logo_url, fileUri);
          if (result.status === 200) {
            await saveTeamLogo(team.id, result.uri);
            return true;
          }
        } catch (err) {
          console.warn(`Failed to download logo for team ${team.id}:`, err);
        }
      }
      return false;
    });

    const results = await Promise.all(downloadPromises);
    const successCount = results.filter(Boolean).length;
    return teams.length;
  } catch (error) {
    console.error('💥 Failed to initialize teams:', error);
    return 0;
  }
};

const initializeTournaments = async (config: StartupConfig) => {
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
    console.error('Failed to initialize tournaments:', e);
  }
};

// --- КОМПОНЕНТ С АНИМИРОВАННЫМ ПРОГРЕСС-БАРОМ ---
const SplashScreenWithProgress = ({ message, progressAnimated }: { message: string; progressAnimated: Animated.Value }) => {
  const progressInterpolated = progressAnimated.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={progressStyles.container}>
      <Text style={progressStyles.title}>ХК Динамо Форвард 2014</Text>
      <Text style={progressStyles.message}>{message}</Text>
      <View style={progressStyles.progressBarContainer}>
        <Animated.View style={[progressStyles.progressBar, { width: progressInterpolated }]} />
      </View>
    </View>
  );
};

const progressStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 24,
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
  },
  progressBar: {
    height: '100%',
    backgroundColor: colors.primary,
  },
});

// --- ОСНОВНОЙ КОМПОНЕНТ ---
export default function RootLayout() {
  const [isInitializing, setIsInitializing] = useState(true);
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const [initializationMessage, setInitializationMessage] = useState('Запуск приложения...');
  const progressAnimated = useRef(new Animated.Value(0)).current;

  const setProgress = (value: number) => {
    Animated.timing(progressAnimated, {
      toValue: value,
      duration: 300, // плавность: 300 мс
      easing: Easing.out(Easing.ease),
      useNativeDriver: false, // обязательно false для width
    }).start();
  };

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      setInitializationMessage('Получение конфигурации...');
      setProgress(5);
      const config = await fetchStartupConfig();

      setInitializationMessage('Инициализация турниров...');
      setProgress(15);
      await initializeTournaments(config);

      const localTeamsVersion = parseInt(await AsyncStorage.getItem(TEAMS_VERSION_KEY) || '0');
      const localPlayersVersion = parseInt(await AsyncStorage.getItem(PLAYERS_VERSION_KEY) || '0');
      const shouldUpdateTeams = config.teams_version > localTeamsVersion;
      const shouldUpdatePlayers = config.players_version > localPlayersVersion;


      // Команды — синхронно (обязательно!)
      let teamsCount = 0;
      if (shouldUpdateTeams) {
        setInitializationMessage('Обновление информации о командах...');
        setProgress(40);
        teamsCount = await initializeTeams();
        await AsyncStorage.setItem(TEAMS_VERSION_KEY, String(config.teams_version));
        setInitializationMessage(`Загружено ${teamsCount} команд`);
      } else {
        // Проверяем: есть ли команды в хранилище?
        const existingTeams = await loadTeamList();
        if (existingTeams && existingTeams.length > 0) {
          teamsCount = existingTeams.length;
          setInitializationMessage(`Команды загружены (${teamsCount})`);
        } else {
          // Первый запуск: команд нет, но обновление не требуется → всё равно загружаем
          setInitializationMessage('Первый запуск: загрузка команд...');
          setProgress(40);
          teamsCount = await initializeTeams();
          await AsyncStorage.setItem(TEAMS_VERSION_KEY, String(config.teams_version));
        }
      }


      setInitializationMessage('Загрузка ближайших игр...');
      setProgress(75);
      await getUpcomingGamesMasterData();



      setInitializationMessage('Загрузка данных игроков...');
      setProgress(90);
      
      //Инициализация игроков
      if (shouldUpdatePlayers) {
        setInitializationMessage('Обновление данных игроков...');
        setProgress(85);
        // Запускаем в фоне — не ждём завершения
        initializePlayersInBackground();
        // Сохраняем новую версию
        await AsyncStorage.setItem(PLAYERS_VERSION_KEY, String(config.players_version));
      } else {
        // Проверяем, загружены ли данные
        const dataLoaded = await playerDownloadService.isDataLoaded();
        if (!dataLoaded) {
          setInitializationMessage('Загрузка данных игроков (первый запуск)...');
          setProgress(85);
          initializePlayersInBackground();
        }
      }

      setInitializationMessage('Готово!');
      setProgress(100);

      setIsInitializing(false);
    } catch (error) {
      console.error('💥 App initialization failed:', error);
      setInitializationError('Ошибка инициализации приложения');
      setIsInitializing(false);
    }
  };

  if (isInitializing) {
    return <SplashScreenWithProgress message={initializationMessage} progressAnimated={progressAnimated} />;
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
        <Stack.Screen name="archive" />
        <Stack.Screen name="game/[id]" />
        <Stack.Screen name="season/[id]" />
        <Stack.Screen name="tournaments/[id]" />
        <Stack.Screen name="coaches" />
        <Stack.Screen name="test-tabs" />
      </Stack>
    </GestureHandlerRootView>
  );
}