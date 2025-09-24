
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
import { colors, commonStyles } from '../../styles/commonStyles';
import Icon from '../../components/Icon';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';
import { getGameById, getGameStatsById } from '../../data/gameData';

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    marginRight: 16,
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  gameInfo: {
    backgroundColor: colors.surface,
    margin: 16,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  matchup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  team: {
    alignItems: 'center',
    flex: 1,
  },
  teamName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  score: {
    fontSize: 36,
    fontWeight: 'bold',
    color: colors.primary,
    marginHorizontal: 30,
  },
  vs: {
    fontSize: 18,
    color: colors.textSecondary,
    marginHorizontal: 30,
  },
  gameDetails: {
    alignItems: 'center',
  },
  status: {
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 8,
  },
  dateTime: {
    fontSize: 16,
    color: colors.text,
    marginBottom: 4,
  },
  venue: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  tournament: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  videoContainer: {
    margin: 16,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  videoHeader: {
    padding: 16,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  videoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  webview: {
    height: 200,
  },
  noVideo: {
    padding: 40,
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  noVideoText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  statsContainer: {
    margin: 16,
  },
  statsHeader: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
  },
  teamStatsContainer: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
  },
  teamStatsHeader: {
    padding: 16,
    backgroundColor: colors.primary,
  },
  teamStatsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.surface,
  },
  playerRow: {
    flexDirection: 'row',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    alignItems: 'center',
  },
  playerNumber: {
    width: 30,
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  playerName: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
  },
  playerStats: {
    fontSize: 12,
    color: colors.textSecondary,
    width: 80,
    textAlign: 'right',
  },
});

const GameDetailsScreen: React.FC = () => {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [game, setGame] = useState<Game | null>(null);
  const [gameStats, setGameStats] = useState<GameStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      loadGameData();
    }
  }, [id]);

  const loadGameData = async () => {
    if (!id) return;

    try {
      setError(null);
      console.log('Loading game data for ID:', id);
      
      const [gameData, statsData] = await Promise.all([
        getGameById(id),
        getGameStatsById(id)
      ]);

      setGame(gameData);
      setGameStats(statsData);
      console.log('Game data loaded successfully');
    } catch (err) {
      console.error('Error loading game data:', err);
      setError('Ошибка загрузки данных игры. Проверьте подключение к интернету.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadGameData();
  };

  const getStatusColor = (status: Game['status']) => {
    switch (status) {
      case 'live':
        return { backgroundColor: colors.success, color: colors.surface };
      case 'upcoming':
        return { backgroundColor: colors.warning, color: colors.surface };
      case 'finished':
        return { backgroundColor: colors.textSecondary, color: colors.surface };
      default:
        return { backgroundColor: colors.textSecondary, color: colors.surface };
    }
  };

  const getStatusText = (status: Game['status']) => {
    switch (status) {
      case 'live':
        return 'В ЭФИРЕ';
      case 'upcoming':
        return 'ПРЕДСТОЯЩИЙ';
      case 'finished':
        return 'ЗАВЕРШЕН';
      default:
        return 'НЕИЗВЕСТНО';
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('ru-RU', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
    } catch (error) {
      console.error('Error formatting date:', error);
      return dateString;
    }
  };

  const renderPlayerStats = (stats: GamePlayerStats[]) => {
    return stats.map((player, index) => (
      <View key={player.playerId} style={styles.playerRow}>
        <Text style={styles.playerNumber}>#{player.number}</Text>
        <Text style={styles.playerName}>{player.playerName}</Text>
        <Text style={styles.playerStats}>
          {player.goals}Г {player.assists}П {player.points}О
        </Text>
      </View>
    ));
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Icon name="arrow-left" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Загрузка...</Text>
        </View>
        <LoadingSpinner />
      </SafeAreaView>
    );
  }

  if (!game) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Icon name="arrow-left" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Игра не найдена</Text>
        </View>
        <ErrorMessage message="Игра не найдена" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Icon name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Детали игры</Text>
      </View>

      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {error && <ErrorMessage message={error} />}

        {/* Game Info */}
        <View style={styles.gameInfo}>
          <View style={styles.matchup}>
            <View style={styles.team}>
              <Text style={styles.teamName}>{game.homeTeam}</Text>
            </View>

            {game.homeScore !== undefined && game.awayScore !== undefined ? (
              <Text style={styles.score}>
                {game.homeScore} : {game.awayScore}
              </Text>
            ) : (
              <Text style={styles.vs}>VS</Text>
            )}

            <View style={styles.team}>
              <Text style={styles.teamName}>{game.awayTeam}</Text>
            </View>
          </View>

          <View style={styles.gameDetails}>
            <Text style={[styles.status, getStatusColor(game.status)]}>
              {getStatusText(game.status)}
            </Text>
            <Text style={styles.dateTime}>
              {formatDate(game.date)} • {game.time}
            </Text>
            <Text style={styles.venue}>{game.venue}</Text>
            <Text style={styles.tournament}>{game.tournament}</Text>
          </View>
        </View>

        {/* Video */}
        {game.videoUrl ? (
          <View style={styles.videoContainer}>
            <View style={styles.videoHeader}>
              <Text style={styles.videoTitle}>Видео трансляция</Text>
            </View>
            <WebView
              source={{ uri: game.videoUrl }}
              style={styles.webview}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              startInLoadingState={true}
              onError={(syntheticEvent) => {
                const { nativeEvent } = syntheticEvent;
                console.error('WebView error: ', nativeEvent);
              }}
            />
          </View>
        ) : (
          <View style={styles.videoContainer}>
            <View style={styles.videoHeader}>
              <Text style={styles.videoTitle}>Видео трансляция</Text>
            </View>
            <View style={styles.noVideo}>
              <Icon name="video-off" size={48} color={colors.textSecondary} />
              <Text style={styles.noVideoText}>
                Видео трансляция недоступна для этой игры
              </Text>
            </View>
          </View>
        )}

        {/* Player Statistics */}
        {gameStats && (
          <View style={styles.statsContainer}>
            <Text style={styles.statsHeader}>Статистика игроков</Text>

            {/* Home Team Stats */}
            <View style={styles.teamStatsContainer}>
              <View style={styles.teamStatsHeader}>
                <Text style={styles.teamStatsTitle}>{game.homeTeam}</Text>
              </View>
              {renderPlayerStats(gameStats.homeTeamStats)}
            </View>

            {/* Away Team Stats */}
            <View style={styles.teamStatsContainer}>
              <View style={styles.teamStatsHeader}>
                <Text style={styles.teamStatsTitle}>{game.awayTeam}</Text>
              </View>
              {renderPlayerStats(gameStats.awayTeamStats)}
            </View>

            {/* Game Highlights */}
            {gameStats.gameHighlights && gameStats.gameHighlights.length > 0 && (
              <View style={styles.teamStatsContainer}>
                <View style={styles.teamStatsHeader}>
                  <Text style={styles.teamStatsTitle}>Основные моменты</Text>
                </View>
                {gameStats.gameHighlights.map((highlight, index) => (
                  <View key={index} style={styles.playerRow}>
                    <Text style={[styles.playerName, { flex: 1 }]}>{highlight}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

export default GameDetailsScreen;
