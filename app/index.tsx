
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import { Game, TeamStats } from '../types';
import { getCurrentGame, getFutureGames } from '../data/gameData';
import { mockTeamStats } from '../data/mockData';
import { commonStyles, colors } from '../styles/commonStyles';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import GameCard from '../components/GameCard';
import Icon from '../components/Icon';

export default function HomeScreen() {
  const [currentGame, setCurrentGame] = useState<Game | null>(null);
  const [upcomingGames, setUpcomingGames] = useState<Game[]>([]);
  const [teamStats, setTeamStats] = useState<TeamStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      console.log('Loading home screen data...');
      setLoading(true);
      setError(null);

      const [currentGameData, upcomingGamesData] = await Promise.all([
        getCurrentGame(),
        getFutureGames()
      ]);

      setCurrentGame(currentGameData);
      setUpcomingGames(upcomingGamesData.slice(0, 3)); // Show only first 3 upcoming games
      setTeamStats(mockTeamStats); // Keep using mock data for team stats
      
      console.log('Home screen data loaded successfully');
    } catch (err) {
      console.error('Error loading home screen data:', err);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
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
        <ErrorMessage message={error} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={commonStyles.container}>
      <ScrollView
        style={commonStyles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Header */}
        <View style={commonStyles.header}>
          <Text style={commonStyles.headerTitle}>HC Forward</Text>
        </View>

        {/* Current Game */}
        {currentGame && (
          <View style={commonStyles.section}>
            <Text style={commonStyles.sectionTitle}>Current Game</Text>
            <GameCard game={currentGame} showScore={true} />
          </View>
        )}

        {/* Quick Navigation */}
        <View style={commonStyles.section}>
          <Text style={commonStyles.sectionTitle}>Quick Access</Text>
          <View style={quickNavStyles.container}>
            <Link href="/upcoming" asChild>
              <TouchableOpacity style={quickNavStyles.item}>
                <Icon name="calendar" size={24} color={colors.primary} />
                <Text style={quickNavStyles.text}>Upcoming Games</Text>
              </TouchableOpacity>
            </Link>
            <Link href="/archive" asChild>
              <TouchableOpacity style={quickNavStyles.item}>
                <Icon name="archive" size={24} color={colors.primary} />
                <Text style={quickNavStyles.text}>Game Archive</Text>
              </TouchableOpacity>
            </Link>
            <Link href="/players" asChild>
              <TouchableOpacity style={quickNavStyles.item}>
                <Icon name="users" size={24} color={colors.primary} />
                <Text style={quickNavStyles.text}>Players</Text>
              </TouchableOpacity>
            </Link>
            <Link href="/tournaments" asChild>
              <TouchableOpacity style={quickNavStyles.item}>
                <Icon name="trophy" size={24} color={colors.primary} />
                <Text style={quickNavStyles.text}>Tournaments</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>

        {/* Upcoming Games Preview */}
        {upcomingGames.length > 0 && (
          <View style={commonStyles.section}>
            <View style={commonStyles.sectionHeader}>
              <Text style={commonStyles.sectionTitle}>Next Games</Text>
              <Link href="/upcoming" asChild>
                <TouchableOpacity>
                  <Text style={commonStyles.seeAllText}>See All</Text>
                </TouchableOpacity>
              </Link>
            </View>
            {upcomingGames.map((game) => (
              <GameCard key={game.id} game={game} showScore={false} />
            ))}
          </View>
        )}

        {/* Team Stats */}
        {teamStats && (
          <View style={commonStyles.section}>
            <Text style={commonStyles.sectionTitle}>Season Stats</Text>
            <View style={commonStyles.statsGrid}>
              <View style={commonStyles.statItem}>
                <Text style={commonStyles.statValue}>{teamStats.wins}</Text>
                <Text style={commonStyles.statLabel}>Wins</Text>
              </View>
              <View style={commonStyles.statItem}>
                <Text style={commonStyles.statValue}>{teamStats.losses}</Text>
                <Text style={commonStyles.statLabel}>Losses</Text>
              </View>
              <View style={commonStyles.statItem}>
                <Text style={commonStyles.statValue}>{teamStats.draws}</Text>
                <Text style={commonStyles.statLabel}>Draws</Text>
              </View>
              <View style={commonStyles.statItem}>
                <Text style={commonStyles.statValue}>{teamStats.points}</Text>
                <Text style={commonStyles.statLabel}>Points</Text>
              </View>
              <View style={commonStyles.statItem}>
                <Text style={commonStyles.statValue}>{teamStats.goalsFor}</Text>
                <Text style={commonStyles.statLabel}>Goals For</Text>
              </View>
              <View style={commonStyles.statItem}>
                <Text style={commonStyles.statValue}>{teamStats.goalsAgainst}</Text>
                <Text style={commonStyles.statLabel}>Goals Against</Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const quickNavStyles = {
  container: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    justifyContent: 'space-between',
    gap: 12,
  },
  item: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: 80,
  },
  text: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600' as const,
    color: colors.text,
    textAlign: 'center' as const,
  },
};
