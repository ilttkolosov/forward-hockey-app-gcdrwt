
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import { getFutureGames, getUpcomingGamesCount } from '../data/gameData';
import Icon from '../components/Icon';
import { Game } from '../types';
import GameCard from '../components/GameCard';
import { commonStyles, colors } from '../styles/commonStyles';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';

const UpcomingGamesScreen: React.FC = () => {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState<number>(0);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setError(null);
      console.log('Loading upcoming games...');
      
      const upcomingGames = await getFutureGames();
      setGames(upcomingGames);
      setTotalCount(getUpcomingGamesCount());
      
      console.log('Upcoming games loaded successfully. Count:', upcomingGames.length);
    } catch (err) {
      console.error('Error loading upcoming games:', err);
      setError('Ошибка загрузки предстоящих игр. Проверьте подключение к интернету.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

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

  return (
    <SafeAreaView style={commonStyles.container}>
      <View style={commonStyles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Link href="/" asChild>
            <TouchableOpacity style={{ marginRight: 16 }}>
              <Icon name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
          </Link>
          <View>
            <Text style={commonStyles.title}>
              Предстоящие игры {totalCount > 0 ? `(${totalCount})` : ''}
            </Text>
          </View>
        </View>
      </View>

      {error && <ErrorMessage message={error} />}

      <ScrollView
        style={commonStyles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {games.length === 0 ? (
          <View style={commonStyles.emptyState}>
            <Icon name="calendar" size={48} color={colors.textSecondary} />
            <Text style={commonStyles.emptyStateText}>
              Нет предстоящих игр
            </Text>
            <Text style={commonStyles.emptyStateSubtext}>
              Расписание игр будет обновлено позже
            </Text>
          </View>
        ) : (
          games.map((game) => (
            <GameCard key={game.id} game={game} showScore={false} hideSeasonInfo={true} />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

export default UpcomingGamesScreen;
