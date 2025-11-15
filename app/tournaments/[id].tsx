// app/tournaments/[id].tsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors, commonStyles } from '../../styles/commonStyles';
import Icon from '../../components/Icon';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import GameCardCompact from '../../components/GameCardCompact';
import { getGames, gameDetailsCache } from '../../data/gameData';
import type { Game } from '../../types';
import {
  fetchTournamentConfig,
  getCachedTournamentConfig,
  TournamentConfig,
  fetchTournamentTable,
  getCachedTournamentTable,
} from '../../services/tournamentsApi';
import { loadTeamLogo } from '../../services/teamStorage';
import CommandCard from '../../components/CommandCard';
import { trackScreenView } from '../../services/analyticsService';
import { useTrackScreenView } from '../../hooks/useTrackScreenView';

const TOURNAMENTS_NOW_KEY = 'tournaments_now';
const TOURNAMENTS_PAST_KEY = 'tournaments_past';

// Русские месяцы для поиска
const RUSSIAN_MONTHS = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'
];

interface TournamentTableRowWithLogo {
  team_id: string;
  position: string;
  team_name: string;
  games: string;
  wins: string;
  losses: string;
  draws: string;
  overtime_wins: string;
  overtime_losses: string;
  points_2x: string;
  pkpercent: string;
  logo_uri: string | null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
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
    padding: 8,
  },
  headerTitle: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  searchButton: {
    padding: 8,
    marginLeft: 8,
  },
  content: {
    flex: 1,
  },
  segmentedContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  tabContent: {
    flex: 1,
  },
  filtersContainer: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  gamesListContainer: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-start',
  },
  modalContent: {
    backgroundColor: colors.background,
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 16,
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
    marginHorizontal: 16,
    marginBottom: 16,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
  },
  clearButton: {
    padding: 4,
    marginLeft: 8,
  },
});

export default function TournamentDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  // Состояния
  const [tournamentInfo, setTournamentInfo] = useState<any | null>(null);
  const [tournamentConfig, setTournamentConfig] = useState<TournamentConfig | null>(null);
  const [isPastTournament, setIsPastTournament] = useState<boolean | null>(null);
  const [tournamentGames, setTournamentGames] = useState<Game[]>([]);
  const [gamesLoading, setGamesLoading] = useState(false);
  const [filterCounts, setFilterCounts] = useState({ current: 0, upcoming: 0, past: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [gameFilter, setGameFilter] = useState<'current' | 'upcoming' | 'past'>('current');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchModal, setShowSearchModal] = useState(false);
 
  // === СТАТИСТИКА ===
  const [tournamentTable, setTournamentTable] = useState<TournamentTableRowWithLogo[] | null>(null);
  const [tableLoading, setTableLoading] = useState(false);

  // Ref для прокрутки
  const scrollViewRef = useRef<ScrollView>(null);

  // Подсчёт фильтров
  const calculateFilterCounts = useCallback((games: Game[]) => {
    const now = new Date();
    let current = 0, upcoming = 0, past = 0;
    games.forEach(game => {
      const gameDate = new Date(game.event_date);
      const threeDaysAgo = new Date(now);
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      const threeDaysAhead = new Date(now);
      threeDaysAhead.setDate(threeDaysAhead.getDate() + 3);
      if (gameDate >= threeDaysAgo && gameDate <= threeDaysAhead) current++;
      if (gameDate >= now) upcoming++;
      if (gameDate < now) past++;
    });
    setFilterCounts({ current, upcoming, past });
  }, []);

  // Загрузка данных турнира
  const loadTournamentInfo = useCallback(async () => {
    if (!id) return null;
    try {
      const [nowJson, pastJson] = await Promise.all([
        AsyncStorage.getItem(TOURNAMENTS_NOW_KEY),
        AsyncStorage.getItem(TOURNAMENTS_PAST_KEY),
      ]);
      const nowTournaments = nowJson ? JSON.parse(nowJson) : [];
      const pastTournaments = pastJson ? JSON.parse(pastJson) : [];
      const isPast = pastTournaments.some((t: any) => String(t.tournament_ID) === id);
      setIsPastTournament(isPast);
      const allTournaments = [...nowTournaments, ...pastTournaments];
      return allTournaments.find((t: any) => String(t.tournament_ID) === id) || null;
    } catch (err) {
      console.error('💥 [TournamentDetail] Ошибка загрузки info:', err);
      return null;
    }
  }, [id]);

  const loadTournamentConfig = useCallback(async () => {
    if (!id) return null;
    try {
      let config = await getCachedTournamentConfig(id);
      if (!config) config = await fetchTournamentConfig(id);
      return config || null;
    } catch (err) {
      console.error('💥 [TournamentDetail] Ошибка загрузки config:', err);
      return null;
    }
  }, [id]);

  const loadTournamentGames = useCallback(async (force = false) => {
    if (!tournamentConfig?.league_id || !tournamentConfig?.season_id) {
      setTournamentGames([]);
      calculateFilterCounts([]);
      return;
    }
    const leagueIdStr = String(tournamentConfig.league_id);
    const seasonIdStr = String(tournamentConfig.season_id);
    setGamesLoading(true);
    try {
      const games = await getGames({
        league: leagueIdStr,
        season: seasonIdStr,
        useCache: !force,
      });
      const now = Date.now();
      games.forEach(game => {
        gameDetailsCache[game.id] = { data: game, timestamp: now };
      });
      setTournamentGames(games);
      calculateFilterCounts(games);
    } catch (err) {
      console.error('💥 [TournamentDetail] Ошибка загрузки игр:', err);
      setTournamentGames([]);
      calculateFilterCounts([]);
    } finally {
      setGamesLoading(false);
    }
  }, [tournamentConfig, calculateFilterCounts]);

  const loadTournamentTable = useCallback(async (force = false) => {
    if (!id) return;
    setTableLoading(true);
    try {
      let table = null;
      if (!force) {
        table = await getCachedTournamentTable(id);
      }
      if (!table || force) {
        console.log(`[TournamentDetail] Кэш пуст или force=true → запрашиваем API для турнира ${id}`);
        table = await fetchTournamentTable(id);
      }

      console.log(`[TournamentDetail] Получена таблица для турнира ${id}. Длина: ${table.length}`);
      if (table.length > 0) {
        //console.log(`[TournamentDetail] Пример первой строки:`, table[0]);
      }

      const tableWithLogos = await Promise.all(
        table.map(async (row: any) => {
          const logo_uri = await loadTeamLogo(row.team_id.toString()).catch(() => null);
          return { ...row, logo_uri };
        })
      );

      setTournamentTable(tableWithLogos);
    } catch (err) {
      console.error(`💥 [TournamentDetail] Ошибка загрузки турнирной таблицы ${id}:`, err);
      setTournamentTable([]);
    } finally {
      setTableLoading(false);
    }
  }, [id]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [info, config] = await Promise.all([
        loadTournamentInfo(),
        loadTournamentConfig(),
      ]);
      if (!info) throw new Error('Турнир не найден');
      if (!config) throw new Error('Конфигурация турнира не найдена');
      setTournamentInfo(info);
      setTournamentConfig(config);
    } catch (err: any) {
      setError(err.message || 'Не удалось загрузить данные турнира');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadTournamentInfo, loadTournamentConfig]);

  // Загружаем игры при открытии вкладки "Игры"
  useEffect(() => {
    if (activeTab === 0 && tournamentConfig && tournamentGames.length === 0 && !gamesLoading) {
      loadTournamentGames();
    }
  }, [activeTab, tournamentConfig, tournamentGames.length, gamesLoading, loadTournamentGames]);

  // Загружаем таблицу при открытии вкладки "Статистика"
  useEffect(() => {
    if (activeTab === 1 && tournamentTable === null && !tableLoading) {
      loadTournamentTable();
    }
  }, [activeTab, tournamentTable, tableLoading, loadTournamentTable]);

  useEffect(() => {
    if (id) {
      loadData();
    } else {
      setError('ID турнира не указан');
      setLoading(false);
    }
  }, [id, loadData]);

