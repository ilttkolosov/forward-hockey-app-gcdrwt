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
import { getCurrentGame, getFutureGames, getUpcomingGamesCount, getGameById, getUpcomingGamesMasterData } from '../data/gameData';
import { getPlayers } from '../data/playerData';
import GameCard from '../components/GameCard';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import Icon from '../components/Icon';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDeclension } from './tournaments/index'; // ← импортируем склонение
import { trackScreenView } from '../services/analyticsService'; //импорт аналитики
import { useTrackScreenView } from '../hooks/useTrackScreenView';

const TOURNAMENTS_NOW_KEY = 'tournaments_now';

const quickNavStyles = {
  container: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    justifyContent: 'space-between',
    marginVertical: 24,
  },
  item: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: colors.border,
  },
  icon: {
    marginBottom: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: colors.text,
    textAlign: 'center' as const,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center' as const,
  },
};

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

export default function HomeScreen() {
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

  const loadData = useCallback(async (force = false) => {
    try {
      setError(null);
      if (!force) setLoading(true);
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
      setError('Не удалось загрузить данные. Попробуйте еще раз.');
    } finally {
      if (!force) setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    loadTournamentsCount();
  }, [loadData, loadTournamentsCount]);

  useTrackScreenView('Главный экран');

  const onRefresh = () => {
    setRefreshing(true);
    loadData(true);
    loadTournamentsCount();
  };

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={commonStyles.container}>
        <LoadingSpinner />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView edges={['top']} style={commonStyles.container}>
        <ErrorMessage message={error} onRetry={loadData} />
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

        {/* Quick Navigation — НОВЫЙ ПОРЯДОК */}
        <View style={quickNavStyles.container}>
          {/* Турниры */}
          <Link href="tournaments" asChild>
            <TouchableOpacity style={quickNavStyles.item}>
              <Icon name="trophy" size={24} color={colors.primary} style={quickNavStyles.icon} />
              <Text style={quickNavStyles.title}>Турниры</Text>
              <Text style={quickNavStyles.subtitle}>
                {getDeclension(tournamentsCount, ['текущий', 'текущих', 'текущих'])}
              </Text>
            </TouchableOpacity>
          </Link>

          {/* Архив игр */}
          <Link href="season" asChild>
            <TouchableOpacity style={quickNavStyles.item}>
              <Icon name="archive" size={24} color={colors.primary} style={quickNavStyles.icon} />
              <Text style={quickNavStyles.title}>Архив игр</Text>
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
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginVertical: 24, paddingHorizontal: 32 }}>
          <Link href="/settings" asChild>
            <Text style={[commonStyles.textSecondary, { fontSize: 14 }]}>
              Настройки
            </Text>
          </Link>
          <Text style={[commonStyles.textSecondary, { fontSize: 14, paddingHorizontal: 8 }]}></Text>
          <Link href="/about" asChild>
            <Text style={[commonStyles.textSecondary, { fontSize: 14 }]}>
              О программе
            </Text>
          </Link>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}