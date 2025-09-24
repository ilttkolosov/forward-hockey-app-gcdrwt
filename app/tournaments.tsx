
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import Icon from '../components/Icon';
import { Tournament } from '../types';
import { mockTournaments } from '../data/mockData';
import TournamentCard from '../components/TournamentCard';
import { commonStyles, colors } from '../styles/commonStyles';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';

const TournamentsScreen: React.FC = () => {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setError(null);
      console.log('Loading tournaments...');
      // For now, using mock data. In the future, this could fetch from the API
      // when league endpoints are fully implemented
      await new Promise(resolve => setTimeout(resolve, 500)); // Simulate API call
      setTournaments(mockTournaments);
      console.log('Tournaments loaded successfully');
    } catch (err) {
      console.error('Error loading tournaments:', err);
      setError('Ошибка загрузки турниров. Проверьте подключение к интернету.');
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
        <View style={commonStyles.header}>
          <Link href="/" asChild>
            <TouchableOpacity style={{ marginRight: 16 }}>
              <Icon name="arrow-left" size={24} color={colors.text} />
            </TouchableOpacity>
          </Link>
          <Text style={commonStyles.title}>Турниры</Text>
        </View>
        <LoadingSpinner />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={commonStyles.container}>
      <View style={commonStyles.header}>
        <Link href="/" asChild>
          <TouchableOpacity style={{ marginRight: 16 }}>
            <Icon name="arrow-left" size={24} color={colors.text} />
          </TouchableOpacity>
        </Link>
        <Text style={commonStyles.title}>Турниры</Text>
      </View>

      <ScrollView
        style={commonStyles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {error && <ErrorMessage message={error} />}

        {tournaments.length === 0 ? (
          <View style={commonStyles.emptyState}>
            <Icon name="trophy" size={64} color={colors.textSecondary} />
            <Text style={commonStyles.emptyStateTitle}>Нет турниров</Text>
            <Text style={commonStyles.emptyStateText}>
              Информация о турнирах будет добавлена в ближайшее время
            </Text>
          </View>
        ) : (
          <View style={{ padding: 8 }}>
            {tournaments.map((tournament) => (
              <TournamentCard key={tournament.id} tournament={tournament} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

export default TournamentsScreen;
