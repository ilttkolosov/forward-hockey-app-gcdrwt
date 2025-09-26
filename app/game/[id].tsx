
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
import { Game, GameStats, GamePlayerStats } from '../../types';
import LoadingSpinner from '../../components/LoadingSpinner';
import { getGameById, getGameStatsById } from '../../data/gameData';
import ErrorMessage from '../../components/ErrorMessage';
import Icon from '../../components/Icon';
import { WebView } from 'react-native-webview';
import { colors, commonStyles } from '../../styles/commonStyles';

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  gameHeader: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
  },
  tournament: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '500',
    marginBottom: 8,
  },
  matchup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
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
    color: colors.text,
    marginHorizontal: 20,
  },
  vs: {
    fontSize: 20,
    color: colors.textSecondary,
    marginHorizontal: 20,
  },
  status: {
    fontSize: 14,
    fontWeight: '500',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 8,
  },
  gameInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateTime: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  venue: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'right',
  },
  section: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  videoContainer: {
    height: 200,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.background,
  },
  statsTable: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  statsHeader: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  statsHeaderText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  statsRowLast: {
    borderBottomWidth: 0,
  },
  statsCell: {
    fontSize: 12,
    color: colors.text,
    textAlign: 'center',
  },
  playerName: {
    fontSize: 12,
    color: colors.text,
    fontWeight: '500',
  },
  resultsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  resultBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  resultText: {
    fontSize: 14,
    fontWeight: '600',
  },
  winBadge: {
    backgroundColor: colors.success + '20',
  },
  winText: {
    color: colors.success,
  },
  lossBadge: {
    backgroundColor: colors.error + '20',
  },
  lossText: {
    color: colors.error,
  },
  drawBadge: {
    backgroundColor: colors.textSecondary + '20',
  },
  drawText: {
    color: colors.textSecondary,
  },
});

