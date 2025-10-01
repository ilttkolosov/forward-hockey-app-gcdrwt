// app/game/[id].tsx

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import { Game } from '../../types'; // Используем обновлённый тип Game
import { getGameById } from '../../data/gameData'; // Импортируем новую функцию
import { colors, commonStyles } from '../../styles/commonStyles';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';
import Icon from '../../components/Icon';
import { getCachedTeamLogo } from '../../utils/teamLogos'; // Возможно, не понадобится, так как logo_uri уже в Game
import { formatDateTimeWithoutSeconds } from '../../utils/dateUtils'; // Возможно, не понадобится, так как date/time уже в Game

const { width } = Dimensions.get('window');

// VK Video Utilities - Inline implementation to avoid import issues
const parseVKVideoUrl = (url: string): { ownerId: string; videoId: string } | null => {
  try {
    console.log('Parsing VK video URL:', url);
    
    // Check if it's already an embed URL
    if (url.includes('video_ext.php')) {
      console.log('URL is already an embed URL');
      return null; // Return null to use the URL as-is
    }
    
    // Parse URLs like https://vkvideo.ru/video-211881014_456240669  
    const videoMatch = url.match(/video(-?\d+)_(\d+)/);
    if (videoMatch) {
      const ownerId = videoMatch[1]; // Already includes the minus sign if present
      const videoId = videoMatch[2];
      console.log('Extracted VK video IDs:', { ownerId, videoId });
      return { ownerId, videoId };
    }
    
    console.log('Could not parse VK video URL');
    return null;
  } catch (error) {
    console.error('Error parsing VK video URL:', error);
    return null;
  }
};

const constructVKEmbedUrl = (ownerId: string, videoId: string): string => {
  // Use the parameters specified in the requirements:
  // - hd=4 for 1920×1080 resolution
  // - autoplay=1 to enable autostart
  // - js_api=1 to enable JavaScript API for player control
  const embedUrl = `https://vk.com/video_ext.php?oid=${ownerId}&id=${videoId}&hd=4&autoplay=1&js_api=1`;
  console.log('Constructed VK embed URL:', embedUrl);
  return embedUrl;
};

const getVKEmbedUrl = (videoUrl: string): string => {
  try {
    // If it's already an embed URL, enhance it with our preferred parameters
    if (videoUrl.includes('video_ext.php')) {
      const url = new URL(videoUrl);
      
      // Add our preferred parameters if they're not already there
      if (!url.searchParams.has('hd')) url.searchParams.set('hd', '4');
      if (!url.searchParams.has('autoplay')) url.searchParams.set('autoplay', '1');
      if (!url.searchParams.has('js_api')) url.searchParams.set('js_api', '1');
      
      const enhancedUrl = url.toString();
      console.log('Enhanced existing embed URL:', enhancedUrl);
      return enhancedUrl;
    }
    
    // Parse the VK video URL and construct embed URL
    const parsed = parseVKVideoUrl(videoUrl);
    if (parsed) {
      return constructVKEmbedUrl(parsed.ownerId, parsed.videoId);
    }
    
    // If we can't parse it, return the original URL as fallback
    console.log('Using original URL as fallback:', videoUrl);
    return videoUrl;
  } catch (error) {
    console.error('Error processing VK video URL:', error);
    return videoUrl; // Return original URL as fallback
  }
};

// --- Вспомогательные функции для работы с новым типом Game ---
// Эти функции адаптируют данные из нового Game к структуре EnrichedGameDetails

// Извлечение результата (outcome) из массива
const extractOutcome = (outcomeArray: any): string => {
  if (Array.isArray(outcomeArray) && outcomeArray.length > 0) {
    const outcome = outcomeArray[0].toLowerCase();
    if (outcome === 'w' || outcome === 'win') return 'win';
    if (outcome === 'l' || outcome === 'loss') return 'loss';
    if (outcome === 't' || outcome === 'tie' || outcome === 'draw' || outcome === 'nich') return 'nich';
  }
  return '';
};

// Извлечение имени из объекта сущности (лиги, сезона, места проведения)
const extractNameFromEntity = (entity: any): string | undefined => {
  if (entity && typeof entity === 'object' && 'name' in entity) {
    return entity.name;
  }
  return undefined;
};

// Форматирование даты и времени (если нужно, но в Game уже отформатировано)
// const formatDateTimeWithoutSeconds = (dateString: string): { formattedDate: string; formattedTime: string } => {
//   // Реализация может быть в utils/dateUtils, но если Game.date и Game.time уже отформатированы, это не нужно.
//   // const date = new Date(dateString);
//   // const formattedDate = date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' });
//   // const formattedTime = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
//   // return { formattedDate, formattedTime };
//   // return { formattedDate: '', formattedTime: '' };
// };

