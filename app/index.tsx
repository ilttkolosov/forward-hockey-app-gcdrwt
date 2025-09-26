
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { commonStyles, colors } from '../styles/commonStyles';
import GameCard from '../components/GameCard';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import { Game, TeamStats } from '../types';
import { getCurrentGame, getFutureGames, getPastGamesCount, getUpcomingGamesCount } from '../data/gameData';
import { Link } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import Icon from '../components/Icon';

export default function HomeScreen() {
  const [currentGame, setCurrentGame] = useState<Game | null>(null);
  const [upcomingGames, setUpcomingGames] = useState<Game[]>([]);
  const [archiveCount, setArchiveCount] = useState<number>(0);
  const [upcomingCount, setUpcomingCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      setError(null);
      console.log('Loading home screen data...');
      
      // Load current game
      const current = await getCurrentGame();
      setCurrentGame(current);
      console.log('Current game loaded:', current);
      
      // Load upcoming games
      const upcoming = await getFutureGames();
      setUpcomingGames(upcoming);
      console.log('Upcoming games loaded:', upcoming.length);
      
      // Load archive count
      const archCount = await getPastGamesCount();
      setArchiveCount(archCount);
      console.log('Archive count loaded:', archCount);
      
      // Load upcoming count
      const upCount = await getUpcomingGamesCount();
      setUpcomingCount(upCount);
      console.log('Upcoming count loaded:', upCount);
      
    } catch (err) {
      console.log('Error loading home data:', err);
      setError('Не удалось загрузить данные. Попробуйте еще раз.');
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
      <ScrollView
        style={commonStyles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ marginBottom: 24 }}>
          <Text style={commonStyles.title}>ХК Форвард</Text>
          <Text style={commonStyles.textSecondary}>Официальное мобильное приложение</Text>
        </View>

        {/* Current Game */}
        {currentGame && (
          <View style={commonStyles.section}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <Text style={commonStyles.subtitle}>Текущая игра</Text>
              {currentGame.status === 'live' && (
                <View style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: colors.error,
                  marginLeft: 8,
                }} />
              )}
            </View>
            <GameCard game={currentGame} />
          </View>
        )}

        {/* Upcoming Games */}
        {upcomingGames.length > 0 && (
          <View style={commonStyles.section}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={commonStyles.subtitle}>Ближайшие игры</Text>
              <Link href="/upcoming" asChild>
                <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '500', marginRight: 4 }}>
                    Все игры
                  </Text>
                  <Icon name="chevron-forward" size={16} color={colors.primary} />
                </TouchableOpacity>
              </Link>
            </View>
            {upcomingGames.map((game) => (
              <GameCard key={game.id} game={game} showScore={false} />
            ))}
          </View>
        )}

        {/* Quick Navigation */}
        <View style={commonStyles.section}>
          <Text style={commonStyles.subtitle}>Быстрый доступ</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            <Link href="/archive" asChild>
              <TouchableOpacity style={quickNavStyles.button}>
                <Icon name="archive" size={24} color={colors.primary} />
                <Text style={quickNavStyles.buttonText}>
                  Архив игр {archiveCount > 0 && `(${archiveCount})`}
                </Text>
              </TouchableOpacity>
            </Link>
            <Link href="/upcoming" asChild>
              <TouchableOpacity style={quickNavStyles.button}>
                <Icon name="calendar" size={24} color={colors.primary} />
                <Text style={quickNavStyles.buttonText}>
                  Предстоящие игры {upcomingCount > 0 && `(${upcomingCount})`}
                </Text>
              </TouchableOpacity>
            </Link>
            <Link href="/players" asChild>
              <TouchableOpacity style={quickNavStyles.button}>
                <Icon name="people" size={24} color={colors.primary} />
                <Text style={quickNavStyles.buttonText}>Игроки</Text>
              </TouchableOpacity>
            </Link>
            <Link href="/tournaments" asChild>
              <TouchableOpacity style={quickNavStyles.button}>
                <Icon name="trophy" size={24} color={colors.primary} />
                <Text style={quickNavStyles.buttonText}>Турниры</Text>
              </TouchableOpacity>
            </Link>
            <Link href="/coaches" asChild>
              <TouchableOpacity style={quickNavStyles.button}>
                <Icon name="school" size={24} color={colors.primary} />
                <Text style={quickNavStyles.buttonText}>Тренеры</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>

        {/* Bottom spacing */}
        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const quickNavStyles = {
  button: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minWidth: '45%',
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: colors.text,
    marginTop: 8,
    textAlign: 'center' as const,
  },
};
