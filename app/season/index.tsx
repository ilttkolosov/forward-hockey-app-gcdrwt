// app/seasons/index.tsx
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Icon from '../../components/Icon';
import { colors, commonStyles } from '../../styles/commonStyles';
import { getPastGames } from '../../data/gameData';
import { getGameById } from '../../data/gameData';
import { usePersistentBottomNavigationInset } from '../../components/PersistentBottomNavigation';

interface SeasonOption {
  id: string;
  name: string;
  start: Date;
  end: Date;
}

// Генерация сезонов от 2022-2023 до текущего
const generateSeasons = (): SeasonOption[] => {
  const today = new Date();
  const seasons: SeasonOption[] = [];

  // Фиксированный первый сезон: 2022–2023
  const startYear = 2022;
  const currentYear = today.getFullYear();

  // Определяем, в каком сезоне мы сейчас находимся
  // Сезон идёт с 1 июля по 30 июня следующего года
  let currentSeasonStartYear = currentYear;
  if (today.getMonth() < 6) {
    // До июля — текущий сезон начался в прошлом году
    currentSeasonStartYear = currentYear - 1;
  }

  // Генерируем все сезоны от 2022 до текущего включительно
  for (let year = startYear; year <= currentSeasonStartYear; year++) {
    const seasonStart = new Date(year, 6, 1); // 1 июля
    const seasonEnd = new Date(year + 1, 5, 30); // 30 июня

    const actualEnd = seasonEnd > today ? today : seasonEnd;

    seasons.push({
      id: `season_${year}_${year + 1}`,
      name: `Сезон ${year}-${year + 1}`,
      start: seasonStart,
      end: actualEnd,
    });
  }

  // Добавляем "Недавние игры" в начало
  const recentOption: SeasonOption = {
    id: 'recent',
    name: 'Недавние игры',
    start: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000),
    end: today,
  };

  return [recentOption, ...seasons.reverse()]; // Самый свежий сезон — сверху
};

const seasonIcons = ['🏆', '📅', '⏳', '🗓️', '📉', '📊', '⚽', '🔥'];

export default function SeasonsScreen() {
  const router = useRouter();
  const bottomNavigationInset = usePersistentBottomNavigationInset();
  const SEASON_OPTIONS = generateSeasons();

  React.useEffect(() => {
    const preloadRecentGamesDetails = async () => {
      try {
        const recentGames = await getPastGames();
        const gamesToPreload = recentGames.slice(0, 10);
        gamesToPreload.forEach((game) => {
          getGameById(game.id).catch((err) => {
            console.warn(`⚠️ Failed to preload details for game ${game.id}:`, err);
          });
        });
      } catch (error) {
        console.error('❌ Error during recent games preload:', error);
      }
    };
    preloadRecentGamesDetails();
  }, []);

  const handleSeasonPress = (season: SeasonOption) => {
    const startDateString = season.start.toISOString().split('T')[0];
    const endDateString = season.end.toISOString().split('T')[0];

    router.push({
      pathname: '/season/[id]',
      params: {
        id: season.id,
        date_from: startDateString,
        date_to: endDateString,
        seasonName: season.name,
      },
    });
  };

  const handleBackPress = () => {
    router.back();
  };

  return (
    <SafeAreaView edges={['top']} style={commonStyles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
          <Icon name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={commonStyles.title}>Архив матчей</Text>
          <Text style={commonStyles.textSecondary}>Выберите период для просмотра игр</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: bottomNavigationInset }}
        style={styles.seasonsContainer}
        showsVerticalScrollIndicator={false}
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
                <Text style={styles.seasonPeriod}>
                  {season.id === 'recent'
                    ? 'Последний месяц'
                    : `${season.start.getFullYear()}-${season.end.getFullYear()}`}
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

      <View style={{ height: 32 }} />
    </SafeAreaView>
  );
}

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
});
