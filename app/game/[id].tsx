// app/game/[id].tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Image,
  Linking,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import { Game } from '../../types';
import { getGameById, getVenueById, getGames, gameDetailsCache } from '../../data/gameData';
import { colors, commonStyles } from '../../styles/commonStyles';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';
import Icon from '../../components/Icon';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import GameCardCompact from '../../components/GameCardCompact';
import ProtocolEventCard from '../../components/ProtocolEventCard';
import { getPlayerById } from '../../data/playerData';

// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===
const parseVKVideoUrl = (url: string): { ownerId: string; videoId: string } | null => {
  try {
    if (url.includes('video_ext.php')) return null;
    const videoMatch = url.match(/video(-?\d+)_(\d+)/);
    if (videoMatch) {
      return { ownerId: videoMatch[1], videoId: videoMatch[2] };
    }
    return null;
  } catch (error) {
    console.error('Error parsing VK video URL:', error);
    return null;
  }
};

const constructVKEmbedUrl = (ownerId: string, videoId: string, autoplay: boolean = true): string => {
  return `https://vk.com/video_ext.php?oid=${ownerId}&id=${videoId}&hd=4&autoplay=${autoplay ? '1' : '0'}&muted=0&js_api=1`;
};

const getVKEmbedUrl = (videoUrl: string, autoplay: boolean = true): string => {
  try {
    if (videoUrl.includes('video_ext.php')) {
      const url = new URL(videoUrl);
      if (!url.searchParams.has('hd')) url.searchParams.set('hd', '4');
      url.searchParams.set('autoplay', autoplay ? '1' : '0');
      url.searchParams.set('muted', '0');
      if (!url.searchParams.has('js_api')) url.searchParams.set('js_api', '1');
      return url.toString();
    }
    const parsed = parseVKVideoUrl(videoUrl);
    if (parsed) return constructVKEmbedUrl(parsed.ownerId, parsed.videoId, autoplay);
    return videoUrl;
  } catch (error) {
    console.error('Error processing VK video URL:', error);
    return videoUrl;
  }
};

// Проверяет, заполнен ли протокол игры
const isProtocolFilled = (protocol: any): boolean => {
  if (!protocol) return false;
  const maintime = protocol.maintime;
  // Считаем протокол незаполненным, если maintime пустой, null, undefined, "00:00" или "0"
  return maintime !== null &&
         maintime !== undefined &&
         maintime !== '' &&
         maintime !== '00:00' &&
         maintime !== '0';
};

  // Проверяет, есть ли непустая статистика для хотя бы одной команды
  const hasPlayerStats = (player_stats: any): boolean => {
    if (!player_stats || typeof player_stats !== 'object') return false;
    return Object.values(player_stats).some(
      (statsArray: any) => Array.isArray(statsArray) && statsArray.length > 0
    );
  };

const formatPlayerName = (fullName: string): string => {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return fullName;
  const [lastName, firstName] = parts;
  const shortFirstName = firstName ? `${firstName.charAt(0)}.` : '';
  //return `${shortFirstName} ${lastName}`.trim();
  return `${firstName} ${lastName}`;
};

const extractOutcome = (outcomeArray: any): string => {
  if (Array.isArray(outcomeArray) && outcomeArray.length > 0) {
    const outcome = outcomeArray[0].toLowerCase();
    if (outcome === 'w' || outcome === 'win') return 'win';
    if (outcome === 'l' || outcome === 'loss') return 'loss';
    if (outcome === 't' || outcome === 'tie' || outcome === 'draw' || outcome === 'nich') return 'nich';
  }
  return '';
};

const extractNameFromEntity = (entity: any): string | undefined => {
  if (entity && typeof entity === 'object' && 'name' in entity) {
    return entity.name;
  }
  return undefined;
};

const isGameFinished = (game: Game): boolean => {
  const now = new Date();
  const gameDate = new Date(game.event_date);
  return now.getTime() - gameDate.getTime() > 3 * 60 * 60 * 1000;
};

