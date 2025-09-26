
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import { commonStyles, colors } from '../styles/commonStyles';
import { Game } from '../types';
import { getCurrentGame, getFutureGames, getUpcomingGamesCount } from '../data/gameData';
import GameCard from '../components/GameCard';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import Icon from '../components/Icon';

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

export default function HomeScreen() {
  const [currentGame, setCurrentGame] = useState<Game | null>(null);
  const [upcomingGames, setUpcomingGames] = useState<Game[]>([]);
  const [upcomingCount, setUpcomingCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      setError(null);
      console.log('Loading home screen data...');
      
      // Load only current game, upcoming games, and upcoming count
      // Archive count will be loaded in archive screen
      const [current, upcoming, upcomingCountData] = await Promise.all([
        getCurrentGame(),
        getFutureGames(),
        getUpcomingGamesCount()
      ]);
      
      setCurrentGame(current);
      setUpcomingGames(upcoming);
      setUpcomingCount(upcomingCountData);
      
      console.log('Home screen data loaded:', {
        currentGame: current?.id,
        upcomingGames: upcoming.length,
        upcomingCount: upcomingCountData
      });
    } catch (err) {
      console.log('Error loading home screen data:', err);
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
          <Text style={commonStyles.textSecondary}>
            Официальное приложение хоккейного клуба
          </Text>
        </View>

        {/* Current Game */}
        {currentGame && (
          <View style={{ marginBottom: 24 }}>
            <Text style={[commonStyles.subtitle, { marginBottom: 12 }]}>
              Текущая игра
            </Text>
            <GameCard game={currentGame} showScore={true} />
          </View>
        )}

        {/* Quick Navigation */}
        <View style={quickNavStyles.container}>
          <Link href="/upcoming" asChild>
            <TouchableOpacity style={quickNavStyles.item}>
              <Icon 
                name="calendar" 
                size={24} 
                color={colors.primary} 
                style={quickNavStyles.icon} 
              />
              <Text style={quickNavStyles.title}>Предстоящие игры</Text>
              <Text style={quickNavStyles.subtitle}>
                {upcomingCount > 0 ? `${upcomingCount} игр` : 'Нет игр'}
              </Text>
            </TouchableOpacity>
          </Link>

          <Link href="/archive" asChild>
            <TouchableOpacity style={quickNavStyles.item}>
              <Icon 
                name="archive" 
                size={24} 
                color={colors.primary} 
                style={quickNavStyles.icon} 
              />
              <Text style={quickNavStyles.title}>Архив игр</Text>
              <Text style={quickNavStyles.subtitle}>История матчей</Text>
            </TouchableOpacity>
          </Link>

          <Link href="/tournaments" asChild>
            <TouchableOpacity style={quickNavStyles.item}>
              <Icon 
                name="trophy" 
                size={24} 
                color={colors.primary} 
                style={quickNavStyles.icon} 
              />
              <Text style={quickNavStyles.title}>Турниры</Text>
              <Text style={quickNavStyles.subtitle}>Соревнования</Text>
            </TouchableOpacity>
          </Link>

          <Link href="/players" asChild>
            <TouchableOpacity style={quickNavStyles.item}>
              <Icon 
                name="people" 
                size={24} 
                color={colors.primary} 
                style={quickNavStyles.icon} 
              />
              <Text style={quickNavStyles.title}>Игроки</Text>
              <Text style={quickNavStyles.subtitle}>Состав команды</Text>
            </TouchableOpacity>
          </Link>
        </View>

        {/* Upcoming Games */}
        {upcomingGames.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <View style={{ 
              flexDirection: 'row', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: 12 
            }}>
              <Text style={commonStyles.subtitle}>Ближайшие игры</Text>
              <Link href="/upcoming" asChild>
                <TouchableOpacity>
                  <Text style={[commonStyles.textSecondary, { fontSize: 14 }]}>
                    Все игры
                  </Text>
                </TouchableOpacity>
              </Link>
            </View>
            
            {upcomingGames.slice(0, 3).map((game) => (
              <GameCard key={game.id} game={game} showScore={false} />
            ))}
          </View>
        )}

        {/* Bottom spacing */}
        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
