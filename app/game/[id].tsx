
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
import { getGameById, getGameStatsById } from '../../data/gameData';
import Icon from '../../components/Icon';
import { Game, GameStats, GamePlayerStats } from '../../types';
import { colors, commonStyles } from '../../styles/commonStyles';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';
import { WebView } from 'react-native-webview';

const styles = StyleSheet.create({
  videoContainer: {
    height: 200,
    backgroundColor: colors.background,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    overflow: 'hidden',
  },
  gameInfo: {
    backgroundColor: colors.surface,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    padding: 16,
  },
  gameTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  gameDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 8,
  },
  gameDetail: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  score: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.primary,
    textAlign: 'center',
    marginVertical: 16,
  },
  status: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  statsSection: {
    backgroundColor: colors.surface,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  playerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.background,
  },
  playerName: {
    fontSize: 14,
    color: colors.text,
    flex: 1,
  },
  playerStat: {
    fontSize: 14,
    color: colors.textSecondary,
    minWidth: 40,
    textAlign: 'center',
  },
});

const GameDetailsScreen: React.FC = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
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
    try {
      setError(null);
      console.log('Loading game data for ID:', id);
      
      const [gameData, statsData] = await Promise.all([
        getGameById(id!),
        getGameStatsById(id!).catch(() => null) // Stats might not be available
      ]);
      
      setGame(gameData);
      setGameStats(statsData);
      
      if (!gameData) {
        setError('Игра не найдена');
      }
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
        return colors.error;
      case 'finished':
        return colors.textSecondary;
      case 'upcoming':
        return colors.primary;
      default:
        return colors.textSecondary;
    }
  };

  const getStatusText = (status: Game['status']) => {
    switch (status) {
      case 'live':
        return 'В прямом эфире';
      case 'finished':
        return 'Завершена';
      case 'upcoming':
        return 'Предстоящая';
      default:
        return 'Неизвестно';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const renderPlayerStats = (stats: GamePlayerStats[]) => {
    if (!stats || stats.length === 0) {
      return (
        <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 8 }}>
          Статистика недоступна
        </Text>
      );
    }

    return stats.map((player, index) => (
      <View key={index} style={styles.playerRow}>
        <Text style={styles.playerName}>
          #{player.number} {player.playerName}
        </Text>
        <Text style={styles.playerStat}>{player.goals}Г</Text>
        <Text style={styles.playerStat}>{player.assists}А</Text>
        <Text style={styles.playerStat}>{player.points}О</Text>
      </View>
    ));
  };

  if (loading) {
    return (
      <SafeAreaView style={commonStyles.container}>
        <View style={commonStyles.header}>
          <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 16 }}>
            <Icon name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={commonStyles.title}>Игра</Text>
        </View>
        <LoadingSpinner />
      </SafeAreaView>
    );
  }

  if (error || !game) {
    return (
      <SafeAreaView style={commonStyles.container}>
        <View style={commonStyles.header}>
          <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 16 }}>
            <Icon name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={commonStyles.title}>Игра</Text>
        </View>
        <ErrorMessage message={error || 'Игра не найдена'} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={commonStyles.container}>
      <View style={commonStyles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 16 }}>
          <Icon name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={commonStyles.title}>Игра</Text>
      </View>

      <ScrollView
        style={commonStyles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Video Player */}
        {game.videoUrl && (
          <View style={styles.videoContainer}>
            <WebView
              source={{ uri: game.videoUrl }}
              style={{ flex: 1 }}
              allowsFullscreenVideo={true}
              mediaPlaybackRequiresUserAction={false}
            />
          </View>
        )}

        {/* Game Information */}
        <View style={styles.gameInfo}>
          <Text style={styles.gameTitle}>
            {game.homeTeam} vs {game.awayTeam}
          </Text>
          
          <Text style={[styles.status, { color: getStatusColor(game.status) }]}>
            {getStatusText(game.status)}
          </Text>

          {(game.homeScore !== undefined && game.awayScore !== undefined) && (
            <Text style={styles.score}>
              {game.homeScore} : {game.awayScore}
            </Text>
          )}

          <View style={styles.gameDetails}>
            <Text style={styles.gameDetail}>Дата: {formatDate(game.date)}</Text>
            <Text style={styles.gameDetail}>Время: {game.time}</Text>
          </View>

          <View style={styles.gameDetails}>
            <Text style={styles.gameDetail}>Место: {game.venue}</Text>
            <Text style={styles.gameDetail}>Турнир: {game.tournament}</Text>
          </View>
        </View>

        {/* Game Statistics */}
        {gameStats && (
          <>
            {gameStats.homeTeamStats.length > 0 && (
              <View style={styles.statsSection}>
                <Text style={styles.sectionTitle}>{game.homeTeam}</Text>
                {renderPlayerStats(gameStats.homeTeamStats)}
              </View>
            )}

            {gameStats.awayTeamStats.length > 0 && (
              <View style={styles.statsSection}>
                <Text style={styles.sectionTitle}>{game.awayTeam}</Text>
                {renderPlayerStats(gameStats.awayTeamStats)}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

export default GameDetailsScreen;
