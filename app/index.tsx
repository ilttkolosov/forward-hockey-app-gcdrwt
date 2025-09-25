
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import { getCurrentGame, getFutureGames } from '../data/gameData';
import Icon from '../components/Icon';
import { Game, TeamStats } from '../types';
import GameCard from '../components/GameCard';
import { mockTeamStats } from '../data/mockData';
import { commonStyles, colors } from '../styles/commonStyles';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';

const quickNavStyles = {
  container: {
    flexDirection: 'row' as const,
    justifyContent: 'space-around' as const,
    paddingVertical: 20,
    paddingHorizontal: 16,
    backgroundColor: colors.surface,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  item: {
    alignItems: 'center' as const,
    flex: 1,
  },
  text: {
    marginTop: 8,
    fontSize: 12,
    color: colors.text,
    textAlign: 'center' as const,
  },
};

const HomeScreen: React.FC = () => {
  const [currentGame, setCurrentGame] = useState<Game | null>(null);
  const [upcomingGames, setUpcomingGames] = useState<Game[]>([]);
  const [teamStats] = useState<TeamStats>(mockTeamStats);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setError(null);
      console.log('Loading home screen data...');
      
      const [current, upcoming] = await Promise.all([
        getCurrentGame(),
        getFutureGames()
      ]);

      setCurrentGame(current);
      setUpcomingGames(upcoming.slice(0, 3)); // Show only first 3 upcoming games
      console.log('Home screen data loaded successfully');
    } catch (err) {
      console.error('Error loading home screen data:', err);
      setError('Ошибка загрузки данных. Проверьте подключение к интернету.');
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
        <LoadingSpinner />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={commonStyles.container}>
      <ScrollView
        style={commonStyles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={commonStyles.header}>
          <Text style={commonStyles.title}>ХК Форвард</Text>
          <Text style={commonStyles.subtitle}>Официальное приложение</Text>
        </View>

        {error && <ErrorMessage message={error} />}

        {/* Team Stats */}
        <View style={[commonStyles.card, { marginHorizontal: 16, marginVertical: 8 }]}>
          <Text style={commonStyles.cardTitle}>Статистика сезона</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 24, fontWeight: 'bold', color: colors.primary }}>
                {teamStats.wins}
              </Text>
              <Text style={{ fontSize: 12, color: colors.textSecondary }}>Победы</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 24, fontWeight: 'bold', color: colors.error }}>
                {teamStats.losses}
              </Text>
              <Text style={{ fontSize: 12, color: colors.textSecondary }}>Поражения</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 24, fontWeight: 'bold', color: colors.warning }}>
                {teamStats.draws}
              </Text>
              <Text style={{ fontSize: 12, color: colors.textSecondary }}>Ничьи</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 24, fontWeight: 'bold', color: colors.text }}>
                {teamStats.points}
              </Text>
              <Text style={{ fontSize: 12, color: colors.textSecondary }}>Очки</Text>
            </View>
          </View>
        </View>

        {/* Current Game */}
        {currentGame && (
          <View>
            <View style={commonStyles.sectionHeader}>
              <Text style={commonStyles.sectionTitle}>Текущая игра</Text>
            </View>
            <GameCard game={currentGame} showScore={true} />
          </View>
        )}

        {/* Quick Navigation */}
        <View style={quickNavStyles.container}>
          <Link href="/upcoming" asChild>
            <TouchableOpacity style={quickNavStyles.item}>
              <Icon name="calendar" size={24} color={colors.primary} />
              <Text style={quickNavStyles.text}>Предстоящие игры</Text>
            </TouchableOpacity>
          </Link>
          
          <Link href="/archive" asChild>
            <TouchableOpacity style={quickNavStyles.item}>
              <Icon name="archive" size={24} color={colors.primary} />
              <Text style={quickNavStyles.text}>Архив игр</Text>
            </TouchableOpacity>
          </Link>
          
          <Link href="/players" asChild>
            <TouchableOpacity style={quickNavStyles.item}>
              <Icon name="people" size={24} color={colors.primary} />
              <Text style={quickNavStyles.text}>Игроки</Text>
            </TouchableOpacity>
          </Link>
          
          <Link href="/tournaments" asChild>
            <TouchableOpacity style={quickNavStyles.item}>
              <Icon name="trophy" size={24} color={colors.primary} />
              <Text style={quickNavStyles.text}>Турниры</Text>
            </TouchableOpacity>
          </Link>
        </View>

        {/* Upcoming Games */}
        {upcomingGames.length > 0 && (
          <View>
            <View style={commonStyles.sectionHeader}>
              <Text style={commonStyles.sectionTitle}>Ближайшие игры</Text>
              <Link href="/upcoming" asChild>
                <TouchableOpacity>
                  <Text style={commonStyles.sectionLink}>Все игры</Text>
                </TouchableOpacity>
              </Link>
            </View>
            {upcomingGames.map((game) => (
              <GameCard key={game.id} game={game} showScore={false} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

export default HomeScreen;
