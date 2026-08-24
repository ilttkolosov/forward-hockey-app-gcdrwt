// _layout.tsx
import React, { useCallback, useEffect, useState, useRef } from 'react';
import { Stack, useRouter } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Animated,
  AppState,
  Easing,
  InteractionManager,
  Platform,
} from 'react-native';
import { colors } from '../styles/commonStyles';
import { playerDownloadService } from '../services/playerDataService';
import PlayerDataLoadingScreen from '../components/PlayerDataLoadingScreen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getUpcomingGamesMasterData,
  restoreUpcomingGamesMasterData,
} from '../data/gameData';
//import SplashScreen from '../components/SplashScreen';
import { loadStartupConfig, StartupConfig } from '../services/startupApi';
import {
  getCachedTournamentConfig,
  getConfiguredTournamentVersion,
  synchronizeTournamentConfigs,
} from '../services/tournamentsApi';
import { getGames } from '../data/gameData';
import type { Player } from '../types';
import {
  initAnalytics,
  reportAnalyticsError,
  trackMessengerAction,
  trackScheduleAction,
} from '../services/analyticsService';
import AnalyticsRouteTracker from '../components/AnalyticsRouteTracker';
import * as Notifications from 'expo-notifications';
import { Buffer } from 'buffer';
import NetInfo from '@react-native-community/netinfo';
import { dataAvailability } from '../services/dataAvailability';
import { NetworkStatusProvider } from '../contexts/NetworkStatusContext';
import { MessengerAuthProvider } from '../contexts/MessengerAuthContext';
import MessengerPersistenceBridge from '../features/messenger/MessengerPersistenceBridge';
import { SQLiteProvider } from 'expo-sqlite';
import { DATABASE_ASSET_SOURCE, DATABASE_NAME, migrateDatabase } from '../database';
import { getReferenceVersion } from '../database/repository';
import {
  getConfiguredReferenceVersion,
  initializeReferenceData,
  type ReferenceDataLocalState,
} from '../services/referenceDataService';
import { syncCompletedHistoricalGames } from '../services/historicalSync';
import { showAppUpdateNotice } from '../services/appUpdateService';
import { synchronizeTrainings } from '../services/trainingService';
import { startTrainingNotificationCleanup } from '../services/trainingNotificationService';
import {
  getProjectExpoPushToken,
  messengerNotificationPermissionGranted,
  normalizeMessengerPushPayload,
  processMessengerPushPayload,
} from '../services/messengerPush';
import {
  isExpoGo,
  remotePushNotificationsSupported,
} from '../services/runtimeEnvironment';
import { getMessengerActiveRoomId } from '../services/messengerRealtime';
import { publishReferenceDataUpdate } from '../services/referenceDataUpdates';
import { ShareIntentProvider } from 'expo-share-intent';
import MessengerShareIntentBridge from '../features/messenger/MessengerShareIntentBridge';
import {
  markAppInteractive,
  waitForAppInteractive,
} from '../services/appInteractive';
global.Buffer = Buffer;

Notifications.setNotificationHandler({
  handleNotification: async notification => {
    const messengerPush = normalizeMessengerPushPayload(
      notification.request.content.data,
    );
    const messengerBadgeUpdate = messengerPush?.type === 'messenger.badge';
    const messengerRoomEvent =
      messengerPush?.type === 'messenger.message'
      || messengerPush?.type === 'messenger.reaction';
    const messengerEventForVisibleRoom =
      AppState.currentState === 'active'
      && messengerRoomEvent
      && Boolean(messengerPush.room_id)
      && messengerPush.room_id === getMessengerActiveRoomId();
    const suppressVisualNotification =
      messengerBadgeUpdate || messengerEventForVisibleRoom;

    return {
      shouldShowBanner: !suppressVisualNotification,
      shouldShowList: !suppressVisualNotification,
      shouldPlaySound: !suppressVisualNotification,
      // The server-provided badge remains the source of truth even when the
      // foreground banner is suppressed. Realtime updates the visible feed.
      shouldSetBadge: true,
    };
  },
});

