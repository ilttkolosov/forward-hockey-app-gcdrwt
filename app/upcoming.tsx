
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import { Game } from '../types';
import { getFutureGames } from '../data/gameData';
import { commonStyles, colors } from '../styles/commonStyles';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import GameCard from '../components/GameCard';
import Icon from '../components/Icon';

export default function UpcomingGamesScreen() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      console.log('Loading upcoming games...');
      setLoading(true);
      setError(null);

      const gamesData = await getFutureGames();
      setGames(gamesData);
      
      console.log('Upcoming games loaded successfully');
    } catch (err) {
      console.error('Error loading upcoming games:', err);
      setError('Failed to load upcoming games');
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
        <View style={commonStyles.header}>
          <Link href="/" asChild>
            <TouchableOpacity style={commonStyles.backButton}>
              <Icon name="arrow-left" size={24} color={colors.text} />
            </TouchableOpacity>
          </Link>
          <Text style={commonStyles.headerTitle}>Upcoming Games</Text>
        </View>
        <ErrorMessage message={error} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={commonStyles.container}>
      <View style={commonStyles.header}>
        <Link href="/" asChild>
          <TouchableOpacity style={commonStyles.backButton}>
            <Icon name="arrow-left" size={24} color={colors.text} />
          </TouchableOpacity>
        </Link>
        <Text style={commonStyles.headerTitle}>Upcoming Games</Text>
      </View>

      <ScrollView
        style={commonStyles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={commonStyles.section}>
          {games.length > 0 ? (
            games.map((game) => (
              <GameCard key={game.id} game={game} showScore={false} />
            ))
          ) : (
            <View style={commonStyles.emptyState}>
              <Icon name="calendar" size={48} color={colors.textSecondary} />
              <Text style={commonStyles.emptyStateText}>No upcoming games scheduled</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
