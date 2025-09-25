
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import { getFutureGames } from '../data/gameData';
import GameCard from '../components/GameCard';
import Icon from '../components/Icon';
import { Game } from '../types';
import { commonStyles, colors } from '../styles/commonStyles';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';

const UpcomingGamesScreen: React.FC = () => {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setError(null);
      console.log('Loading upcoming games...');
      
      const gamesData = await getFutureGames();
      setGames(gamesData);
      
      console.log(`Successfully loaded ${gamesData.length} upcoming games`);
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
        <View style={commonStyles.header}>
          <Link href="/" asChild>
            <TouchableOpacity style={{ marginRight: 16 }}>
              <Icon name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
          </Link>
          <Text style={commonStyles.title}>Предстоящие игры</Text>
        </View>
        <LoadingSpinner />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={commonStyles.container}>
      <View style={commonStyles.header}>
        <Link href="/" asChild>
          <TouchableOpacity style={{ marginRight: 16 }}>
            <Icon name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
        </Link>
        <Text style={commonStyles.title}>Предстоящие игры</Text>
      </View>

      <ScrollView
        style={commonStyles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {error && <ErrorMessage message={error} />}

        {games.length === 0 ? (
          <View style={commonStyles.emptyState}>
            <Icon name="calendar" size={64} color={colors.textSecondary} />
            <Text style={commonStyles.emptyStateTitle}>Нет предстоящих игр</Text>
            <Text style={commonStyles.emptyStateText}>
              Расписание игр будет обновлено в ближайшее время
            </Text>
          </View>
        ) : (
          <View style={{ padding: 8 }}>
            {games.map((game) => (
              <GameCard key={game.id} game={game} showScore={false} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

export default UpcomingGamesScreen;
