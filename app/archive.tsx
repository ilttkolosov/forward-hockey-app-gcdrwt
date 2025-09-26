
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from '../components/Icon';
import GameCard from '../components/GameCard';
import { Game } from '../types';
import { getPastGames } from '../data/gameData';
import LoadingSpinner from '../components/LoadingSpinner';
import { commonStyles, colors } from '../styles/commonStyles';
import ErrorMessage from '../components/ErrorMessage';

export default function ArchiveScreen() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setError(null);
      console.log('Загрузка архивных игр...');
      const pastGames = await getPastGames();
      console.log('Загружено архивных игр:', pastGames.length);
      setGames(pastGames);
    } catch (error) {
      console.error('Ошибка загрузки архивных игр:', error);
      setError('Не удалось загрузить архив игр. Проверьте подключение к интернету.');
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
        <LoadingSpinner text="Загрузка архива игр..." />
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

        {games.length === 0 ? (
          <View style={commonStyles.emptyState}>
            <Icon name="history" size={48} color={colors.textSecondary} />
            <Text style={commonStyles.emptyStateTitle}>Архив пуст</Text>
            <Text style={commonStyles.emptyStateText}>
              Завершенные игры появятся здесь
            </Text>
          </View>
        ) : (
          <>
            <View style={[commonStyles.sectionHeader, { paddingHorizontal: 0 }]}>
              <Text style={commonStyles.sectionTitle}>
                Архив игр ({games.length})
              </Text>
            </View>
            {games.map((game) => (
              <GameCard key={game.id} game={game} showScore={true} />
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
