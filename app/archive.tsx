
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { commonStyles, colors } from '../styles/commonStyles';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import { fetchPastGames, fetchPastGamesCount, getOutcomeText, getOutcomeColor } from '../data/pastGameData';
import { Link, useRouter } from 'expo-router';
import Icon from '../components/Icon';

interface EnrichedPastGame {
  id: string;
  event_id: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamLogo: string;
  awayTeamLogo: string;
  homeGoals: number;
  awayGoals: number;
  homeOutcome: string;
  awayOutcome: string;
  date: string;
  time: string;
  event_date: string;
  tournamentName: string | null;
  arenaName: string | null;
  seasonName: string | null;
}

const styles = StyleSheet.create({
  gameCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    boxShadow: `0px 2px 8px ${colors.shadow}`,
    elevation: 2,
  },
  gameHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  teamsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  teamInfo: {
    flex: 1,
    alignItems: 'center',
  },
  teamLogo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginBottom: 8,
    backgroundColor: colors.backgroundAlt,
  },
  teamName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  scoreContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  score: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 4,
  },
  outcomeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  outcomeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  gameInfo: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  infoIcon: {
    marginRight: 8,
  },
  infoText: {
    fontSize: 13,
    color: colors.textSecondary,
    flex: 1,
  },
  dateTime: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  backButton: {
    marginRight: 16,
    padding: 4,
  },
  headerInfo: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});

export default function GameArchiveScreen() {
  const [games, setGames] = useState<EnrichedPastGame[]>([]);
  const [gamesCount, setGamesCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();

  const testApiDirectly = async () => {
    try {
      console.log('=== Archive Screen: Testing API directly ===');
      const response = await fetch('https://www.hc-forward.com/wp-json/app/v1/past-events');
      console.log('Direct API response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Direct API response data keys:', Object.keys(data));
        console.log('Direct API response count:', data.count);
        console.log('Direct API response data length:', data.data?.length);
        
        if (data.data && data.data.length > 0) {
          console.log('First event from direct API:', data.data[0]);
        }
      } else {
        console.error('Direct API call failed with status:', response.status);
      }
    } catch (error) {
      console.error('Direct API test error:', error);
    }
  };

  const loadData = async () => {
    try {
      setError(null);
      console.log('=== Archive Screen: Loading data ===');
      
      // Test API directly first
      await testApiDirectly();
      
      // Load past games and count concurrently
      const [pastGames, count] = await Promise.all([
        fetchPastGames(),
        fetchPastGamesCount()
      ]);
      
      console.log(`Archive Screen: Received ${pastGames.length} games, count: ${count}`);
      
      setGames(pastGames);
      setGamesCount(count);
      
      if (pastGames.length === 0 && count > 0) {
        console.warn('Archive Screen: Count is positive but games array is empty - this indicates a data processing issue');
      }
      
    } catch (err) {
      console.error('Archive Screen: Error loading data:', err);
      setError('Не удалось загрузить архив игр. Попробуйте еще раз.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleGamePress = (gameId: string) => {
    console.log('Archive Screen: Navigating to game:', gameId);
    router.push(`/game/${gameId}`);
  };

  const renderGameCard = (game: EnrichedPastGame) => {
    return (
      <TouchableOpacity
        key={game.id}
        style={styles.gameCard}
        onPress={() => handleGamePress(game.event_id)}
        activeOpacity={0.7}
      >
        {/* Date and Time */}
        <View style={styles.gameHeader}>
          <Text style={styles.dateTime}>
            {game.date} {game.time && `• ${game.time}`}
          </Text>
        </View>

        {/* Teams and Score */}
        <View style={styles.teamsContainer}>
          {/* Home Team */}
          <View style={styles.teamInfo}>
            {game.homeTeamLogo ? (
              <Image
                source={{ uri: game.homeTeamLogo }}
                style={styles.teamLogo}
                defaultSource={require('../assets/images/natively-dark.png')}
              />
            ) : (
              <View style={styles.teamLogo} />
            )}
            <Text style={styles.teamName} numberOfLines={2}>
              {game.homeTeam}
            </Text>
          </View>

          {/* Score */}
          <View style={styles.scoreContainer}>
            <Text style={styles.score}>
              {game.homeGoals} : {game.awayGoals}
            </Text>
          </View>

          {/* Away Team */}
          <View style={styles.teamInfo}>
            {game.awayTeamLogo ? (
              <Image
                source={{ uri: game.awayTeamLogo }}
                style={styles.teamLogo}
                defaultSource={require('../assets/images/natively-dark.png')}
              />
            ) : (
              <View style={styles.teamLogo} />
            )}
            <Text style={styles.teamName} numberOfLines={2}>
              {game.awayTeam}
            </Text>
          </View>
        </View>

        {/* Outcomes */}
        {(game.homeOutcome || game.awayOutcome) && (
          <View style={styles.outcomeContainer}>
            <Text style={[styles.outcomeText, { color: getOutcomeColor(game.homeOutcome) }]}>
              {getOutcomeText(game.homeOutcome)}
            </Text>
            <Text style={[styles.outcomeText, { color: getOutcomeColor(game.awayOutcome) }]}>
              {getOutcomeText(game.awayOutcome)}
            </Text>
          </View>
        )}

        {/* Game Information */}
        {(game.tournamentName || game.arenaName || game.seasonName) && (
          <View style={styles.gameInfo}>
            {game.tournamentName && (
              <View style={styles.infoRow}>
                <Icon name="trophy" size={16} color={colors.textSecondary} style={styles.infoIcon} />
                <Text style={styles.infoText}>{game.tournamentName}</Text>
              </View>
            )}
            
            {game.arenaName && (
              <View style={styles.infoRow}>
                <Icon name="location" size={16} color={colors.textSecondary} style={styles.infoIcon} />
                <Text style={styles.infoText}>{game.arenaName}</Text>
              </View>
            )}
            
            {game.seasonName && (
              <View style={styles.infoRow}>
                <Icon name="calendar" size={16} color={colors.textSecondary} style={styles.infoIcon} />
                <Text style={styles.infoText}>{game.seasonName}</Text>
              </View>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={commonStyles.container}>
        <View style={commonStyles.loadingContainer}>
          <LoadingSpinner />
          <Text style={[commonStyles.textSecondary, { marginTop: 16 }]}>
            Загружаем архив игр...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={commonStyles.container}>
        <ErrorMessage message={error} onRetry={loadData} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={commonStyles.container}>
      <ScrollView
        style={commonStyles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.headerContainer}>
          <Link href="/" asChild>
            <TouchableOpacity style={styles.backButton}>
              <Icon name="chevron-back" size={24} color={colors.text} />
            </TouchableOpacity>
          </Link>
          <View style={styles.headerInfo}>
            <Text style={commonStyles.title}>Архив игр</Text>
            <Text style={commonStyles.textSecondary}>
              {gamesCount > 0 ? `Всего игр: ${gamesCount}` : 'Нет сыгранных игр'}
            </Text>
          </View>
        </View>

        {/* Games List */}
        {games.length > 0 ? (
          <>
            {games.map(renderGameCard)}
            {/* Bottom spacing */}
            <View style={{ height: 32 }} />
          </>
        ) : (
          <View style={styles.emptyContainer}>
            <Icon name="archive" size={64} color={colors.textSecondary} />
            <Text style={styles.emptyText}>Нет игр в архиве</Text>
            <Text style={styles.emptySubtext}>
              {gamesCount > 0 
                ? `Найдено ${gamesCount} игр, но не удалось их обработать`
                : 'Архивные игры появятся здесь после проведения матчей'
              }
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
