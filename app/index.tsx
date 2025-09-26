
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getCurrentGame, getFutureGames, getUpcomingGamesCount, getPastGamesCount } from '../data/gameData';
import Icon from '../components/Icon';
import { Game, TeamStats } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';
import { commonStyles, colors } from '../styles/commonStyles';
import GameCard from '../components/GameCard';
import ErrorMessage from '../components/ErrorMessage';
import { mockTeamStats } from '../data/mockData';

const quickNavStyles = {
  container: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12,
  },
  item: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center' as const,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
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

export default function HomeScreen() {
  const [currentGame, setCurrentGame] = useState<Game | null>(null);
  const [upcomingGames, setUpcomingGames] = useState<Game[]>([]);
  const [teamStats, setTeamStats] = useState<TeamStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upcomingCount, setUpcomingCount] = useState<number>(0);
  const [pastCount, setPastCount] = useState<number>(0);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setError(null);
      console.log('Загрузка данных главного экрана...');
      
      const [current, upcoming, upcomingCountData, pastCountData] = await Promise.all([
        getCurrentGame(),
        getFutureGames(),
        getUpcomingGamesCount(),
        getPastGamesCount(),
      ]);

      console.log('Текущая игра:', current);
      console.log('Предстоящие игры:', upcoming?.length || 0);
      console.log('Количество предстоящих игр:', upcomingCountData);
      console.log('Количество архивных игр:', pastCountData);

      setCurrentGame(current);
      setUpcomingGames(upcoming || []);
      setUpcomingCount(upcomingCountData);
      setPastCount(pastCountData);
      setTeamStats(mockTeamStats);
    } catch (error) {
      console.error('Ошибка загрузки данных главного экрана:', error);
      setError('Не удалось загрузить данные. Проверьте подключение к интернету.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  if (loading) {
    return (
      <SafeAreaView style={commonStyles.container}>
        <LoadingSpinner text="Загрузка..." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={commonStyles.container}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Заголовок */}
        <View style={commonStyles.header}>
          <Text style={commonStyles.title}>ХК Форвард</Text>
        </View>

        {error && <ErrorMessage message={error} />}

        {/* Текущая игра */}
        {currentGame && (
          <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
            <View style={commonStyles.sectionHeader}>
              <Text style={commonStyles.sectionTitle}>Текущая игра</Text>
            </View>
            <GameCard game={currentGame} showScore={true} />
          </View>
        )}

        {/* Предстоящие игры */}
        {upcomingGames.length > 0 && (
          <View style={{ paddingHorizontal: 16 }}>
            <View style={commonStyles.sectionHeader}>
              <Text style={commonStyles.sectionTitle}>Ближайшие игры</Text>
              <Link href="/upcoming" asChild>
                <TouchableOpacity>
                  <Text style={commonStyles.sectionLink}>Все игры</Text>
                </TouchableOpacity>
              </Link>
            </View>
            {upcomingGames.slice(0, 3).map((game) => (
              <GameCard key={game.id} game={game} />
            ))}
          </View>
        )}

        {/* Статистика команды */}
        {teamStats && (
          <View style={{ paddingHorizontal: 16 }}>
            <View style={commonStyles.sectionHeader}>
              <Text style={commonStyles.sectionTitle}>Статистика сезона</Text>
            </View>
            <View style={commonStyles.card}>
              <View style={[commonStyles.row, commonStyles.spaceBetween, { marginBottom: 8 }]}>
                <Text style={commonStyles.cardText}>Побед</Text>
                <Text style={[commonStyles.cardText, { fontWeight: '600', color: colors.success }]}>
                  {teamStats.wins}
                </Text>
              </View>
              <View style={[commonStyles.row, commonStyles.spaceBetween, { marginBottom: 8 }]}>
                <Text style={commonStyles.cardText}>Поражений</Text>
                <Text style={[commonStyles.cardText, { fontWeight: '600', color: colors.error }]}>
                  {teamStats.losses}
                </Text>
              </View>
              <View style={[commonStyles.row, commonStyles.spaceBetween, { marginBottom: 8 }]}>
                <Text style={commonStyles.cardText}>Ничьих</Text>
                <Text style={[commonStyles.cardText, { fontWeight: '600' }]}>
                  {teamStats.draws}
                </Text>
              </View>
              <View style={commonStyles.divider} />
              <View style={[commonStyles.row, commonStyles.spaceBetween]}>
                <Text style={[commonStyles.cardText, { fontWeight: '600' }]}>Очки</Text>
                <Text style={[commonStyles.cardText, { fontWeight: '600', color: colors.primary }]}>
                  {teamStats.points}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Быстрая навигация */}
        <View style={{ paddingVertical: 16 }}>
          <View style={commonStyles.sectionHeader}>
            <Text style={commonStyles.sectionTitle}>Разделы</Text>
          </View>
          <View style={quickNavStyles.container}>
            <Link href="/players" asChild>
              <TouchableOpacity style={quickNavStyles.item}>
                <Icon name="person" size={24} color={colors.primary} style={quickNavStyles.icon} />
                <Text style={quickNavStyles.title}>Игроки</Text>
                <Text style={quickNavStyles.subtitle}>Состав команды</Text>
              </TouchableOpacity>
            </Link>

            <Link href="/coaches" asChild>
              <TouchableOpacity style={quickNavStyles.item}>
                <Icon name="school" size={24} color={colors.primary} style={quickNavStyles.icon} />
                <Text style={quickNavStyles.title}>Тренеры</Text>
                <Text style={quickNavStyles.subtitle}>Тренерский штаб</Text>
              </TouchableOpacity>
            </Link>

            <Link href="/upcoming" asChild>
              <TouchableOpacity style={quickNavStyles.item}>
                <Icon name="calendar-today" size={24} color={colors.primary} style={quickNavStyles.icon} />
                <Text style={quickNavStyles.title}>Предстоящие игры</Text>
                <Text style={quickNavStyles.subtitle}>
                  {upcomingCount > 0 ? `${upcomingCount} игр` : 'Нет игр'}
                </Text>
              </TouchableOpacity>
            </Link>

            <Link href="/archive" asChild>
              <TouchableOpacity style={quickNavStyles.item}>
                <Icon name="history" size={24} color={colors.primary} style={quickNavStyles.icon} />
                <Text style={quickNavStyles.title}>Архив игр</Text>
                <Text style={quickNavStyles.subtitle}>
                  {pastCount > 0 ? `${pastCount} игр` : 'Нет игр'}
                </Text>
              </TouchableOpacity>
            </Link>

            <Link href="/tournaments" asChild>
              <TouchableOpacity style={quickNavStyles.item}>
                <Icon name="emoji-events" size={24} color={colors.primary} style={quickNavStyles.icon} />
                <Text style={quickNavStyles.title}>Турниры</Text>
                <Text style={quickNavStyles.subtitle}>Соревнования</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
