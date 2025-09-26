
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from '../components/Icon';
import CoachCard from '../components/CoachCard';
import { Coach } from '../types';
import { mockCoaches } from '../data/mockData';
import LoadingSpinner from '../components/LoadingSpinner';
import { commonStyles, colors } from '../styles/commonStyles';
import ErrorMessage from '../components/ErrorMessage';

export default function CoachesScreen() {
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
      console.log('Загрузка тренеров...');
      
      // Имитация загрузки данных
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setCoaches(mockCoaches);
      console.log('Загружено тренеров:', mockCoaches.length);
    } catch (error) {
      console.error('Ошибка загрузки тренеров:', error);
      setError('Не удалось загрузить список тренеров. Проверьте подключение к интернету.');
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
        <LoadingSpinner text="Загрузка тренеров..." />
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

        {coaches.length === 0 ? (
          <View style={commonStyles.emptyState}>
            <Icon name="school" size={48} color={colors.textSecondary} />
            <Text style={commonStyles.emptyStateTitle}>Нет тренеров</Text>
            <Text style={commonStyles.emptyStateText}>
              Информация о тренерском штабе пока недоступна
            </Text>
          </View>
        ) : (
          <>
            <View style={[commonStyles.sectionHeader, { paddingHorizontal: 0 }]}>
              <Text style={commonStyles.sectionTitle}>
                Тренерский штаб ({coaches.length})
              </Text>
            </View>
            {coaches.map((coach) => (
              <CoachCard key={coach.id} coach={coach} />
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
