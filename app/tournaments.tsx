
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { commonStyles, colors } from '../styles/commonStyles';
import TournamentCard from '../components/TournamentCard';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import { Tournament } from '../types';
import { mockTournaments } from '../data/mockData';
import { Link } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import Icon from '../components/Icon';

export default function TournamentsScreen() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      setError(null);
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 800));
      
      setTournaments(mockTournaments);
    } catch (err) {
      console.log('Error loading tournaments:', err);
      setError('Failed to load tournaments. Please try again.');
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

  const activeTournaments = tournaments.filter(t => t.status === 'active');
  const upcomingTournaments = tournaments.filter(t => t.status === 'upcoming');
  const finishedTournaments = tournaments.filter(t => t.status === 'finished');

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
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}>
          <Link href="/" asChild>
            <TouchableOpacity style={{ marginRight: 16 }}>
              <Icon name="chevron-back" size={24} color={colors.text} />
            </TouchableOpacity>
          </Link>
          <View>
            <Text style={commonStyles.title}>Tournaments</Text>
            <Text style={commonStyles.textSecondary}>{tournaments.length} tournaments</Text>
          </View>
        </View>

        {/* Active Tournaments */}
        {activeTournaments.length > 0 && (
          <View style={commonStyles.section}>
            <Text style={commonStyles.subtitle}>Active Tournaments</Text>
            {activeTournaments.map((tournament) => (
              <TournamentCard key={tournament.id} tournament={tournament} />
            ))}
          </View>
        )}

        {/* Upcoming Tournaments */}
        {upcomingTournaments.length > 0 && (
          <View style={commonStyles.section}>
            <Text style={commonStyles.subtitle}>Upcoming Tournaments</Text>
            {upcomingTournaments.map((tournament) => (
              <TournamentCard key={tournament.id} tournament={tournament} />
            ))}
          </View>
        )}

        {/* Finished Tournaments */}
        {finishedTournaments.length > 0 && (
          <View style={commonStyles.section}>
            <Text style={commonStyles.subtitle}>Finished Tournaments</Text>
            {finishedTournaments.map((tournament) => (
              <TournamentCard key={tournament.id} tournament={tournament} />
            ))}
          </View>
        )}

        {tournaments.length === 0 && (
          <View style={commonStyles.errorContainer}>
            <Text style={commonStyles.text}>No tournaments information available.</Text>
          </View>
        )}

        {/* Bottom spacing */}
        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
