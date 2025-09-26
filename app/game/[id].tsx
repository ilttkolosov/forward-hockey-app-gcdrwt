
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import { Game, GameStats, GamePlayerStats } from '../../types';
import { getGameById, getGameStatsById } from '../../data/mockData';
import { colors, commonStyles } from '../../styles/commonStyles';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';
import Icon from '../../components/Icon';

const { width } = Dimensions.get('window');

export default function GameDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [game, setGame] = useState<Game | null>(null);
  const [gameStats, setGameStats] = useState<GameStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'home' | 'away'>('home');

  useEffect(() => {
    loadGameData();
  }, [id]);

  const loadGameData = async () => {
    try {
      console.log('Loading game data for ID:', id);
      setLoading(true);
      setError(null);

      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 500));

      const gameData = getGameById(id);
      const statsData = getGameStatsById(id);

      if (!gameData) {
        setError('Game not found');
        return;
      }

      setGame(gameData);
      setGameStats(statsData || null);
    } catch (err) {
      console.error('Error loading game data:', err);
      setError('Failed to load game data');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadGameData();
    setRefreshing(false);
  };

  const getStatusColor = (status: Game['status']) => {
    switch (status) {
      case 'live':
        return colors.error;
      case 'upcoming':
        return colors.warning;
      case 'finished':
        return colors.textSecondary;
      default:
        return colors.textSecondary;
    }
  };

  const getStatusText = (status: Game['status']) => {
    switch (status) {
      case 'live':
        return 'LIVE';
      case 'upcoming':
        return 'UPCOMING';
      case 'finished':
        return 'FINISHED';
      default:
        return '';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const renderPlayerStats = (stats: GamePlayerStats[]) => {
    return stats.map((player) => (
      <View key={player.playerId} style={styles.playerRow}>
        <View style={styles.playerInfo}>
          <Text style={styles.playerNumber}>#{player.number}</Text>
          <View style={styles.playerDetails}>
            <Text style={styles.playerName}>{player.playerName}</Text>
            <Text style={styles.playerPosition}>{player.position}</Text>
          </View>
        </View>
        <View style={styles.playerStats}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{player.goals}</Text>
            <Text style={styles.statLabel}>G</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{player.assists}</Text>
            <Text style={styles.statLabel}>A</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{player.points}</Text>
            <Text style={styles.statLabel}>P</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{player.shots}</Text>
            <Text style={styles.statLabel}>SOG</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{player.timeOnIce}</Text>
            <Text style={styles.statLabel}>TOI</Text>
          </View>
        </View>
      </View>
    ));
  };

  if (loading) {
    return (
      <SafeAreaView style={commonStyles.container}>
        <LoadingSpinner />
      </SafeAreaView>
    );
  }

  if (error || !game) {
    return (
      <SafeAreaView style={commonStyles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Icon name="arrow-left" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Game Details</Text>
        </View>
        <ErrorMessage message={error || 'Game not found'} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={commonStyles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Icon name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Game Details</Text>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Game Info */}
        <View style={styles.gameInfo}>
          <View style={styles.gameHeader}>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(game.status) }]}>
              <Text style={styles.statusText}>{getStatusText(game.status)}</Text>
            </View>
            <Text style={styles.gameDate}>{formatDate(game.date)} • {game.time}</Text>
          </View>

          <View style={styles.teamsContainer}>
            <View style={styles.teamSection}>
              <Text style={styles.teamName}>{game.homeTeam}</Text>
              {game.homeScore !== undefined && (
                <Text style={styles.score}>{game.homeScore}</Text>
              )}
            </View>

            <View style={styles.vsSection}>
              <Text style={styles.vsText}>VS</Text>
            </View>

            <View style={styles.teamSection}>
              <Text style={styles.teamName}>{game.awayTeam}</Text>
              {game.awayScore !== undefined && (
                <Text style={styles.score}>{game.awayScore}</Text>
              )}
            </View>
          </View>

          <View style={styles.gameDetails}>
            <Text style={styles.venue}>{game.venue}</Text>
            {game.tournament && (
              <Text style={styles.tournament}>{game.tournament}</Text>
            )}
          </View>
        </View>

        {/* Video Frame */}
        {game.videoUrl && (
          <View style={styles.videoContainer}>
            <Text style={styles.sectionTitle}>Live Broadcast</Text>
            <View style={styles.videoFrame}>
              <WebView
                source={{ uri: game.videoUrl }}
                style={styles.webview}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                startInLoadingState={true}
                scalesPageToFit={true}
                allowsInlineMediaPlayback={true}
                mediaPlaybackRequiresUserAction={false}
              />
            </View>
          </View>
        )}

        {/* Player Statistics */}
        {gameStats && (
          <View style={styles.statsContainer}>
            <Text style={styles.sectionTitle}>Player Statistics</Text>
            
            {/* Team Tabs */}
            <View style={styles.tabContainer}>
              <TouchableOpacity
                style={[styles.tab, selectedTab === 'home' && styles.activeTab]}
                onPress={() => setSelectedTab('home')}
              >
                <Text style={[styles.tabText, selectedTab === 'home' && styles.activeTabText]}>
                  {game.homeTeam}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, selectedTab === 'away' && styles.activeTab]}
                onPress={() => setSelectedTab('away')}
              >
                <Text style={[styles.tabText, selectedTab === 'away' && styles.activeTabText]}>
                  {game.awayTeam}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Stats Header */}
            <View style={styles.statsHeader}>
              <Text style={styles.statsHeaderText}>Player</Text>
              <View style={styles.statsHeaderRight}>
                <Text style={styles.statsHeaderLabel}>G</Text>
                <Text style={styles.statsHeaderLabel}>A</Text>
                <Text style={styles.statsHeaderLabel}>P</Text>
                <Text style={styles.statsHeaderLabel}>SOG</Text>
                <Text style={styles.statsHeaderLabel}>TOI</Text>
              </View>
            </View>

            {/* Player Stats */}
            <View style={styles.playersList}>
              {selectedTab === 'home'
                ? renderPlayerStats(gameStats.homeTeamStats)
                : renderPlayerStats(gameStats.awayTeamStats)
              }
            </View>

            {/* Game Highlights */}
            {gameStats.gameHighlights && gameStats.gameHighlights.length > 0 && (
              <View style={styles.highlightsContainer}>
                <Text style={styles.sectionTitle}>Game Highlights</Text>
                {gameStats.gameHighlights.map((highlight, index) => (
                  <View key={index} style={styles.highlightItem}>
                    <Text style={styles.highlightText}>• {highlight}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
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
  },
  backButton: {
    marginRight: 16,
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  content: {
    flex: 1,
  },
  gameInfo: {
    padding: 16,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  gameHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: colors.background,
    fontSize: 12,
    fontWeight: '700',
  },
  gameDate: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  teamsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  teamSection: {
    flex: 1,
    alignItems: 'center',
  },
  teamName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  score: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.primary,
  },
  vsSection: {
    paddingHorizontal: 16,
  },
  vsText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  gameDetails: {
    alignItems: 'center',
  },
  venue: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  tournament: {
    fontSize: 14,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  videoContainer: {
    padding: 16,
    backgroundColor: colors.background,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
  },
  videoFrame: {
    height: 200,
    backgroundColor: colors.surface,
    borderRadius: 8,
    overflow: 'hidden',
  },
  webview: {
    flex: 1,
  },
  statsContainer: {
    padding: 16,
    backgroundColor: colors.background,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 8,
    marginBottom: 16,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 6,
  },
  activeTab: {
    backgroundColor: colors.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  activeTabText: {
    color: colors.background,
  },
  statsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.surface,
    borderRadius: 8,
    marginBottom: 8,
  },
  statsHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  statsHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statsHeaderLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    width: 32,
    textAlign: 'center',
  },
  playersList: {
    backgroundColor: colors.background,
  },
  playerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  playerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  playerNumber: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
    width: 32,
  },
  playerDetails: {
    marginLeft: 12,
  },
  playerName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  playerPosition: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  playerStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    alignItems: 'center',
    width: 32,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  statLabel: {
    fontSize: 10,
    color: colors.textSecondary,
  },
  highlightsContainer: {
    marginTop: 24,
  },
  highlightItem: {
    paddingVertical: 8,
  },
  highlightText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
});
