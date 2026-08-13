// app/game/[id].tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ActivityIndicator,
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Image,
  Linking,
  Animated,
  LayoutChangeEvent,
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
import { trackScreenView } from '../../services/analyticsService';
import { useTrackScreenView } from '../../hooks/useTrackScreenView';

// Определение типа видео
const isYouTubeUrl = (url: string): boolean => {
  return /(?:youtube\.com\/watch\?v=|youtu\.be\/)/.test(url.trim());
};

// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===
const VK_EMBED_URL = 'https://vkvideo.ru/video_ext.php';
const VK_VIDEO_ID_PATTERN = /(?:video|live)(-?\d+)_(\d+)/i;

const isVKVideoHost = (hostname: string): boolean => {
  const normalizedHostname = hostname.toLowerCase();
  return ['vk.com', 'vk.ru', 'vkvideo.ru'].some(
    (domain) => normalizedHostname === domain || normalizedHostname.endsWith(`.${domain}`)
  );
};

const parseVKVideoUrl = (url: string): { ownerId: string; videoId: string } | null => {
  try {
    const parsedUrl = new URL(url.trim().replace(/&amp;/g, '&'));
    if (!isVKVideoHost(parsedUrl.hostname)) return null;

    if (parsedUrl.pathname.endsWith('/video_ext.php')) {
      const ownerId = parsedUrl.searchParams.get('oid');
      const videoId = parsedUrl.searchParams.get('id');
      if (ownerId && videoId && /^-?\d+$/.test(ownerId) && /^\d+$/.test(videoId)) {
        return { ownerId, videoId };
      }
      return null;
    }

    // VK currently uses both /video-OWNER_ID_VIDEO_ID and
    // /live-OWNER_ID_VIDEO_ID. The identifier may also be nested in a
    // query/hash of a share URL, so inspect the complete path suffix.
    const videoMatch = `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`.match(
      VK_VIDEO_ID_PATTERN
    );
    if (videoMatch) {
      return { ownerId: videoMatch[1], videoId: videoMatch[2] };
    }
    return null;
  } catch (error) {
    console.error('Error parsing VK video URL:', error);
    return null;
  }
};

const constructVKEmbedUrl = (
  ownerId: string,
  videoId: string,
  autoplay: boolean = true,
  sourceUrl?: URL
): string => {
  const embedUrl = new URL(VK_EMBED_URL);

  // Preserve parameters which VK may add to shared/private videos and clips.
  ['hash', 'list', 't'].forEach((parameter) => {
    const value = sourceUrl?.searchParams.get(parameter);
    if (value) embedUrl.searchParams.set(parameter, value);
  });

  embedUrl.searchParams.set('oid', ownerId);
  embedUrl.searchParams.set('id', videoId);
  embedUrl.searchParams.set('hd', sourceUrl?.searchParams.get('hd') || '4');
  embedUrl.searchParams.set('autoplay', autoplay ? '1' : '0');
  embedUrl.searchParams.set('muted', '0');
  embedUrl.searchParams.set('js_api', '1');
  return embedUrl.toString();
};

const getVKEmbedUrl = (videoUrl: string, autoplay: boolean = true): string => {
  try {
    const normalizedUrl = videoUrl.trim().replace(/&amp;/g, '&');
    const parsed = parseVKVideoUrl(normalizedUrl);
    if (parsed) {
      return constructVKEmbedUrl(
        parsed.ownerId,
        parsed.videoId,
        autoplay,
        new URL(normalizedUrl)
      );
    }
    return videoUrl;
  } catch (error) {
    console.error('Error processing VK video URL:', error);
    return videoUrl;
  }
};

const isAllowedVKEmbedNavigation = (requestUrl: string): boolean => {
  if (requestUrl === 'about:blank') return true;
  try {
    const parsedUrl = new URL(requestUrl);
    return isVKVideoHost(parsedUrl.hostname) && parsedUrl.pathname.endsWith('/video_ext.php');
  } catch {
    return false;
  }
};

const BLOCKED_VIDEO_NAVIGATION_TYPES = new Set(['click', 'formsubmit', 'formresubmit']);
const MAX_VIDEO_BOOTSTRAP_RETRIES = 2;

