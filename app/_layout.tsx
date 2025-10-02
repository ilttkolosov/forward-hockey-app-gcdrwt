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
import * as FileSystem from 'expo-file-system/legacy'; // ✅ Импортируем основной модуль
import { getGames } from '../data/gameData'; 
import SplashScreen from '../components/SplashScreen'; 

const shouldUpdateTeams = true; // Признак необходимости обновлять загрузки всех логотипов команд и их названия
const shouldUpdatePlayers = false; // Признак необходимости обновить данные игроков (включая фото)

// --- ФУНКЦИЯ ИНИЦИАЛИЗАЦИИ ИГРОКОВ ---
const initializePlayers = async () => {
  if (!shouldUpdatePlayers) {
    console.log('Player initialization skipped by flag (shouldUpdatePlayers = false)');
    return;
  }

  try {
    console.log('🔄 Player initialization triggered by flag (shouldUpdatePlayers = true)...');
    // Здесь можно выбрать способ обновления:
    // 1. Полная очистка и перезагрузка:
    // await clearPlayersData(); // Очищает ВСЁ (данные, фото, флаги)
    // await getPlayers(); // Загружает снова

    // 2. Принудительная перезагрузка (если ваш playerDownloadService поддерживает это):
    // await refreshPlayersData(); // Реализация зависит от того, как вы обновили playerData.ts/playerDownloadService.ts

    // 3. Принудительная перезагрузка ТОЛЬКО фото (если ваш playerDownloadService поддерживает флаг PLAYER_PHOTOS_DOWNLOADED_KEY):
    // Это требует доработки playerDownloadService.ts, чтобы refresh/loadAllPlayersData учитывал этот флаг.
    // Например, можно добавить параметр forcePhotoReload в loadAllPlayersData.
    // Пока используем полную перезагрузку.

    await clearPlayersData(); // Проще и надежнее для начала
    console.log('🗑️ Previous player data cleared.');

    console.log('📥 Re-fetching player data...');
    const players = await getPlayers(); // Это вызовет loadAllPlayersData, так как флаги сброшены
    console.log(`✅ Re-loaded ${players.length} players.`);
  } catch (error) {
    console.error('💥 Failed to re-initialize players:', error);
    // Можно показать уведомление об ошибке пользователю
  }
};


