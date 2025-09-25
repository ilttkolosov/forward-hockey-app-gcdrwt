
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import { Coach } from '../types';
import Icon from '../components/Icon';
import { mockCoaches } from '../data/mockData';
import CoachCard from '../components/CoachCard';
import { commonStyles, colors } from '../styles/commonStyles';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';

const CoachesScreen: React.FC = () => {
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setError(null);
      console.log('Loading coaches...');
      // For now, using mock data. In the future, this could fetch from the API
      await new Promise(resolve => setTimeout(resolve, 500)); // Simulate API call
      setCoaches(mockCoaches);
      console.log('Coaches loaded successfully');
    } catch (err) {
      console.error('Error loading coaches:', err);
      setError('Ошибка загрузки тренерского состава. Проверьте подключение к интернету.');
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
              <Icon name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
          </Link>
          <Text style={commonStyles.title}>Тренеры</Text>
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
            <Icon name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
        </Link>
        <Text style={commonStyles.title}>Тренеры</Text>
      </View>

      <ScrollView
        style={commonStyles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {error && <ErrorMessage message={error} />}

        {coaches.length === 0 ? (
          <View style={commonStyles.emptyState}>
            <Icon name="person" size={64} color={colors.textSecondary} />
            <Text style={commonStyles.emptyStateTitle}>Нет данных о тренерах</Text>
            <Text style={commonStyles.emptyStateText}>
              Информация о тренерском составе будет добавлена в ближайшее время
            </Text>
          </View>
        ) : (
          <View style={{ padding: 8 }}>
            {coaches.map((coach) => (
              <CoachCard key={coach.id} coach={coach} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

export default CoachesScreen;
