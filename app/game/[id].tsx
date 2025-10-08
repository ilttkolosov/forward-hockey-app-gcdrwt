// app/game/[id].tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import { Game } from '../../types';
import { getGameById, getStaleGameById, isGameDetailsCacheFresh, loadVenues } from '../../data/gameData';
import { colors, commonStyles } from '../../styles/commonStyles';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';
import Icon from '../../components/Icon';

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

const constructVKEmbedUrl = (ownerId: string, videoId: string): string => {
  return `https://vk.com/video_ext.php?oid=${ownerId}&id=${videoId}&hd=4&autoplay=1&js_api=1`;
};

const getVKEmbedUrl = (videoUrl: string): string => {
  try {
    if (videoUrl.includes('video_ext.php')) {
      const url = new URL(videoUrl);
      if (!url.searchParams.has('hd')) url.searchParams.set('hd', '4');
      if (!url.searchParams.has('autoplay')) url.searchParams.set('autoplay', '1');
      if (!url.searchParams.has('js_api')) url.searchParams.set('js_api', '1');
      return url.toString();
    }
    const parsed = parseVKVideoUrl(videoUrl);
    if (parsed) return constructVKEmbedUrl(parsed.ownerId, parsed.videoId);
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

export default function GameDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [gameDetails, setGameDetails] = useState<Game | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadGameData = useCallback(async (forceRefresh = false) => {
    try {
      console.log('Loading game data for ID:', id, { forceRefresh });
      setLoading(true);
      setError(null);

      // Передаём forceRefresh в getGameById как useCache = !forceRefresh
      const gameData = await getGameById(id, !forceRefresh);
        if (!gameData) {
          setError('Игра не найдена');
          return;
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

  useEffect(() => {
    if (id) {
      loadGameData();
    }
  }, [id, loadGameData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadGameData(true);
    setRefreshing(false);
  };

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
    venue,
    sp_video,
  } = gameDetails;

  const homeTeamName = homeTeam?.name || 'Команда 1';
  const awayTeamName = awayTeam?.name || 'Команда 2';
  const leagueName = extractNameFromEntity(league);
  const venueName = extractNameFromEntity(venue);

  const homeFirstPeriod = team1_first;
  const homeSecondPeriod = team1_second;
  const homeThirdPeriod = team1_third;
  const awayFirstPeriod = team2_first;
  const awaySecondPeriod = team2_second;
  const awayThirdPeriod = team2_third;

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
                userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1"
              />
            </View>
          </View>
        )}

        <View style={styles.gameInfo}>
          <View style={styles.gameHeader}>
            <Text style={styles.gameDate}>{formattedDate} • {formattedTime}</Text>
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
              <Text style={styles.score}>{homeGoals} : {awayGoals}</Text>
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
        </View>

        {(homeFirstPeriod !== undefined || awayFirstPeriod !== undefined) && (
          <View style={styles.periodScores}>
            <Text style={styles.sectionTitle}>Счет по периодам</Text>
            <View style={styles.periodTable}>
              <View style={styles.periodHeader}>
                <Text style={styles.periodHeaderText}>Команда</Text>
                <Text style={styles.periodHeaderNumber}>1</Text>
                <Text style={styles.periodHeaderNumber}>2</Text>
                <Text style={styles.periodHeaderNumber}>3</Text>
                <Text style={styles.periodHeaderNumber}>Итого</Text>
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

        <View style={styles.gameDetails}>
          {leagueName && (
            <View style={styles.detailItem}>
              <Icon name="trophy" size={16} color={colors.textSecondary} />
              <Text style={styles.detailText}>{leagueName}</Text>
            </View>
          )}
          {venueName && (
            <View style={styles.detailItem}>
              <Icon name="location" size={16} color={colors.textSecondary} />
              <Text style={styles.detailText}>Арена: {venueName}</Text>
            </View>
          )}
        </View>
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
  scoreContainer: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 76,
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
  gameDetails: {
    padding: 16,
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 16,
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
});