// --- ИСПРАВЛЕННАЯ ФУНКЦИЯ ИНИЦИАЛИЗАЦИИ КОМАНД ---
const initializeTeams = async () => {
  if (!shouldUpdateTeams) {
    console.log('📥 Team initialization skipped by flag (shouldUpdateTeams = false)');
    return;
  }

  try {
    console.log('📥 Fetching team list from API...');
    const teams = await apiService.fetchTeamList(); // Получаем список команд
    console.log(`✅ Fetched ${teams.length} teams`);

    await saveTeamList(teams); // Сохраняем список в AsyncStorage
    console.log('💾 Team list saved to AsyncStorage');

    // --- РАБОТА С ФАЙЛОВОЙ СИСТЕМОЙ ---
      console.log('📂 Attempting to get document directory...');
      let documentDir = FileSystem.documentDirectory;

      // Простая задержка на случай, если documentDirectory ещё не инициализирован
      if (!documentDir) {
          console.warn('⚠️ documentDirectory is null, waiting briefly...');
          await new Promise(resolve => setTimeout(resolve, 150)); // Подождать 150мс
          documentDir = FileSystem.documentDirectory;
      }

      if (!documentDir) {
        const errorMsg = '💥 Could not get document directory from FileSystem (legacy). Skipping logo download.';
        console.error(errorMsg);
        return;
      }
      console.log('📂 Document directory obtained (legacy):', documentDir);
        // --- КОНЕЦ НАДЕЖНОГО ПОЛУЧЕНИЯ ---

    // 2. Формируем путь к папке для логотипов
    const logoDirPath = `${documentDir}team_logos`;

    // 3. Создаём папку для логотипов, если она не существует
    console.log('📂 Ensuring team logos directory exists...');
    const dirInfo = await FileSystem.getInfoAsync(logoDirPath);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(logoDirPath, { intermediates: true });
      console.log('✅ Team logos directory created');
    } else {
      console.log('✅ Team logos directory already exists');
    }

    // 4. (Опционально) Очищаем папку перед загрузкой (если нужно)
    // ⚠️ ВНИМАНИЕ: Это удалит ВСЕ файлы в папке!
    // console.log('🧹 Clearing existing logo directory contents...');
    // try {
    //   const files = await FileSystem.readDirectoryAsync(logoDirPath);
    //   await Promise.all(files.map(file => FileSystem.deleteAsync(`${logoDirPath}/${file}`, { idempotent: true })));
    //   console.log('✅ Logo directory contents cleared');
    // } catch (error) {
    //   console.warn('⚠️ Failed to clear logo directory contents:', error);
    // }

    // 5. Загружаем логотипы для каждой команды
    console.log('⬇️ Starting team logo downloads...');
    // Используем Promise.allSettled, чтобы ошибка загрузки одного логотипа не остановила весь процесс
    const downloadPromises = teams.map(async (team) => {
      if (team.logo_url) {
        try {
          console.log(`🖼️  Preparing download for logo of team ${team.id}: ${team.name}`);
          // Формируем уникальное имя файла для логотипа
          const fileName = `team_${team.id}.jpg`; // Или .png, проверьте формат на сервере
          const fileUri = `${logoDirPath}/${fileName}`;

          // Проверяем, существует ли файл уже
          const fileInfo = await FileSystem.getInfoAsync(fileUri);
          if (fileInfo.exists) {
             console.log(`ℹ️  Logo for team ${team.id} already exists locally, skipping download.`);
             // Убедимся, что URI сохранен в AsyncStorage
             await saveTeamLogo(team.id, fileUri);
             return `Skipped ${team.id}`; // Возвращаем результат для Promise.allSettled
          }

          // Загружаем файл
          console.log(`⬇️  Downloading logo for team ${team.id} from ${team.logo_url}`);
          const downloadResult = await FileSystem.downloadAsync(team.logo_url, fileUri);

          if (downloadResult.status === 200) {
            console.log(`✅ Logo downloaded for team ${team.id}: ${downloadResult.uri}`);
            // Сохраняем URI локального файла в AsyncStorage
            await saveTeamLogo(team.id, downloadResult.uri);
            console.log(`💾 Logo URI saved for team ${team.id}`);
            return `Success ${team.id}`;
          } else {
            const warnMsg = `⚠️ Failed to download logo for team ${team.id}. Status: ${downloadResult.status}`;
            console.warn(warnMsg);
            return `Failed ${team.id} (Status ${downloadResult.status})`;
          }
        } catch (err) {
          // Обрабатываем ошибки загрузки конкретного файла
          const errMsg = `❌ Error downloading logo for team ${team.id}: ${err.message || err}`;
          console.error(errMsg);
          // Можно сохранить null или пустую строку, если логотип не загрузился
          // await saveTeamLogo(team.id, null);
          return `Error ${team.id}`;
        }
      } else {
        console.log(`ℹ️ Team ${team.id} has no logo URL`);
        // Опционально: сохранить null/пустую строку для команд без логотипа
        // await saveTeamLogo(team.id, null);
        return `No URL ${team.id}`;
      }
    });

    // Ждем завершения всех загрузок
    const downloadResults = await Promise.allSettled(downloadPromises);
    
    // Анализируем результаты (опционально)
    const successfulDownloads = downloadResults.filter(r => r.status === 'fulfilled' && r.value?.startsWith('Success')).length;
    const skippedDownloads = downloadResults.filter(r => r.status === 'fulfilled' && r.value?.startsWith('Skipped')).length;
    const failedDownloads = downloadResults.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value?.startsWith('Failed'))).length;
    const errorDownloads = downloadResults.filter(r => r.status === 'fulfilled' && r.value?.startsWith('Error')).length;

    console.log(`📊 Team logo download summary: Success: ${successfulDownloads}, Skipped: ${skippedDownloads}, Failed (HTTP): ${failedDownloads}, Errored: ${errorDownloads}`);

    console.log('✅ Teams and logos initialized successfully (or attempted)');
  } catch (error) {
    // Перехватываем и логируем любые ошибки в этой асинхронной функции
    console.error('💥 Failed to initialize teams:', error);
    // ВАЖНО: Не выбрасываем ошибку дальше с помощью `throw error;`
    // Это предотвратит "падение" всего процесса инициализации приложения (_layout.tsx -> initializeApp)
    // из-за ошибки в инициализации команд. Приложение продолжит работать.
    // Если нужно, чтобы ошибка влияла на initializeApp, раскомментируйте следующую строку:
    // throw error; 
  }
};

// --- ФУНКЦИИ ПРЕДЗАГРУЗКИ ---
/**
 * Предзагружает предшествующие игры (до сегодняшней даты) в фоне
 */
