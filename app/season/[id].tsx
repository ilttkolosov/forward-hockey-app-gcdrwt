// app/season/[id].tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  TextInput,
  Modal,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { commonStyles, colors } from '../../styles/commonStyles';
import { getGames } from '../../data/gameData';
import { Game } from '../../types';
import ErrorMessage from '../../components/ErrorMessage';
import Icon from '../../components/Icon';
import LoadingSpinner from '../../components/LoadingSpinner';
import GameCard from '../../components/GameCard'; // ← ЕДИНЫЙ КОМПОНЕНТ

// Русские месяцы для поиска
const RUSSIAN_MONTHS = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'
];

export default function SeasonGamesScreen() {
  const router = useRouter();
  const { id, date_from, date_to, seasonName } = useLocalSearchParams<{
    id: string;
    date_from: string;
    date_to: string;
    seasonName?: string;
  }>();

  const [allGames, setAllGames] = useState<Game[]>([]);
  const [filteredGames, setFilteredGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async (bypassCache = false) => {
    if (!date_from || !date_to) {
      setError('Не указан диапазон дат');
      setLoading(false);
      return;
    }

    // Определяем, это "недавние игры" или конкретный сезон
    const isRecent = id === 'recent';
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const oneYearAgo = new Date(now);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const oneYearAgoStr = oneYearAgo.toISOString().split('T')[0];

    try {
      setError(null);
      setLoading(true);
      if (bypassCache) setRefreshing(true);

      let games: Game[] = [];

      if (isRecent && !bypassCache) {
        // 1. Сначала пытаемся взять из кэша за последний год
        try {
          const yearlyGames = await getGames({
            date_from: oneYearAgoStr,
            date_to: todayStr,
            teams: '74',
            useCache: true,
          });

          // 2. Отфильтровываем только за последний месяц
          const oneMonthAgo = new Date(now);
          oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);
          const monthStartStr = oneMonthAgo.toISOString().split('T')[0];

          games = yearlyGames.filter(game => {
            return game.event_date >= monthStartStr && game.event_date <= todayStr;
          });

          console.log(`✅ [Recent] Found ${games.length} games in yearly cache`);
        } catch (e) {
          console.warn('⚠️ [Recent] No yearly cache, falling back to API');
        }

        // 3. Если в кэше ничего нет — идём в API
        if (games.length === 0) {
          games = await getGames({
            date_from: date_from,
            date_to: date_to,
            teams: '74',
            useCache: false,
          });
        }
      } else {
        // Обычный сезон — работаем как раньше
        games = await getGames({
          date_from,
          date_to,
          teams: '74',
          useCache: !bypassCache,
        });
      }

      // Сортируем по убыванию даты
      games.sort((a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime());
      setAllGames(games);
      setFilteredGames(games);
    } catch (err) {
      console.error('Error loading games:', err);
      setError('Не удалось загрузить игры. Попробуйте позже.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [date_from, date_to]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredGames(allGames);
    } else {
      const q = searchQuery.toLowerCase().trim();
      const filtered = allGames.filter((game) => {
        const home = (game.homeTeam?.name || '').toLowerCase();
        const away = (game.awayTeam?.name || '').toLowerCase();

        if (home.includes(q) || away.includes(q)) return true;

        const gameDate = new Date(game.event_date);
        const monthName = RUSSIAN_MONTHS[gameDate.getMonth()];
        return monthName.includes(q);
      });
      setFilteredGames(filtered);
    }
  }, [searchQuery, allGames]);

  const onRefresh = () => loadData(true);

  const handleBackPress = () => router.back();
  const handleSearchPress = () => setShowSearchModal(true);
  const handleCloseSearch = () => {
    setShowSearchModal(false);
    setSearchQuery('');
  };
  const handleClearSearch = () => setSearchQuery('');

  const renderEmpty = () => (
    <View style={commonStyles.errorContainer}>
      <Text style={commonStyles.text}>
        {searchQuery ? 'Игры не найдены' : 'Нет игр в этом сезоне'}
      </Text>
      <Text style={commonStyles.textSecondary}>
        {searchQuery ? 'Попробуйте изменить запрос' : 'Проверьте позже'}
      </Text>
    </View>
  );

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
        <ErrorMessage message={error} onRetry={() => loadData()} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={commonStyles.container}>
      <View style={commonStyles.content}>
        {/* Header */}
        <View style={styles.headerContainer}>
          <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
            <Icon name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerTextContainer}>
            <Text
              style={commonStyles.title}
              adjustsFontSizeToFit
              numberOfLines={1}
              minimumFontScale={0.8}
            >
              {seasonName || `Сезон ${id}`}
            </Text>
            <Text style={commonStyles.textSecondary}>
              {filteredGames.length} {getGamesCountText(filteredGames.length)}
            </Text>
          </View>
          <TouchableOpacity onPress={handleSearchPress} style={styles.searchButton}>
            <Icon name="search" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* Games List — ЕДИНЫЙ GameCard */}
        <FlatList
          data={filteredGames}
          renderItem={({ item: game }) => (
            <GameCard game={game} showScore={true} />
          )}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={renderEmpty}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
      </View>

      {/* Search Modal */}
      <Modal
        visible={showSearchModal}
        animationType="slide"
        transparent
        onRequestClose={handleCloseSearch}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.searchHeader}>
              <Text style={styles.searchTitle}>Поиск игр</Text>
              <TouchableOpacity onPress={handleCloseSearch} style={styles.closeButton}>
                <Icon name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <View style={styles.searchInputContainer}>
              <Icon name="search" size={20} color={colors.textSecondary} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Поиск по командам или месяцу (например, «октябрь»)..."
                placeholderTextColor={colors.textSecondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={handleClearSearch} style={styles.clearButton}>
                  <Icon name="close" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
            <FlatList
              data={searchQuery ? filteredGames : []}
              renderItem={({ item: game }) => (
                <GameCard game={game} showScore={true} />
              )}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.searchResults}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={searchQuery ? renderEmpty() : null}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const getGamesCountText = (count: number): string => {
  if (count === 1) return 'игра';
  if (count > 1 && count < 5) return 'игры';
  return 'игр';
};

const styles = StyleSheet.create({
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  backButton: {
    marginRight: 16,
    padding: 4,
  },
  headerTextContainer: {
    flex: 1,
  },
  searchButton: {
    padding: 8,
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-start',
  },
  modalContent: {
    backgroundColor: colors.background,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
    maxHeight: '80%',
  },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  searchTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  closeButton: {
    padding: 8,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    height: 48,
    marginBottom: 16,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    paddingVertical: 0,
  },
  clearButton: {
    padding: 4,
    marginLeft: 8,
  },
  searchResults: {
    paddingBottom: 20,
  },
  listContainer: {
    padding: 0, // ← как в archiv.tsx
    paddingBottom: 32,
  },
});