// _layout.tsx
import React, { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../styles/commonStyles';
import { getPlayers, refreshPlayersData, clearPlayersData } from '../data/playerData';
import PlayerDataLoadingScreen from '../components/PlayerDataLoadingScreen';
import { apiService } from '../services/apiService';
import { loadTeamList, saveTeamList, saveTeamLogo } from '../services/teamStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { getGames,  getUpcomingGamesMasterData, getFutureGames, getGameById, getGameDetailsCacheKeys} from '../data/gameData'; 
import SplashScreen from '../components/SplashScreen'; 
import { fetchStartupConfig, StartupConfig } from '../services/startupApi';
import { fetchTournamentTable } from '../services/tournamentsApi';

// === НОВЫЕ КОНСТАНТЫ ДЛЯ ХРАНЕНИЯ ТУРНИРОВ ===
const TOURNAMENTS_NOW_KEY = 'tournaments_now';
const TOURNAMENTS_PAST_KEY = 'tournaments_past';
const CURRENT_TOURNAMENT_ID_KEY = 'current_tournament_id';

// Ключи для хранения версий в AsyncStorage
const TEAMS_VERSION_KEY = 'teams_version';
const PLAYERS_VERSION_KEY = 'players_version';

// --- ФУНКЦИЯ ИНИЦИАЛИЗАЦИИ ИГРОКОВ (без проверки флага) ---
const initializePlayers = async () => {
  try {
    console.log('🔄 Player initialization triggered (shouldUpdatePlayers = true)...');
    await clearPlayersData();
    console.log('🗑️ Previous player data cleared.');
    console.log('📥 Re-fetching player data...');
    const players = await getPlayers();
    console.log(`✅ Re-loaded ${players.length} players.`);
  } catch (error) {
    console.error('💥 Failed to re-initialize players:', error);
  }
};

// --- ФУНКЦИЯ ИНИЦИАЛИЗАЦИИ КОМАНД (без проверки флага) с возможностью очистки изображений ---
const initializeTeams = async () => {
  try {
    console.log('📥 Fetching team list from API...');
    const teams = await apiService.fetchTeamList();
    console.log(`✅ Fetched ${teams.length} teams`);
    await saveTeamList(teams);
    console.log('💾 Team list saved to AsyncStorage');

    let documentDir = FileSystem.documentDirectory;
    if (!documentDir) {
      console.warn('⚠️ documentDirectory is null, waiting briefly...');
      await new Promise(resolve => setTimeout(resolve, 150));
      documentDir = FileSystem.documentDirectory;
    }
    if (!documentDir) {
      console.error('💥 Could not get document directory. Skipping logo download.');
      return;
    }
    const logoDirPath = `${documentDir}team_logos`;
    const dirInfo = await FileSystem.getInfoAsync(logoDirPath);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(logoDirPath, { intermediates: true });
      console.log('✅ Team logos directory created');
    } else {
      // === ОЧИСТКА ПАПКИ С ЛОГОТИПАМИ ===
      console.log('🧹 Clearing existing team logos directory...');
      const files = await FileSystem.readDirectoryAsync(logoDirPath);
      await Promise.all(
        files.map(file => 
          FileSystem.deleteAsync(`${logoDirPath}/${file}`, { idempotent: true })
        )
      );
      console.log(`✅ Cleared ${files.length} existing logo files`);
    }

    // === ОЧИСТКА КЭША URI В ASYNCSTORAGE ===
    console.log('🧹 Clearing team logo URI cache in AsyncStorage...');
    const logoKeys = teams.map(team => `team_logo_${team.id}`);
    await AsyncStorage.multiRemove(logoKeys);
    console.log('✅ Team logo URI cache cleared');

    console.log('⬇️ Starting fresh team logo downloads...');
    const downloadPromises = teams.map(async (team) => {
      if (team.logo_url) {
        const fileName = `team_${team.id}.jpg`;
        const fileUri = `${logoDirPath}/${fileName}`;
        try {
          const downloadResult = await FileSystem.downloadAsync(team.logo_url, fileUri);
          if (downloadResult.status === 200) {
            await saveTeamLogo(team.id, downloadResult.uri);
            return `Success ${team.id}`;
          } else {
            console.warn(`⚠️ Failed to download logo for team ${team.id}. Status: ${downloadResult.status}`);
            return `Failed ${team.id}`;
          }
        } catch (err) {
          console.error(`❌ Error downloading logo for team ${team.id}:`, err);
          return `Error ${team.id}`;
        }
      } else {
        console.log(`ℹ️ Team ${team.id} has no logo URL`);
        return `No URL ${team.id}`;
      }
    });

    const downloadResults = await Promise.allSettled(downloadPromises);
    const successful = downloadResults.filter(r => r.status === 'fulfilled' && r.value?.startsWith('Success')).length;
    console.log(`📊 Logo download summary: Success: ${successful}`);
    console.log('✅ Teams and logos initialized successfully');
  } catch (error) {
    console.error('💥 Failed to initialize teams:', error);
  }
};

