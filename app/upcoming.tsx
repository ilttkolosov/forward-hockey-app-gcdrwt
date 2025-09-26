
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

export default function UpcomingGamesScreen() {
  const [games, setGames] = useState<Game[]>([]);
  const [gamesCount, setGamesCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      setError(null);
      console.log('Loading upcoming games...');
      
      // Load upcoming games and count
      const [upcomingGames, count] = await Promise.all([
        getUpcomingGames(),
        getUpcomingGamesCount()
      ]);
      
      setGames(upcomingGames);
      setGamesCount(count);
      console.log(`Loaded ${upcomingGames.length} upcoming games, total count: ${count}`);
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
            <Text style={commonStyles.title}>Предстоящие игры</Text>
            <Text style={commonStyles.textSecondary}>
              {gamesCount > 0 ? `${gamesCount} игр запланировано` : 'Нет запланированных игр'}
            </Text>
          </View>
        </View>

        {/* Games List */}
        {games.length > 0 ? (
          games.map((game) => (
            <GameCard key={game.id} game={game} showScore={false} />
          ))
        ) : (
          <View style={commonStyles.errorContainer}>
            <Text style={commonStyles.text}>Нет предстоящих игр.</Text>
          </View>
        )}

        {/* Bottom spacing */}
        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
