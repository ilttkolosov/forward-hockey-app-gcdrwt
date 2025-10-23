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
      url.searchParams.set('muted', '0'); // ← явно включаем звук
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

const getEventTypeLabel = (type: string): string => {
  switch (type) {
    case 'gk': return 'Вратарь';
    case 'g': return 'Гол';
    case 'p': return 'Штраф';
    case 'o': return 'Другое';
    default: return type;
  }
};

const getEventTypeColor = (type: string): string => {
  switch (type) {
    case 'g': return colors.success;
    case 'p': return colors.error;
    case 'gk': return colors.warning;
    case 'o': return colors.textSecondary;
    default: return colors.text;
  }
};

const isGameFinished = (game: Game): boolean => {
  const now = new Date();
  const gameDate = new Date(game.event_date);
  // Если игра началась и прошло более 3 часов — считаем завершённой
  return now.getTime() - gameDate.getTime() > 3 * 60 * 60 * 1000;
};

// 🔥 ИСПРАВЛЕНА ЛОГИКА ПЕРИОДОВ
const getPeriodLabel = (timeStr: string, protocol: any): string => {
  if (!timeStr || !/^\d{2}:\d{2}$/.test(timeStr)) return 'other';
  const [minutesStr, secondsStr] = timeStr.split(':');
  const minutes = parseInt(minutesStr, 10);
  const seconds = parseInt(secondsStr, 10);
  if (isNaN(minutes) || isNaN(seconds)) return 'other';

  const maintime = parseInt(protocol.maintime || '60', 10);

  // Основное время: строго МЕНЬШЕ maintime → периоды
  if (minutes < maintime) {
    const periodLength = maintime / 3;
    if (minutes < periodLength) return 'period1';
    if (minutes < periodLength * 2) return 'period2';
    return 'period3';
  }

  // После основного времени
  if (protocol.overtime) {
    const otMinutes = parseInt(protocol.overtime, 10) || 0;
    if (minutes <= maintime + otMinutes) return 'overtime';
  }

  // Буллиты (если pms: true)
  if (protocol.pms) return 'shootout';

  return 'other';
};

