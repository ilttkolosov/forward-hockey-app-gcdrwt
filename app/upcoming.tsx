
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { commonStyles, colors } from '../styles/commonStyles';
import GameCard from '../components/GameCard';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import { Game } from '../types';
import { getUpcomingGames, getUpcomingGamesCount } from '../data/gameData';
import { Link } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import Icon from '../components/Icon';

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

export default function UpcomingGamesScreen() {
  const [games, setGames] = useState<Game[]>([]);
  const [gamesCount, setGamesCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      setError(null);
      console.log('Loading upcoming games screen data...');
      
      // Load upcoming games and count concurrently
      const [upcomingGames, count] = await Promise.all([
        getUpcomingGames(),
        getUpcomingGamesCount()
      ]);
      
      // Sort games with new priority logic
      const sortedGames = sortUpcomingGames(upcomingGames);
      setGames(sortedGames);
      setGamesCount(count);
      console.log(`Loaded ${sortedGames.length} upcoming games, total count: ${count}`);
    } catch (err) {
      console.log('Error loading upcoming games:', err);
      setError('Не удалось загрузить предстоящие игры. Попробуйте еще раз.');
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
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}>
          <Link href="/" asChild>
            <TouchableOpacity style={{ marginRight: 16 }}>
              <Icon name="chevron-back" size={24} color={colors.text} />
            </TouchableOpacity>
          </Link>
          <View>
            <Text style={commonStyles.title}>Предстоящие игры ({gamesCount})</Text>
            <Text style={commonStyles.textSecondary}>
              {gamesCount > 0 ? `${gamesCount} игр запланировано` : 'Нет запланированных игр'}
            </Text>
          </View>
        </View>

        {/* Games List */}
        {games.length > 0 ? (
          <View style={{ gap: 16 }}>
            {games.map((game) => (
              <GameCard key={game.id} game={game} showScore={false} />
            ))}
          </View>
        ) : (
          <View style={commonStyles.errorContainer}>
            <Text style={commonStyles.text}>Нет предстоящих игр.</Text>
            <Text style={commonStyles.textSecondary}>
              Проверьте позже или обновите страницу.
            </Text>
          </View>
        )}

        {/* Bottom spacing */}
        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