/*   // === Аналитика: отслеживание просмотра экрана турнира ===
  useTrackScreenView('Экран турнира с ID', {
    tournament_id: id,
    //tournament_name: tournamentName || 'unknown',
  });
 */

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
    if (activeTab === 0) {
      loadTournamentGames(true);
    }
    if (activeTab === 1) {
      loadTournamentTable(true);
    }
  };

  const handleBackPress = () => router.back();

  // === ПОИСК И ФИЛЬТРАЦИЯ ===
  const filteredGames = useMemo(() => {
    let result: Game[] = [];
    if (isPastTournament) {
      result = [...tournamentGames].sort((a, b) =>
        new Date(b.event_date).getTime() - new Date(a.event_date).getTime()
      );
    } else {
      const now = new Date();
      result = tournamentGames.filter(game => {
        const gameDate = new Date(game.event_date);
        switch (gameFilter) {
          case 'current':
            const threeDaysAgo = new Date(now);
            threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
            const threeDaysAhead = new Date(now);
            threeDaysAhead.setDate(threeDaysAhead.getDate() + 3);
            return gameDate >= threeDaysAgo && gameDate <= threeDaysAhead;
          case 'upcoming':
            return gameDate >= now;
          case 'past':
            return gameDate < now;
          default:
            return true;
        }
      });
      if (gameFilter === 'past') {
        result = result.sort((a, b) =>
          new Date(b.event_date).getTime() - new Date(a.event_date).getTime()
        );
      }
    }
    if (searchQuery.trim().length >= 2) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(game => {
        const home = (game.homeTeam?.name || '').toLowerCase();
        const away = (game.awayTeam?.name || '').toLowerCase();
        if (home.includes(q) || away.includes(q)) return true;
        const gameDate = new Date(game.event_date);
        const day = String(gameDate.getDate());
        const monthName = RUSSIAN_MONTHS[gameDate.getMonth()];
        return day.includes(q) || monthName.includes(q);
      });
    }
    return result;
  }, [tournamentGames, gameFilter, searchQuery, isPastTournament]);

  const handleFilterChange = (index: number) => {
    const filter = index === 0 ? 'current' : index === 1 ? 'upcoming' : 'past';
    setGameFilter(filter);
    setSearchQuery('');
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  };

  const handleSearchPress = () => setShowSearchModal(true);
  const handleCloseSearch = () => {
    setShowSearchModal(false);
    setSearchQuery('');
  };
  const handleClearSearch = () => setSearchQuery('');

  // --- Рендер ---
  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <LoadingSpinner />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <ErrorMessage message={error} onRetry={loadData} />
      </SafeAreaView>
    );
  }

  const tournamentName = tournamentInfo?.tournament_Name || 'Турнир не найден';
  const leagueName = tournamentInfo?.league_name || 'Все игры и статистика';


  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBackPress}>
          <Icon name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitle}>
          <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
            {tournamentName}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1} ellipsizeMode="tail">
            {leagueName}
          </Text>
        </View>
        <TouchableOpacity onPress={handleSearchPress} style={styles.searchButton}>
          <Icon name="search" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Основные вкладки */}
      <View style={styles.segmentedContainer}>
        <SegmentedControl
          values={['Игры', 'Статистика']}
          selectedIndex={activeTab}
          onChange={(e) => setActiveTab(e.nativeEvent.selectedSegmentIndex)}
          tintColor={colors.primary}
          fontStyle={{ fontSize: 14, fontWeight: '600' }}
          activeFontStyle={{ fontWeight: '700' }}
          springEnabled={false}
        />
      </View>

      {/* Содержимое вкладок */}
      {activeTab === 0 ? (
        <View style={styles.tabContent}>
          {isPastTournament === false && (
            <View style={styles.filtersContainer}>
              <SegmentedControl
                values={[
                  `Текущие (${filterCounts.current})`,
                  `Будущие (${filterCounts.upcoming})`,
                  `Прошедшие (${filterCounts.past})`,
                ]}
                selectedIndex={
                  gameFilter === 'current' ? 0 :
                  gameFilter === 'upcoming' ? 1 : 2
                }
                onChange={(e) => handleFilterChange(e.nativeEvent.selectedSegmentIndex)}
                tintColor={colors.primary}
                fontStyle={{ fontSize: 13, fontWeight: '500' }}
                activeFontStyle={{ fontWeight: '700' }}
                springEnabled={false}
              />
            </View>
          )}
          <ScrollView
            ref={scrollViewRef}
            style={styles.content}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.gamesListContainer}>
              {gamesLoading ? (
                <LoadingSpinner />
              ) : filteredGames.length > 0 ? (
                filteredGames.map(game => (
                  <GameCardCompact key={game.id} game={game} showScore={true} />
                ))
              ) : (
                <Text style={[commonStyles.text, { textAlign: 'center', marginTop: 24 }]}>
                  {searchQuery
                    ? 'Игры не найдены'
                    : isPastTournament
                      ? 'Нет игр в этом турнире'
                      : gameFilter === 'current' ? 'Нет игр за последние 3 дня и ближайшие 3 дня'
                      : gameFilter === 'upcoming' ? 'Нет предстоящих игр'
                      : 'Нет прошедших игр'}
                </Text>
              )}
            </View>
          </ScrollView>
        </View>
      ) : (
        <ScrollView
          style={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ padding: 16 }}>
            {tableLoading ? (
              <LoadingSpinner />
            ) : tournamentTable && tournamentTable.length > 0 ? (
              tournamentTable.map((row) => (
                <CommandCard
                  key={row.team_id}
                  teamId={row.team_id}
                  teamName={row.team_name}
                  logoUri={row.logo_uri}
                  position={row.position}
                  games={row.games}
                  wins={row.wins}
                  losses={row.losses}
                  draws={row.draws}
                  overtime_wins={row.overtime_wins}
                  overtime_losses={row.overtime_losses}
                  points_2x={row.points_2x}
                  goals_for={row.goals_for}
                  goals_against={row.goals_against}
                  goal_diff={row.goal_diff}
                  ppg_percent={row.ppg_percent}
                  pkpercent={row.penalty_kill_percent}
                  tournamentId={id}
                />
              ))
            ) : (
              <Text style={[commonStyles.text, { textAlign: 'center' }]}>
                Нет данных по статистике
              </Text>
            )}
          </View>
        </ScrollView>
      )}

      {/* Модальное окно поиска */}
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
                placeholder="Поиск по командам или дате (от 2 символов)..."
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
            <ScrollView>
              {searchQuery.length >= 2 ? (
                filteredGames.length > 0 ? (
                  filteredGames.map(game => (
                    <GameCardCompact
                      key={game.id}
                      game={game}
                      showScore={true}
                      onPress={() => {
                        router.push(`/game/${game.id}`);
                        setShowSearchModal(false);
                      }}
                    />
                  ))
                ) : (
                  <View style={{ padding: 16 }}>
                    <Text style={[commonStyles.text, { textAlign: 'center' }]}>
                      Игры не найдены
                    </Text>
                  </View>
                )
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}