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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import { commonStyles, colors } from '../styles/commonStyles';
import { Game } from '../types';
import {
  getFutureGames,
  getUpcomingGamesCount,
  getUpcomingGamesMasterData,
  subscribeUpcomingGamesUpdates,
} from '../data/gameData';
import { getPlayers } from '../data/playerData';
import GameCard from '../components/GameCard';
import LoadingSpinner from '../components/LoadingSpinner';
import Icon from '../components/Icon';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDeclension } from './tournaments/index'; // ← импортируем склонение
import { useNetworkStatus } from '../contexts/NetworkStatusContext';
import { useMessengerAuth } from '../contexts/MessengerAuthContext';
import { useMessengerUnreadCount } from '../services/messengerUnread';
import { useReferenceDataRevision } from '../services/referenceDataUpdates';

const TOURNAMENTS_NOW_KEY = 'tournaments_now';

const quickNavStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginVertical: 24,
  },
  item: {
    position: 'relative',
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  icon: {
    marginBottom: 6,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  unreadBadge: {
    position: 'absolute',
    top: 8,
    right: 10,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  unreadBadgeText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '800',
  },
});

const footerLinkStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 24,
    paddingHorizontal: 16,
  },
  button: {
    width: '46%',
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  text: {
    fontSize: 14,
  },
});

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
  const { isOffline } = useNetworkStatus();
  const { isAuthenticated: isMessengerAuthenticated } = useMessengerAuth();
  const messengerUnreadCount = useMessengerUnreadCount();
  const referenceRevision = useReferenceDataRevision([
    'teams',
    'venues',
    'leagues',
    'seasons',
    'players',
  ]);
  const [currentGames, setCurrentGames] = useState<Game[]>([]);
  const [upcomingGames, setUpcomingGames] = useState<Game[]>([]);
  const [upcomingCount, setUpcomingCount] = useState<number>(0);
  const [playersCount, setPlayersCount] = useState<number>(0);
  const [tournamentsCount, setTournamentsCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadTournamentsCount = useCallback(async () => {
    try {
      const json = await AsyncStorage.getItem(TOURNAMENTS_NOW_KEY);
      const list = json ? JSON.parse(json) : [];
      setTournamentsCount(list.length);
    } catch (err) {
      console.warn('Failed to load tournaments count');
      setTournamentsCount(0);
    }
  }, []);

  const loadData = useCallback(async (force = false, showLoading = true) => {
    void referenceRevision;
    try {
      setError(null);
      if (!force && showLoading) setLoading(true);
      const [allUpcoming, upcoming, upcomingCount, players] = await Promise.all([
        getUpcomingGamesMasterData(force), // ← получаем ВСЕ игры
        getFutureGames(force),
        getUpcomingGamesCount(),
        getPlayers(),
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

      // Сортируем по времени (возрастание)
      currentGames.sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime());

      setCurrentGames(currentGames);
      setUpcomingGames(upcoming);
      setUpcomingCount(upcomingCount);
      setPlayersCount(players.length);
    } catch (err) {
      console.error('Error loading home screen data:', err);
      setError('Не удалось обновить данные с сервера.');
    } finally {
      if (!force) setLoading(false);
      setRefreshing(false);
    }
  }, [referenceRevision]);

  useEffect(() => {
    loadData();
    loadTournamentsCount();
  }, [loadData, loadTournamentsCount]);

  useEffect(() => subscribeUpcomingGamesUpdates(games => {
    console.log(
      `[Главный экран] Получен обновлённый фоновый снимок предстоящих игр: ${games.length}`
    );
    void loadData(false, false);
  }), [loadData]);


  const onRefresh = () => {
    setRefreshing(true);
    loadData(true);
    loadTournamentsCount();
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
        contentContainerStyle={{ paddingBottom: 32 }} // ← отступ снизу внутри ScrollView
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

        {/* Current Game */}
        {currentGames.length > 0 && (
          <View style={{ marginBottom: 0 }}>
            <Text style={[commonStyles.subtitle, { marginBottom: 12 }]}>
              {currentGames.length === 1 ? 'Текущая игра' : 'Текущие игры'}
            </Text>
            {currentGames.map((game) => (
              <GameCard key={game.id} game={game} showScore={true} />
            ))}
          </View>
        )}

        {/* Quick Navigation */}
        <View style={quickNavStyles.container}>
          {/* Тренировки */}
          <Link href="/trainings" asChild>
            <TouchableOpacity style={quickNavStyles.item}>
              <Icon name="calendar" size={24} color={colors.primary} style={quickNavStyles.icon} />
              <Text style={quickNavStyles.title}>Тренировки</Text>
              <Text style={quickNavStyles.subtitle}>Недельное расписание</Text>
            </TouchableOpacity>
          </Link>

          {/* Общение */}
          <Link
            href={isMessengerAuthenticated ? "/messenger/rooms" : "/messenger/register"}
            asChild
          >
            <TouchableOpacity style={quickNavStyles.item}>
              {isMessengerAuthenticated && messengerUnreadCount > 0 && (
                <View style={quickNavStyles.unreadBadge}>
                  <Text style={quickNavStyles.unreadBadgeText}>
                    {messengerUnreadCount > 99 ? '99+' : messengerUnreadCount}
                  </Text>
                </View>
              )}
              <Icon name="chatbubbles" size={24} color={colors.primary} style={quickNavStyles.icon} />
              <Text style={quickNavStyles.title}>Общение</Text>
              <Text style={quickNavStyles.subtitle}>
                {isMessengerAuthenticated ? 'Чаты команды' : 'Вход по приглашению'}
              </Text>
            </TouchableOpacity>
          </Link>

          {/* Турниры */}
          <Link href="/tournaments" asChild>
            <TouchableOpacity style={quickNavStyles.item}>
              <Icon name="trophy" size={24} color={colors.primary} style={quickNavStyles.icon} />
              <Text style={quickNavStyles.title}>Турниры</Text>
              <Text style={quickNavStyles.subtitle}>
                {getDeclension(tournamentsCount, ['текущий', 'текущих', 'текущих'])}
              </Text>
            </TouchableOpacity>
          </Link>

          {/* Архив матчей */}
          <Link href="/season" asChild>
            <TouchableOpacity style={quickNavStyles.item}>
              <Icon name="archive" size={24} color={colors.primary} style={quickNavStyles.icon} />
              <Text style={quickNavStyles.title}>Архив матчей</Text>
              <Text style={quickNavStyles.subtitle}>История матчей</Text>
            </TouchableOpacity>
          </Link>

          {/* Мобильные игры */}
          <Link href="/mobilegames" asChild>
            <TouchableOpacity style={quickNavStyles.item}>
              <Icon name="game-controller" size={24} color={colors.primary} style={quickNavStyles.icon} />
              <Text style={quickNavStyles.title}>Мобильные игры</Text>
            </TouchableOpacity>
          </Link>

          {/* Игроки */}
          <Link href="/players" asChild>
            <TouchableOpacity style={quickNavStyles.item}>
              <Icon name="people" size={24} color={colors.primary} style={quickNavStyles.icon} />
              <Text style={quickNavStyles.title}>Игроки</Text>
              <Text style={quickNavStyles.subtitle}>
                {playersCount > 0 ? `${playersCount} игроков` : 'Состав команды'}
              </Text>
            </TouchableOpacity>
          </Link>
        </View>

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
        {/* Ссылки "Настройки" и "О программе" в одной строке */}
        <View style={footerLinkStyles.row}>
          <Link href="/settings" asChild>
            <TouchableOpacity
              style={footerLinkStyles.button}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Открыть настройки"
            >
              <Text style={[commonStyles.textSecondary, footerLinkStyles.text]}>
                Настройки
              </Text>
            </TouchableOpacity>
          </Link>
          <Link href="/about" asChild>
            <TouchableOpacity
              style={footerLinkStyles.button}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Открыть информацию о программе"
            >
              <Text style={[commonStyles.textSecondary, footerLinkStyles.text]}>
                О программе
              </Text>
            </TouchableOpacity>
          </Link>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
