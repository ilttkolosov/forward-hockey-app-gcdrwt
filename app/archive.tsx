// app/archiv.tsx

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Alert,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Icon from '../components/Icon';
import { colors, commonStyles } from '../styles/commonStyles';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import GameCard from '../components/GameCard'; // Импортируем компонент GameCard
import { getGames } from '../data/gameData'; // Импортируем новую функцию getGames
import { Game } from '../types'; // Импортируем тип Game

const { width } = Dimensions.get('window');

export default function ArchiveScreen() {
  const router = useRouter();
  // ---Получаем даты и имя сезона из параметров маршрута ---
  const { date_from, date_to, seasonName } = useLocalSearchParams<{
    date_from: string;
    date_to: string;
    seasonName?: string; // Опционально
  }>();


  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  
  const loadData = useCallback(async () => {
    // -- Проверяем, есть ли даты в параметрах ---
    if (!date_from || !date_to) {
      console.warn('ArchiveScreen: Missing date_from or date_to in route params');
      setError('Не указан диапазон дат для загрузки архива');
      setLoading(false);
      return;
    }


    try {
      setError(null);
      setLoading(true);
      console.log(`ArchiveScreen: Loading games for date range: ${date_from} to ${date_to}`);

      // --- Используем getGames с фильтром по дате и команде ---
      const fetchedGames = await getGames({
        date_from: date_from,
        date_to: date_to,
        teams: '74', // Фильтр по команде с ID 74
      });
      // --- КОНЕЦ ИСПРАВЛЕНИЯ ---

      // Сортируем по дате (новые первые)
      fetchedGames.sort((a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime());

      setGames(fetchedGames);
      console.log(`ArchiveScreen: Loaded ${fetchedGames.length} games for date range: ${date_from} to ${date_to}`);
    } catch (err) {
      console.error('ArchiveScreen: Error loading games:', err);
      setError('Не удалось загрузить архивные игры. Попробуйте еще раз.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [date_from, date_to]); // <-- Зависимости от дат

  useEffect(() => {
    loadData();
  }, [loadData, date_from, date_to]); // <-- Зависимости от дат

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };


  const handleBackPress = () => {
    router.back();
  };

  // --- Обновлённый рендер заголовка ---
  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
        <Icon name="chevron-back" size={24} color={colors.text} />
      </TouchableOpacity>
      <View style={styles.headerTitleContainer}>
        {/* --- Используем seasonName и date_from - date_to из параметров маршрута --- */}
        <Text style={commonStyles.title}>{seasonName || 'Архив матчей'}</Text>
        <Text style={commonStyles.textSecondary}>
          {date_from && date_to ? `${date_from} - ${date_to}` : 'Выбранный период'}
        </Text>
        {/* --- КОНЕЦ ИСПРАВЛЕНИЯ --- */}
      </View>
    </View>
  );

  // --- Обновлённый рендер списка игр ---
  const renderGamesList = () => (
    <FlatList
      data={games}
      renderItem={({ item: game }) => (
        <GameCard
          key={game.id}
          game={game}
          showScore={true}
          onPress={() => router.push(`/game/${game.id}`)} // Добавляем навигацию
        />
      )}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContainer}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      ListEmptyComponent={
        <View style={commonStyles.errorContainer}>
          <Text style={commonStyles.text}>Нет архивных игр.</Text>
          <Text style={commonStyles.textSecondary}>
            Попробуйте выбрать другой период или обновить страницу.
          </Text>
        </View>
      }
      showsVerticalScrollIndicator={false}
    />
  );
  // --- КОНЕЦ ИСПРАВЛЕНИЯ ---

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
      {/* Header */}
      {renderHeader()}

      {/* Games List */}
      {renderGamesList()}

      {/* Bottom spacing */}
      <View style={{ height: 32 }} />
    </SafeAreaView>
  );
}

// --- Стили (без изменений) ---
const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    marginRight: 16,
    padding: 4,
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  listContainer: {
    padding: 16,
    paddingBottom: 32,
  },
});
// --- КОНЕЦ СТИЛЕЙ ---