export default function GameDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [gameDetails, setGameDetails] = useState<Game | null>(null); // Используем Game, а не EnrichedGameDetails
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // const [teamsLoading, setTeamsLoading] = useState(false); // Больше не нужно, так как данные уже обогащены в gameData.ts

  const loadGameData = useCallback(async () => {
    try {
      console.log('Loading game data for ID:', id);
      setLoading(true);
      setError(null);

      // Используем новую функцию getGameById
      const gameData = await getGameById(id);

      if (!gameData) {
        setError('Игра не найдена');
        return;
      }

      setGameDetails(gameData);
    } catch (err) {
      console.error('Error loading game data:', err);
      setError('Не удалось загрузить данные игры');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      loadGameData();
    }
  }, [id, loadGameData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadGameData();
    setRefreshing(false);
  };

  // --- Адаптация функций для нового типа Game ---
  const getOutcomeText = (outcome: string): string => {
    switch (outcome) {
      case 'win':
        return 'Победа';
      case 'loss':
        return 'Поражение';
      case 'nich':
        return 'Ничья';
      default:
        return outcome || '';
    }
  };

  const getOutcomeColor = (outcome: string): string => {
    switch (outcome) {
      case 'win':
        return colors.success;
      case 'loss':
        return colors.error;
      case 'nich':
        return colors.warning;
      default:
        return colors.textSecondary;
    }
  };

  // --- Рендеринг компонента ---
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

  // --- Используем данные из gameDetails (нового типа Game) ---
  // Извлекаем нужные поля
  const {
    id: gameId, // Не используется в отображении
    date: formattedDate, // Уже отформатированная дата из gameData.ts
    time: formattedTime, // Уже отформатированное время из gameData.ts
    homeTeam,
    awayTeam,
    homeTeamLogo, // URI из локального хранилища
    awayTeamLogo, // URI из локального хранилища
    homeScore,
    awayScore,
    homeOutcome,
    awayOutcome,
    team1_first, // Результаты по периодам
    team1_second,
    team1_third,
    team2_first,
    team2_second,
    team2_third,
    league, // Объект лиги
    season, // Объект сезона
    venue, // Объект места проведения
    sp_video, // URL видео
    event_date, // Не используется напрямую
    status, // Не используется напрямую
    // ... другие поля, если нужны
  } = gameDetails;

  // Извлекаем имена команд из объектов
  const homeTeamName = homeTeam?.name || 'Команда 1';
  const awayTeamName = awayTeam?.name || 'Команда 2';

  // Извлекаем имена лиги, сезона, места проведения
  const leagueName = extractNameFromEntity(league);
  const seasonName = extractNameFromEntity(season);
  const venueName = extractNameFromEntity(venue);

  // Извлекаем результаты по периодам
  const homeFirstPeriod = team1_first;
  const homeSecondPeriod = team1_second;
  const homeThirdPeriod = team1_third;
  const awayFirstPeriod = team2_first;
  const awaySecondPeriod = team2_second;
  const awayThirdPeriod = team2_third;

  // Извлекаем итоговые результаты
  const homeGoals = homeScore;
  const awayGoals = awayScore;
  const homeOutcomeText = extractOutcome(homeOutcome);
  const awayOutcomeText = extractOutcome(awayOutcome);

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
        {/* VK Video Player - Using official VK embed API */}
        {sp_video && (
          <View style={styles.videoContainer}>
            <Text style={styles.sectionTitle}>Видео матча</Text>
            <View style={styles.videoFrame}>
              <WebView
                source={{ uri: getVKEmbedUrl(sp_video) }}
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
                onLoadStart={() => {
                  console.log('VK video embed started loading for URL:', getVKEmbedUrl(sp_video));
                }}
                onLoadEnd={() => {
                  console.log('VK video embed loaded successfully');
                }}
                onError={(syntheticEvent) => {
                  const { nativeEvent } = syntheticEvent;
                  console.error('VK video embed error:', nativeEvent);
                }}
                onHttpError={(syntheticEvent) => {
                  const { nativeEvent } = syntheticEvent;
                  console.error('VK video embed HTTP error:', nativeEvent);
                }}
                userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1"
              />
            </View>
          </View>
        )}

        {/* Main Game Info */}
        <View style={styles.gameInfo}>
          <View style={styles.gameHeader}>
            <Text style={styles.gameDate}>{formattedDate} • {formattedTime}</Text>
          </View>

          {/* Teams with Logos Above Names */}
          <View style={styles.teamsContainer}>
            {/* Home Team Column */}
            <View style={styles.teamColumn}>
              {homeTeamLogo ? (
                <Image 
                  source={{ uri: homeTeamLogo }} 
                  style={styles.teamLogo}
                  onError={() => console.log('Failed to load home team logo')}
                />
              ) : (
                <View style={styles.teamLogoPlaceholder}>
                  <Icon name="shield" size={32} color={colors.textSecondary} />
                </View>
              )}
              <Text style={styles.teamName} numberOfLines={2}>
                {homeTeamName}
              </Text>
              {/* Outcome Badge centered under team name */}
              {homeOutcomeText && (
                <View style={styles.outcomeBadgeContainer}>
                  <View style={[styles.outcomeBadge, { backgroundColor: getOutcomeColor(homeOutcomeText) }]}>
                    <Text style={styles.outcomeText}>{getOutcomeText(homeOutcomeText)}</Text>
                  </View>
                </View>
              )}
            </View>

            {/* Score - Aligned with bottom of team names */}
            <View style={styles.scoreContainer}>
              <Text style={styles.score}>
                {homeGoals} : {awayGoals}
              </Text>
            </View>

            {/* Away Team Column */}
            <View style={styles.teamColumn}>
              {awayTeamLogo ? (
                <Image 
                  source={{ uri: awayTeamLogo }} 
                  style={styles.teamLogo}
                  onError={() => console.log('Failed to load away team logo')}
                />
              ) : (
                <View style={styles.teamLogoPlaceholder}>
                  <Icon name="shield" size={32} color={colors.textSecondary} />
                </View>
              )}
              <Text style={styles.teamName} numberOfLines={2}>
                {awayTeamName}
              </Text>
              {/* Outcome Badge centered under team name */}
              {awayOutcomeText && (
                <View style={styles.outcomeBadgeContainer}>
                  <View style={[styles.outcomeBadge, { backgroundColor: getOutcomeColor(awayOutcomeText) }]}>
                    <Text style={styles.outcomeText}>{getOutcomeText(awayOutcomeText)}</Text>
                  </View>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Period Scores */}
        {(homeFirstPeriod !== undefined || awayFirstPeriod !== undefined) && (
          <View style={styles.periodScores}>
            <Text style={styles.sectionTitle}>Счет по периодам</Text>
            <View style={styles.periodTable}>
              <View style={styles.periodHeader}>
                <Text style={styles.periodHeaderText}>Команда</Text>
                <Text style={styles.periodHeaderText}>1</Text>
                <Text style={styles.periodHeaderText}>2</Text>
                <Text style={styles.periodHeaderText}>3</Text>
                <Text style={styles.periodHeaderText}>Итого</Text>
              </View>
              <View style={styles.periodRow}>
                <Text style={styles.periodTeam}>{homeTeamName}</Text>
                <Text style={styles.periodScore}>{homeFirstPeriod || 0}</Text>
                <Text style={styles.periodScore}>{homeSecondPeriod || 0}</Text>
                <Text style={styles.periodScore}>{homeThirdPeriod || 0}</Text>
                <Text style={styles.periodTotal}>{homeGoals}</Text>
              </View>
              <View style={styles.periodRow}>
                <Text style={styles.periodTeam}>{awayTeamName}</Text>
                <Text style={styles.periodScore}>{awayFirstPeriod || 0}</Text>
                <Text style={styles.periodScore}>{awaySecondPeriod || 0}</Text>
                <Text style={styles.periodScore}>{awayThirdPeriod || 0}</Text>
                <Text style={styles.periodTotal}>{awayGoals}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Tournament, Arena Info (Season removed as requested) */}
        <View style={styles.gameDetails}>
          {leagueName && (
            <View style={styles.detailItem}>
              <Icon name="trophy" size={16} color={colors.textSecondary} />
              <Text style={styles.detailText}>Турнир: {leagueName}</Text>
            </View>
          )}
          {venueName && (
            <View style={styles.detailItem}>
              <Icon name="location" size={16} color={colors.textSecondary} />
              <Text style={styles.detailText}>Арена: {venueName}</Text>
            </View>
          )}
        </View>

        {/* teamsLoading больше не используется, так как данные уже загружены в gameData.ts */}
        {/* {teamsLoading && (
          <View style={styles.loadingContainer}>
            <LoadingSpinner />
            <Text style={styles.loadingText}>Загрузка данных команд...</Text>
          </View>
        )} */}
      </ScrollView>
    </SafeAreaView>
  );
}

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
    aspectRatio: 16 / 9, // Fixed aspect ratio for video
    backgroundColor: '#000', // Black background for video
    borderRadius: 12,
    overflow: 'hidden',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    elevation: 4, // Android shadow
  },
  webview: {
    flex: 1,
    backgroundColor: '#000', // Black background for video
    borderRadius: 12,
  },
  gameInfo: {
    padding: 20,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  gameHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  gameDate: {
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  teamsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 24,
    paddingHorizontal: 8,
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
    marginBottom: 12,
  },
  teamName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 12,
  },
  // Score Container - Positioned to align with bottom of team names
  scoreContainer: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 76, // Logo (64px) + margin (12px) = 76px to align with team names
  },
  score: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.primary,
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
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
  },
  periodHeader: {
    flexDirection: 'row',
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  periodHeaderText: {
    flex: 1,
    color: colors.background,
    fontWeight: '600',
    textAlign: 'center',
    fontSize: 14,
  },
  periodRow: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  periodTeam: {
    flex: 1,
    color: colors.text,
    fontWeight: '500',
    fontSize: 14,
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
  gameDetails: {
    padding: 16,
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  detailText: {
    fontSize: 14,
    color: colors.text,
    marginLeft: 12,
    fontWeight: '500',
  },
  loadingContainer: {
    padding: 20,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 12,
  },
});