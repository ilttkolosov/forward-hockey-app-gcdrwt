
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
  videoPlaceholder: {
    height: 200,
    backgroundColor: colors.surface,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.background,
  },
  videoPlaceholderText: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
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
  periodsContainer: {
    backgroundColor: colors.surface,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    padding: 16,
  },
  periodsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  periodsTable: {
    borderWidth: 1,
    borderColor: colors.background,
    borderRadius: 8,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.background,
  },
  tableHeader: {
    backgroundColor: colors.background,
  },
  tableCell: {
    flex: 1,
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tableCellText: {
    fontSize: 14,
    color: colors.text,
    textAlign: 'center',
  },
  tableCellHeader: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
    textAlign: 'center',
  },
  outcomeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.background,
  },
  outcomeItem: {
    alignItems: 'center',
  },
  outcomeLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  outcomeText: {
    fontSize: 16,
    fontWeight: '600',
  },
  winText: {
    color: colors.success,
  },
  lossText: {
    color: colors.error,
  },
  drawText: {
    color: colors.warning,
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
      console.log('Loading enhanced game data from /events/{id} for ID:', id);
      
      const [gameData, statsData] = await Promise.all([
        getGameById(id!),
        getGameStatsById(id!).catch(() => null) // Stats might not be available
      ]);
      
      console.log('Loaded game data:', gameData);
      console.log('Loaded stats data:', statsData);
      
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

  const getOutcomeText = (outcome: 'win' | 'loss' | 'nich' | undefined) => {
    switch (outcome) {
      case 'win':
        return 'ПОБЕДА';
      case 'loss':
        return 'ПОРАЖЕНИЕ';
      case 'nich':
        return 'НИЧЬЯ';
      default:
        return 'НЕТ ДАННЫХ';
    }
  };

  const getOutcomeStyle = (outcome: 'win' | 'loss' | 'nich' | undefined) => {
    switch (outcome) {
      case 'win':
        return styles.winText;
      case 'loss':
        return styles.lossText;
      case 'nich':
        return styles.drawText;
      default:
        return { color: colors.textSecondary };
    }
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

  const renderPeriodsTable = () => {
    if (!game || game.homeScore === undefined || game.awayScore === undefined) {
      return null;
    }

    const hasPeriodsData = game.homeFirstPeriod !== undefined || 
                          game.homeSecondPeriod !== undefined || 
                          game.homeThirdPeriod !== undefined ||
                          game.awayFirstPeriod !== undefined || 
                          game.awaySecondPeriod !== undefined || 
                          game.awayThirdPeriod !== undefined;

    if (!hasPeriodsData) {
      return null;
    }

    return (
      <View style={styles.periodsContainer}>
        <Text style={styles.periodsTitle}>Счет по периодам</Text>
        <View style={styles.periodsTable}>
          {/* Header */}
          <View style={[styles.tableRow, styles.tableHeader]}>
            <View style={styles.tableCell}>
              <Text style={styles.tableCellHeader}>Команда</Text>
            </View>
            <View style={styles.tableCell}>
              <Text style={styles.tableCellHeader}>1 период</Text>
            </View>
            <View style={styles.tableCell}>
              <Text style={styles.tableCellHeader}>2 период</Text>
            </View>
            <View style={styles.tableCell}>
              <Text style={styles.tableCellHeader}>3 период</Text>
            </View>
            <View style={styles.tableCell}>
              <Text style={styles.tableCellHeader}>Итого</Text>
            </View>
          </View>
          
          {/* Home team */}
          <View style={styles.tableRow}>
            <View style={styles.tableCell}>
              <Text style={styles.tableCellText} numberOfLines={1}>
                {game.homeTeam}
              </Text>
            </View>
            <View style={styles.tableCell}>
              <Text style={styles.tableCellText}>
                {game.homeFirstPeriod ?? 0}
              </Text>
            </View>
            <View style={styles.tableCell}>
              <Text style={styles.tableCellText}>
                {game.homeSecondPeriod ?? 0}
              </Text>
            </View>
            <View style={styles.tableCell}>
              <Text style={styles.tableCellText}>
                {game.homeThirdPeriod ?? 0}
              </Text>
            </View>
            <View style={styles.tableCell}>
              <Text style={[styles.tableCellText, { fontWeight: 'bold', color: colors.primary }]}>
                {game.homeScore}
              </Text>
            </View>
          </View>
          
          {/* Away team */}
          <View style={styles.tableRow}>
            <View style={styles.tableCell}>
              <Text style={styles.tableCellText} numberOfLines={1}>
                {game.awayTeam}
              </Text>
            </View>
            <View style={styles.tableCell}>
              <Text style={styles.tableCellText}>
                {game.awayFirstPeriod ?? 0}
              </Text>
            </View>
            <View style={styles.tableCell}>
              <Text style={styles.tableCellText}>
                {game.awaySecondPeriod ?? 0}
              </Text>
            </View>
            <View style={styles.tableCell}>
              <Text style={styles.tableCellText}>
                {game.awayThirdPeriod ?? 0}
              </Text>
            </View>
            <View style={styles.tableCell}>
              <Text style={[styles.tableCellText, { fontWeight: 'bold', color: colors.primary }]}>
                {game.awayScore}
              </Text>
            </View>
          </View>
        </View>
      </View>
    );
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
        {/* Video Player from sp_video field */}
        {(game.videoUrl || game.sp_video) ? (
          <View style={styles.videoContainer}>
            <WebView
              source={{ uri: game.videoUrl || game.sp_video || '' }}
              style={{ flex: 1 }}
              allowsFullscreenVideo={true}
              mediaPlaybackRequiresUserAction={false}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              startInLoadingState={true}
              onError={(syntheticEvent) => {
                const { nativeEvent } = syntheticEvent;
                console.error('WebView error: ', nativeEvent);
              }}
              onLoadStart={() => console.log('WebView loading started')}
              onLoadEnd={() => console.log('WebView loading ended')}
            />
          </View>
        ) : (
          <View style={styles.videoPlaceholder}>
            <Icon name="play-circle-outline" size={48} color={colors.textSecondary} />
            <Text style={styles.videoPlaceholderText}>
              Видео трансляции недоступно
            </Text>
          </View>
        )}

        {/* Game Information from /events/{id} endpoint */}
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
            <Text style={styles.gameDetail}>
              Время: {game.time === '00:00' ? 'Уточняется' : game.time}
            </Text>
          </View>

          <View style={styles.gameDetails}>
            <Text style={styles.gameDetail}>Место: {game.venue}</Text>
            <Text style={styles.gameDetail}>
              Турнир: {game.league || game.tournament || 'Товарищеский матч'}
            </Text>
          </View>

          {game.season && (
            <View style={styles.gameDetails}>
              <Text style={styles.gameDetail}>Сезон: {game.season}</Text>
            </View>
          )}

          {/* Outcome for finished games with results */}
          {game.status === 'finished' && (game.homeOutcome || game.awayOutcome) && (
            <View style={styles.outcomeContainer}>
              <View style={styles.outcomeItem}>
                <Text style={styles.outcomeLabel}>{game.homeTeam}</Text>
                <Text style={[styles.outcomeText, getOutcomeStyle(game.homeOutcome)]}>
                  {getOutcomeText(game.homeOutcome)}
                </Text>
              </View>
              <View style={styles.outcomeItem}>
                <Text style={styles.outcomeLabel}>{game.awayTeam}</Text>
                <Text style={[styles.outcomeText, getOutcomeStyle(game.awayOutcome)]}>
                  {getOutcomeText(game.awayOutcome)}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Periods Table with detailed period scores */}
        {renderPeriodsTable()}

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