const formatTimeSeconds = (secondsStr: string): string => {
  const seconds = parseInt(secondsStr, 10);
  if (isNaN(seconds) || seconds <= 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// 🔥 ЛОГИКА ПЕРИОДОВ
const getPeriodLabel = (timeStr: string, protocol: any): string => {
  if (!timeStr || !/^\d{2}:\d{2}$/.test(timeStr)) return 'other';
  const [minutesStr, secondsStr] = timeStr.split(':');
  const minutes = parseInt(minutesStr, 10);
  const seconds = parseInt(secondsStr, 10);
  if (isNaN(minutes) || isNaN(seconds)) return 'other';
  const maintime = parseInt(protocol.maintime || '60', 10);
  if (minutes < maintime) {
    const periodLength = maintime / 3;
    if (minutes < periodLength) return 'period1';
    if (minutes < periodLength * 2) return 'period2';
    return 'period3';
  }
  if (protocol.overtime) {
    const otMinutes = parseInt(protocol.overtime, 10) || 0;
    if (minutes <= maintime + otMinutes) return 'overtime';
  }
  if (protocol.pms) return 'shootout';
  return 'other';
};

// === РЕНДЕР ПРОТОКОЛА ===
const renderProtocolByPeriods = (
  protocol: any,
  gameDetails: Game,
  protocolPlayers: Record<string, any>,
  onVideoPress: (url: string) => void
) => {
  const { homeTeamLogo, awayTeamLogo } = gameDetails;
  // Группируем события по периодам
  const periods: { [key: string]: any[] } = {
    period1: [],
    period2: [],
    period3: [],
    overtime: [],
    shootout: [],
  };
  protocol.events?.forEach((event: any) => {
    const periodKey = getPeriodLabel(event.time, protocol);
    if (periods[periodKey]) {
      periods[periodKey].push(event);
    }
  });
  // Заголовки периодов
  const periodLabels: { [key: string]: string } = {
    period1: '1 период',
    period2: '2 период, начинаем с ',
    period3: '3 период, начинаем с ',
    overtime: 'Овертайм, начинаем с ',
    shootout: 'Буллиты, начинаем с ',
  };
  // Начальный счет
  let currentScore = { home: 0, away: 0 };
  // Создаем массив для всех событий, включая заголовки периодов
  const allEvents: any[] = [];
  Object.entries(periods).forEach(([key, events]) => {
    if (events.length === 0) return;
    // Добавляем заголовок периода как отдельное событие
    const periodTitle = `${periodLabels[key]} ${currentScore.home} – ${currentScore.away}`;
    allEvents.push({
      type: 'periodHeader',
      title: periodTitle,
      icon: 'whistle-outline',
      key: `period-${key}`,
    });
    // Добавляем события периода
    events.forEach((event: any) => {
      // Определяем, какая команда
      const isHomeTeam = event.team === 0;
      const teamLogo = isHomeTeam ? homeTeamLogo : awayTeamLogo;
      // Создаем копию текущего счета
      let tempScore = { ...currentScore };
      // Обновляем счет, если это гол
      if (event.type === 'g') {
        if (isHomeTeam) {
          tempScore.home++;
        } else {
          tempScore.away++;
        }
        // Обновляем глобальный счет для следующих событий
        currentScore = tempScore;
      }
      allEvents.push({
        ...event,
        teamLogo,
        score: tempScore,
        isHomeTeam,
      });
    });
  });
  // Добавляем финальный элемент "Матч окончен"
  const finalEvent = {
    type: 'final',
    title: `Матч окончен. Счет ${gameDetails.homeScore} : ${gameDetails.awayScore}.`,
    icon: 'whistle-outline',
    key: 'final-event',
  };
  allEvents.push(finalEvent);
  // Рендерим все события в виде таблицы
  return (
    <View style={styles.protocolTable}>
      {allEvents.map((item: any, idx: number) => {
        const isLastEvent = idx === allEvents.length - 1;
        if (item.type === 'periodHeader') {
          return (
            <View key={item.key} style={styles.protocolTableRow}>
              {/* Столбец 1: Отступ */}
              <View style={styles.protocolTableCellSpacer} />
              {/* Столбцы 2-3: Логотип/иконка */}
              <View style={[styles.protocolTableCellLogo, styles.protocolTableCellIcon]}>
                <View style={styles.protocolIconCircle}>
                  <Icon name={item.icon} type="material-community" size={20} color={colors.text} />
                </View>
              </View>
              {/* Столбец 4: Отступ */}
              <View style={styles.protocolTableCellSpacer} />
              {/* Столбец 5: Заголовок периода */}
              <View style={styles.protocolTableCellContent}>
                <Text style={styles.protocolPeriodTitleText}>{item.title}</Text>
              </View>
            </View>
          );
        } else if (item.type === 'final') {
          // Финальный элемент "Матч окончен"
          return (
            <View key={item.key} style={styles.protocolTableRow}>
              {/* Столбец 1: Отступ */}
              <View style={styles.protocolTableCellSpacer} />
              {/* Столбцы 2-3: Логотип/иконка */}
              <View style={[styles.protocolTableCellLogo, styles.protocolTableCellIcon]}>
                <View style={styles.protocolIconCircle}>
                  <Icon name={item.icon} type="material-community" size={20} color={colors.text} />
                </View>
              </View>
              {/* Столбец 4: Отступ */}
              <View style={styles.protocolTableCellSpacer} />
              {/* Столбец 5: Текст "Матч окончен" */}
              <View style={styles.protocolTableCellContent}>
                <Text style={styles.protocolFinalText}>{item.title}</Text>
              </View>
            </View>
          );
        } else {
          // Это обычное событие
          return (
            <View key={idx} style={styles.protocolTableRow}>
              {/* Столбец 1: Отступ */}
              <View style={styles.protocolTableCellSpacer} />
              {/* Столбцы 2-3: Логотип команды */}
              <View style={isLastEvent ? styles.protocolTableCellLogoLast : styles.protocolTableCellLogo}>
                <View style={styles.protocolLogoCircle}>
                  <Image source={{ uri: item.teamLogo }} style={styles.protocolEventTeamLogo} />
                </View>
              </View>
              {/* Столбец 4: Отступ */}
              <View style={styles.protocolTableCellSpacer} />
              {/* Столбец 5: Карточка события */}
              <View style={styles.protocolTableCellContent}>
                <ProtocolEventCard
                  event={item}
                  teamLogo={item.teamLogo}
                  homeTeamLogo={homeTeamLogo}
                  awayTeamLogo={awayTeamLogo}
                  onVideoPress={onVideoPress}
                  playerStats={protocolPlayers}
                  score={item.score}
                  isHomeTeam={item.isHomeTeam}
                />
              </View>
            </View>
          );
        }
      })}
    </View>
  );
};

// === РЕНДЕР СТАТИСТИКИ ===
const renderPlayerStatsTable = (
  teamId: string,
  statsArray: any[],
  statsPlayers: Record<string, any>
) => {
  if (!Array.isArray(statsArray) || statsArray.length === 0) {
    return null;
  }
  const goalies: any[] = [];
  const fieldPlayers: any[] = [];
  statsArray.forEach(({ player_id, stats }) => {
    if (!player_id || !stats || typeof stats !== 'object') return;
    const player = statsPlayers[player_id] || null;
    const resolvedPlayer = player || { name: `ID: ${player_id}`, number: '?' };
    const position = stats.position;
    const isGoalie = position === '7';
    const row = { playerId: player_id, player: resolvedPlayer, ...stats };
    if (isGoalie) {
      goalies.push(row);
    } else {
      fieldPlayers.push(row);
    }
  });
  if (goalies.length === 0 && fieldPlayers.length === 0) return null;
  const renderRow = (row: any, isGoalie: boolean) => {
    const { player, playerId, g, a, pim, pn, timeg, ga, sv } = row;
    const number = player?.number || '?';
    const fullName = player?.name || `ID: ${playerId}`;
    const displayName = formatPlayerName(fullName);
    const photoPath = player?.photoPath;
    return (
      <View key={playerId} style={styles.statsRow}>
        <View style={styles.statsCellNumber}>
          <Text style={styles.statsCellNumber}>#{number}</Text>
        </View>
        <View style={styles.statsCellPhoto}>
          {photoPath ? (
            <Image source={{ uri: photoPath }} style={styles.statsPlayerPhoto} />
          ) : (
            <View style={styles.statsPlayerPhotoPlaceholder} />
          )}
        </View>
        <View style={styles.statsCellName}>
          <Text style={styles.statsText}>{displayName}</Text>
        </View>
        {isGoalie ? (
          <>
            <View style={styles.statsCell}><Text style={styles.statsText}>{formatTimeSeconds(timeg)}</Text></View>
            <View style={styles.statsCell}><Text style={styles.statsText}>{ga || '0'}</Text></View>
            <View style={styles.statsCell}><Text style={styles.statsText}>{sv || '0'}</Text></View>
            <View style={styles.statsCell}>
              <Text style={styles.statsText}>
                {sv || ga ? ((parseInt(sv, 10) || 0) / ((parseInt(sv, 10) || 0) + (parseInt(ga, 10) || 0)) * 100).toFixed(2) : '0.00'}%
              </Text>
            </View>
            <View style={styles.statsCell}><Text style={styles.statsText}>{pim || '0'}</Text></View>
          </>
        ) : (
          <>
            <View style={styles.statsCell}>
              <Text style={styles.statsText}>
                {row.position === '8' ? 'Н' : row.position === '9' ? 'З' : '?'}
              </Text>
            </View>
            <View style={styles.statsCell}><Text style={styles.statsText}>{g || '0'}</Text></View>
            <View style={styles.statsCell}><Text style={styles.statsText}>{a || '0'}</Text></View>
            <View style={styles.statsCell}><Text style={styles.statsText}>{(parseInt(g, 10) || 0) + (parseInt(a, 10) || 0)}</Text></View>
            <View style={styles.statsCell}><Text style={styles.statsText}>{pim || '0'}</Text></View>
            <View style={styles.statsCell}><Text style={styles.statsText}>{pn || '0'}</Text></View>
          </>
        )}
      </View>
    );
  };
  return (
    <View style={styles.statsTableContainer}>
      {goalies.length > 0 && (
        <>
          <Text style={styles.statsTableTitle}>Вратари</Text>
          <View style={styles.statsTableHeader}>
            <View style={[styles.statsHeaderCell, { flex: 0.5 }]}><Text style={styles.statsHeaderText}></Text></View>
            <View style={[styles.statsHeaderCell, { flex: 0.5 }]}><Text style={styles.statsHeaderText}></Text></View>
            <View style={[styles.statsHeaderCell, { flex: 2 }]}><Text style={styles.statsHeaderText}></Text></View>
            <View style={[styles.statsHeaderCell, { flex: 1 }]}><Text style={styles.statsHeaderText}>ВНП</Text></View>
            <View style={[styles.statsHeaderCell, { flex: 0.5 }]}><Text style={styles.statsHeaderText}>П6</Text></View>
            <View style={[styles.statsHeaderCell, { flex: 0.5 }]}><Text style={styles.statsHeaderText}>Бр</Text></View>
            <View style={[styles.statsHeaderCell, { flex: 1 }]}><Text style={styles.statsHeaderText}>ОБ%</Text></View>
            <View style={[styles.statsHeaderCell, { flex: 0.5 }]}><Text style={styles.statsHeaderText}>ШМ</Text></View>
          </View>
          {goalies.map(row => renderRow(row, true))}
        </>
      )}
      {fieldPlayers.length > 0 && (
        <>
          <Text style={styles.statsTableTitle}>Полевые игроки</Text>
          <View style={styles.statsTableHeader}>
            <View style={[styles.statsHeaderCell, { flex: 0.5 }]}><Text style={styles.statsHeaderText}></Text></View>
            <View style={[styles.statsHeaderCell, { flex: 0.5 }]}><Text style={styles.statsHeaderText}></Text></View>
            <View style={[styles.statsHeaderCell, { flex: 2 }]}><Text style={styles.statsHeaderText}></Text></View>
            <View style={[styles.statsHeaderCell, { flex: 0.5 }]}><Text style={styles.statsHeaderText}>П</Text></View>
            <View style={[styles.statsHeaderCell, { flex: 0.5 }]}><Text style={styles.statsHeaderText}>Г</Text></View>
            <View style={[styles.statsHeaderCell, { flex: 0.5 }]}><Text style={styles.statsHeaderText}>П</Text></View>
            <View style={[styles.statsHeaderCell, { flex: 0.5 }]}><Text style={styles.statsHeaderText}>О</Text></View>
            <View style={[styles.statsHeaderCell, { flex: 0.5 }]}><Text style={styles.statsHeaderText}>ШМ</Text></View>
            <View style={[styles.statsHeaderCell, { flex: 0.5 }]}><Text style={styles.statsHeaderText}>КШ</Text></View>
          </View>
          {fieldPlayers.map(row => renderRow(row, false))}
        </>
      )}
    </View>
  );
};

// === ОСНОВНОЙ КОМПОНЕНТ ===
export default function GameDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [gameDetails, setGameDetails] = useState<Game | null>(null);
  const [protocolPlayers, setProtocolPlayers] = useState<Record<string, any>>({});
  const [statsPlayers, setStatsPlayers] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tabIndex, setTabIndex] = useState(0);
  const [f2fGames, setF2fGames] = useState<Game[]>([]);
  const [f2fLoading, setF2fLoading] = useState(false);
  // Динамически формируем список вкладок
  // const baseTabs = ['Арена', 'Статистика', 'F2F'];
  // Динамически формируем список вкладок в нужном порядке
  const visibleTabs = [];
  if (gameDetails && isProtocolFilled(gameDetails.protocol)) {
    visibleTabs.push('Протокол');
  }
  if (gameDetails && hasPlayerStats(gameDetails.player_stats)) {
    visibleTabs.push('Статистика');
  }
  visibleTabs.push('Арена');
  visibleTabs.push('F2F');

  const tabs = visibleTabs;
  //////////

  const [liveScore, setLiveScore] = useState({ home: '0', away: '0' });
  const [periodScores, setPeriodScores] = useState({
    team1_first: '0',
    team1_second: '0',
    team1_third: '0',
    team2_first: '0',
    team2_second: '0',
    team2_third: '0',
  });
  const [isGameStarted, setIsGameStarted] = useState(false);

  const f2fLoadedRef = useRef(false);
  const [videoModalUrl, setVideoModalUrl] = useState<string | null>(null);

  // === АНИМАЦИЯ ПРОКРУТКИ ===
  const scrollY = useRef(new Animated.Value(0)).current;
  const gameInfoHeight = useRef(0); // Для хранения динамической высоты

  // Функция для получения высоты блока gameInfo
  const handleGameInfoLayout = useCallback((event) => {
    const { height } = event.nativeEvent.layout;
    gameInfoHeight.current = height;
  }, []);

  // === ЗАГРУЗКА ДАННЫХ ИГРЫ ===
  const loadGameData = useCallback(async (forceRefresh = false) => {
    try {
      console.log('Loading game data for ID:', id, { forceRefresh });
      setLoading(true);
      setError(null);
      const gameData = await getGameById(id, !forceRefresh);
      if (!gameData) {
        setError('Игра не найдена');
        return;
      }
      // Игроки для протокола
      const newProtocolPlayers: Record<string, any> = {};
      if (gameData.protocol?.events) {
        const playerIds = new Set<string>();
        gameData.protocol.events.forEach(event => {
          if (event.players) {
            event.players.forEach((id: string) => playerIds.add(id));
          }
        });
        const playersArray = await Promise.all(
          Array.from(playerIds).map(async (playerId) => {
            const player = await getPlayerById(playerId);
            return { id: playerId, player };
          })
        );
        playersArray.forEach(({ id, player }) => {
          newProtocolPlayers[id] = player;
        });
        setProtocolPlayers(newProtocolPlayers);
      }
      // Игроки для статистики
      const newStatsPlayers: Record<string, any> = {};
      if (gameData.player_stats) {
        const statsPlayerIds = new Set<string>();
        Object.values(gameData.player_stats).forEach(teamStats => {
          if (Array.isArray(teamStats)) {
            teamStats.forEach(({ player_id }) => {
              if (player_id) {
                statsPlayerIds.add(player_id);
              }
            });
          }
        });
        if (statsPlayerIds.size > 0) {
          const statsPlayersArray = await Promise.all(
            Array.from(statsPlayerIds).map(async (playerId) => {
              const player = await getPlayerById(playerId);
              return { id: playerId, player };
            })
          );
          statsPlayersArray.forEach(({ id, player }) => {
            newStatsPlayers[id] = player;
          });
        }
      }
      setStatsPlayers(newStatsPlayers);
      setGameDetails(gameData);
    } catch (err) {
      console.error('Error loading game ', err);
      setError('Не удалось загрузить данные игры');
    } finally {
      setLoading(false);
      if (forceRefresh) setRefreshing(false);
    }
  }, [id]);

  // === ЗАГРУЗКА F2F ===
  const loadF2fGames = useCallback(async (currentGame: Game) => {
    if (f2fLoadedRef.current) return;
    f2fLoadedRef.current = true;
    const homeTeamId = currentGame.homeTeamId;
    const awayTeamId = currentGame.awayTeamId;
    const eventDate = new Date(currentGame.event_date);
    if (!homeTeamId || !awayTeamId) {
      console.warn('F2F: Missing team IDs');
      return;
    }
    const startDate = new Date(eventDate);
    startDate.setFullYear(startDate.getFullYear() - 5);
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = eventDate.toISOString().split('T')[0];
    setF2fLoading(true);
    try {
      console.log(`🔍 Loading F2F games for teams ${homeTeamId},${awayTeamId} before ${endDateStr}`);
      const games = await getGames({
        date_from: startDateStr,
        date_to: endDateStr,
        teams: `${homeTeamId},${awayTeamId}`,
        useCache: true,
        f2f: true,
      });
      const filteredGames = games.filter(g => g.id !== id);
      const sortedGames = filteredGames.sort((a, b) =>
        new Date(b.event_date).getTime() - new Date(a.event_date).getTime()
      );
      const now = Date.now();
      sortedGames.forEach(game => {
        if (!gameDetailsCache[game.id]) {
          gameDetailsCache[game.id] = { game, timestamp: now };
        }
      });
      console.log(`✅ Loaded ${sortedGames.length} F2F games`);
      setF2fGames(sortedGames);
    } catch (err) {
      console.error('❌ Failed to load F2F games:', err);
    } finally {
      setF2fLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      loadGameData();
    }
  }, [id, loadGameData]);

  // === ОТСЛЕЖИВАНИЕ СТАРТА ИГРЫ ===
  useEffect(() => {
    if (!gameDetails || isGameStarted) return;

    const gameStart = new Date(gameDetails.event_date);
    const now = new Date();

    // Если игра уже началась, ничего не делаем (всё уже обработано)
    if (now >= gameStart) {
      setIsGameStarted(true);
      return;
    }

    // Запускаем таймер, который проверяет каждые 5 секунд, началась ли игра
    const checkGameStartInterval = setInterval(() => {
      const now = new Date();
      if (now >= gameStart) {
        console.log('🎮 Game has started! Initializing live score.');
        setIsGameStarted(true);
        clearInterval(checkGameStartInterval);
      }
    }, 5000); // Проверяем каждые 5 секунд

    // Очистка при размонтировании
    return () => clearInterval(checkGameStartInterval);
  }, [gameDetails, isGameStarted]);



  // ✅ Инициализация счёта: если игра ещё не началась — оставляем как есть,
  // если началась — берём данные из gameDetails
  useEffect(() => {
    if (!gameDetails) return;

    const now = new Date();
    const gameStart = new Date(gameDetails.event_date);
    const gameHasStarted = now >= gameStart;

    if (gameHasStarted) {
      // Игра уже идёт или прошла — берём реальный счёт
      setLiveScore({
        home: gameDetails.homeScore ?? '0',
        away: gameDetails.awayScore ?? '0',
      });
      setPeriodScores({
        team1_first: gameDetails.team1_first ?? '0',
        team1_second: gameDetails.team1_second ?? '0',
        team1_third: gameDetails.team1_third ?? '0',
        team2_first: gameDetails.team2_first ?? '0',
        team2_second: gameDetails.team2_second ?? '0',
        team2_third: gameDetails.team2_third ?? '0',
      });
      if (!isGameStarted) {
        setIsGameStarted(true);
      }
    } else {
      // Игра ещё не началась — сбрасываем счёт на 0:0 (на случай, если данные пришли с прошлой игры)
      setLiveScore({ home: '0', away: '0' });
      setPeriodScores({
        team1_first: '0',
        team1_second: '0',
        team1_third: '0',
        team2_first: '0',
        team2_second: '0',
        team2_third: '0',
      });
    }
  }, [gameDetails, isGameStarted]);


  useEffect(() => {
    if (gameDetails && !f2fLoadedRef.current) {
      loadF2fGames(gameDetails);
    }
  }, [gameDetails, loadF2fGames]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadGameData(true);
    setRefreshing(false);
  };


  // === ФОНОВОЕ ОБНОВЛЕНИЕ СЧЁТА ВО ВРЕМЯ ИГРЫ ===
  useEffect(() => {
    if (!gameDetails) return;

    // Функция обновления счёта
    const updateLiveScore = async () => {
      // --- ПЕРЕНОСИМ ПРОВЕРКУ СЮДА ---
      const gameStart = new Date(gameDetails.event_date);
      const gameEnd = new Date(gameStart.getTime() + 100 * 60 * 1000); // +100 минут
      const now = new Date();
      const isGameLive = isGameStarted && now <= gameEnd;

      if (!isGameLive) {
        return; // Ничего не делаем
      }
      // --- КОНЕЦ ПЕРЕНОСА ---

      try {
        const freshGame = await getGameById(gameDetails.id, false);
        if (!freshGame) return;

        const newHome = freshGame.homeScore ?? '0';
        const newAway = freshGame.awayScore ?? '0';
        const currentHome = liveScore.home;
        const currentAway = liveScore.away;

        const newPeriods = {
          team1_first: freshGame.team1_first ?? '0',
          team1_second: freshGame.team1_second ?? '0',
          team1_third: freshGame.team1_third ?? '0',
          team2_first: freshGame.team2_first ?? '0',
          team2_second: freshGame.team2_second ?? '0',
          team2_third: freshGame.team2_third ?? '0',
        };

        const periodsChanged =
          newPeriods.team1_first !== periodScores.team1_first ||
          newPeriods.team1_second !== periodScores.team1_second ||
          newPeriods.team1_third !== periodScores.team1_third ||
          newPeriods.team2_first !== periodScores.team2_first ||
          newPeriods.team2_second !== periodScores.team2_second ||
          newPeriods.team2_third !== periodScores.team2_third;

        if (newHome !== currentHome || newAway !== currentAway || periodsChanged) {
          console.log(`🔄 Live data updated`);
          setLiveScore({ home: newHome, away: newAway });
          setPeriodScores(newPeriods);
        }
      } catch (err) {
        console.warn('⚠️ Failed to update live score:', err);
      }
    };

    // Запускаем первое обновление немедленно
    updateLiveScore();

    // Запускаем интервал каждые 2 минуты
    const intervalId = setInterval(updateLiveScore, 2 * 60 * 1000);

    // Очистка при размонтировании
    return () => clearInterval(intervalId);
  }, [gameDetails?.id, isGameStarted]); // <-- Упрощаем зависимости


  // === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ОТОБРАЖЕНИЯ ===
  const getOutcomeText = (outcome: string): string => {
    switch (outcome) {
      case 'win': return 'Победа';
      case 'loss': return 'Поражение';
      case 'nich': return 'Ничья';
      default: return outcome || '';
    }
  };

  const getOutcomeColor = (outcome: string): string => {
    switch (outcome) {
      case 'win': return colors.success;
      case 'loss': return colors.error;
      case 'nich': return colors.warning;
      default: return colors.textSecondary;
    }
  };

  // === РЕНДЕР ЗАГРУЗКИ / ОШИБКИ ===
  if (loading) {
    return (
      <SafeAreaView style={commonStyles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Icon name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>ХК Динамо Форвард 2014</Text>
            <Text style={styles.headerSubtitle}> • </Text>
            <Text style={styles.headerLocation}>Санкт-Петербург</Text>
          </View>
        </View>
        <LoadingSpinner />
      </SafeAreaView>
    );
  }

  if (error || !gameDetails) {
    return (
      <SafeAreaView style={commonStyles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Icon name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>ХК Динамо Форвард 2014</Text>
            <Text style={styles.headerSubtitle}> • </Text>
            <Text style={styles.headerLocation}>Санкт-Петербург</Text>
          </View>
        </View>
        <ErrorMessage message={error || 'Матч не найден'} onRetry={loadGameData} />
      </SafeAreaView>
    );
  }

  // === ПОДГОТОВКА ДАННЫХ ===
  const {
    date: formattedDate,
    time: formattedTime,
    homeTeam,
    awayTeam,
    homeTeamLogo,
    awayTeamLogo,
    homeScore,
    awayScore,
    homeOutcome,
    awayOutcome,
    team1_first,
    team1_second,
    team1_third,
    team2_first,
    team2_second,
    team2_third,
    league,
    venueId,
    sp_video,
    event_date,
    homeTeamId,
    awayTeamId,
    protocol,
    player_stats,
  } = gameDetails;

  const homeTeamName = homeTeam?.name || 'Команда 1';
  const awayTeamName = awayTeam?.name || 'Команда 2';
  const leagueName = extractNameFromEntity(league);
  const hideTime = formattedTime === '00:00';
  const displayDateTime = hideTime ? formattedDate : `${formattedDate} • ${formattedTime}`;
  const now = new Date();
  const gameDate = new Date(event_date);
  //const isGameStarted = now >= gameDate;
  const scoreDisplay = isGameStarted ? `${liveScore.home} : ${liveScore.away}` : 'VS';
  const showPeriodScores = isGameStarted;
  const homeOutcomeText = extractOutcome(homeOutcome);
  const awayOutcomeText = extractOutcome(awayOutcome);
  const venueData = venueId ? getVenueById(venueId) : null;

  // Анимированные стили для прозрачности и отображения компактного счёта
  const gameInfoOpacity = scrollY.interpolate({
    inputRange: [0, gameInfoHeight.current],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const compactScoreOpacity = scrollY.interpolate({
    inputRange: [gameInfoHeight.current - 50, gameInfoHeight.current],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  return (
    <SafeAreaView style={commonStyles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Icon name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>

        {/* Абсолютно центрированный компактный счёт */}
        <Animated.View style={[styles.headerCompactScoreContainer, { opacity: compactScoreOpacity }]}>
          {homeTeamLogo ? (
            <Image source={{ uri: homeTeamLogo }} style={styles.headerLogo} />
          ) : (
            <View style={[styles.headerLogo, { backgroundColor: colors.border }]} />
          )}
          <Text style={[styles.headerScore, !isGameStarted && styles.vsText]}>{scoreDisplay}</Text>
          {awayTeamLogo ? (
            <Image source={{ uri: awayTeamLogo }} style={styles.headerLogo} />
          ) : (
            <View style={[styles.headerLogo, { backgroundColor: colors.border }]} />
          )}
        </Animated.View>
      </View>

      <Animated.ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false } // Для анимации opacity можно использовать false
        )}
        scrollEventThrottle={16}
      >
        {/* Main Game Info (анимированный) */}
        <Animated.View
          style={[
            styles.gameInfo,
            { opacity: gameInfoOpacity },
          ]}
          onLayout={handleGameInfoLayout} // Измеряем высоту
        >
          <View style={styles.gameHeader}>
            <Text style={styles.gameDate}>{displayDateTime}</Text>
          </View>
          <View style={styles.teamsContainer}>
            <View style={styles.teamColumn}>
              {homeTeamLogo ? (
                <Image source={{ uri: homeTeamLogo }} style={styles.teamLogo} />
              ) : (
                <View style={styles.teamLogoPlaceholder}>
                  <Icon name="shield" size={32} color={colors.textSecondary} />
                </View>
              )}
              <Text style={styles.teamName} numberOfLines={2}>{homeTeamName}</Text>
              {homeOutcomeText && (
                <View style={styles.outcomeBadgeContainer}>
                  <View style={[styles.outcomeBadge, { backgroundColor: getOutcomeColor(homeOutcomeText) }]}>
                    <Text style={styles.outcomeText}>{getOutcomeText(homeOutcomeText)}</Text>
                  </View>
                </View>
              )}
            </View>
            <View style={styles.scoreContainer}>
              <Text style={[styles.score, !isGameStarted && styles.vsText]}>{scoreDisplay}</Text>
            </View>
            <View style={styles.teamColumn}>
              {awayTeamLogo ? (
                <Image source={{ uri: awayTeamLogo }} style={styles.teamLogo} />
              ) : (
                <View style={styles.teamLogoPlaceholder}>
                  <Icon name="shield" size={32} color={colors.textSecondary} />
                </View>
              )}
              <Text style={styles.teamName} numberOfLines={2}>{awayTeamName}</Text>
              {awayOutcomeText && (
                <View style={styles.outcomeBadgeContainer}>
                  <View style={[styles.outcomeBadge, { backgroundColor: getOutcomeColor(awayOutcomeText) }]}>
                    <Text style={styles.outcomeText}>{getOutcomeText(awayOutcomeText)}</Text>
                  </View>
                </View>
              )}
            </View>
          </View>
          {leagueName && <Text style={styles.leagueText}>🏆 {leagueName}</Text>}
        </Animated.View>

        {/* Video */}
        {sp_video && (
          <View style={styles.videoContainer}>
            <View style={styles.videoFrame}>
              <WebView
                source={{ uri: getVKEmbedUrl(sp_video, !isGameFinished(gameDetails)) }}
                style={styles.webview}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                startInLoadingState={true}
                scalesPageToFit={false}
                allowsInlineMediaPlayback={true}
                mediaPlaybackRequiresUserAction={false}
                mixedContentMode="compatibility"
                allowsFullscreenVideo={true}
                bounces={false}
                scrollEnabled={false}
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
                userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1"
              />
            </View>
          </View>
        )}

        {/* Period Scores */}
        {showPeriodScores && (
          <View style={styles.periodScores}>
            <View style={styles.periodTable}>
              <View style={styles.periodHeader}>
                <Text style={styles.periodHeaderText}>Счет по периодам</Text>
                <Text style={styles.periodHeaderNumber}>1</Text>
                <Text style={styles.periodHeaderNumber}>2</Text>
                <Text style={styles.periodHeaderNumber}>3</Text>
                <Text style={styles.periodHeaderNumber}>Итого</Text>
              </View>
              <View style={styles.periodRow}>
                <Text style={styles.periodTeam}>{homeTeamName}</Text>
                <Text style={styles.periodScore}>{periodScores.team1_first}</Text>
                <Text style={styles.periodScore}>{periodScores.team1_second}</Text>
                <Text style={styles.periodScore}>{periodScores.team1_third}</Text>
                <Text style={styles.periodTotal}>{liveScore.home}</Text>
              </View>
              <View style={styles.periodRow}>
                <Text style={styles.periodTeam}>{awayTeamName}</Text>
                <Text style={styles.periodScore}>{periodScores.team2_first}</Text>
                <Text style={styles.periodScore}>{periodScores.team2_second}</Text>
                <Text style={styles.periodScore}>{periodScores.team2_third}</Text>
                <Text style={styles.periodTotal}>{liveScore.away}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Tabs Section */}
        <View style={styles.tabsContainer}>
          <View style={styles.tabsSpacer} />
          <SegmentedControl
            values={tabs}
            selectedIndex={tabIndex}
            onChange={(event) => setTabIndex(event.nativeEvent.selectedSegmentIndex)}
            tintColor={colors.primary}
            fontStyle={{ fontSize: 14, fontWeight: '600', color: colors.text }}
            activeFontStyle={{ fontWeight: '700' }}
            backgroundColor={colors.surface}
          />
          <View style={styles.tabContent}>
            {tabs[tabIndex] === 'Протокол' && gameDetails?.protocol && (
              <View style={styles.protocolTab}>
                {renderProtocolByPeriods(
                  gameDetails.protocol,
                  gameDetails,
                  protocolPlayers,
                  (url) => {
                    const cleanUrl = url.split('?')[0];
                    const embedUrl = getVKEmbedUrl(cleanUrl, true);
                    const timeParamMatch = url.match(/\?t=([^&]+)/);
                    let finalUrl = embedUrl;
                    if (timeParamMatch) {
                      finalUrl += (embedUrl.includes('?') ? '&' : '?') + `t=${timeParamMatch[1]}`;
                    }
                    setVideoModalUrl(finalUrl);
                  }
                )}
              </View>
            )}
            {tabs[tabIndex] === 'Статистика' && gameDetails?.player_stats && (
              <ScrollView style={styles.statsTab}>
                {Object.entries(gameDetails.player_stats).map(([teamId, statsArray]) => {
                  if (!Array.isArray(statsArray)) return null;
                  return (
                    <View key={teamId} style={styles.teamStatsSection}>
                      {renderPlayerStatsTable(teamId, statsArray, statsPlayers)}
                    </View>
                  );
                })}
              </ScrollView>
            )}
            {tabs[tabIndex] === 'Арена' && venueData && (
              <View style={styles.venueInfo}>
                <Text style={styles.venueName}>{venueData.name}</Text>
                {venueData.address && <Text style={styles.venueAddress}>{venueData.address}</Text>}
                {venueData.coordinates && (
                  <TouchableOpacity
                    onPress={() => {
                      const url = `https://yandex.ru/maps/?pt=${venueData.coordinates.longitude},${venueData.coordinates.latitude}&z=17`;
                      Linking.openURL(url).catch(() => console.warn('Не удалось открыть Яндекс.Карты'));
                    }}
                    style={styles.mapLinkButton}
                  >
                    <Text style={styles.mapLinkText}>Открыть в </Text>
                    <Image source={require('../../assets/icons/YandexMap.png')} style={styles.mapIcon} />
                  </TouchableOpacity>
                )}
              </View>
            )}
            {tabs[tabIndex] === 'F2F' && (
              <View style={styles.f2fTab}>
                {f2fLoading ? (
                  <LoadingSpinner />
                ) : f2fGames.length > 0 ? (
                  f2fGames.map((game) => <GameCardCompact key={game.id} game={game} showScore={true} />)
                ) : (
                  <Text style={[commonStyles.text, { textAlign: 'center', marginTop: 24 }]}>
                    Нет истории личных встреч
                  </Text>
                )}
              </View>
            )}
          </View>
        </View>
      </Animated.ScrollView>

      {/* Video Modal */}
      {videoModalUrl && (
        <View style={styles.videoModalOverlay}>
          <TouchableOpacity style={styles.videoModalCloseButton} onPress={() => setVideoModalUrl(null)}>
            <Icon name="close" size={32} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.videoModalContent}>
            <WebView
              source={{ uri: videoModalUrl }}
              style={styles.videoModalWebView}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              startInLoadingState={true}
              scalesPageToFit={false}
              allowsInlineMediaPlayback={true}
              mediaPlaybackRequiresUserAction={false}
              mixedContentMode="compatibility"
              allowsFullscreenVideo={true}
              scrollEnabled={false}
              bounces={false}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
              userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1"
              onShouldStartLoadWithRequest={(request) => request.url.startsWith('https://vk.com/video_ext.php')}
              onFullscreenVideoWillDismiss={() => setVideoModalUrl(null)}
            />
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

// === СТИЛИ ===
const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  backButton: { marginRight: 16, padding: 4 },
  headerTitleContainer: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  headerTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  headerSubtitle: { fontSize: 16, fontWeight: '400', color: colors.textSecondary },
  headerLocation: { fontSize: 14, fontWeight: '400', color: colors.textSecondary },
  content: { flex: 1 },
  videoContainer: {
    padding: 16,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  videoFrame: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 4,
  },
  webview: { flex: 1, backgroundColor: '#000', borderRadius: 12 },
  gameInfo: {
    padding: 10,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  gameHeader: { alignItems: 'center' },
  gameDate: { fontSize: 16, color: colors.textSecondary, fontWeight: '500' },
  leagueText: { fontSize: 14, color: colors.textSecondary, textAlign: 'left', paddingLeft: 8, fontStyle: 'italic' },
  teamsContainer: { flexDirection: 'row', alignItems: 'stretch', justifyContent: 'space-between', marginBottom: 24 },
  teamColumn: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  teamLogo: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surface, marginBottom: 12 },
  teamLogoPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  teamName: { fontSize: 14, fontWeight: '600', color: colors.text, textAlign: 'center', lineHeight: 18, marginBottom: 4 },
  scoreContainer: { justifyContent: 'center', paddingHorizontal: 16 },
  score: { fontSize: 32, fontWeight: '800', color: colors.primary },
  vsText: { color: colors.textSecondary },
  outcomeBadgeContainer: { alignItems: 'center' },
  outcomeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    minWidth: 80,
    alignItems: 'center',
  },
  outcomeText: {
    color: colors.background,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  periodScores: {
    padding: 16,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  periodTable: { backgroundColor: colors.surface, borderRadius: 12, overflow: 'hidden' },
  periodHeaderNumber: { flex: 1, color: colors.background, fontWeight: '600', textAlign: 'center', fontSize: 14 },
  periodRow: { flexDirection: 'row', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  periodTeam: { flex: 4, color: colors.text, fontWeight: '500', fontSize: 14, textAlign: 'left', paddingLeft: 8 },
  periodScore: { flex: 1, color: colors.text, textAlign: 'center', fontSize: 14, fontWeight: '500' },
  periodTotal: { flex: 1, color: colors.primary, textAlign: 'center', fontWeight: '700', fontSize: 14 },
  tabsContainer: { marginHorizontal: 16, marginBottom: 16 },
  tabsSpacer: { height: 16 },
  tabContent: { marginHorizontal: 0, marginTop: 16, backgroundColor: colors.surface, borderRadius: 12 },
  venueInfo: { gap: 8, padding: 16 },
  venueName: { fontSize: 16, fontWeight: '600', color: colors.text },
  venueAddress: { fontSize: 14, color: colors.textSecondary },
  mapLinkButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  mapLinkText: { fontSize: 14, color: colors.primary, fontWeight: '600' },
  mapIcon: { width: 150, height: 26 },
  f2fTab: { width: '100%' },
  protocolTab: { padding: 0 },
  protocolEventTimeText: { fontSize: 12, fontWeight: '600', color: colors.text },
  protocolEventTextContainer: { flex: 1 },
  protocolEventLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  protocolEventPlayers: { flexDirection: 'column', gap: 6 },
  protocolEventPlayerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  protocolEventPlayerPhoto: { width: 28, height: 28, borderRadius: 14 },
  protocolEventPlayerPhotoPlaceholder: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.border },
  protocolEventPlayerInfo: { justifyContent: 'center' },
  protocolEventPlayerNumber: { fontSize: 12, fontWeight: '600', color: colors.text },
  protocolEventPlayerName: { fontSize: 12, color: colors.textSecondary },
  protocolEventComment: { fontSize: 13, color: colors.text, fontStyle: 'italic', lineHeight: 16 },
  protocolEventScoreRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  protocolEventScoreLogo: { width: 20, height: 20, borderRadius: 10 },
  protocolScore: { fontSize: 16, fontWeight: '500', color: colors.text },
  protocolScoreBold: { fontSize: 16, fontWeight: '800', color: colors.primary },
  protocolEventScoreSeparator: { fontSize: 16, color: colors.text },
  protocolEventVideoButton: { marginLeft: 'auto', padding: 4 },
  // Статистика
  statsTab: { maxHeight: 600 },
  teamStatsSection: { marginBottom: 24 },
  statsTableContainer: { marginVertical: 16, marginHorizontal: 0 },
  statsTableTitle: { fontSize: 18, fontWeight: '600', color: colors.text, marginBottom: 8 },
  statsTableHeader: { flexDirection: 'row', backgroundColor: colors.primary, paddingVertical: 8, paddingHorizontal: 8 },
  statsHeaderCell: { justifyContent: 'center', alignItems: 'center' },
  statsHeaderText: { color: colors.background, fontWeight: '600', fontSize: 12, textAlign: 'center' },
  statsRow: { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  statsCell: { justifyContent: 'center', alignItems: 'center', padding: 4 },
  statsCellNumber: { flex: 0.5, justifyContent: 'center', fontWeight: '600', alignItems: 'center' },
  statsCellPhoto: { flex: 0.5, justifyContent: 'center', alignItems: 'center' },
  statsCellName: { flex: 2, justifyContent: 'center', alignItems: 'flex-start', paddingLeft: 8 },
  statsText: { fontSize: 12, color: colors.text, textAlign: 'center' },
  statsPlayerPhoto: { width: 24, height: 24, borderRadius: 12 },
  statsPlayerPhotoPlaceholder: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.border },
  // Модальное окно видео
  videoModalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  videoModalContent: {
    width: '90%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  videoModalCloseButton: {
    position: 'absolute',
    top: 40,
    right: 20,
    zIndex: 1001,
    padding: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 24,
  },
  videoModalWebView: { 
    flex: 1, 
    backgroundColor: '#000'   
  },
  protocolPeriodSection: {
    marginBottom: 24,
  },
  periodHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  periodHeaderText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    padding: 16,
  },
      // Стили для протокола (таблица)
  protocolTable: {
    width: '100%',
  },
  protocolTableRow: {
    flexDirection: 'row',
    alignItems: 'stretch', // Оставляем, чтобы логотипы были по центру
    // Убираем marginBottom, если он был
    // marginBottom: 16,
  },
  protocolTableCellSpacer: {
    width: 20, // Ширина столбца для отступа
  },
  protocolTableCellLogo: {
    width: 1, // Ширина объединенных столбцов 2-3
    justifyContent: 'center',
    alignItems: 'center',
    borderLeftWidth: 2, // Видимая граница между столбцами
    borderLeftColor: colors.primary,
    borderRightWidth: 2, // Видимая граница между столбцами
    borderRightColor: colors.primary,
  },
  protocolTableCellIcon: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  protocolIconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#F5F5F5', // Серая заливка
    borderWidth: 1, // Тонкая рамка
    borderColor: colors.primary, // Цвет рамки
    justifyContent: 'center',
    alignItems: 'center',
  },
  protocolLogoCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#F5F5F5', // Серая заливка
    borderWidth: 1, // Тонкая рамка
    borderColor: colors.primary, // Цвет рамки
    justifyContent: 'center',
    alignItems: 'center',
  },
  protocolEventTeamLogo: {
    width: '80%',
    height: '80%',
    resizeMode: 'contain',
  },
  protocolTableCellContent: {
    flex: 1,
    paddingLeft: 12,
    // Добавляем вертикальный отступ (padding) для создания пространства между элементами
    paddingTop: 8,
    paddingBottom: 8,
    justifyContent: 'center', // Добавляем это свойство
  },
  protocolPeriodTitleText: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  protocolFinalText: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
// Стили для компактного счёта в шапке
headerCompactScoreContainer: {
  position: 'absolute',
  left: 26, // ← Начинаем справа от кнопки "Назад" (ширина кнопки ~24 + отступы ~16 + запас)
  right: 26, // ← Отступ справа
  top: 0,
  bottom: 0,
  justifyContent: 'center',
  alignItems: 'center',
  flexDirection: 'row',
  gap: 8,
  // Добавляем, чтобы не перехватывать касания вне контента
  pointerEvents: 'box-none', // ← Ключевое исправление
},
headerLogo: {
  width: 24,
  height: 24,
  borderRadius: 12,
},
headerScore: {
  fontSize: 24,
  fontWeight: '800',
  color: colors.primary,
},
});