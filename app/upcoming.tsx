// app/upcoming.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { commonStyles, colors } from '../styles/commonStyles';
import GameCard from '../components/GameCard';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import { Game } from '../types';
import { getUpcomingGamesCount, getUpcomingGamesMasterData } from '../data/gameData';
// УБРАНО: import { Link } from 'expo-router'; // Больше не нужен
import Icon from '../components/Icon';
import { useRouter } from 'expo-router'; // Добавлен импорт

export default function UpcomingGamesScreen() {
  const [games, setGames] = useState<Game[]>([]);
  const [gamesCount, setGamesCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const router = useRouter(); // Инициализируем router

  const handleBackPress = () => {
    router.back(); // Используем router.back() для навигации назад
  };

  const loadData = async () => {
    try {
      setError(null);
      console.log('UpcomingGamesScreen: Loading data...');
      const upcomingGamesData = await getUpcomingGamesMasterData();
      console.log(`UpcomingGamesScreen: Loaded ${upcomingGamesData.length} games`);
      const totalCount = upcomingGamesData.length;
      setGames(upcomingGamesData);
      setGamesCount(totalCount);
    } catch (err) {
      console.error('UpcomingGamesScreen: Error loading data:', err);
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
        {/* Header - Используем TouchableOpacity с handleBackPress, как в других экранах */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}>
          <TouchableOpacity onPress={handleBackPress} style={{ marginRight: 16 }}>
            {/* Оборачиваем Icon в View, чтобы избежать потенциальной ошибки отрисовки */}
            <View style={{ justifyContent: 'center', alignItems: 'center' }}>
              <Icon name="chevron-back" size={24} color={colors.text} />
            </View>
          </TouchableOpacity>
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