const renderProtocolByPeriods = (
  protocol: any,
  gameDetails: Game,
  protocolPlayers: Record<string, any>,
  onVideoPress: (url: string) => void
) => {
  const { homeTeamLogo, awayTeamLogo } = gameDetails;

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

  const periodLabels: { [key: string]: string } = {
    period1: 'Период 1',
    period2: 'Период 2',
    period3: 'Период 3',
    overtime: 'Овертайм',
    shootout: 'Буллиты',
  };

  return Object.entries(periods).map(([key, events]) => {
    if (events.length === 0) return null;
    return (
      <View key={key} style={styles.protocolPeriodSection}>
        <Text style={styles.protocolPeriodTitle}>{periodLabels[key]}</Text>
        {events.map((event: any, idx: number) => {
          return (
            <View
              key={idx}
              style={[
                styles.protocolRow,
                idx % 2 === 0 ? styles.protocolRowEven : styles.protocolRowOdd,
              ]}
            >
              <Text style={styles.protocolTime}>{event.time}</Text>
              <View style={styles.protocolTypeBadge}>
                <Text style={[styles.protocolTypeText, { color: getEventTypeColor(event.type) }]}>
                  {getEventTypeLabel(event.type)}
                </Text>
              </View>
              <View style={styles.protocolTeamLogo}>
                <Image
                  source={{ uri: event.team === 0 ? homeTeamLogo : awayTeamLogo }}
                  style={styles.protocolTeamLogoImage}
                />
              </View>
              {/* Игроки + Комментарий в одном блоке */}
              <View style={styles.protocolEventDetails}>
                {(() => {
                  const elements = [];
                  if (event.players && event.players.length > 0) {
                    event.players.forEach((playerId: string, pIdx: number) => {
                      const player = protocolPlayers[playerId] || null;
                      elements.push(
                        <View key={`player-${pIdx}`} style={styles.protocolPlayerCard}>
                          {player?.photoPath ? (
                            <Image source={{ uri: player.photoPath }} style={styles.protocolPlayerPhoto} />
                          ) : (
                            <View style={styles.protocolPlayerPhotoPlaceholder} />
                          )}
                          <View style={styles.protocolPlayerInfo}>
                            <Text style={styles.protocolPlayerNumber}>#{player?.number || '?'}</Text>
                            <Text style={styles.protocolPlayerName}>
                              {player ? player.name : `ID: ${playerId}`}
                            </Text>
                          </View>
                        </View>
                      );
                    });
                  }
                  if (event.comment) {
                    elements.push(
                      <Text key="comment" style={styles.protocolCommentInline}>
                        {event.comment.replace(/<br\s*\/?>/gi, '\n')}
                      </Text>
                    );
                  }
                  return elements;
                })()}
              </View>
              {event.url?.trim() && (
                <TouchableOpacity onPress={() => onVideoPress(event.url.trim())} style={styles.videoButton}>
                  <Icon name="play-circle" size={20} color={colors.primary} />
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </View>
    );
  });
};

// === ОСНОВНОЙ КОМПОНЕНТ ===
export default function GameDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [gameDetails, setGameDetails] = useState<Game | null>(null);
  const [protocolPlayers, setProtocolPlayers] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tabIndex, setTabIndex] = useState(0);
  const [f2fGames, setF2fGames] = useState<Game[]>([]);
  const [f2fLoading, setF2fLoading] = useState(false);
  const tabs = ['Арена', 'Протокол', 'Статистика', 'F2F'];
  const f2fLoadedRef = useRef(false);
  const [videoModalUrl, setVideoModalUrl] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

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

      // 🔥 Загружаем игроков из протокола
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
          gameDetailsCache[game.id] = {  game, timestamp: now };
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
  } = gameDetails;

  const homeTeamName = homeTeam?.name || 'Команда 1';
  const awayTeamName = awayTeam?.name || 'Команда 2';
  const leagueName = extractNameFromEntity(league);
  const hideTime = formattedTime === '00:00';
  const displayDateTime = hideTime ? formattedDate : `${formattedDate} • ${formattedTime}`;
  const now = new Date();
  const gameDate = new Date(event_date);
  const isGameStarted = now >= gameDate;
  const homeGoalsDisplay = homeScore ?? 0;
  const awayGoalsDisplay = awayScore ?? 0;
  const scoreDisplay = isGameStarted ? `${homeGoalsDisplay} : ${awayGoalsDisplay}` : 'VS';
  const showPeriodScores = isGameStarted;
  const homeOutcomeText = extractOutcome(homeOutcome);
  const awayOutcomeText = extractOutcome(awayOutcome);
  const venueData = venueId ? getVenueById(venueId) : null;

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
      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Main Game Info */}
        <View style={styles.gameInfo}>
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
          {leagueName && (
            <Text style={styles.leagueText}>🏆 {leagueName}</Text>
          )}
        </View>
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
                <Text style={styles.periodScore}>{team1_first || 0}</Text>
                <Text style={styles.periodScore}>{team1_second || 0}</Text>
                <Text style={styles.periodScore}>{team1_third || 0}</Text>
                <Text style={styles.periodTotal}>{homeGoalsDisplay}</Text>
              </View>
              <View style={styles.periodRow}>
                <Text style={styles.periodTeam}>{awayTeamName}</Text>
                <Text style={styles.periodScore}>{team2_first || 0}</Text>
                <Text style={styles.periodScore}>{team2_second || 0}</Text>
                <Text style={styles.periodScore}>{team2_third || 0}</Text>
                <Text style={styles.periodTotal}>{awayGoalsDisplay}</Text>
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
            {tabIndex === 0 && venueData && (
              <View style={styles.venueInfo}>
                <Text style={styles.venueName}>{venueData.name}</Text>
                {venueData.address && (
                  <Text style={styles.venueAddress}>{venueData.address}</Text>
                )}
                {venueData.coordinates && (
                  <TouchableOpacity
                    onPress={() => {
                      const url = `https://yandex.ru/maps/?pt=${venueData.coordinates.longitude},${venueData.coordinates.latitude}&z=17`;
                      Linking.openURL(url).catch(() => console.warn('Не удалось открыть Яндекс.Карты'));
                    }}
                    style={styles.mapLinkButton}
                  >
                    <Text style={styles.mapLinkText}>Открыть в </Text>
                    <Image
                      source={require('../../assets/icons/YandexMap.png')}
                      style={styles.mapIcon}
                    />
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* === ВКЛАДКА ПРОТОКОЛА === */}
            {tabIndex === 1 && gameDetails?.protocol && (
              <View style={styles.protocolTab}>
{/*                 <View style={styles.protocolHeader}>
                  <Text style={styles.protocolHeaderText}>
                    Основное: {gameDetails.protocol.maintime || '60'} мин
                  </Text>
                  {gameDetails.protocol.overtime && (
                    <Text style={styles.protocolHeaderText}>
                      ОТ: {gameDetails.protocol.overtime} мин
                    </Text>
                  )}
                  {gameDetails.protocol.pms && (
                    <Text style={styles.protocolHeaderText}>Буллиты</Text>
                  )}
                  {gameDetails.protocol['penalty-time'] && (
                    <Text style={styles.protocolHeaderText}>
                      Удаление: {gameDetails.protocol['penalty-time']}
                    </Text>
                  )}
                </View> */}
                {renderProtocolByPeriods(
                  gameDetails.protocol,
                  gameDetails,
                  protocolPlayers,
                  (url) => {
                  // Извлекаем базовую ссылку без параметров времени
                  const cleanUrl = url.split('?')[0];
                  // Преобразуем в embed-формат без autoplay
                  const embedUrl = getVKEmbedUrl(cleanUrl, true);
                  // Добавляем время из оригинальной ссылки
                  const timeParamMatch = url.match(/\?t=([^&]+)/);
                  let finalUrl = embedUrl;
                  if (timeParamMatch) {
                    // embedUrl уже содержит ?oid=..., поэтому добавляем &t=...
                    finalUrl += (embedUrl.includes('?') ? '&' : '?') + `t=${timeParamMatch[1]}`;
                  }
                  setVideoModalUrl(finalUrl);
                }
                )}
              </View>
            )}

            {tabIndex === 2 && (
              <View style={styles.placeholderTab}>
                <Text style={styles.placeholderText}>Хоккей</Text>
              </View>
            )}

            {tabIndex === 3 && (
              <View style={styles.f2fTab}>
                {f2fLoading ? (
                  <LoadingSpinner />
                ) : f2fGames.length > 0 ? (
                  f2fGames.map((game) => (
                    <GameCardCompact key={game.id} game={game} showScore={true} />
                  ))
                ) : (
                  <Text style={[commonStyles.text, { textAlign: 'center', marginTop: 24 }]}>
                    Нет истории личных встреч
                  </Text>
                )}
              </View>
            )}
          </View>
        </View>
      </ScrollView>
      {/* Video Modal */}
      {videoModalUrl && (
        <View style={styles.videoModalOverlay}>
          {/* Кнопка закрытия — теперь в правом верхнем углу всего модального окна */}
          <TouchableOpacity
            style={styles.videoModalCloseButton}
            onPress={() => setVideoModalUrl(null)}
          >
            <Icon name="close" size={32} color="#FFFFFF" />
          </TouchableOpacity>

          {/* Видео-контейнер */}
          <View style={styles.videoModalContent}>
            <WebView
              source={{ uri: videoModalUrl }}
              style={styles.videoModalWebView}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              startInLoadingState={true}               // ← добавьте
              scalesPageToFit={false}                  // ← добавьте
              allowsInlineMediaPlayback={true}
              mediaPlaybackRequiresUserAction={false}
              mixedContentMode="compatibility"
              allowsFullscreenVideo={true}
              scrollEnabled={false}
              bounces={false}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
              userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1"
              onShouldStartLoadWithRequest={(request) => {
                return request.url.startsWith('https://vk.com/video_ext.php');
              }}
              onFullscreenVideoWillDismiss={() => {
                setVideoModalUrl(null);
              }}
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
  backButton: {
    marginRight: 16,
    padding: 4,
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  headerSubtitle: {
    fontSize: 16,
    fontWeight: '400',
    color: colors.textSecondary,
  },
  headerLocation: {
    fontSize: 14,
    fontWeight: '400',
    color: colors.textSecondary,
  },
  content: {
    flex: 1,
  },
  videoContainer: {
    padding: 16,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
  },
  videoFrame: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 4,
  },
  webview: {
    flex: 1,
    backgroundColor: '#000',
    borderRadius: 12,
  },
  gameInfo: {
    padding: 10,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  gameHeader: {
    alignItems: 'center',
    //marginBottom: 8,
  },
  gameDate: {
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  leagueText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'left',
    paddingLeft: 8,
    marginBottom: 0,
    fontStyle: 'italic',
  },
  teamsContainer: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    marginBottom: 24,
    //paddingHorizontal: 8,
  },
  teamColumn: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  teamLogo: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surface,
    marginBottom: 12,
  },
  teamLogoPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  teamName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 4,
  },
  scoreContainer: {
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  score: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.primary,
  },
  vsText: {
    color: colors.textSecondary,
  },
  outcomeBadgeContainer: {
    alignItems: 'center',
  },
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
  periodTable: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    overflow: 'hidden',
  },
  periodHeader: {
    flexDirection: 'row',
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  periodHeaderNumber: {
    flex: 1,
    color: colors.background,
    fontWeight: '600',
    textAlign: 'center',
    fontSize: 14,
  },
  periodHeaderText: {
    flex: 4,
    color: colors.background,
    fontWeight: '600',
    textAlign: 'left',
    fontSize: 14,
    paddingLeft: 8,
  },
  periodRow: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  periodTeam: {
    flex: 4,
    color: colors.text,
    fontWeight: '500',
    fontSize: 14,
    textAlign: 'left',
    paddingLeft: 8,
  },
  periodScore: {
    flex: 1,
    color: colors.text,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '500',
  },
  periodTotal: {
    flex: 1,
    color: colors.primary,
    textAlign: 'center',
    fontWeight: '700',
    fontSize: 14,
  },
  tabsContainer: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  tabsSpacer: {
    height: 16,
  },
  tabContent: {
    marginTop: 16,
    backgroundColor: colors.surface,
    borderRadius: 12,
  },
  venueInfo: {
    gap: 8,
  },
  venueName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  venueAddress: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  mapLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  mapLinkText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
  mapIcon: {
    width: 150,
    height: 26,
  },
  placeholderTab: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  placeholderText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  f2fTab: {
    width: '100%',
  },
  protocolTab: {
    //padding: 16,
  },
  protocolHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
    padding: 12,
    backgroundColor: colors.surface,
    borderRadius: 8,
  },
  protocolHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: colors.background,
    borderRadius: 6,
  },
  protocolPeriodSection: {
    marginBottom: 24,
  },
  protocolPeriodTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  protocolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  protocolRowEven: {
    backgroundColor: colors.background,
  },
  protocolRowOdd: {
    backgroundColor: colors.surface,
  },
  protocolTime: {
    width: 50,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  protocolTypeBadge: {
    width: 80,
  },
  protocolTypeText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  protocolTeamLogo: {
    width: 40,
    alignItems: 'center',
  },
  protocolTeamLogoImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  protocolEventDetails: {
    flex: 1,
    flexDirection: 'column',
    gap: 4,
    marginRight: 8,
  },
  protocolPlayerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 6,
    minWidth: 80,
  },
  protocolPlayerPhoto: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 6,
  },
  protocolPlayerPhotoPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.border,
    marginRight: 6,
  },
  protocolPlayerInfo: {
    justifyContent: 'center',
  },
  protocolPlayerNumber: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  protocolPlayerName: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  protocolCommentInline: {
    fontSize: 13,
    color: colors.text,
    fontStyle: 'italic',
    lineHeight: 16,
  },
  videoButton: {
    padding: 4,
  },
  videoModalOverlay: {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0,0,0,0.9)', // чуть темнее для контраста
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
  top: 40, // отступ от верха экрана
  right: 20, // отступ от правого края
  zIndex: 1001,
  padding: 12,
  backgroundColor: 'rgba(0,0,0,0.7)',
  borderRadius: 24,
},
videoModalWebView: {
  flex: 1,
  backgroundColor: '#000',
},
});