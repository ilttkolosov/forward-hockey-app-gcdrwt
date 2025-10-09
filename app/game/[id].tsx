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
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import { Game } from '../../types';
import { getGameById, getVenueById } from '../../data/gameData';
import { colors, commonStyles } from '../../styles/commonStyles';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';
import Icon from '../../components/Icon';
import SegmentedControl from '@react-native-segmented-control/segmented-control';

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
  const [tabIndex, setTabIndex] = useState(0);
  const tabs = ['Арена', 'Статистика', 'FTF'];

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
    venueId,
    sp_video,
    event_date,
  } = gameDetails;

  const homeTeamName = homeTeam?.name || 'Команда 1';
  const awayTeamName = awayTeam?.name || 'Команда 2';
  const leagueName = extractNameFromEntity(league);

  // === 5. Скрыть время, если 00:00 ===
  const hideTime = formattedTime === '00:00';
  const displayDateTime = hideTime ? formattedDate : `${formattedDate} • ${formattedTime}`;

  // === 2. Логика счёта и периодов ===
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
        {/* Video */}
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

            {/* === 3. Вертикальное центрирование === */}
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

          {/* === 1. Лига ПОД командами === */}
          {leagueName && (
            <Text style={styles.leagueText}>🏆 {leagueName}</Text>
          )}
        </View>

        {/* === 2. Блок периодов: показываем ТОЛЬКО если игра началась === */}
        {showPeriodScores && (
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
          {/* === 4. Увеличенный отступ сверху === */}
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
                    <Text style={styles.mapLinkText}>Открыть в Яндекс.Картах</Text>
                    {/* === 5. Иконка YandexMap.png === */}
                    <Image
                      source={require('../../assets/icons/YandexMap.png')}
                      style={styles.mapIcon}
                    />
                  </TouchableOpacity>
                )}
              </View>
            )}
            {tabIndex === 1 && (
              <View style={styles.placeholderTab}>
                <Text style={styles.placeholderText}>Хоккей</Text>
              </View>
            )}
            {tabIndex === 2 && (
              <View style={styles.placeholderTab}>
                <Text style={styles.placeholderText}>Хоккей</Text>
              </View>
            )}
          </View>
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
    marginBottom: 8,
  },
  gameDate: {
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  leagueText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'left', // ← прижали к левому краю
    paddingLeft: 8, // ← небольшой отступ слева
    marginBottom: 0, // ← уменьшили отступ снизу
    fontStyle: 'italic',
  },
  teamsContainer: {
    flexDirection: 'row',
    alignItems: 'stretch',
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
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  score: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.primary,
  },
  vsText: {
    color: colors.textSecondary, // ← цвет "VS" как на карточке
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
    height: 16, // ← увеличенный отступ сверху
  },
  tabContent: {
    marginTop: 16,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
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
});