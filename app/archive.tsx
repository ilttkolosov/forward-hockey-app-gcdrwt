// app/archive.tsx

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
  FlatList, 
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

// --- Типы для сезонов ---
interface SeasonOption {
  id: string; // Используем string для ID
  name: string;
  start: Date;
  end: Date;
}

// --- Опции сезонов ---
const SEASON_OPTIONS: SeasonOption[] = [
  {
    id: 'recent',
    name: 'Недавние игры',
    start: new Date(new Date().setDate(new Date().getDate() - 30)), // Последние 30 дней
    end: new Date(),
  },
  {
    id: 'season_2025_2026',
    name: 'Сезон 2025-2026',
    start: new Date('2025-07-01'),
    end: new Date('2026-06-30'),
  },
  {
    id: 'season_2024_2025',
    name: 'Сезон 2024-2025',
    start: new Date('2024-07-01'),
    end: new Date('2025-06-30'),
  },
  {
    id: 'season_2023_2024',
    name: 'Сезон 2023-2024',
    start: new Date('2023-07-01'),
    end: new Date('2024-06-30'),
  },
  {
    id: 'season_2022_2023',
    name: 'Сезон 2022-2023',
    start: new Date('2022-07-01'),
    end: new Date('2023-06-30'),
  },
];
// --- Конец опций сезонов ---

// --- Вспомогательная функция для форматирования периода сезона ---
const formatSeasonPeriod = (season: SeasonOption): string => {
  if (season.id === 'recent') {
    return 'Последний месяц';
  }
  const startYear = season.start.getFullYear();
  const endYear = season.end.getFullYear();
  return `${startYear}-${endYear}`;
};

export default function ArchiveScreen() {
  const router = useRouter();
  // --- ИСПРАВЛЕНО: Получаем даты и имя сезона из параметров маршрута ---
  const { date_from, date_to, seasonName } = useLocalSearchParams<{
    date_from: string;
    date_to: string;
    seasonName?: string;
  }>();

  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(false); // Не загружаем игры по умолчанию
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  

  const loadData = useCallback(async () => {
    
    // --- ИЗМЕНЕНО: Проверяем, есть ли даты в параметрах ---
    if (!date_from || !date_to) {
      console.warn('ArchiveScreen: Missing date_from or date_to in route params');
      setError('Не указан диапазон дат для загрузки архива');
      setLoading(false);
      return;
    }
    
    
    try {
      setError(null);
      setLoading(true);
      console.log(`ArchiveScreen: Loading games for season: ${season.id}`);
      
      // --- ОБНОВЛЕНО: Форматируем даты для нового API ---
      const startDateString = season.start.toISOString().split('T')[0];
      const endDateString = season.end.toISOString().split('T')[0];
      // --- КОНЕЦ ОБНОВЛЕНИЯ ---
      
      console.log(`ArchiveScreen: Fetching games from ${startDateString} to ${endDateString} for team 74...`);
      
      // --- ОБНОВЛЕНО: Используем getGames с фильтром по дате и команде ---
      const fetchedGames = await getGames({
        date_from: startDateString,
        date_to: endDateString,
        teams: '74', // Фильтр по команде с ID 74
      });
      // --- КОНЕЦ ОБНОВЛЕНИЯ ---
      
      // Сортируем по дате (новые первые)
      fetchedGames.sort((a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime());
      
      setGames(fetchedGames);
      console.log(`Loaded ${fetchedGames.length} games for season ${season.id}`);
    } catch (err) {
      console.error('Error loading season games:', err);
      setError('Не удалось загрузить игры сезона. Попробуйте еще раз.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    if (selectedSeason) {
      loadData(selectedSeason);
    }
  };

  const handleSeasonPress = (season: SeasonOption) => {
    console.log('ArchiveScreen: Season selected:', season.id);
    setSelectedSeason(season);
    loadData(season);
  };

  const handleBackPress = () => {
    router.back();
  };

  // --- Рендер списка сезонов ---
  const renderSeasonsList = () => (
    <ScrollView
      style={styles.seasonsContainer}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {SEASON_OPTIONS.map((season, index) => (
        <TouchableOpacity
          key={season.id}
          style={styles.seasonTile}
          onPress={() => handleSeasonPress(season)}
          activeOpacity={0.7}
        >
          <View style={styles.seasonTileContent}>
            <View style={styles.seasonIcon}>
              <Text style={styles.seasonIconText}>
                {seasonIcons[index % seasonIcons.length]}
              </Text>
            </View>
            <View style={styles.seasonInfo}>
              <Text style={styles.seasonName}>{season.name}</Text>
              <Text style={styles.seasonPeriod}>{formatSeasonPeriod(season)}</Text>
            </View>
            <Icon
              name="chevron-forward"
              size={20}
              color={colors.textSecondary}
              style={styles.chevronIcon}
            />
          </View>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
  // --- Конец рендера списка сезонов ---

  // --- Рендер списка игр ---
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
          <Text style={commonStyles.text}>Нет игр в выбранном периоде.</Text>
          <Text style={commonStyles.textSecondary}>
            Попробуйте выбрать другой период или обновить страницу.
          </Text>
        </View>
      }
      showsVerticalScrollIndicator={false}
    />
  );
  // --- Конец рендера списка игр ---

  return (
    <SafeAreaView style={commonStyles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
          <Icon name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          {/* --- ИСПРАВЛЕНО: Используем screenTitle и screenSubtitle --- */}
          <Text style={commonStyles.title}>{screenTitle}</Text>
          <Text style={commonStyles.textSecondary}>
            {screenSubtitle || `${filteredGames.length} ${filteredGames.length === 1 ? 'игра' : 'игр'}`}
          </Text>
        </View>
        <TouchableOpacity onPress={handleSearchPress} style={styles.searchButton}>
          <Icon name="search" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Content */}
      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorMessage message={error} onRetry={() => selectedSeason && loadData(selectedSeason)} /> // <-- ОСТАВЛЯЕМ ТАК, но лучше заменить на () => loadData()
      ) : selectedSeason ? (
        // Если сезон выбран, отображаем список игр
        renderGamesList()
      ) : (
        // Если сезон не выбран, отображаем список сезонов
        renderSeasonsList()
      )}

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
  seasonsContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  seasonTile: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
    boxShadow: `0px 2px 8px ${colors.shadow}`,
    elevation: 2,
  },
  seasonTileContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  seasonIcon: {
    marginRight: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  seasonIconText: {
    fontSize: 24,
  },
  seasonInfo: {
    flex: 1,
  },
  seasonName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  seasonPeriod: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  chevronIcon: {
    marginLeft: 8,
  },
  listContainer: {
    padding: 16,
    paddingBottom: 32,
  },
});

// --- Иконки сезонов (без изменений) ---
const seasonIcons = ['🏆', '📅', '⏳', '🗓️', '📉'];