type VideoGenerationStatus = 'ready' | 'retrying' | 'failed';

const shouldAllowVideoNavigation = (
  sourceUrl: string,
  requestUrl: string,
  isTopFrame: boolean | undefined,
  navigationType: string
): boolean => {
  // Keep the existing behavior for non-VK sources (for example YouTube).
  if (parseVKVideoUrl(sourceUrl) === null) return true;

  // iOS reports navigation requests from VK's internal frames as well. They
  // are required for player bootstrap, authentication and media delivery.
  if (isTopFrame === false) return true;

  if (isAllowedVKEmbedNavigation(requestUrl)) return true;

  // Allow redirects/reloads used while the embedded player initializes, but
  // do not let a user click navigate the top-level WebView to the full VK UI.
  return !BLOCKED_VIDEO_NAVIGATION_TYPES.has(navigationType);
};

const getVideoLogContext = (url: string): Record<string, string> => {
  try {
    const parsedUrl = new URL(url);
    const video = parseVKVideoUrl(url);
    return {
      host: parsedUrl.hostname || parsedUrl.protocol.replace(':', ''),
      path: parsedUrl.pathname,
      ...(video ? { owner_id: video.ownerId, video_id: video.videoId } : {}),
    };
  } catch {
    return { host: 'invalid', path: '' };
  }
};


