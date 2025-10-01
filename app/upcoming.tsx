// upcoming.tsx

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { commonStyles, colors } from '../styles/commonStyles';
import GameCard from '../components/GameCard';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import { Game } from '../types';
// Импортируем функции из обновлённого gameData.ts
import { getUpcomingGames, getUpcomingGamesCount } from '../data/gameData';
import { Link } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import Icon from '../components/Icon';
// --- УДАЛЕНЫ неиспользуемые импорты ---
// import { loadTeamList, loadTeamLogo } from '../services/teamStorage';
// import { apiService } from '../services/apiService';
// import { formatDateTimeWithoutSeconds } from '../utils/dateUtils';

export default function UpcomingGamesScreen() {
  const [games, setGames] = useState<Game[]>([]);
  const [gamesCount, setGamesCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      setError(null);
      console.log('UpcomingGamesScreen: Loading data...');

      // --- УПРОЩЕНАЯ ЛОГИКА ЗАГРУЗКИ ---
      // Загружаем список предстоящих игр (уже отсортированный и с заполненными полями)
      const upcomingGamesData = await getUpcomingGames();
      console.log(`UpcomingGamesScreen: Loaded ${upcomingGamesData.length} games`);

      // Загружаем общее количество предстоящих игр
      //const totalCount = await getUpcomingGamesCount();
      //console.log(`UpcomingGamesScreen: Total count is ${totalCount}`);

      const totalCount = upcomingGamesData.length;

      setGames(upcomingGamesData);
      setGamesCount(totalCount);
      // --- КОНЕЦ УПРОЩЕННОЙ ЛОГИКИ ---
      
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
            {/* --- ИСПОЛЬЗУЕМ GameCard напрямую с объектом Game --- */}
            {games.map((game) => (
              <GameCard key={game.id} game={game} showScore={false} />
            ))}
            {/* --- КОНЕЦ ИСПОЛЬЗОВАНИЯ GameCard --- */}
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