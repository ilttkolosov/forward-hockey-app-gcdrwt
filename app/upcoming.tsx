
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from '../components/Icon';
import GameCard from '../components/GameCard';
import { Game } from '../types';
import { getUpcomingGames } from '../data/gameData';
import LoadingSpinner from '../components/LoadingSpinner';
import { commonStyles, colors } from '../styles/commonStyles';
import ErrorMessage from '../components/ErrorMessage';

export default function UpcomingGamesScreen() {
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
      console.log('Загрузка предстоящих игр...');
      const upcomingGames = await getUpcomingGames();
      console.log('Загружено предстоящих игр:', upcomingGames.length);
      setGames(upcomingGames);
    } catch (error) {
      console.error('Ошибка загрузки предстоящих игр:', error);
      setError('Не удалось загрузить предстоящие игры. Проверьте подключение к интернету.');
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
        <LoadingSpinner text="Загрузка предстоящих игр..." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={commonStyles.container}>
      <ScrollView
        style={commonStyles.flex1}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {error && <ErrorMessage message={error} />}

        {games.length === 0 ? (
          <View style={commonStyles.emptyState}>
            <Icon name="event" size={48} color={colors.textSecondary} />
            <Text style={commonStyles.emptyStateTitle}>Нет предстоящих игр</Text>
            <Text style={commonStyles.emptyStateText}>
              Расписание игр пока не опубликовано
            </Text>
          </View>
        ) : (
          <>
            <View style={[commonStyles.sectionHeader, { paddingHorizontal: 0 }]}>
              <Text style={commonStyles.sectionTitle}>
                Предстоящие игры ({games.length})
              </Text>
            </View>
            {games.map((game) => (
              <GameCard key={game.id} game={game} />
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
