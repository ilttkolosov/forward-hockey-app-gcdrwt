// app/seasons/index.tsx

import React from 'react';
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
import { useRouter } from 'expo-router';
import Icon from '../../components/Icon';
import { colors, commonStyles } from '../../styles/commonStyles';

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

// --- Иконки сезонов ---
const seasonIcons = ['🏆', '📅', '⏳', '🗓️', '📉'];

export default function SeasonsScreen() {
  const router = useRouter();

  const handleSeasonPress = (season: SeasonOption) => {
    console.log('SeasonsScreen: Season selected:', season.id);
    
    // --- ИСПРАВЛЕНО: Передаем даты начала и окончания сезона ---
    const startDateString = season.start.toISOString().split('T')[0];
    const endDateString = season.end.toISOString().split('T')[0];
    
    
    //router.push('/Test'); // <-- Навигируем на тестовую страницу
    // Навигируем на тестовую страницу, передавая даты
    router.push({
        pathname: '/archive', // <-- Навигируем на тестовую страницу
        params: { 
        date_from: startDateString, 
        date_to: endDateString,
        seasonName: season.name // <-- Передаем имя сезона для отображения
        }
    });
  }// --- КОНЕЦ ОБНОВЛЕНИЯ ---

  const handleBackPress = () => {
    router.back();
  };

  return (
    <SafeAreaView style={commonStyles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
          <Icon name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={commonStyles.title}>Архив матчей</Text>
          <Text style={commonStyles.textSecondary}>Выберите период для просмотра игр</Text>
        </View>
      </View>

      {/* Seasons List */}
      <ScrollView
        style={styles.seasonsContainer}
        showsVerticalScrollIndicator={false}
        // refreshControl={
        //   <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        // }
      >
        {SEASON_OPTIONS.map((season, index) => (
          <TouchableOpacity
            key={season.id}
            style={styles.seasonTile}
            onPress={() => handleSeasonPress(season)}
            activeOpacity={0.7}
          >
            {/* --- ИСПРАВЛЕНО: Обернул содержимое в один корневой View --- */}
            <View style={styles.seasonTileContentWrapper}> 
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
            </View>
            {/* --- КОНЕЦ ИСПРАВЛЕНИЯ --- */}
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Bottom spacing */}
      <View style={{ height: 32 }} />
    </SafeAreaView>
  );
}

// --- Стили ---
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
  // --- ИСПРАВЛЕНО: Добавлен новый стиль для обёртки ---
  seasonTileContentWrapper: {
    // Этот стиль может быть пустым, но он нужен для корректного JSX
  },
  // --- КОНЕЦ ИСПРАВЛЕНИЯ ---
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