// --- ФУНКЦИЯ ОБНОВЛЕНИЯ ТУРНИРОВ ---
const initializeTournaments = async (config: StartupConfig) => {
  try {
    console.log('📥 Saving tournament lists to AsyncStorage...');
    await AsyncStorage.setItem(TOURNAMENTS_NOW_KEY, JSON.stringify(config.tournamentsNow || []));
    await AsyncStorage.setItem(TOURNAMENTS_PAST_KEY, JSON.stringify(config.tournamentsPast || []));
    console.log('✅ Tournament lists saved.');

    // === ЗАГРУЗКА ТАБЛИЦ ВСЕХ ТУРНИРОВ В КЭШ ===
    const allTournaments = [...(config.tournamentsNow || []), ...(config.tournamentsPast || [])];
    if (allTournaments.length > 0) {
      console.log(`🔄 Загружаем таблицы для ${allTournaments.length} турниров...`);
      await Promise.all(
        allTournaments.map(async (t) => {
          console.log(`🔄 Загружаем таблицу для турнира: ${t.tournament_Name} (${t.tournament_ID})`);
          const table = await fetchTournamentTable(t.tournament_ID);
          console.log(`✅ Таблица турнира ${t.tournament_Name} загружена и сохранена`);
        })
      );
      console.log('✅ Все таблицы турниров сохранены в кэш');
    }

    // === ОПРЕДЕЛЕНИЕ И СОХРАНЕНИЕ ТЕКУЩЕГО ТУРНИРА ===
    const currentTournament = config.tournamentsNow?.[0]; // Берём первый из текущих турниров
    if (currentTournament) {
      const tournamentId = currentTournament.tournament_ID;
      console.log(`🔄 Fetching current tournament data for ID: ${tournamentId}`);
      await AsyncStorage.setItem(CURRENT_TOURNAMENT_ID_KEY, tournamentId); // Сохраняем ID текущего турнира
    } else {
      console.log('ℹ️ No current tournament found in config');
      await AsyncStorage.removeItem(CURRENT_TOURNAMENT_ID_KEY);
    }
  } catch (error) {
    console.error('💥 Failed to initialize tournaments:', error);
  }
};

// --- ФУНКЦИИ ПРЕДЗАГРУЗКИ ---
const preloadPastGames = async () => {
  try {
    const now = new Date();
    const pastDate = new Date(now);
    pastDate.setDate(pastDate.getDate() - 30);
    await getGames({
      date_from: pastDate.toISOString().split('T')[0],
      date_to: now.toISOString().split('T')[0],
      teams: '74',
    });
    console.log('✅ Past games preloaded successfully');
  } catch (error) {
    console.warn('⚠️ Failed to preload past games:', error);
  }
};

const preloadUpcomingGames = async () => {
  try {
    const now = new Date();
    const futureDate = new Date(now);
    futureDate.setDate(futureDate.getDate() + 30);
    await getGames({
      date_from: now.toISOString().split('T')[0],
      date_to: futureDate.toISOString().split('T')[0],
      teams: '74',
    });
    console.log('✅ Upcoming games preloaded successfully');
  } catch (error) {
    console.warn('⚠️ Failed to preload upcoming games:', error);
  }
};

