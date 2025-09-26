
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, useRouter } from 'expo-router';
import { commonStyles, colors } from '../styles/commonStyles';
import Icon from '../components/Icon';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import { SEASONS_MAP, getAllSeasons } from '../utils/seasons';
import { fetchPastGamesCount } from '../data/pastGameData';

const styles = StyleSheet.create({
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  backButton: {
    marginRight: 16,
    padding: 4,
  },
  headerInfo: {
    flex: 1,
  },
  seasonsGrid: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  seasonTile: {
    backgroundColor: colors.card,
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});

const seasonIcons = ['📅', '🏆', '⏳', '🗓️'];

export default function SeasonSelectorScreen() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gamesCount, setGamesCount] = useState<number>(0);
  const router = useRouter();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setError(null);
      console.log('=== Season Selector: Loading games count ===');
      
      const count = await fetchPastGamesCount();
      setGamesCount(count);
      
      console.log(`Season Selector: Games count: ${count}`);
    } catch (err) {
      console.error('Season Selector: Error loading data:', err);
      setError('Не удалось загрузить информацию о сезонах. Попробуйте еще раз.');
    } finally {
      setLoading(false);
    }
  };

  const handleSeasonPress = (seasonId: number) => {
    console.log('Season Selector: Navigating to season:', seasonId);
    router.push(`/season/${seasonId}`);
  };

  const formatSeasonPeriod = (season: typeof SEASONS_MAP[number]): string => {
    const startYear = season.start.getFullYear();
    const endYear = season.end.getFullYear();
    return `${startYear}-${endYear}`;
  };

  if (loading) {
    return (
      <SafeAreaView style={commonStyles.container}>
        <View style={styles.headerContainer}>
          <Link href="/" asChild>
            <TouchableOpacity style={styles.backButton}>
              <Icon name="chevron-back" size={24} color={colors.text} />
            </TouchableOpacity>
          </Link>
          <View style={styles.headerInfo}>
            <Text style={commonStyles.title}>Архив матчей</Text>
            <Text style={commonStyles.textSecondary}>Загружаем...</Text>
          </View>
        </View>
        <View style={commonStyles.loadingContainer}>
          <LoadingSpinner />
          <Text style={[commonStyles.textSecondary, { marginTop: 16 }]}>
            Загружаем информацию о сезонах...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={commonStyles.container}>
        <View style={styles.headerContainer}>
          <Link href="/" asChild>
            <TouchableOpacity style={styles.backButton}>
              <Icon name="chevron-back" size={24} color={colors.text} />
            </TouchableOpacity>
          </Link>
          <View style={styles.headerInfo}>
            <Text style={commonStyles.title}>Архив матчей</Text>
            <Text style={commonStyles.textSecondary}>Ошибка загрузки</Text>
          </View>
        </View>
        <ErrorMessage message={error} onRetry={loadData} />
      </SafeAreaView>
    );
  }

  const seasons = getAllSeasons();

  if (gamesCount === 0) {
    return (
      <SafeAreaView style={commonStyles.container}>
        <View style={styles.headerContainer}>
          <Link href="/" asChild>
            <TouchableOpacity style={styles.backButton}>
              <Icon name="chevron-back" size={24} color={colors.text} />
            </TouchableOpacity>
          </Link>
          <View style={styles.headerInfo}>
            <Text style={commonStyles.title}>Архив матчей</Text>
            <Text style={commonStyles.textSecondary}>Нет сыгранных игр</Text>
          </View>
        </View>
        <View style={styles.emptyContainer}>
          <Icon name="archive" size={64} color={colors.textSecondary} />
          <Text style={styles.emptyText}>Нет игр в архиве</Text>
          <Text style={styles.emptySubtext}>
            Архивные игры появятся здесь после проведения матчей
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={commonStyles.container}>
      {/* Header */}
      <View style={styles.headerContainer}>
        <Link href="/" asChild>
          <TouchableOpacity style={styles.backButton}>
            <Icon name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
        </Link>
        <View style={styles.headerInfo}>
          <Text style={commonStyles.title}>Архив матчей</Text>
          <Text style={commonStyles.textSecondary}>
            Выберите сезон для просмотра игр
          </Text>
        </View>
      </View>

      {/* Seasons Grid */}
      <ScrollView 
        style={styles.seasonsGrid}
        showsVerticalScrollIndicator={false}
      >
        {seasons.map((season, index) => (
          <TouchableOpacity
            key={season.id}
            style={styles.seasonTile}
            onPress={() => handleSeasonPress(season.id)}
            activeOpacity={0.7}
          >
            <View style={styles.seasonTileContent}>
              <View style={styles.seasonIcon}>
                <Text style={{ fontSize: 24 }}>
                  {seasonIcons[index % seasonIcons.length]}
                </Text>
              </View>
              <View style={styles.seasonInfo}>
                <Text style={styles.seasonName}>{season.name}</Text>
                <Text style={styles.seasonPeriod}>
                  {formatSeasonPeriod(season)}
                </Text>
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
    </SafeAreaView>
  );
}
