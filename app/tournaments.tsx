
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from '../components/Icon';
import TournamentCard from '../components/TournamentCard';
import { Tournament } from '../types';
import { mockTournaments } from '../data/mockData';
import LoadingSpinner from '../components/LoadingSpinner';
import { commonStyles, colors } from '../styles/commonStyles';
import ErrorMessage from '../components/ErrorMessage';

export default function TournamentsScreen() {
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
      console.log('Загрузка турниров...');
      
      // Имитация загрузки данных
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setTournaments(mockTournaments);
      console.log('Загружено турниров:', mockTournaments.length);
    } catch (error) {
      console.error('Ошибка загрузки турниров:', error);
      setError('Не удалось загрузить список турниров. Проверьте подключение к интернету.');
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
        <LoadingSpinner text="Загрузка турниров..." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={commonStyles.container}>
      <ScrollView
        style={commonStyles.flex1}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {error && <ErrorMessage message={error} />}

        {tournaments.length === 0 ? (
          <View style={commonStyles.emptyState}>
            <Icon name="emoji-events" size={48} color={colors.textSecondary} />
            <Text style={commonStyles.emptyStateTitle}>Нет турниров</Text>
            <Text style={commonStyles.emptyStateText}>
              Информация о турнирах пока недоступна
            </Text>
          </View>
        ) : (
          <>
            <View style={[commonStyles.sectionHeader, { paddingHorizontal: 0 }]}>
              <Text style={commonStyles.sectionTitle}>
                Турниры ({tournaments.length})
              </Text>
            </View>
            {tournaments.map((tournament) => (
              <TournamentCard key={tournament.id} tournament={tournament} />
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