export default function GameDetailsScreen() {
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
      console.log('Загрузка данных игры с ID:', id);
      
      const [gameData, statsData] = await Promise.all([
        getGameById(id!),
        getGameStatsById(id!),
      ]);
      
      if (gameData) {
        setGame(gameData);
        setGameStats(statsData);
        console.log('Данные игры загружены:', gameData);
      } else {
        setError('Игра не найдена');
      }
    } catch (error) {
      console.error('Ошибка загрузки данных игры:', error);
      setError('Не удалось загрузить данные игры');
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
        return colors.success;
      case 'upcoming':
        return colors.warning;
      default:
        return colors.textSecondary;
    }
  };

  const getStatusText = (status: Game['status']) => {
    switch (status) {
      case 'live':
        return 'В эфире';
      case 'finished':
        return 'Завершена';
      case 'upcoming':
        return 'Предстоящая';
      default:
        return status;
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (error) {
      return dateString;
    }
  };

  const renderPlayerStats = (stats: GamePlayerStats[]) => {
    if (!stats || stats.length === 0) {
      return (
        <Text style={[commonStyles.cardText, { textAlign: 'center', padding: 20 }]}>
          Статистика недоступна
        </Text>
      );
    }

    const screenWidth = Dimensions.get('window').width;
    const cellWidth = (screenWidth - 64) / 8; // 8 колонок

    return (
      <View style={styles.statsTable}>
        <View style={styles.statsHeader}>
          <Text style={[styles.statsHeaderText, { width: cellWidth * 2 }]}>Игрок</Text>
          <Text style={[styles.statsHeaderText, { width: cellWidth }]}>Г</Text>
          <Text style={[styles.statsHeaderText, { width: cellWidth }]}>П</Text>
          <Text style={[styles.statsHeaderText, { width: cellWidth }]}>О</Text>
          <Text style={[styles.statsHeaderText, { width: cellWidth }]}>Штр</Text>
          <Text style={[styles.statsHeaderText, { width: cellWidth }]}>Бр</Text>
          <Text style={[styles.statsHeaderText, { width: cellWidth }]}>Время</Text>
        </View>
        {stats.map((player, index) => (
          <View 
            key={player.playerId} 
            style={[styles.statsRow, index === stats.length - 1 && styles.statsRowLast]}
          >
            <View style={{ width: cellWidth * 2 }}>
              <Text style={styles.playerName} numberOfLines={1}>
                #{player.number} {player.playerName}
              </Text>
            </View>
            <Text style={[styles.statsCell, { width: cellWidth }]}>{player.goals}</Text>
            <Text style={[styles.statsCell, { width: cellWidth }]}>{player.assists}</Text>
            <Text style={[styles.statsCell, { width: cellWidth }]}>{player.points}</Text>
            <Text style={[styles.statsCell, { width: cellWidth }]}>{player.penaltyMinutes}</Text>
            <Text style={[styles.statsCell, { width: cellWidth }]}>{player.shots}</Text>
            <Text style={[styles.statsCell, { width: cellWidth }]}>{player.timeOnIce}</Text>
          </View>
        ))}
      </View>
    );
  };

  const getOutcomeStyle = (outcome: string) => {
    switch (outcome) {
      case 'win':
        return [styles.resultBadge, styles.winBadge];
      case 'loss':
        return [styles.resultBadge, styles.lossBadge];
      case 'nich':
        return [styles.resultBadge, styles.drawBadge];
      default:
        return [styles.resultBadge, styles.drawBadge];
    }
  };

  const getOutcomeTextStyle = (outcome: string) => {
    switch (outcome) {
      case 'win':
        return [styles.resultText, styles.winText];
      case 'loss':
        return [styles.resultText, styles.lossText];
      case 'nich':
        return [styles.resultText, styles.drawText];
      default:
        return [styles.resultText, styles.drawText];
    }
  };

  const getOutcomeText = (outcome: string) => {
    switch (outcome) {
      case 'win':
        return 'Победа';
      case 'loss':
        return 'Поражение';
      case 'nich':
        return 'Ничья';
      default:
        return outcome;
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={commonStyles.container}>
        <LoadingSpinner text="Загрузка данных игры..." />
      </SafeAreaView>
    );
  }

  if (error || !game) {
    return (
      <SafeAreaView style={commonStyles.container}>
        <ErrorMessage message={error || 'Игра не найдена'} />
        <TouchableOpacity 
          style={[commonStyles.button, { margin: 16 }]} 
          onPress={() => router.back()}
        >
          <Text style={commonStyles.buttonText}>Назад</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={commonStyles.container}>
      <ScrollView
        style={commonStyles.flex1}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.gameHeader}>
          <Text style={styles.tournament}>{game.tournament || 'Товарищеский матч'}</Text>
          
          <View style={styles.matchup}>
            <View style={styles.team}>
              <Text style={styles.teamName}>{game.homeTeam}</Text>
            </View>
            
            {game.status === 'finished' && game.homeScore !== undefined && game.awayScore !== undefined ? (
              <Text style={styles.score}>
                {game.homeScore} : {game.awayScore}
              </Text>
            ) : (
              <Text style={styles.vs}>vs</Text>
            )}
            
            <View style={styles.team}>
              <Text style={styles.teamName}>{game.awayTeam}</Text>
            </View>
          </View>
          
          <Text style={[styles.status, { color: getStatusColor(game.status) }]}>
            {getStatusText(game.status)}
          </Text>
          
          <View style={styles.gameInfo}>
            <Text style={styles.dateTime}>
              {formatDate(game.event_date)}
            </Text>
            <Text style={styles.venue}>{game.venue}</Text>
          </View>

          {/* Детальные результаты для архивных игр */}
          {game.status === 'finished' && game.team1_outcome && game.team2_outcome && (
            <View style={styles.resultsContainer}>
              <View style={getOutcomeStyle(game.team1_outcome)}>
                <Text style={getOutcomeTextStyle(game.team1_outcome)}>
                  {getOutcomeText(game.team1_outcome)}
                </Text>
              </View>
              <View style={getOutcomeStyle(game.team2_outcome)}>
                <Text style={getOutcomeTextStyle(game.team2_outcome)}>
                  {getOutcomeText(game.team2_outcome)}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Видео трансляция */}
        {game.videoUrl && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Видео</Text>
            <View style={styles.videoContainer}>
              <WebView
                source={{ uri: game.videoUrl }}
                style={{ flex: 1 }}
                allowsFullscreenVideo
              />
            </View>
          </View>
        )}

        {/* Статистика игры */}
        {gameStats && (
          <>
            {gameStats.homeTeamStats && gameStats.homeTeamStats.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Статистика - {game.homeTeam}</Text>
                {renderPlayerStats(gameStats.homeTeamStats)}
              </View>
            )}

            {gameStats.awayTeamStats && gameStats.awayTeamStats.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Статистика - {game.awayTeam}</Text>
                {renderPlayerStats(gameStats.awayTeamStats)}
              </View>
            )}

            {gameStats.gameHighlights && gameStats.gameHighlights.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Основные моменты</Text>
                {gameStats.gameHighlights.map((highlight, index) => (
                  <Text key={index} style={[commonStyles.cardText, { marginBottom: 4 }]}>
                    • {highlight}
                  </Text>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
