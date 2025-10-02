// app/test.tsx

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
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Icon from '../components/Icon';
import { colors, commonStyles } from '../styles/commonStyles';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import { getGames } from '../data/gameData'; // Импортируем новую функцию getGames
import { Game } from '../types'; // Импортируем тип Game

const { width } = Dimensions.get('window');

export default function TestScreen() {
  const router = useRouter();
  // --- ИСПРАВЛЕНО: Получаем даты и имя сезона из параметров маршрута ---
  const { date_from, date_to, seasonName } = useLocalSearchParams<{
    date_from: string;
    date_to: string;
    seasonName?: string; // Опционально
  }>();
  // --- КОНЕЦ ИСПРАВЛЕНИЯ ---

  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- ДОБАВЛЕНО: Функция загрузки данных ---
  const loadData = useCallback(async () => {
    // --- ИСПРАВЛЕНО: Проверяем, есть ли даты в параметрах ---
    if (!date_from || !date_to) {
      console.warn('TestScreen: Missing date_from or date_to in route params');
      setError('Не указан диапазон дат для загрузки архива');
      setLoading(false);
      return;
    }
    // --- КОНЕЦ ИСПРАВЛЕНИЯ ---

    try {
      setError(null);
      setLoading(true);
      console.log(`TestScreen: Loading games for date range: ${date_from} to ${date_to}`);

      // --- ИСПРАВЛЕНО: Используем getGames с фильтром по дате и команде ---
      const fetchedGames = await getGames({
        date_from: date_from,
        date_to: date_to,
        teams: '74', // Фильтр по команде с ID 74
      });
      // --- КОНЕЦ ИСПРАВЛЕНИЯ ---

      // Сортируем по дате (новые первые)
      fetchedGames.sort((a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime());

      setGames(fetchedGames);
      console.log(`TestScreen: Loaded ${fetchedGames.length} games for date range: ${date_from} to ${date_to}`);
    } catch (err) {
      console.error('TestScreen: Error loading games:', err);
      setError('Не удалось загрузить архивные игры. Попробуйте еще раз.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [date_from, date_to]); // <-- Зависимости от дат

  useEffect(() => {
    loadData();
  }, [loadData, date_from, date_to]); // <-- Зависимости от дат
  // --- КОНЕЦ ДОБАВЛЕНИЯ ---

  // --- ДОБАВЛЕНО: Функция обновления ---
  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };
  // --- КОНЕЦ ДОБАВЛЕНИЯ ---

  // --- ДОБАВЛЕНО: Функция возврата ---
  const handleBackPress = () => {
    router.back();
  };
  // --- КОНЕЦ ДОБАВЛЕНИЯ ---

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

  // --- ИСПРАВЛЕНО: Обновляем заголовок ---
  const screenTitle = seasonName || 'Архив матчей';
  const screenSubtitle = date_from && date_to ? `${date_from} - ${date_to}` : 'Выбранный период';
  // --- КОНЕЦ ИСПРАВЛЕНИЯ ---

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
          <Text style={commonStyles.textSecondary}>{screenSubtitle}</Text>
          {/* --- КОНЕЦ ИСПРАВЛЕНИЯ --- */}
        </View>
      </View>

      {/* Content */}
      <FlatList
        data={games}
        renderItem={({ item: game }) => (
          <View style={commonStyles.gameCard}>
            {/* Game Card Header */}
            <View style={styles.gameCardHeader}>
              <View style={styles.statusContainer}>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(game.status) }]}>
                  <Text style={styles.statusText}>{getStatusText(game.status)}</Text>
                </View>
                {game.tournament && <Text style={commonStyles.textSecondary}>{game.tournament}</Text>}
              </View>
            </View>

            {/* Game Card Teams */}
            <View style={styles.gameCardTeams}>
              {/* Home Team */}
              <View style={styles.teamContainer}>
                {game.homeTeamLogo ? (
                  <Image source={{ uri: game.homeTeamLogo }} style={styles.teamLogo} />
                ) : (
                  <View style={styles.teamLogoPlaceholder}>
                    <Text style={styles.teamLogoPlaceholderText}>?</Text>
                  </View>
                )}
                <Text style={styles.teamName} numberOfLines={2}>
                  {game.homeTeam?.name || '—'}
                </Text>
                {game.showScore && game.homeScore !== undefined && (
                  <Text style={[styles.score, { color: getScoreColor(game.homeOutcome) }]}>{game.homeScore}</Text>
                )}
                {/* Outcome Badge centered under team name */}
                {game.homeOutcome && (
                  <View style={styles.outcomeBadgeContainer}>
                    <Text style={[styles.outcomeText, { 
                      color: game.homeOutcome === 'win' ? colors.success : 
                             game.homeOutcome === 'loss' ? colors.error : colors.warning 
                    }]}>
                      {getOutcomeText(game.homeOutcome)}
                    </Text>
                  </View>
                )}
              </View>

              {/* VS Section - Aligned with bottom of team names */}
              <View style={styles.vsSection}>
                <Text style={styles.vsText}>VS</Text>
              </View>

              {/* Away Team */}
              <View style={styles.teamContainer}>
                <Text style={styles.teamName} numberOfLines={2}>
                  {game.awayTeam?.name || '—'}
                </Text>
                {game.awayTeamLogo ? (
                  <Image source={{ uri: game.awayTeamLogo }} style={styles.teamLogo} />
                ) : (
                  <View style={styles.teamLogoPlaceholder}>
                    <Text style={styles.teamLogoPlaceholderText}>?</Text>
                  </View>
                )}
                {game.showScore && game.awayScore !== undefined && (
                  <Text style={[styles.score, { color: getScoreColor(game.awayOutcome) }]}>{game.awayScore}</Text>
                )}
                {/* Outcome Badge centered under team name */}
                {game.awayOutcome && (
                  <View style={styles.outcomeBadgeContainer}>
                    <Text style={[styles.outcomeText, { 
                      color: game.awayOutcome === 'win' ? colors.success : 
                             game.awayOutcome === 'loss' ? colors.error : colors.warning 
                    }]}>
                      {getOutcomeText(game.awayOutcome)}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Game Card Footer */}
            <View style={styles.gameCardFooter}>
              <View style={styles.gameInfo}>
                {game.venue && (
                  <Text style={commonStyles.textSecondary} numberOfLines={1}>
                    📍 {game.venue}
                  </Text>
                )}
                <Text style={[commonStyles.textSecondary, styles.leagueText]} numberOfLines={1}>
                  {(!game.league_name || game.league_name.trim() === '') ? '🤝 ' : '🏆 '}{getLeagueDisplayName(game.league_name)}
                </Text>
                {/* Season field removed as requested */}
              </View>
            </View>
          </View>
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

      {/* Bottom spacing */}
      <View style={{ height: 32 }} />
    </SafeAreaView>
  );
}

// --- Вспомогательные функции (скопированы из старого GameCard) ---

const getStatusColor = (status: Game['status']) => {
  switch (status) {
    case 'live':
      return colors.success;
    case 'upcoming':
      return colors.warning;
    case 'finished':
      return colors.textSecondary;
    default:
      return colors.textSecondary;
  }
};

const getStatusText = (status: Game['status']) => {
  switch (status) {
    case 'live':
      return 'LIVE';
    case 'upcoming':
      return 'ПРЕДСТОЯЩАЯ';
    case 'finished':
      return ''; // Убираем "ЗАВЕРШЕНА" бейдж для завершенных игр
    default:
      return '';
  }
};

const getScoreColor = (outcome: string | undefined) => {
  if (outcome === 'win') return colors.success;
  if (outcome === 'loss') return colors.error;
  // if (outcome === 'draw' || outcome === 'nich') return colors.textSecondary; // или другой цвет для ничьей
  return colors.text; // цвет по умолчанию
};

const getOutcomeText = (outcome: string | undefined): string => {
  switch (outcome) {
    case 'win':
      return 'Победа';
    case 'loss':
      return 'Поражение';
    case 'draw':
      return 'Ничья';
    // case 'nich': // Если 'nich' используется вместо 'draw'
    //   return 'Ничья';
    default:
      return outcome || '';
  }
};

const getLeagueDisplayName = (leagueName: string | undefined): string => {
  if (!leagueName || leagueName.trim() === '') {
    return 'Товарищеский матч';
  }
  // Применяем обрезание, как в старом коде, если нужно
  // const parts = leagueName.split(':');
  // if (parts.length > 1) {
  //   const namePart = parts[1].trim();
  //   const words = namePart.split(',')[0].trim();
  //   const firstWord = words.split(' ')[0];
  //   return firstWord;
  // }
  // return leagueName.split(',')[0].trim();
  return leagueName; // Возвращаем как есть, если обрезание не нужно
};

// --- Стили (скопированы из старого GameCard) ---
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
  gameCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
  },
  statusText: {
    color: colors.background,
    fontSize: 12,
    fontWeight: '700',
  },
  gameCardTeams: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  teamContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  teamLogo: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginBottom: 8,
  },
  teamLogoPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.border,
    marginBottom: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  teamLogoPlaceholderText: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  teamName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 8,
    minHeight: 36, // Для выравнивания по высоте
  },
  score: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.primary,
    marginBottom: 4,
  },
  outcomeBadgeContainer: {
    alignItems: 'center',
  },
  outcomeText: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  // VS Section - Positioned to align with bottom of team names
  vsSection: {
    paddingHorizontal: 16,
    justifyContent: 'flex-start',
    paddingTop: 56, // Logo (48px) + margin (8px) = 56px to align with team names
  },
  vsText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  gameCardFooter: {
    marginTop: 8,
  },
  gameInfo: {
    gap: 4,
  },
  leagueText: {
    fontSize: 12,
    fontStyle: 'italic',
  },
});