// === КОНСТАНТЫ ===
const TOURNAMENTS_NOW_KEY = 'tournaments_now';
const TOURNAMENTS_PAST_KEY = 'tournaments_past';
const CURRENT_TOURNAMENT_ID_KEY = 'current_tournament_id';
const PLAYERS_VERSION_KEY = 'players_version';

const elapsedMilliseconds = (startedAt: number) => Date.now() - startedAt;
const initializationLog = (message: string) => console.log(`[Инициализация] ${message}`);
const pause = (milliseconds: number) =>
  new Promise<void>(resolve => setTimeout(resolve, milliseconds));
const waitForNavigationIdle = () =>
  new Promise<void>(resolve => {
    InteractionManager.runAfterInteractions(() => resolve());
  });

const REFERENCE_LABELS: Record<string, string> = {
  teams: 'команды',
  venues: 'арены',
  leagues: 'лиги',
  seasons: 'сезоны',
};

const describeReferenceState = (state: ReferenceDataLocalState): string => (
  (['teams', 'venues', 'leagues', 'seasons'] as const)
    .map(entity => (
      `${REFERENCE_LABELS[entity]}=${state.itemCounts[entity]} `
      + `(версия ${state.localVersions[entity]}/${state.targetVersions[entity]})`
    ))
    .join('; ')
);

// --- ФОНОВЫЕ ФУНКЦИИ ---
const initializeTournamentsInBackground = async (
  config: StartupConfig,
  canUseNetwork: boolean
) => {
  const startedAt = Date.now();
  const allTournaments = [...(config.tournamentsNow || []), ...(config.tournamentsPast || [])];
  const targetVersion = getConfiguredTournamentVersion(config);
  initializationLog(
    `Проверка ${allTournaments.length} турнирных таблиц запущена; целевая версия=${targetVersion}`
  );
  try {
    await AsyncStorage.setItem(TOURNAMENTS_NOW_KEY, JSON.stringify(config.tournamentsNow || []));
    await AsyncStorage.setItem(TOURNAMENTS_PAST_KEY, JSON.stringify(config.tournamentsPast || []));
    const currentTournament = config.tournamentsNow?.[0];
    if (currentTournament) {
      await AsyncStorage.setItem(CURRENT_TOURNAMENT_ID_KEY, currentTournament.tournament_ID);
    } else {
      await AsyncStorage.removeItem(CURRENT_TOURNAMENT_ID_KEY);
    }

    const result = await synchronizeTournamentConfigs(
      allTournaments.map(tournament => tournament.tournament_ID),
      targetVersion,
      canUseNetwork
    );
    initializationLog(
      `Турнирные таблицы проверены за ${elapsedMilliseconds(startedAt)} мс: `
      + `запрошено=${result.requested}, обновлено=${result.updated}, ошибок=${result.failed.length}`
    );
  } catch (e) {
    console.error('[Инициализация] Ошибка фоновой подготовки турниров:', e);
  }
};