const preloadPastGames = async () => {
  try {
    console.log('🚀 Preloading past games in background...');
    
    // Определяем диапазон дат: последние 30 дней
    const now = new Date();
    const pastDate = new Date(now);
    pastDate.setDate(pastDate.getDate() - 30);
    const pastDateString = pastDate.toISOString().split('T')[0];
    const todayString = now.toISOString().split('T')[0];

    // Вызываем getGames с фильтром по дате "до сегодняшней"
    // teams: '74' - фильтр по команде с ID 74
    await getGames({
      date_from: pastDateString,
      date_to: todayString,
      teams: '74',
    });

    console.log('✅ Past games preloaded successfully');
  } catch (error) {
    // ВАЖНО: Ловим ошибку внутри, чтобы она не "сломала" основной поток инициализации
    console.warn('⚠️ Failed to preload past games (background task):', error);
    // Не выбрасываем ошибку дальше, чтобы не нарушить инициализацию приложения
  }
};

/**
 * Предзагружает последние игры (после сегодняшней даты) в фоне
 */
const preloadUpcomingGames = async () => {
  try {
    console.log('🚀 Preloading upcoming games in background...');
    
    // Определяем диапазон дат: следующие 30 дней
    const now = new Date();
    const futureDate = new Date(now);
    futureDate.setDate(futureDate.getDate() + 30);
    const todayString = now.toISOString().split('T')[0];
    const futureDateString = futureDate.toISOString().split('T')[0];

    // Вызываем getGames с фильтром по дате "после сегодняшней"
    // teams: '74' - фильтр по команде с ID 74
    await getGames({
      date_from: todayString,
      date_to: futureDateString,
      teams: '74',
    });

    console.log('✅ Upcoming games preloaded successfully');
  } catch (error) {
    // ВАЖНО: Ловим ошибку внутри, чтобы она не "сломала" основной поток инициализации
    console.warn('⚠️ Failed to preload upcoming games (background task):', error);
    // Не выбрасываем ошибку дальше, чтобы не нарушить инициализацию приложения
  }
};
// --- КОНЕЦ ФУНКЦИЙ ПРЕДЗАГРУЗКИ ---


export default function RootLayout() {
  const [isInitializing, setIsInitializing] = useState(true);
  const [initializationError, setInitializationError] = useState<string | null>(null);

  useEffect(() => {
    initializeApp();
  }, []);



  const initializeApp = async () => {
    try {
      console.log('🚀 Initializing app...');
      
      // --- ИСПРАВЛЕНО: Сначала загружаем/обновляем данные игроков, если флаг установлен ---
      await initializePlayers(); // <-- Инициализация игроков по флагу
      // --- КОНЕЦ ИСПРАВЛЕНИЯ ---

      // --- ИСПРАВЛЕНО: Затем загружаем основные данные игроков (из кэша или, если кэш пуст, загружает) ---
      await getPlayers(); // <-- Это основная загрузка данных для приложения
      // --- КОНЕЦ ИСПРАВЛЕНИЯ ---

      // --- ИСПРАВЛЕНО: Потом обновляем команды, если флаг установлен ---
      await initializeTeams(); // <-- Инициализация команд по флагу
      // --- КОНЕЦ ИСПРАВЛЕНИЯ ---

      console.log('✅ App initialization completed');
      setIsInitializing(false);

      // --- ДОБАВЛЕНО: Предзагрузка игр в фоне ---
      // Предзагружаем игры в фоне после завершения основной инициализации
      // Это улучшит UX, так как данные будут уже в кэше, когда пользователь перейдёт на экраны игр
      console.log('🚀 Starting background preload tasks...');
      
      // Предзагружаем предшествующие игры первыми (99% пользователей их просматривают)
      preloadPastGames().catch(console.warn); // <-- .catch для обработки ошибок в фоне
      
      // Затем предзагружаем последние игры
      preloadUpcomingGames().catch(console.warn); // <-- .catch для обработки ошибок в фоне
      
      console.log('🚀 Background preload tasks started');
      // --- КОНЕЦ ДОБАВЛЕНИЯ ---
      
    } catch (error) {
      console.error('💥 App initialization failed:', error);
      setInitializationError('Ошибка инициализации приложения');
      setIsInitializing(false);
    }
  };

  if (isInitializing) {
    // --- ИСПРАВЛЕНО: Отображаем SplashScreen вместо LoadingSpinner ---
    return <SplashScreen />;
    // --- КОНЕЦ ИСПРАВЛЕНИЯ ---
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
        <Stack.Screen name="coaches" />
      </Stack>
    </GestureHandlerRootView>
  );
}