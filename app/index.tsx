
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import { commonStyles, colors } from '../styles/commonStyles';
import { Game } from '../types';
import { getCurrentGame, getFutureGames, getUpcomingGamesCount, getGameById } from '../data/gameData';
import { getPlayers } from '../data/playerData';
import GameCard from '../components/GameCard';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import Icon from '../components/Icon';

const quickNavStyles = {
  container: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    justifyContent: 'space-between',
    marginVertical: 24,
  },
  item: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: colors.border,
  },
  icon: {
    marginBottom: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: colors.text,
    textAlign: 'center' as const,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center' as const,
  },
};

const headerStyles = StyleSheet.create({
  headerContainer: {
    marginBottom: 24,
    alignItems: 'center',
  },
  teamName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  cityName: {
    fontSize: 14,
    fontWeight: '400',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
});

// Helper function to determine game status with new badge logic
const getGameStatus = (game: Game) => {
  const now = new Date();
  const gameDate = new Date(game.event_date);
  
  // Check if game is today
  const isToday = gameDate.toDateString() === now.toDateString();
  
  // Check if game is within next 3 days
  const daysDiff = Math.ceil((gameDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const isWithin3Days = daysDiff >= 0 && daysDiff <= 3;
  
  // Check if game is live (5 minutes before to 90 minutes after)
  const liveStart = new Date(gameDate.getTime() - 5 * 60 * 1000);   // –5 мин
  const liveEnd = new Date(gameDate.getTime() + 90 * 60 * 1000);   // +90 мин
  const isLive = now >= liveStart && now <= liveEnd;
  
  return { isToday, isWithin3Days, isLive };
};

// Helper function to sort upcoming games with new priority logic
const sortUpcomingGames = (games: Game[]): Game[] => {
  return [...games].sort((a, b) => {
    const statusA = getGameStatus(a);
    const statusB = getGameStatus(b);
    
    // LIVE games first
    if (statusA.isLive && !statusB.isLive) return -1;
    if (!statusA.isLive && statusB.isLive) return 1;
    
    // Today games second (but not LIVE)
    if (statusA.isToday && !statusA.isLive && !statusB.isToday) return -1;
    if (!statusA.isToday && statusB.isToday && !statusB.isLive) return 1;
    
    // Within 3 days games third
    if (statusA.isWithin3Days && !statusB.isWithin3Days) return -1;
    if (!statusA.isWithin3Days && statusB.isWithin3Days) return 1;
    
    // Rest by date
    return new Date(a.event_date).getTime() - new Date(b.event_date).getTime();
  });
};

export default function HomeScreen() {
  const [currentGame, setCurrentGame] = useState<Game | null>(null);
  const [upcomingGames, setUpcomingGames] = useState<Game[]>([]);
  const [upcomingCount, setUpcomingCount] = useState<number>(0);
  const [playersCount, setPlayersCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);


  const loadData = useCallback(async (force = false) => {
    try {
      setError(null);
      setLoading(true);

      console.log('Loading home screen data...', { force });

      const [current, upcoming, upcomingCount, players] = await Promise.all([
        getCurrentGame(force),
        getFutureGames(force),
        getUpcomingGamesCount(), // она использует мастер-кэш → будет свежей
        getPlayers(),
      ]);

      setCurrentGame(current ?? null);
      setUpcomingGames(upcoming);
      setUpcomingCount(upcomingCount);
      setPlayersCount(players.length);

      // === ФОНОВОЕ ОБНОВЛЕНИЕ ДЕТАЛЕЙ ВСЕХ ИГР ПРИ force ===
/*       if (force) {
        const allGameIds = [
          ...(current ? [current.id] : []),
          ...upcoming.map(g => g.id),
        ];
        console.log('Force-refresh: Preloading details for games:', allGameIds);
        allGameIds.forEach(id => {
          // useCache = false → игнорировать кэш, запросить с API
          getGameById(id, false).catch(err => {
            console.warn(`Background update of game ${id} details failed:`, err);
          });
        });
      } else {
        // Только для текущей игры — как раньше
        if (current) {
          getGameById(current.id).catch(console.warn);
        }
      } */
    } catch (err) {
      console.error('Error loading home screen data:', err);
      setError('Не удалось загрузить данные. Попробуйте еще раз.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  // --- КОНЕЦ ОБНОВЛЕНИЯ ---

useEffect(() => {
  // Загружаем только если ещё не загружено
  if (currentGame === null && upcomingGames.length === 0) {
    loadData();
  }
}, [loadData, currentGame, upcomingGames.length]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData(true); // <-- принудительная перезагрузка
  };

  if (loading) {
    return (
      <SafeAreaView style={commonStyles.container}>
        <LoadingSpinner />
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
        <View style={headerStyles.headerContainer}>
          <View style={headerStyles.headerRow}>
            <Text style={headerStyles.teamName}>ХК Динамо Форвард 2014</Text>
            <Text style={headerStyles.cityName}> • Санкт-Петербург</Text>
          </View>
        </View>

        {/* Current Game */}
        {currentGame && (
          <View style={{ marginBottom: 0 }}>
            <Text style={[commonStyles.subtitle, { marginBottom: 12 }]}>
              Текущая игра
            </Text>
            <GameCard game={currentGame} showScore={true} />
          </View>
        )}

        {/* Quick Navigation */}
        <View style={quickNavStyles.container}>
          <Link href="/upcoming" asChild>
            <TouchableOpacity style={quickNavStyles.item}>
              <Icon 
                name="calendar" 
                size={24} 
                color={colors.primary} 
                style={quickNavStyles.icon} 
              />
              <Text style={quickNavStyles.title}>Предстоящие игры</Text>
              <Text style={quickNavStyles.subtitle}>
                {upcomingCount > 0 ? `${upcomingCount} игр` : 'Нет игр'}
              </Text>
            </TouchableOpacity>
          </Link>

          <Link href="season" asChild>
            <TouchableOpacity style={quickNavStyles.item}>
              <Icon 
                name="archive" 
                size={24} 
                color={colors.primary} 
                style={quickNavStyles.icon} 
              />
              <Text style={quickNavStyles.title}>Архив игр</Text>
              <Text style={quickNavStyles.subtitle}>История матчей</Text>
            </TouchableOpacity>
          </Link>

          <Link href="tournaments" asChild>
            <TouchableOpacity style={quickNavStyles.item}>
              <Icon 
                name="trophy" 
                size={24} 
                color={colors.primary} 
                style={quickNavStyles.icon} 
              />
              <Text style={quickNavStyles.title}>Турниры</Text>
              <Text style={quickNavStyles.subtitle}>Соревнования</Text>
            </TouchableOpacity>
          </Link>

          <Link href="/players" asChild>
            <TouchableOpacity style={quickNavStyles.item}>
              <Icon 
                name="people" 
                size={24} 
                color={colors.primary} 
                style={quickNavStyles.icon} 
              />
              <Text style={quickNavStyles.title}>Игроки</Text>
              <Text style={quickNavStyles.subtitle}>
                {playersCount > 0 ? `${playersCount} игроков` : 'Состав команды'}
              </Text>
            </TouchableOpacity>
          </Link>
        </View>

        {/* Upcoming Games */}
        {upcomingGames.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <View style={{ 
              flexDirection: 'row', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: 12 
            }}>
              <Text style={commonStyles.subtitle}>Ближайшие игры</Text>
              <Link href="/upcoming" asChild>
                <TouchableOpacity>
                  <Text style={[commonStyles.textSecondary, { fontSize: 14 }]}>
                    Все игры
                  </Text>
                </TouchableOpacity>
              </Link>
            </View>
            
            {upcomingGames.slice(0, 3).map((game) => (
              <GameCard key={game.id} game={game} showScore={false} />
            ))}
          </View>
        )}


        {/* Bottom spacing */}
        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