const preloadCurrentTournamentGames = async (config: StartupConfig) => {
  const startedAt = Date.now();
  try {
    const currentTournament = config.tournamentsNow?.[0];
    if (!currentTournament?.tournament_ID) {
      initializationLog('Предзагрузка турнира пропущена: текущий турнир не задан');
      return;
    }
    const tournamentId = currentTournament.tournament_ID;
    console.log(`[Предзагрузка] Получение конфигурации турнира ${tournamentId}`);
    const fullConfig = await getCachedTournamentConfig(tournamentId);
    if (!fullConfig?.league_id || !fullConfig?.season_id) {
      console.warn(`[Предзагрузка] У турнира ${tournamentId} отсутствуют league_id или season_id`);
      return;
    }
    const league = String(fullConfig.league_id);
    const season = String(fullConfig.season_id);
    console.log(`[Предзагрузка] Загрузка игр турнира ${tournamentId} (лига=${league}, сезон=${season})`);
    const games = await getGames({ league, season, useCache: true });
    console.log(
      `[Предзагрузка] Турнир ${tournamentId}: подготовлено ${games.length} игр `
      + `за ${elapsedMilliseconds(startedAt)} мс`
    );
  } catch (error) {
    console.warn('[Предзагрузка] Ошибка загрузки игр текущего турнира:', error);
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
  if (!remotePushNotificationsSupported) {
    await AsyncStorage.setItem('push_notifications_enabled', 'false');
    return;
  }
  try {
    const permission = await Notifications.getPermissionsAsync();
    if (!messengerNotificationPermissionGranted(permission)) {
      await AsyncStorage.setItem('push_notifications_enabled', 'false');
      console.log('[Инициализация] Push отключены: разрешение пользователя не выдано');
      return;
    }

    const token = await getProjectExpoPushToken();

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
    console.log(
      `[Инициализация] Статус push-подписки синхронизирован: ${isEnabled ? 'включена' : 'отключена'}`
    );
  } catch (error) {
    console.warn('[Инициализация] Не удалось синхронизировать push-подписку:', error);
  }
};


// --- ОСНОВНОЙ КОМПОНЕНТ ---
function RootLayoutContent() {
  const router = useRouter();
  const lastNotificationResponse = Notifications.useLastNotificationResponse();
  const handledNotificationId = useRef<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const [initializationMessage, setInitializationMessage] = useState('Запуск приложения...');
  const [dynamicStatus, setDynamicStatus] = useState<string>('Подготовка данных...');
  const progressAnimated = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const response = lastNotificationResponse;
    const identifier = response?.notification.request.identifier;
    if (isInitializing || !identifier || handledNotificationId.current === identifier) return;
    handledNotificationId.current = identifier;
    const route = response.notification.request.content.data?.route;
    if (route === '/trainings') {
      initializationLog('Открытие расписания по нажатию на уведомление о тренировке');
      trackScheduleAction('notification_opened');
      router.push('/trainings');
      return;
    }
    const data = response.notification.request.content.data;
    const messengerPush = normalizeMessengerPushPayload(data);
    const opensMessengerRoom =
      messengerPush?.type === 'messenger.message'
      || messengerPush?.type === 'messenger.reaction';
    if (opensMessengerRoom && messengerPush.room_id) {
      void processMessengerPushPayload(data);
      trackMessengerAction('push_opened', {
        push_type:
          messengerPush.type === 'messenger.reaction' ? 'reaction' : 'message',
      });
      initializationLog(
        messengerPush.type === 'messenger.reaction'
          ? 'Открытие реакции по нажатию на уведомление мессенджера'
          : 'Открытие комнаты по нажатию на уведомление мессенджера'
      );
      // Make the rooms list the stable parent, then push the selected room.
      // The back action now uses the normal reverse transition even when the
      // application was opened from a notification or another room.
      const target = {
        pathname: '/messenger/room/[id]' as const,
        params: {
          id: messengerPush.room_id,
          title: messengerPush.room_title || 'Чат',
          pushMessageId: messengerPush.message_id || '',
          pushSequence: messengerPush.sequence || '',
          pushEventId: identifier,
          pushReaction:
            messengerPush.type === 'messenger.reaction'
              ? messengerPush.reaction || ''
              : '',
        },
      };
      router.replace('/messenger/rooms');
      requestAnimationFrame(() => router.push(target));
    }
  }, [isInitializing, lastNotificationResponse, router]);

  const setProgress = useCallback((value: number) => {
    Animated.timing(progressAnimated, {
      toValue: value,
      duration: 300,
      easing: Easing.out(Easing.ease),
      useNativeDriver: false,
    }).start();
  }, [progressAnimated]);

  const initializeApp = useCallback(async () => {
    const initializationStartedAt = Date.now();
    setInitializationError(null);
    setIsInitializing(true);
    setInitializationMessage('Запуск приложения...');
    setDynamicStatus('Подготовка данных...');
    setProgress(0);
    const afterStartupTasks: (() => void)[] = [];

    // === Отслеживаем загрузку предстоящих игр ===
    let upcomingGamesPromise: Promise<void> | null = null;
    let upcomingGamesRefreshPromise: Promise<void> | null = null;
    let upcomingGamesFinished = false;

    const startUpcomingGames = (reason: string) => {
      if (upcomingGamesPromise) {
        initializationLog('Запрос предстоящих игр уже запущен, повторный запуск пропущен');
        return;
      }

      const startedAt = Date.now();
      initializationLog(`Предстоящие игры: локальная подготовка запущена (${reason})`);
      upcomingGamesPromise = (async () => {
        try {
          const localGames = await restoreUpcomingGamesMasterData();
          initializationLog(
            `Предстоящие игры: локально доступно ${localGames.length}, `
            + `${elapsedMilliseconds(startedAt)} мс`
          );

          const refreshStartedAt = Date.now();
          initializationLog('Предстоящие игры: сетевое обновление отложено до готовности интерфейса');
          upcomingGamesRefreshPromise = waitForAppInteractive()
            .then(() => pause(1_400))
            .then(() => getUpcomingGamesMasterData(true))
            .then(games => {
              initializationLog(
                `Предстоящие игры: цикл сетевого обновления завершён; доступно ${games.length}, `
                + `${elapsedMilliseconds(refreshStartedAt)} мс`
              );
            })
            .catch(error => {
              console.warn(
                `[Инициализация] Предстоящие игры: фоновое обновление завершилось с ошибкой через `
                + `${elapsedMilliseconds(refreshStartedAt)} мс:`,
                error
              );
            });
        } catch (error) {
          console.warn('[Инициализация] Предстоящие игры: локальная подготовка не выполнена:', error);
        } finally {
          upcomingGamesFinished = true;
        }
      })();
    };

    try {
      initializationLog('Запуск приложения');

      // Аналитика не является условием показа интерфейса. Нативная активация
      // может занимать секунды на iOS, поэтому запускаем её после быстрого
      // старта; события до активации сохраняются во внутренней очереди.
      afterStartupTasks.push(() => {
        const analyticsStartedAt = Date.now();
        void initAnalytics().then(() =>
          initializationLog(
            `Аналитика подготовлена в фоне за ${elapsedMilliseconds(analyticsStartedAt)} мс`
          )
        );
      });

      // Нативные push API и сеть не должны конкурировать с первым кадром.
      afterStartupTasks.push(() => {
        void syncPushSubscriptionStatus();
      });

      // === 1. Конфигурация ===
      setInitializationMessage('Получение конфигурации...');
      setProgress(5);
      const configStartedAt = Date.now();
      const configResult = await loadStartupConfig();
      const config = configResult.data;
      initializationLog(
        `Конфигурация получена из ${configResult.source === 'network' ? 'сети' : 'кэша'} `
        + `за ${elapsedMilliseconds(configStartedAt)} мс; ревизия=${config.config_revision ?? 'не указана'}`
      );
      afterStartupTasks.push(() => {
        void showAppUpdateNotice(config);
      });
      if (configResult.backgroundRefresh) {
        const backgroundConfigStartedAt = Date.now();
        void configResult.backgroundRefresh.then(latestConfig => {
          if (!latestConfig) {
            initializationLog(
              `Фоновое обновление конфигурации не выполнено за `
              + `${elapsedMilliseconds(backgroundConfigStartedAt)} мс; локальная копия сохранена`
            );
            return;
          }
          initializationLog(
            `Фоновая конфигурация получена за ${elapsedMilliseconds(backgroundConfigStartedAt)} мс; `
            + `ревизия=${latestConfig.config_revision ?? 'не указана'}`
          );
          void showAppUpdateNotice(latestConfig);
          if (latestConfig.config_revision !== config.config_revision) {
            initializationLog('Новая ревизия конфигурации сохранена и будет полностью применена при следующем запуске');
          }
        });
      }

      const networkStartedAt = Date.now();
      const networkState = await NetInfo.fetch();
      const canUseNetwork = networkState.isConnected !== false && networkState.isInternetReachable !== false;
      initializationLog(
        `Проверка сети за ${elapsedMilliseconds(networkStartedAt)} мс: `
        + `подключение=${String(networkState.isConnected)}, `
        + `доступ в интернет=${String(networkState.isInternetReachable)}, `
        + `сетевые запросы=${canUseNetwork ? 'разрешены' : 'отключены'}`
      );
      if (configResult.source === 'cache') {
        setDynamicStatus('Используется последняя сохранённая конфигурация');
      }

      initializationLog('Проверка локальных справочников SQLite');
      setInitializationMessage('Подготовка локальных справочников...');
      setProgress(15);
      const referencesStartedAt = Date.now();
      const { teamsCount, backgroundRefresh: referenceRefresh } = await initializeReferenceData(
        config,
        canUseNetwork,
        state => {
          initializationLog(`Состояние справочников: ${describeReferenceState(state)}`);
          if (state.changedEntities.length > 0) {
            initializationLog(
              `Требуют обновления: ${state.changedEntities.map(entity => REFERENCE_LABELS[entity]).join(', ')}`
            );
          }
          if (state.missingEntities.length > 0) {
            initializationLog(
              `Отсутствуют локальные данные: ${state.missingEntities.map(entity => REFERENCE_LABELS[entity]).join(', ')}`
            );
          }
          if (state.canStartUpcomingImmediately) {
            startUpcomingGames('полный локальный снимок доступен');
          } else {
            initializationLog('Предстоящие игры: запуск отложен до подготовки справочников');
          }
        }
      );
      initializationLog(
        `Справочники готовы за ${elapsedMilliseconds(referencesStartedAt)} мс; команд=${teamsCount}`
      );
      afterStartupTasks.push(() => {
        void referenceRefresh()
          .then(result => {
            if (result.updatedEntities.length > 0) {
              initializationLog(
                `Фоновое обновление справочников завершено: ${result.updatedEntities
                  .map(entity => REFERENCE_LABELS[entity])
                  .join(', ')}`
              );
            }
            if (result.failedEntities.length > 0) {
              console.warn(
                `[Инициализация] Фоновое обновление отложено: ${result.failedEntities
                  .map(entity => REFERENCE_LABELS[entity])
                  .join(', ')}`
              );
            }
          })
          .catch(error => {
            console.warn('[Инициализация] Фоновая подготовка справочников не завершена:', error);
          });
      });
      setDynamicStatus(`Загружено команд ${teamsCount}`);
      setProgress(30);

      // На первой установке запрос ждёт обязательного локального наполнения.
      // При наличии старого полного снимка он уже запущен параллельно, а
      // новые версии справочников будут применены после открытия приложения.
      if (!upcomingGamesPromise) {
        startUpcomingGames('справочники подготовлены');
      } else {
        initializationLog('Предстоящие игры уже загружаются параллельно с локальной подготовкой');
      }

      // === 5. Игроки ===
      setInitializationMessage('Подготовка игроков и фотографий...');
      setProgress(55);
      const playersStartedAt = Date.now();
      const playersVersion = getConfiguredReferenceVersion(config, 'players');
      initializationLog(`Игроки: подготовка версии ${playersVersion}`);
      let playersList: Player[] = [];
      let localPlayersVersion = await getReferenceVersion('players');
      try {
        playersList = await playerDownloadService.initializeFromDatabase(
          playersVersion,
          false,
          (stage, message) => setDynamicStatus(message || stage)
        );
      } catch (error) {
        if (canUseNetwork) {
          // A first installation with no local roster has no usable fallback,
          // so this one exceptional case is prepared before rendering.
          playersList = await playerDownloadService.initializeFromDatabase(
            playersVersion,
            true,
            (stage, message) => setDynamicStatus(message || stage)
          );
          localPlayersVersion = playersVersion;
        } else {
          playersList = await playerDownloadService.getPlayersFromStorage();
          if (playersList.length === 0) throw error;
          dataAvailability.markCachedDataUsed('Не удалось обновить данные игроков');
          console.warn('[Инициализация] Игроки: использован предыдущий локальный набор:', error);
        }
      }
      localPlayersVersion = await getReferenceVersion('players') || localPlayersVersion;
      await AsyncStorage.setItem(PLAYERS_VERSION_KEY, String(localPlayersVersion));
      initializationLog(
        `Игроки: подготовлено ${playersList.length} записей за ${elapsedMilliseconds(playersStartedAt)} мс`
      );
      if (canUseNetwork && localPlayersVersion !== playersVersion) {
        const playerRefreshStartedAt = Date.now();
        initializationLog(
          `Игроки: версия ${localPlayersVersion}/${playersVersion}, обновление запущено в фоне`
        );
        afterStartupTasks.push(() => {
          void playerDownloadService.refreshPlayersData(playersVersion)
            .then(async freshPlayers => {
              await AsyncStorage.setItem(PLAYERS_VERSION_KEY, String(playersVersion));
              publishReferenceDataUpdate(['players'], { players: playersVersion });
              initializationLog(
                `Игроки: фоновое обновление завершено; записей=${freshPlayers.length}, `
                + `${elapsedMilliseconds(playerRefreshStartedAt)} мс`
              );
            })
            .catch(error => {
              dataAvailability.markCachedDataUsed('Не удалось обновить данные игроков');
              console.warn('[Инициализация] Игроки: фоновое обновление отложено:', error);
            });
        });
      }
      setDynamicStatus(`Загружено игроков ${playersList.length}`);
      setProgress(70);

      afterStartupTasks.push(() => {
        const trainingsStartedAt = Date.now();
        initializationLog('Фоновая синхронизация расписания тренировок запущена');
        void synchronizeTrainings(canUseNetwork)
          .then(result => {
            initializationLog(
              `Расписание тренировок подготовлено за ${elapsedMilliseconds(trainingsStartedAt)} мс: `
              + `занятий=${result.trainings.length}, источник=`
              + `${result.source === 'network' ? 'сеть' : 'SQLite'}`
            );
          })
          .catch(error => {
            console.warn('[Инициализация] Не удалось подготовить расписание тренировок:', error);
          });
      });

      if (canUseNetwork) {
        afterStartupTasks.push(() => {
          const historyStartedAt = Date.now();
          initializationLog('Фоновая синхронизация завершённых матчей запущена');
          void syncCompletedHistoricalGames(config.sync)
            .then(result => {
              if (result.skipped) {
                initializationLog(
                  `Синхронизация завершённых матчей не требуется: безопасная дата ${result.requestedTo}`
                );
                return;
              }
              initializationLog(
                `Синхронизация завершённых матчей: получено ${result.received}, сохранено ${result.stored}, `
                + `диапазон ${result.requestedFrom}—${result.requestedTo}, `
                + `${elapsedMilliseconds(historyStartedAt)} мс`
              );
            })
            .catch(error => {
              console.warn('[Инициализация] Фоновая синхронизация завершённых матчей не выполнена:', error);
            });
        });
      } else {
        initializationLog('Фоновая синхронизация завершённых матчей пропущена: нет интернета');
      }

      // === 7. Фоновые задачи (запускаем после основного прогресса) ===
      setDynamicStatus(`Запуск фоновых задач`);
      setInitializationMessage('Финальная настройка...');
      setProgress(80);
      afterStartupTasks.push(() => {
        const tournamentsPreparation = initializeTournamentsInBackground(config, canUseNetwork);
        void tournamentsPreparation.finally(async () => {
          if (upcomingGamesPromise) await upcomingGamesPromise;
          if (upcomingGamesRefreshPromise) {
            initializationLog('Предзагрузка турнира ожидает завершения запроса предстоящих игр');
            await upcomingGamesRefreshPromise;
          }
          await preloadCurrentTournamentGames(config);
        });
      });

      // === Ожидаем завершения загрузки предстоящих игр, если ещё не готово ===
      if (!upcomingGamesFinished && upcomingGamesPromise) {
        const waitStartedAt = Date.now();
        initializationLog('Основные локальные данные готовы; ожидается только запрос предстоящих игр');
        setInitializationMessage('Ожидание загрузки предстоящих игр...');
        setDynamicStatus('Завершение загрузки данных игр...');
        setProgress(95);
        await upcomingGamesPromise;
        initializationLog(
          `Дополнительное ожидание предстоящих игр заняло ${elapsedMilliseconds(waitStartedAt)} мс`
        );
      } else {
        initializationLog('Предстоящие игры завершены параллельно; дополнительное ожидание не требуется');
      }


      setInitializationMessage('Готово!');
      setProgress(100);
      initializationLog(`Приложение готово за ${elapsedMilliseconds(initializationStartedAt)} мс`);
      setIsInitializing(false);
      markAppInteractive();
      void waitForAppInteractive().then(async () => {
        // Do not release every optional native/network task in one burst. If
        // the user opens Settings/About immediately, InteractionManager keeps
        // the next task behind that transition instead of dropping frames.
        for (const task of afterStartupTasks) {
          await pause(350);
          await waitForNavigationIdle();
          task();
        }
      });

    } catch (error) {
      console.error(
        `[Инициализация] Критическая ошибка через ${elapsedMilliseconds(initializationStartedAt)} мс:`,
        error
      );
      reportAnalyticsError('app_initialization_failed', error);
      setInitializationError(error instanceof Error ? error.message : 'Ошибка инициализации приложения');
      setIsInitializing(false);
    }
  }, [setProgress]);

  useEffect(() => {
    void waitForAppInteractive().then(() => startTrainingNotificationCleanup());
  }, []);

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
      <MessengerShareIntentBridge />
      <AnalyticsRouteTracker />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="players" />
        <Stack.Screen name="trainings" />
        <Stack.Screen name="player/[id]" />
        <Stack.Screen name="upcoming" />
        <Stack.Screen name="game/[id]" />
        <Stack.Screen name="season/[id]" />
        <Stack.Screen name="tournaments/[id]" />
        <Stack.Screen name="command/[id]" />
        <Stack.Screen name="mobilegames/[id]" />
        <Stack.Screen name="messenger/index" />
        <Stack.Screen name="messenger/register" />
        <Stack.Screen name="messenger/change-password" />
        <Stack.Screen name="messenger/rooms" />
        <Stack.Screen
          name="messenger/share"
          options={{ gestureEnabled: false }}
        />
        <Stack.Screen name="messenger/room/[id]" />
      </Stack>
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  return (
    <ShareIntentProvider
      options={{
        scheme: 'natively',
        resetOnBackground: false,
        debug: __DEV__,
        disabled: Platform.OS === 'web' || isExpoGo,
      }}
    >
      <SQLiteProvider
        databaseName={DATABASE_NAME}
        assetSource={DATABASE_ASSET_SOURCE}
        onInit={migrateDatabase}
      >
        <NetworkStatusProvider>
          <MessengerAuthProvider>
            <MessengerPersistenceBridge />
            <RootLayoutContent />
          </MessengerAuthProvider>
        </NetworkStatusProvider>
      </SQLiteProvider>
    </ShareIntentProvider>
  );
}
