// app/index.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
} from 'react-native';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import { commonStyles, colors } from '../styles/commonStyles';
import { Game } from '../types';
import {
  getFutureGames,
  getUpcomingGamesMasterData,
  getPastGamesForTeam74,
  subscribeUpcomingGamesUpdates,
} from '../data/gameData';
import GameCard from '../components/GameCard';
import LoadingSpinner from '../components/LoadingSpinner';
import { usePersistentBottomNavigationInset } from '../components/PersistentBottomNavigation';
import { useNetworkStatus } from '../contexts/NetworkStatusContext';
import { useReferenceDataRevision } from '../services/referenceDataUpdates';
import { getLatestNews, type NewsArticle } from '../services/newsService';
import NewsCard from '../components/NewsCard';
import { useStartupFeature } from '../services/startupConfigRuntime';

const headerStyles = StyleSheet.create({
  headerContainer: {
    marginBottom: 24,
    alignItems: 'center',
  },
  teamName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  cityName: {
    fontSize: 14,
    fontWeight: '400',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
});

const warningStyles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF4E5',
    borderColor: colors.warning,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  text: {
    color: colors.text,
    fontSize: 14,
    textAlign: 'center',
  },
  retry: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 8,
  },
});

export default function HomeScreen() {
  const bottomNavigationInset = usePersistentBottomNavigationInset();
  const { isOffline } = useNetworkStatus();
  const homeGamesEnabled = useStartupFeature('home_games');
  const homeNewsEnabled = useStartupFeature('home_news');
  const referenceRevision = useReferenceDataRevision([
    'teams',
    'venues',
    'leagues',
    'seasons',
    'players',
    'tournaments',
  ]);
  const [currentGames, setCurrentGames] = useState<Game[]>([]);
  const [pastGames, setPastGames] = useState<Game[]>([]);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [gamesTab, setGamesTab] = useState(0);
  const [upcomingGames, setUpcomingGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async (force = false, showLoading = true) => {
    void referenceRevision;
    try {
      setError(null);
      if (!force && showLoading) setLoading(true);
      const [allUpcoming, upcoming, teamPastGames, latestNews] = await Promise.all([
        getUpcomingGamesMasterData(force), // ← получаем ВСЕ игры
        getFutureGames(force),
        homeGamesEnabled ? getPastGamesForTeam74(force) : Promise.resolve([]),
        homeNewsEnabled
          ? getLatestNews(force, 3).catch(error => {
            console.warn('[Главный экран] Новости временно недоступны:', error);
            return [];
          })
          : Promise.resolve([]),
      ]);

      // Фильтруем "текущие" игры по тому же критерию, что и в getCurrentGame
      const now = new Date();
      const currentGames = allUpcoming.filter(game => {
        const gameDate = new Date(game.event_date);
        const gameDay = new Date(gameDate.getFullYear(), gameDate.getMonth(), gameDate.getDate());
        const rangeStart = new Date(gameDay);
        rangeStart.setDate(gameDay.getDate() - 1); // 00:00 дня перед игрой
        const rangeEnd = new Date(gameDay);
        rangeEnd.setDate(gameDay.getDate() + 2); // 00:00 через два дня
        rangeEnd.setMilliseconds(-1); // → 23:59:59.999 следующего дня
        return now >= rangeStart && now <= rangeEnd;
      });

      // Завершённые игры прошлых/будущих календарных дней остаются в блоке,
      // пока попадают в его временное окно, но не должны заслонять актуальные
      // игры. Завершённая игра за сегодня сохраняет обычную хронологическую
      // позицию.
      const todayStart = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
      ).getTime();
      const isFinishedOutsideToday = (game: Game) => {
        if (game.status !== 'finished') return false;
        const gameDate = new Date(game.event_date);
        const gameDayStart = new Date(
          gameDate.getFullYear(),
          gameDate.getMonth(),
          gameDate.getDate(),
        ).getTime();
        return gameDayStart !== todayStart;
      };
      currentGames.sort((a, b) => {
        const aDeferred = isFinishedOutsideToday(a);
        const bDeferred = isFinishedOutsideToday(b);
        if (aDeferred !== bDeferred) return aDeferred ? 1 : -1;
        return (
          new Date(a.event_date).getTime() - new Date(b.event_date).getTime()
        );
      });

      setCurrentGames(currentGames);
      setPastGames(teamPastGames
        .filter(game => (
          (String(game.homeTeamId) === '74' || String(game.awayTeamId) === '74')
          && (
            game.status === 'finished'
            || new Date(game.event_date).getTime() + 100 * 60 * 1_000 < Date.now()
          )
        ))
        .sort((a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime())
        .slice(0, 3));
      setNews(latestNews);
      setUpcomingGames(upcoming);
    } catch (err) {
      console.error('Error loading home screen data:', err);
      setError('Не удалось обновить данные с сервера.');
    } finally {
      if (!force) setLoading(false);
      setRefreshing(false);
    }
  }, [homeGamesEnabled, homeNewsEnabled, referenceRevision]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => subscribeUpcomingGamesUpdates(games => {
    console.log(
      `[Главный экран] Получен обновлённый фоновый снимок предстоящих игр: ${games.length}`
    );
    void loadData(false, false);
  }), [loadData]);


  const onRefresh = () => {
    setRefreshing(true);
    loadData(true);
  };

  const warningMessage = isOffline
    ? 'Нет подключения к интернету. Показаны последние сохранённые данные.'
    : error;

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={commonStyles.container}>
        <LoadingSpinner />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={commonStyles.container}>
      <ScrollView
        style={commonStyles.content}
        contentContainerStyle={{ paddingBottom: bottomNavigationInset }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {warningMessage && (
          <View accessibilityRole="alert" style={warningStyles.container}>
            <Text style={warningStyles.text}>{warningMessage}</Text>
            <TouchableOpacity onPress={() => loadData()}>
              <Text style={warningStyles.retry}>Повторить обновление</Text>
            </TouchableOpacity>
          </View>
        )}
        {/* Header */}
        <View style={headerStyles.headerContainer}>
          <View style={headerStyles.headerRow}>
            <Text style={headerStyles.teamName}>ХК Динамо Форвард 2014</Text>
            <Text style={headerStyles.cityName}> • Санкт-Петербург</Text>
          </View>
        </View>

        {homeGamesEnabled && (
          <View style={homeStyles.gamesSection}>
            <SegmentedControl
              values={[`Текущие игры [${currentGames.length}]`, 'Прошедшие игры']}
              selectedIndex={gamesTab}
              onChange={event => setGamesTab(event.nativeEvent.selectedSegmentIndex)}
              tintColor={colors.primary}
              fontStyle={homeStyles.segmentFont}
              activeFontStyle={homeStyles.activeSegmentFont}
            />
            <View style={homeStyles.gameList}>
              {(gamesTab === 0 ? currentGames : pastGames).map(game => (
                <GameCard key={game.id} game={game} showScore />
              ))}
              {(gamesTab === 0 ? currentGames : pastGames).length === 0 && (
                <View style={homeStyles.emptyBlock}>
                  <Text style={homeStyles.emptyText}>
                    {gamesTab === 0 ? 'Сейчас текущих игр нет.' : 'Прошедшие игры не найдены.'}
                  </Text>
                </View>
              )}
              {gamesTab === 1 && (
                <Link href="/team-games" asChild>
                  <TouchableOpacity accessibilityRole="button" style={homeStyles.allGamesButton}>
                    <Text style={homeStyles.allGamesText}>Смотреть все игры</Text>
                  </TouchableOpacity>
                </Link>
              )}
            </View>
          </View>
        )}

        {homeNewsEnabled && (
          <View style={homeStyles.newsSection}>
            <Text style={homeStyles.sectionTitle}>Новости</Text>
            {news.map(article => <NewsCard article={article} key={article.id} />)}
            {news.length === 0 && (
              <View style={homeStyles.emptyBlock}><Text style={homeStyles.emptyText}>Новостей пока нет.</Text></View>
            )}
          </View>
        )}

        {/* Upcoming Games */}
        {upcomingGames.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={commonStyles.subtitle}>Ближайшие игры</Text>
              <Link href="/upcoming" asChild>
                <TouchableOpacity>
                  <Text style={[commonStyles.subtitle, { fontSize: 14 }]}>Все игры</Text>
                </TouchableOpacity>
              </Link>
            </View>
            {upcomingGames.slice(0, 3).map((game) => (
              <GameCard key={game.id} game={game} showScore={false} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const homeStyles = StyleSheet.create({
  gamesSection: { marginBottom: 24 },
  gameList: { marginTop: 14 },
  segmentFont: { fontSize: 13, fontWeight: '600' },
  activeSegmentFont: { color: colors.background, fontWeight: '700' },
  newsSection: { marginBottom: 24 },
  sectionTitle: { color: colors.text, fontSize: 22, fontWeight: '800', marginBottom: 12 },
  emptyBlock: { minHeight: 80, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 16, marginBottom: 12 },
  emptyText: { color: colors.textSecondary, fontSize: 14, textAlign: 'center' },
  allGamesButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: colors.primary, marginTop: 2 },
  allGamesText: { color: colors.primary, fontSize: 15, fontWeight: '700' },
});