// --- ОСНОВНОЙ КОМПОНЕНТ ---
export default function RootLayout() {
  const [isInitializing, setIsInitializing] = useState(true);
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const [startupConfig, setStartupConfig] = useState<StartupConfig | null>(null);

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      console.log('🚀 Fetching startup configuration...');
      const config = await fetchStartupConfig();
      setStartupConfig(config);
      console.log('✅ Startup config loaded:', config);

      // === СОХРАНЕНИЕ ТУРНИРОВ ===
      await initializeTournaments(config);

      // Получаем локальные версии
      const localTeamsVersion = parseInt(await AsyncStorage.getItem(TEAMS_VERSION_KEY) || '0');
      const localPlayersVersion = parseInt(await AsyncStorage.getItem(PLAYERS_VERSION_KEY) || '0');
      const shouldUpdateTeams = config.teams_version > localTeamsVersion;
      const shouldUpdatePlayers = config.players_version > localPlayersVersion;

      if (shouldUpdateTeams) {
        console.log(`📥 Teams update required: server=${config.teams_version}, local=${localTeamsVersion}`);
        await initializeTeams();
        await AsyncStorage.setItem(TEAMS_VERSION_KEY, String(config.teams_version));
      } else {
        console.log(`⏭️ Team initialization skipped: server=${config.teams_version} <= local=${localTeamsVersion}`);
      }

      if (shouldUpdatePlayers) {
        console.log(`📥 Players update required: server=${config.players_version}, local=${localPlayersVersion}`);
        await initializePlayers();
        await AsyncStorage.setItem(PLAYERS_VERSION_KEY, String(config.players_version));
      } else {
        console.log(`⏭️ Player initialization skipped: server=${config.players_version} <= local=${localPlayersVersion}`);
      }

      // Загрузка основных данных игроков
      await getPlayers();
      console.log('✅ App initialization completed');

      // --- ДОБАВЛЯЕМ КЭШИРОВАНИЕ ВСЕХ ПОЛУЧЕННЫХ ИГР ---
      console.log('🔄 Preloading master upcoming games cache...');
      // Это вызовет getUpcomingGamesMasterData, который сохранит результат в upcomingGamesMasterCache
      await getUpcomingGamesMasterData();
      console.log('✅ Master upcoming games cache preloaded.');
      // --- КОНЕЦ ДОБАВЛЕНИЯ ---

      // --- ПРЕДЗАГРУЗКА ДЕТАЛЕЙ БЛИЖАЙШИХ ИГР (в фоне) ---
      console.log('🔄 Preloading details for future games...');
      const futureGames = await getFutureGames();
      const futureGameIds = futureGames.map(g => g.id);
      console.log(`📥 Preloading details for ${futureGameIds.length} future games:`, futureGameIds);

      // 🔥 ЗАПУСКАЕМ В ФОНЕ, НЕ ЖДЁМ!
      futureGameIds.forEach(id => {
        getGameById(id, true).catch(err => {
          console.warn(`⚠️ Preload of future game ${id} details failed:`, err);
        });
      });

      console.log('✅ Future games details preloading initiated (background).');



      setIsInitializing(false);

      // Предзагрузка игр в фоне
      //preloadPastGames().catch(console.warn);
      //preloadUpcomingGames().catch(console.warn);
    } catch (error) {
      console.error('💥 App initialization failed:', error);
      setInitializationError('Ошибка инициализации приложения');
      setIsInitializing(false);
    }
  };

  if (isInitializing) {
    return <SplashScreen />;
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
        <Stack.Screen name="tournaments" />
        <Stack.Screen name="tournaments/[id]" />
        <Stack.Screen name="coaches" />
        <Stack.Screen name="test-tabs" />
      </Stack>
    </GestureHandlerRootView>
  );
}