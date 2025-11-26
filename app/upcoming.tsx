// app/upcoming.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  Modal,
  TextInput,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import { commonStyles, colors } from '../styles/commonStyles';
import GameCard from '../components/GameCard';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import { Game } from '../types';
import {
  getUpcomingGamesMasterData,
  getPastGamesForTeam74,
} from '../data/gameData';
import Icon from '../components/Icon';
import { useRouter } from 'expo-router';
import { searchGames } from '../utils/gameSearch';
import { RefreshControl } from 'react-native';

export default function TeamGamesScreen() {
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');
  const [upcomingGames, setUpcomingGames] = useState<Game[]>([]);
  const [pastGames, setPastGames] = useState<Game[]>([]);
  const [allGames, setAllGames] = useState<Game[]>([]);
  const [upcomingCount, setUpcomingCount] = useState(0);
  const [pastCount, setPastCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const router = useRouter();
  const upcomingListRef = useRef<FlatList<Game>>(null);
  const pastListRef = useRef<FlatList<Game>>(null);

  const handleBackPress = () => {
    router.back();
  };

  const loadUpcoming = async () => {
    try {
      const games = await getUpcomingGamesMasterData();
      setUpcomingGames(games);
      return games;
    } catch (err) {
      console.error('Error loading upcoming games:', err);
      setError('Не удалось загрузить предстоящие игры.');
      return [];
    }
  };

  const loadPast = async () => {
    try {
      const games = await getPastGamesForTeam74();
      setPastGames(games);
      return games;
    } catch (err) {
      console.error('Error loading past games:', err);
      setError('Не удалось загрузить прошедшие игры.');
      return [];
    }
  };

  const loadData = async () => {
    setError(null);
    try {
      const [upcoming, past] = await Promise.all([loadUpcoming(), loadPast()]);
      const all = [...upcoming, ...past];
      setAllGames(all);
      setUpcomingCount(upcoming.length);
      setPastCount(past.length);
    } catch (err) {
      // Ошибки уже обработаны в loadUpcoming/loadPast
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

  const handleTabChange = (index: number) => {
    const newTab = index === 0 ? 'upcoming' : 'past';
    setActiveTab(newTab);
    if (newTab === 'upcoming' && upcomingListRef.current) {
      upcomingListRef.current.scrollToOffset({ offset: 0, animated: true });
    } else if (newTab === 'past' && pastListRef.current) {
      pastListRef.current.scrollToOffset({ offset: 0, animated: true });
    }
  };

  const renderGame = ({ item }: { item: Game }) => (
    <GameCard game={item} showScore={activeTab === 'past' || item.is_past} />
  );

  const renderEmpty = () => (
    <View style={commonStyles.errorContainer}>
      <Text style={commonStyles.text}>
        {activeTab === 'upcoming' ? 'Нет предстоящих игр' : 'Нет прошедших игр'}
      </Text>
    </View>
  );

  // === ПОИСК ===
  const handleSearchPress = () => {
    setShowSearchModal(true);
  };

  const handleCloseSearch = () => {
    setShowSearchModal(false);
    setSearchQuery('');
  };

  const handleClearSearch = () => {
    setSearchQuery('');
  };

  // Фильтрация по мере ввода, как в season/[id].tsx
  const [filteredSearchResults, setFilteredSearchResults] = useState<Game[]>([]);
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredSearchResults([]);
    } else {
      const q = searchQuery.toLowerCase().trim();
      const filtered = allGames.filter((game) => {
        const home = (game.homeTeam?.name || '').toLowerCase();
        const away = (game.awayTeam?.name || '').toLowerCase();
        if (home.includes(q) || away.includes(q)) return true;
        const gameDate = new Date(game.event_date);
        const monthName = [
          'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
          'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'
        ][gameDate.getMonth()];
        return monthName.includes(q);
      });
      setFilteredSearchResults(filtered);
    }
  }, [searchQuery, allGames]);

  const renderSearchEmpty = () => (
    <View style={commonStyles.errorContainer}>
      <Text style={commonStyles.text}>Игры не найдены</Text>
      <Text style={commonStyles.textSecondary}>Попробуйте изменить запрос</Text>
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
        <ErrorMessage message={error} onRetry={loadData} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={commonStyles.container}>
      {/* Fixed Header */}
      <View style={{ paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center' }}>
        <TouchableOpacity onPress={handleBackPress} style={{ marginRight: 16 }}>
          <Icon name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Все игры Динамо-Форвард</Text>
        <TouchableOpacity onPress={handleSearchPress} style={{ marginLeft: 'auto', padding: 8 }}>
          <Icon name="search" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Segmented Control */}
      <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
        <SegmentedControl
          values={[`Предстоящие (${upcomingCount})`, `Прошедшие (${pastCount})`]}
          selectedIndex={activeTab === 'upcoming' ? 0 : 1}
          onChange={(event) => handleTabChange(event.nativeEvent.selectedSegmentIndex)}
          tintColor={colors.primary}
          fontStyle={{ fontSize: 14, fontWeight: '600' }}
          activeFontStyle={{ fontWeight: '700' }}
          springEnabled={false}
        />
      </View>

      {/* Scrollable Content */}
      {activeTab === 'upcoming' ? (
        <FlatList
          ref={upcomingListRef}
          data={upcomingGames}
          renderItem={renderGame}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 64 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={renderEmpty()}
        />
      ) : (
        <FlatList
          ref={pastListRef}
          data={pastGames}
          renderItem={renderGame}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 64 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={renderEmpty()}
        />
      )}

      {/* === МОДАЛЬНОЕ ОКНО ПОИСКА (идентично season/[id].tsx) === */}
      <Modal
        visible={showSearchModal}
        animationType="slide"
        transparent
        onRequestClose={handleCloseSearch}
      >
        <View style={modalStyles.modalOverlay}>
          <View style={modalStyles.modalContent}>
            <View style={modalStyles.searchHeader}>
              <Text style={modalStyles.searchTitle}>Поиск игр</Text>
              <TouchableOpacity onPress={handleCloseSearch} style={modalStyles.closeButton}>
                <Icon name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <View style={modalStyles.searchInputContainer}>
              <Icon name="search" size={20} color={colors.textSecondary} style={modalStyles.searchIcon} />
              <TextInput
                style={modalStyles.searchInput}
                placeholder="Поиск по командам или месяцу (например, «октябрь»)..."
                placeholderTextColor={colors.textSecondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={handleClearSearch} style={modalStyles.clearButton}>
                  <Icon name="close" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
            <FlatList
              data={searchQuery ? filteredSearchResults : []}
              renderItem={({ item: game }) => (
                <TouchableOpacity
                  onPress={() => {
                    handleCloseSearch();
                    router.push(`/game/${game.id}`);
                  }}
                  style={{ paddingVertical: 4 }}
                >
                  <GameCard game={game} showScore={true} />
                </TouchableOpacity>
              )}
              keyExtractor={(item) => item.id}
              contentContainerStyle={modalStyles.searchResults}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={searchQuery ? renderSearchEmpty() : null}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screenTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
    textAlign: 'center',
  },
});

// Стили модального окна поиска — в точности как в season/[id].tsx
const modalStyles = StyleSheet.create({
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
});