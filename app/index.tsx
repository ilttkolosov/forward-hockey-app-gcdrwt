
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { commonStyles, colors } from '../styles/commonStyles';
import GameCard from '../components/GameCard';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import { Game, TeamStats } from '../types';
import { mockCurrentGame, mockUpcomingGames, mockTeamStats } from '../data/mockData';
import { Link } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import Icon from '../components/Icon';

export default function HomeScreen() {
  const [currentGame, setCurrentGame] = useState<Game | null>(null);
  const [upcomingGames, setUpcomingGames] = useState<Game[]>([]);
  const [teamStats, setTeamStats] = useState<TeamStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      setError(null);
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setCurrentGame(mockCurrentGame);
      setUpcomingGames(mockUpcomingGames.slice(0, 2)); // Show only next 2 games
      setTeamStats(mockTeamStats);
    } catch (err) {
      console.log('Error loading home data:', err);
      setError('Failed to load team data. Please try again.');
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
          <Text style={commonStyles.title}>HC Forward</Text>
          <Text style={commonStyles.textSecondary}>Official Mobile App</Text>
        </View>

        {/* Current Game */}
        {currentGame && (
          <View style={commonStyles.section}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <Text style={commonStyles.subtitle}>Current Game</Text>
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

        {/* Team Stats */}
        {teamStats && (
          <View style={commonStyles.section}>
            <Text style={commonStyles.subtitle}>Season Stats</Text>
            <View style={commonStyles.card}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 24, fontWeight: '700', color: colors.primary }}>
                    {teamStats.position}
                  </Text>
                  <Text style={commonStyles.textSecondary}>Position</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 24, fontWeight: '700', color: colors.success }}>
                    {teamStats.wins}
                  </Text>
                  <Text style={commonStyles.textSecondary}>Wins</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 24, fontWeight: '700', color: colors.primary }}>
                    {teamStats.points}
                  </Text>
                  <Text style={commonStyles.textSecondary}>Points</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text }}>
                    {teamStats.goalsFor}-{teamStats.goalsAgainst}
                  </Text>
                  <Text style={commonStyles.textSecondary}>Goals</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Upcoming Games */}
        {upcomingGames.length > 0 && (
          <View style={commonStyles.section}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={commonStyles.subtitle}>Next Games</Text>
              <Link href="/upcoming" asChild>
                <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '500', marginRight: 4 }}>
                    View All
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
          <Text style={commonStyles.subtitle}>Quick Access</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            <Link href="/archive" asChild>
              <TouchableOpacity style={quickNavStyles.button}>
                <Icon name="archive" size={24} color={colors.primary} />
                <Text style={quickNavStyles.buttonText}>Game Archive</Text>
              </TouchableOpacity>
            </Link>
            <Link href="/players" asChild>
              <TouchableOpacity style={quickNavStyles.button}>
                <Icon name="people" size={24} color={colors.primary} />
                <Text style={quickNavStyles.buttonText}>Players</Text>
              </TouchableOpacity>
            </Link>
            <Link href="/tournaments" asChild>
              <TouchableOpacity style={quickNavStyles.button}>
                <Icon name="trophy" size={24} color={colors.primary} />
                <Text style={quickNavStyles.buttonText}>Tournaments</Text>
              </TouchableOpacity>
            </Link>
            <Link href="/coaches" asChild>
              <TouchableOpacity style={quickNavStyles.button}>
                <Icon name="school" size={24} color={colors.primary} />
                <Text style={quickNavStyles.buttonText}>Coaches</Text>
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
