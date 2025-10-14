// app/tournaments/[id].tsx - ВЕРСИЯ 7: С кэшированием + счётчиками фильтров
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
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

// === НОВЫЕ ИМПОРТЫ ДЛЯ ИГР ===
import { getGames, gameDetailsCache, GAME_DETAILS_CACHE_DURATION } from '../../data/gameData';
import type { Game } from '../../types';

// Импортируем новую функцию
import { fetchTournamentConfig, getCachedTournamentConfig, TournamentConfig } from '../../services/tournamentsApi';
import { apiService } from '../../services/apiService';

// Ключи для AsyncStorage
const TOURNAMENTS_NOW_KEY = 'tournaments_now';
const TOURNAMENTS_PAST_KEY = 'tournaments_past';

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
  content: {
    flex: 1,
  },
  segmentedContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  tabContent: {
    padding: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 16,
  },
  value: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
});

export default function TournamentDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  // Состояния для турнира
  const [tournamentInfo, setTournamentInfo] = useState<any | null>(null);
  const [tournamentConfig, setTournamentConfig] = useState<TournamentConfig | null>(null);
  const [seasonDetails, setSeasonDetails] = useState<any | null>(null);
  const [leagueDetails, setLeagueDetails] = useState<any | null>(null);

  // Состояния для игр
  const [tournamentGames, setTournamentGames] = useState<Game[]>([]);
  const [gamesLoading, setGamesLoading] = useState(false);

  // === НОВОЕ: Счётчики фильтров ===
  const [filterCounts, setFilterCounts] = useState({
    current: 0,
    upcoming: 0,
    past: 0,
  });

  // Общие состояния
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState(0); // 0 — Игры, 1 — Статистика

  // === НОВОЕ: Фильтр игр ===
  const [gameFilter, setGameFilter] = useState<'current' | 'upcoming' | 'past'>('current');

  // === ФУНКЦИЯ ПОДСЧЁТА СЧЁТЧИКОВ ===
  const calculateFilterCounts = useCallback((games: Game[]) => {
    const now = new Date();
    let current = 0, upcoming = 0, past = 0;

    games.forEach(game => {
      const gameDate = new Date(game.event_date);
      // Текущие: ±3 дня
      const threeDaysAgo = new Date(now);
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      const threeDaysAhead = new Date(now);
      threeDaysAhead.setDate(threeDaysAhead.getDate() + 3);

      if (gameDate >= threeDaysAgo && gameDate <= threeDaysAhead) {
        current++;
      }
      if (gameDate >= now) {
        upcoming++;
      }
      if (gameDate < now) {
        past++;
      }
    });

    setFilterCounts({ current, upcoming, past });
  }, []);

  // === ФУНКЦИИ ЗАГРУЗКИ ===
  const loadTournamentInfo = useCallback(async () => {
    if (!id) {
      console.warn('⚠️ [TournamentDetail] ID турнира не указан для loadTournamentInfo');
      return null;
    }
    console.log(`🔍 [TournamentDetail] Загрузка ОСНОВНОЙ ИНФОРМАЦИИ для турнира ID: "${id}"`);
    try {
      const [nowJson, pastJson] = await Promise.all([
        AsyncStorage.getItem(TOURNAMENTS_NOW_KEY),
        AsyncStorage.getItem(TOURNAMENTS_PAST_KEY),
      ]);
      let tournaments: any[] = [];
      if (nowJson) {
        const parsedNow = JSON.parse(nowJson);
        tournaments = tournaments.concat(parsedNow);
      }
      if (pastJson) {
        const parsedPast = JSON.parse(pastJson);
        tournaments = tournaments.concat(parsedPast);
      }
      const found = tournaments.find(t => String(t.tournament_ID) === id);
      return found || null;
    } catch (err) {
      console.error('💥 [TournamentDetail] Ошибка в loadTournamentInfo:', err);
      return null;
    }
  }, [id]);

  const loadTournamentConfig = useCallback(async () => {
    if (!id) {
      console.warn('⚠️ [TournamentDetail] ID турнира не указан для loadTournamentConfig');
      return null;
    }
    console.log(`🔍 [TournamentDetail] Загрузка КОНФИГУРАЦИИ для турнира ID: "${id}"`);
    try {
      let config = await getCachedTournamentConfig(id);
      if (!config) {
        config = await fetchTournamentConfig(id);
      }
      return config || null;
    } catch (err) {
      console.error('💥 [TournamentDetail] Ошибка в loadTournamentConfig:', err);
      return null;
    }
  }, [id]);

  const loadTournamentGames = useCallback(
    async (force = false) => {
      if (!tournamentConfig?.league_id || !tournamentConfig?.season_id) {
        console.warn('⚠️ [TournamentDetail] Невозможно загрузить игры: отсутствуют league_id или season_id');
        setTournamentGames([]);
        calculateFilterCounts([]); // ← сброс счётчиков
        return;
      }

      const leagueIdStr = String(tournamentConfig.league_id);
      const seasonIdStr = String(tournamentConfig.season_id);
      console.log(`🎮 [TournamentDetail] Загрузка игр для league=${leagueIdStr}, season=${seasonIdStr}, force=${force}`);

      setGamesLoading(true);
      try {
        const games = await getGames({
          league: leagueIdStr,
          season: seasonIdStr,
          useCache: !force,
        });
        console.log(`✅ [TournamentDetail] Загружено ${games.length} игр для турнира`);

        // === 🔥 ИСПРАВЛЕНО: импорт + правильная структура кэша ===
        const now = Date.now();
        games.forEach((game) => {
          gameDetailsCache[game.id] = {
            data: game, // ← КЛЮЧЕВОЕ: "data", а не "game"
            timestamp: now,
          };
        });
        console.log(`💾 [TournamentDetail] Все ${games.length} игр сохранены в gameDetailsCache по ID`);

        setTournamentGames(games);
        calculateFilterCounts(games); // ← ОБНОВЛЯЕМ СЧЁТЧИКИ
      } catch (err) {
        console.error('💥 [TournamentDetail] Ошибка загрузки игр:', err);
        setTournamentGames([]);
        calculateFilterCounts([]); // ← сброс при ошибке
      } finally {
        setGamesLoading(false);
      }
    },
    [tournamentConfig, calculateFilterCounts]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      console.log(`🔄 [TournamentDetail] Начало основной загрузки данных для турнира ID: "${id}"`);

      const [info, config] = await Promise.all([
        loadTournamentInfo(),
        loadTournamentConfig(),
      ]);

      if (!info) throw new Error('Основная информация о турнире не найдена');
      if (!config) throw new Error('Конфигурация турнира (league_id, season_id) не найдена');

      setTournamentInfo(info);
      setTournamentConfig(config);

      const seasonDetails = apiService.getSeasonById(String(config.season_id));
      const leagueDetails = apiService.getLeagueById(String(config.league_id));
      setSeasonDetails(seasonDetails);
      setLeagueDetails(leagueDetails);

      console.log(`✅ [TournamentDetail] Основные данные турнира успешно загружены`);
    } catch (err: any) {
      console.error('💥 [TournamentDetail] Ошибка основной загрузки:', err);
      setError(err.message || 'Не удалось загрузить данные турнира');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id, loadTournamentInfo, loadTournamentConfig]);

  useEffect(() => {
    if (activeTab === 0 && tournamentConfig && tournamentGames.length === 0 && !gamesLoading) {
      console.log(`탭 [TournamentDetail] Активна вкладка "Игры" — запускаем загрузку игр`);
      loadTournamentGames();
    }
  }, [activeTab, tournamentConfig, tournamentGames.length, gamesLoading, loadTournamentGames]);

  useEffect(() => {
    if (id) {
      loadData();
    } else {
      setError('ID турнира не указан');
      setLoading(false);
    }
  }, [id, loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
    if (activeTab === 0) {
      loadTournamentGames(true);
    }
  };

  const handleBackPress = () => {
    router.back();
  };

  // === ФИЛЬТРАЦИЯ ИГР ===
  const filteredGames = useMemo(() => {
    const now = new Date();
    return tournamentGames.filter((game) => {
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
  }, [tournamentGames, gameFilter]);

  // === РЕНДЕР ЗАГРУЗКИ / ОШИБКИ ===
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

  // === ПОДГОТОВКА ДАННЫХ ДЛЯ ОТОБРАЖЕНИЯ ===
  const tournamentName = tournamentInfo?.tournament_Name ? String(tournamentInfo.tournament_Name) : 'Турнир не найден';
  const leagueName = tournamentInfo?.league_name ? String(tournamentInfo.league_name) : 'Все игры и статистика';

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
      </View>

      {/* Основные вкладки */}
      <View style={styles.segmentedContainer}>
        <SegmentedControl
          values={['Игры', 'Статистика']}
          selectedIndex={activeTab}
          onChange={(event) => setActiveTab(event.nativeEvent.selectedSegmentIndex)}
          tintColor={colors.primary}
          fontStyle={{ fontSize: 14, fontWeight: '600' }}
          activeFontStyle={{ fontWeight: '700' }}
          springEnabled={false}
        />
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Вкладка "Игры" */}
        {activeTab === 0 && (
          <View style={styles.tabContent}>
            {/* Фильтр игр с счётчиками */}
            <View style={{ marginBottom: 16 }}>
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
                onChange={(event) => {
                  const index = event.nativeEvent.selectedSegmentIndex;
                  setGameFilter(index === 0 ? 'current' : index === 1 ? 'upcoming' : 'past');
                }}
                tintColor={colors.primary}
                fontStyle={{ fontSize: 13, fontWeight: '500' }}
                activeFontStyle={{ fontWeight: '700' }}
                springEnabled={false}
              />
            </View>

            {/* Список игр */}
            {gamesLoading ? (
              <LoadingSpinner />
            ) : filteredGames.length > 0 ? (
              filteredGames.map((game) => (
                <GameCardCompact key={game.id} game={game} showScore={true} />
              ))
            ) : (
              <Text style={[commonStyles.text, { textAlign: 'center', marginTop: 24 }]}>
                {gameFilter === 'current' && 'Нет игр за последние 3 дня и ближайшие 3 дня'}
                {gameFilter === 'upcoming' && 'Нет предстоящих игр'}
                {gameFilter === 'past' && 'Нет прошедших игр'}
              </Text>
            )}
          </View>
        )}

        {/* Вкладка "Статистика" */}
        {activeTab === 1 && (
          <View style={styles.tabContent}>
            <Text style={commonStyles.text}>📊 Вкладка "Статистика" (в разработке)</Text>
          </View>
        )}

        {/* Отступ внизу */}
        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}