const getYouTubeEmbedUrl = (url: string): string => {
  try {
    const videoIdMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?/]+)/);
    if (videoIdMatch && videoIdMatch[1]) {
      return `https://www.youtube.com/embed/${videoIdMatch[1]}?autoplay=1&mute=0&enablejsapi=1&origin=https://www.hc-forward.com`;
    }
    return url; // fallback
  } catch (error) {
    console.error('Error processing YouTube URL:', error);
    return url;
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

  // === ОПРЕДЕЛЕНИЕ РЕШАЮЩЕГО ГОЛА В БУЛЛИТАХ ===
  let decisiveShootoutGoal: any = null;
  if (protocol.pms) {
    const maintime = parseInt(protocol.maintime || '60', 10);
    const shootoutGoals = protocol.events
      .filter((ev: any) => {
        if (ev.type !== 'g') return false;
        const [minStr] = ev.time.split(':');
        const minutes = parseInt(minStr, 10);
        return minutes >= maintime;
      })
      .sort((a: any, b: any) => {
        // Сортируем по времени по убыванию
        const [aMin, aSec] = a.time.split(':').map(Number);
        const [bMin, bSec] = b.time.split(':').map(Number);
        return (bMin * 60 + bSec) - (aMin * 60 + aSec);
      });
    decisiveShootoutGoal = shootoutGoals[0] || null;
  }

  // === СЧЁТ ДО БУЛЛИТОВ ===
  let currentScore = { home: 0, away: 0 };
  const allEvents: any[] = [];

  // Обрабатываем основные периоды
  ['period1', 'period2', 'period3', 'overtime'].forEach(key => {
    const events = periods[key];
    if (events.length === 0) return;

    allEvents.push({
      type: 'periodHeader',
      title: `${periodLabels[key]} ${currentScore.home} – ${currentScore.away}`,
      icon: 'whistle-outline',
      key: `period-${key}`,
    });

    events.forEach((event: any) => {
      const isHomeTeam = event.team === 0;
      const teamLogo = isHomeTeam ? homeTeamLogo : awayTeamLogo;
      let tempScore = { ...currentScore };

      if (event.type === 'g') {
        if (isHomeTeam) tempScore.home++;
        else tempScore.away++;
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

  // Сохраняем счёт до буллитов
  const scoreBeforeShootout = { ...currentScore };

  // Обрабатываем буллиты
  if (protocol.pms && periods.shootout.length > 0) {
    allEvents.push({
      type: 'periodHeader',
      title: `${periodLabels.shootout} ${scoreBeforeShootout.home} – ${scoreBeforeShootout.away}`,
      icon: 'whistle-outline',
      key: 'period-shootout',
    });

    periods.shootout.forEach((event: any) => {
      const isHomeTeam = event.team === 0;
      const teamLogo = isHomeTeam ? homeTeamLogo : awayTeamLogo;

      // Проверка: является ли это решающим голом?
      const isDecisiveGoal =
        decisiveShootoutGoal &&
        event.time === decisiveShootoutGoal.time &&
        event.type === decisiveShootoutGoal.type &&
        event.comment === decisiveShootoutGoal.comment;

      let eventScore = { ...scoreBeforeShootout };
      if (isDecisiveGoal) {
        if (isHomeTeam) eventScore.home += 1;
        else eventScore.away += 1;
      }

      allEvents.push({
        ...event,
        teamLogo,
        score: eventScore,
        isHomeTeam,
        isDecisiveGoal, // ← можно использовать в ProtocolEventCard, если нужно особое оформление
      });
    });

    // Обновляем глобальный счёт (для финальной строки, если нужно)
    if (decisiveShootoutGoal) {
      if (decisiveShootoutGoal.team === 0) currentScore.home += 1;
      else currentScore.away += 1;
    }
  }

  // Финальная строка — строго из gameDetails
  const finalEvent = {
    type: 'final',
    title: `Матч окончен. Счет ${gameDetails.homeScore} : ${gameDetails.awayScore}.`,
    icon: 'whistle-outline',
    key: 'final-event',
  };
  allEvents.push(finalEvent);

  // === РЕНДЕР ===
  return (
    <View style={styles.protocolTable}>
      {allEvents.map((item: any, idx: number) => {
        const isLastEvent = idx === allEvents.length - 1;
        if (item.type === 'periodHeader') {
          return (
            <View key={item.key} style={styles.protocolTableRow}>
              <View style={styles.protocolTableCellSpacer} />
              <View style={[styles.protocolTableCellLogo, styles.protocolTableCellIcon]}>
                <View style={styles.protocolIconCircle}>
                  <Icon name={item.icon} type="material-community" size={20} color={colors.text} />
                </View>
              </View>
              <View style={styles.protocolTableCellSpacer} />
              <View style={styles.protocolTableCellContent}>
                <Text style={styles.protocolPeriodTitleText}>{item.title}</Text>
              </View>
            </View>
          );
        } else if (item.type === 'final') {
          return (
            <View key={item.key} style={styles.protocolTableRow}>
              <View style={styles.protocolTableCellSpacer} />
              <View style={[styles.protocolTableCellLogo, styles.protocolTableCellIcon]}>
                <View style={styles.protocolIconCircle}>
                  <Icon name={item.icon} type="material-community" size={20} color={colors.text} />
                </View>
              </View>
              <View style={styles.protocolTableCellSpacer} />
              <View style={styles.protocolTableCellContent}>
                <Text style={styles.protocolFinalText}>{item.title}</Text>
              </View>
            </View>
          );
        } else {
          return (
            <View key={idx} style={styles.protocolTableRow}>
              <View style={styles.protocolTableCellSpacer} />
              <View style={isLastEvent ? styles.protocolTableCellLogoLast : styles.protocolTableCellLogo}>
                <View style={styles.protocolLogoCircle}>
                  <Image source={{ uri: item.teamLogo || undefined }} style={styles.protocolEventTeamLogo} />
                </View>
              </View>
              <View style={styles.protocolTableCellSpacer} />
              <View style={styles.protocolTableCellContent}>
                <ProtocolEventCard
                  event={item}
                  teamLogo={item.teamLogo}
                  homeTeamLogo={homeTeamLogo || ''}
                  awayTeamLogo={awayTeamLogo || ''}
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
            <View style={[styles.statsCell, { width: 50  }]}><Text style={styles.statsText}>{formatTimeSeconds(timeg)}</Text></View>
            <View style={[styles.statsCell, { width: 30  }]}><Text style={styles.statsText}>{ga || '0'}</Text></View>
            <View style={[styles.statsCell, { width: 30  }]}><Text style={styles.statsText}>{sv || '0'}</Text></View>
            <View style={[styles.statsCell, { width: 60  }]}>
              <Text style={styles.statsText}>
                {sv || ga ? ((parseInt(sv, 10) || 0) / ((parseInt(sv, 10) || 0) + (parseInt(ga, 10) || 0)) * 100).toFixed(2) : '0.00'}%
              </Text>
            </View>
            {/*<View style={styles.statsCell}><Text style={styles.statsText}>{pim || '0'}</Text></View>*/}
          </>
        ) : (
          <>
            {/*<View style={styles.statsCell}>
              <Text style={styles.statsText}>
                {row.position === '8' ? 'Н' : row.position === '9' ? 'З' : '?'}
              </Text>
            </View>*/}
            <View style={[styles.statsCell, { width: 30 }]}><Text style={styles.statsText}>{g || '0'}</Text></View>
            <View style={[styles.statsCell, { width: 30 }]}><Text style={styles.statsText}>{a || '0'}</Text></View>
            <View style={[styles.statsCell, { width: 30 }]}><Text style={[styles.statsText, {fontWeight: '800'}]}>{(parseInt(g, 10) || 0) + (parseInt(a, 10) || 0)}</Text></View>
            <View style={[styles.statsCell, { width: 30 }]}><Text style={styles.statsText}>{pim || '0'}</Text></View>
            {/*<View style={styles.statsCell}><Text style={styles.statsText}>{pn || '0'}</Text></View>*/}
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
            <View style={[styles.statsHeaderCell, { width: 50 }]}><Text style={styles.statsHeaderText}>ВНП</Text></View>
            <View style={[styles.statsHeaderCell, { width: 30 }]}><Text style={styles.statsHeaderText}>П6</Text></View>
            <View style={[styles.statsHeaderCell, { width: 30 }]}><Text style={styles.statsHeaderText}>Бр</Text></View>
            <View style={[styles.statsHeaderCell, { width: 60 }]}><Text style={styles.statsHeaderText}>ОБ%</Text></View>
            {/*<View style={[styles.statsHeaderCell, { flex: 0.5 }]}><Text style={styles.statsHeaderText}>ШМ</Text></View>*/}
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
            {/*<View style={[styles.statsHeaderCell, { flex: 0.5 }]}><Text style={styles.statsHeaderText}>П</Text></View>*/}
            <View style={[styles.statsHeaderCell, { width: 30 }]}><Text style={styles.statsHeaderText}>Г</Text></View>
            <View style={[styles.statsHeaderCell, { width: 30 }]}><Text style={styles.statsHeaderText}>П</Text></View>
            <View style={[styles.statsHeaderCell, { width: 30 }]}><Text style={[styles.statsHeaderText, {fontWeight: '800'}]}>О</Text></View>
            <View style={[styles.statsHeaderCell, { width: 30 }]}><Text style={styles.statsHeaderText}>ШМ</Text></View>
            {/*<View style={[styles.statsHeaderCell, { flex: 0.5 }]}><Text style={styles.statsHeaderText}>КШ</Text></View>*/}
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
  const [videoWebViewGeneration, setVideoWebViewGeneration] = useState(0);
  const [videoPlayerState, setVideoPlayerState] = useState<'loading' | 'ready' | 'error'>(
    'loading'
  );
  const videoBootstrapRetryRef = useRef(0);
  const videoLoadStartedAtRef = useRef(new Map<number, number>());
  const videoGenerationStatusRef = useRef(new Map<number, VideoGenerationStatus>());

  const requestVideoReload = useCallback(
    (generation: number, reason: string, context: Record<string, unknown> = {}) => {
      const generationStatus = videoGenerationStatusRef.current.get(generation);
      if (generationStatus === 'retrying' || generationStatus === 'failed') return;

      if (videoBootstrapRetryRef.current >= MAX_VIDEO_BOOTSTRAP_RETRIES) {
        videoGenerationStatusRef.current.set(generation, 'failed');
        setVideoPlayerState('error');
        console.warn('[GameVideo][player.failed]', {
          game_id: id,
          reason,
          attempts: videoBootstrapRetryRef.current,
          ...context,
        });
        return;
      }

      videoGenerationStatusRef.current.set(generation, 'retrying');
      videoBootstrapRetryRef.current += 1;
      setVideoPlayerState('loading');
      console.log('[GameVideo][bootstrap.retry]', {
        game_id: id,
        reason,
        attempt: videoBootstrapRetryRef.current,
        ...context,
      });
      setVideoWebViewGeneration((currentGeneration) =>
        currentGeneration === generation ? currentGeneration + 1 : currentGeneration
      );
    },
    [id]
  );

  const retryVideoManually = useCallback(() => {
    videoBootstrapRetryRef.current = 0;
    setVideoPlayerState('loading');
    setVideoWebViewGeneration((currentGeneration) => {
      videoGenerationStatusRef.current.set(currentGeneration, 'retrying');
      return currentGeneration + 1;
    });
  }, []);

  // === АНИМАЦИЯ ПРОКРУТКИ ===
  const scrollY = useRef(new Animated.Value(0)).current;
  const gameInfoHeight = useRef(0); // Для хранения динамической высоты

  // Функция для получения высоты блока gameInfo
  const handleGameInfoLayout = useCallback((event: LayoutChangeEvent) => {
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
        gameData.protocol.events.forEach((event: any) => {
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
          gameDetailsCache[game.id] = { data: game, timestamp: now };
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

   //Аналитика экрана
  useTrackScreenView('Экран игры', {
    game_id: id,
    //tournament_name: tournamentName || 'unknown',
  }); 


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
        home: String(gameDetails.homeScore ?? '0'),
        away: String(gameDetails.awayScore ?? '0'),
      });
      setPeriodScores({
        team1_first: String(gameDetails.team1_first ?? '0'),
        team1_second: String(gameDetails.team1_second ?? '0'),
        team1_third: String(gameDetails.team1_third ?? '0'),
        team2_first: String(gameDetails.team2_first ?? '0'),
        team2_second: String(gameDetails.team2_second ?? '0'),
        team2_third: String(gameDetails.team2_third ?? '0'),
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
  const liveGameId = gameDetails?.id;
  const liveGameDate = gameDetails?.event_date;

  useEffect(() => {
    if (!liveGameId || !liveGameDate) return;

    // Функция обновления счёта
    const updateLiveScore = async () => {
      // --- ПЕРЕНОСИМ ПРОВЕРКУ СЮДА ---
      const gameStart = new Date(liveGameDate);
      const gameEnd = new Date(gameStart.getTime() + 100 * 60 * 1000); // +100 минут
      const now = new Date();
      const isGameLive = isGameStarted && now <= gameEnd;

      if (!isGameLive) {
        return; // Ничего не делаем
      }
      // --- КОНЕЦ ПЕРЕНОСА ---

      try {
        const freshGame = await getGameById(liveGameId, false);
        if (!freshGame) return;

        const newHome = String(freshGame.homeScore ?? '0');
        const newAway = String(freshGame.awayScore ?? '0');
        const newPeriods = {
          team1_first: String(freshGame.team1_first ?? '0'),
          team1_second: String(freshGame.team1_second ?? '0'),
          team1_third: String(freshGame.team1_third ?? '0'),
          team2_first: String(freshGame.team2_first ?? '0'),
          team2_second: String(freshGame.team2_second ?? '0'),
          team2_third: String(freshGame.team2_third ?? '0'),
        };

        setLiveScore((currentScore) => {
          if (newHome === currentScore.home && newAway === currentScore.away) {
            return currentScore;
          }
          console.log('🔄 Live score updated');
          return { home: newHome, away: newAway };
        });

        setPeriodScores((currentPeriods) => {
          const periodsChanged =
            newPeriods.team1_first !== currentPeriods.team1_first ||
            newPeriods.team1_second !== currentPeriods.team1_second ||
            newPeriods.team1_third !== currentPeriods.team1_third ||
            newPeriods.team2_first !== currentPeriods.team2_first ||
            newPeriods.team2_second !== currentPeriods.team2_second ||
            newPeriods.team2_third !== currentPeriods.team2_third;

          if (!periodsChanged) return currentPeriods;
          console.log('🔄 Live period scores updated');
          return newPeriods;
        });
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
  }, [isGameStarted, liveGameDate, liveGameId]);


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
                key={`game-video-${id}-${videoWebViewGeneration}`}
                source={{ uri: getVKEmbedUrl(sp_video, !isGameFinished(gameDetails)) }}
                style={[
                  styles.webview,
                  videoPlayerState !== 'ready' && styles.webviewHidden,
                ]}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                scalesPageToFit={false}
                allowsInlineMediaPlayback={true}
                mediaPlaybackRequiresUserAction={false}
                mixedContentMode="compatibility"
                allowsFullscreenVideo={true}
                sharedCookiesEnabled={true}
                thirdPartyCookiesEnabled={true}
                bounces={false}
                scrollEnabled={false}
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
                onShouldStartLoadWithRequest={(request) => {
                  const allowed = shouldAllowVideoNavigation(
                    sp_video,
                    request.url,
                    request.isTopFrame,
                    request.navigationType
                  );
                  if (!allowed) {
                    console.log('[GameVideo][navigation.blocked]', {
                      game_id: id,
                      navigation_type: request.navigationType,
                      ...getVideoLogContext(request.url),
                    });
                  }
                  return allowed;
                }}
                onLoadStart={({ nativeEvent }) => {
                  videoLoadStartedAtRef.current.set(videoWebViewGeneration, Date.now());
                  if (
                    parseVKVideoUrl(sp_video) !== null &&
                    !isAllowedVKEmbedNavigation(nativeEvent.url)
                  ) {
                    setVideoPlayerState('loading');
                  }
                  console.log('[GameVideo][load.started]', {
                    game_id: id,
                    generation: videoWebViewGeneration,
                    ...getVideoLogContext(nativeEvent.url),
                  });
                }}
                onLoadEnd={({ nativeEvent }) => {
                  const startedAt = videoLoadStartedAtRef.current.get(videoWebViewGeneration);
                  videoLoadStartedAtRef.current.delete(videoWebViewGeneration);
                  console.log('[GameVideo][load.completed]', {
                    game_id: id,
                    generation: videoWebViewGeneration,
                    duration_ms: startedAt ? Date.now() - startedAt : null,
                    ...getVideoLogContext(nativeEvent.url),
                  });

                  const isVKSource = parseVKVideoUrl(sp_video) !== null;
                  if (!isVKSource || isAllowedVKEmbedNavigation(nativeEvent.url)) {
                    if (
                      videoGenerationStatusRef.current.get(videoWebViewGeneration) !==
                      'retrying'
                    ) {
                      videoGenerationStatusRef.current.set(videoWebViewGeneration, 'ready');
                      videoBootstrapRetryRef.current = 0;
                      setVideoPlayerState('ready');
                      console.log('[GameVideo][player.ready]', {
                        game_id: id,
                        generation: videoWebViewGeneration,
                        ...getVideoLogContext(nativeEvent.url),
                      });
                    }
                    return;
                  }

                  requestVideoReload(
                    videoWebViewGeneration,
                    'redirected_outside_embed',
                    getVideoLogContext(nativeEvent.url)
                  );
                }}
                onError={({ nativeEvent }) => {
                  const startedAt = videoLoadStartedAtRef.current.get(videoWebViewGeneration);
                  videoLoadStartedAtRef.current.delete(videoWebViewGeneration);
                  console.warn('[GameVideo][load.error]', {
                    game_id: id,
                    generation: videoWebViewGeneration,
                    duration_ms: startedAt ? Date.now() - startedAt : null,
                    code: nativeEvent.code,
                    description: nativeEvent.description,
                    ...getVideoLogContext(nativeEvent.url),
                  });
                  requestVideoReload(videoWebViewGeneration, 'load_error', {
                    code: nativeEvent.code,
                    ...getVideoLogContext(nativeEvent.url),
                  });
                }}
                onHttpError={({ nativeEvent }) => {
                  console.warn('[GameVideo][http_error]', {
                    game_id: id,
                    generation: videoWebViewGeneration,
                    status: nativeEvent.statusCode,
                    description: nativeEvent.description,
                    ...getVideoLogContext(nativeEvent.url),
                  });
                }}
              />
              {videoPlayerState !== 'ready' && (
                <View style={styles.videoPlayerOverlay}>
                  {videoPlayerState === 'error' ? (
                    <>
                      <Text style={styles.videoPlayerErrorText}>
                        Не удалось загрузить трансляцию
                      </Text>
                      <TouchableOpacity
                        style={styles.videoPlayerRetryButton}
                        onPress={retryVideoManually}
                      >
                        <Text style={styles.videoPlayerRetryText}>Повторить</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      <ActivityIndicator size="large" color="#FFFFFF" />
                      <Text style={styles.videoPlayerLoadingText}>Загрузка трансляции…</Text>
                    </>
                  )}
                </View>
              )}
            </View>
          </View>
        )}

        {/* Period Scores */}
        {showPeriodScores && (
          <View style={styles.periodScores}>
            <View style={styles.periodTable}>
              <View style={styles.periodHeaderTable}>
                <Text style={styles.periodHeaderText}>Счет по периодам</Text>
                <Text style={styles.periodHeaderNumber}>1</Text>
                <Text style={styles.periodHeaderNumber}>2</Text>
                <Text style={styles.periodHeaderNumber}>3</Text>
                <Text style={[styles.periodHeaderNumber, {flex: 1.5}]}>Итого</Text>
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
            activeFontStyle={{ 
              fontWeight: '700',
              color: colors.background, // ← Контрастный цвет для активной вкладки (например, белый)
            }}
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
              <View>
                {Object.entries(gameDetails.player_stats).map(([teamId, statsArray]) => {
                  if (!Array.isArray(statsArray)) return null;
                  return (
                    <View key={teamId} style={styles.teamStatsSection}>
                      {renderPlayerStatsTable(teamId, statsArray, statsPlayers)}
                    </View>
                  );
                })}
              </View>
            )}
            {tabs[tabIndex] === 'Арена' && venueData && (
              <View style={styles.venueInfo}>
                <Text style={styles.venueName}>{venueData.name}</Text>
                {venueData.address && <Text style={styles.venueAddress}>{venueData.address}</Text>}
                {venueData.coordinates && (() => {
                  const coordinates = venueData.coordinates;
                  return (
                  <TouchableOpacity
                    onPress={() => {
                      const url = `https://yandex.ru/maps/?pt=${coordinates.longitude},${coordinates.latitude}&z=17`;
                      Linking.openURL(url).catch(() => console.warn('Не удалось открыть Яндекс.Карты'));
                    }}
                    style={styles.mapLinkButton}
                  >
                    <Text style={styles.mapLinkText}>Открыть в </Text>
                    <Image source={require('../../assets/icons/YandexMap.png')} style={styles.mapIcon} />
                  </TouchableOpacity>
                  );
                })()}
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
              onShouldStartLoadWithRequest={(request) =>
                shouldAllowVideoNavigation(
                  videoModalUrl,
                  request.url,
                  request.isTopFrame,
                  request.navigationType
                )
              }
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
  webviewHidden: { opacity: 0 },
  videoPlayerOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
    backgroundColor: '#000',
  },
  videoPlayerLoadingText: { color: '#FFFFFF', fontSize: 14, fontWeight: '500' },
  videoPlayerErrorText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  videoPlayerRetryButton: {
    minHeight: 42,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  videoPlayerRetryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
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
  statsTableHeader: { flexDirection: 'row', backgroundColor: colors.primary, paddingVertical: 8, paddingHorizontal: 8, borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  statsHeaderCell: { justifyContent: 'center', alignItems: 'center' },
  statsHeaderText: { color: colors.background, fontWeight: '600', fontSize: 12, textAlign: 'center' },
  statsRow: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  statsCell: { justifyContent: 'center', alignItems: 'center', padding: 4 },
  statsCellNumber: { width: 30, justifyContent: 'center', fontWeight: '600', alignItems: 'center' },
  statsCellPhoto: { width: 30, justifyContent: 'center', alignItems: 'center' },
  statsCellName: { flex: 2, justifyContent: 'center', alignItems: 'flex-start', paddingLeft: 8 },
  statsText: { fontSize: 12, color: colors.text, textAlign: 'left' },
  statsPlayerPhoto: { width: 30, height: 30, borderRadius: 15 },
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
  periodHeaderTable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    backgroundColor: colors.primary,
    paddingVertical: 0,
    paddingHorizontal: 16,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  periodHeaderText: {
    fontSize: 16,
    fontWeight: '400',
    color: colors.background,
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
  protocolTableCellLogoLast: {
    width: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderLeftWidth: 2,
    borderLeftColor: colors.primary,
    borderRightWidth: 2,
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
