
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import { Game } from '../types';
import { getPastGames } from '../data/gameData';
import Icon from '../components/Icon';
import GameCard from '../components/GameCard';
import { commonStyles, colors } from '../styles/commonStyles';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';

const GameArchiveScreen: React.FC = () => {
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
      console.log('Loading past games...');
      const pastGames = await getPastGames();
      // Sort by date descending (most recent first)
      const sortedGames = pastGames.sort((a, b) => 
        new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      setGames(sortedGames);
      console.log('Past games loaded successfully');
    } catch (err) {
      console.error('Error loading past games:', err);
      setError('Ошибка загрузки архива игр. Проверьте подключение к интернету.');
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
          <Text style={commonStyles.title}>Архив игр</Text>
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
        <Text style={commonStyles.title}>Архив игр</Text>
      </View>

      <ScrollView
        style={commonStyles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {error && <ErrorMessage message={error} />}

        {games.length === 0 ? (
          <View style={commonStyles.emptyState}>
            <Icon name="archive" size={64} color={colors.textSecondary} />
            <Text style={commonStyles.emptyStateTitle}>Архив пуст</Text>
            <Text style={commonStyles.emptyStateText}>
              Завершенные игры появятся здесь
            </Text>
          </View>
        ) : (
          games.map((game) => (
            <GameCard key={game.id} game={game} showScore={true} />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

export default GameArchiveScreen;
