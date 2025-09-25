
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import { getPastGames, getPastGamesCount } from '../data/gameData';
import Icon from '../components/Icon';
import { Game } from '../types';
import GameCard from '../components/GameCard';
import { commonStyles, colors } from '../styles/commonStyles';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';

const ArchiveGamesScreen: React.FC = () => {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState<number>(0);

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
        new Date(b.event_date || b.date).getTime() - new Date(a.event_date || a.date).getTime()
      );
      
      setGames(sortedGames);
      setTotalCount(getPastGamesCount());
      
      console.log('Past games loaded successfully. Count:', sortedGames.length);
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
        <LoadingSpinner />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={commonStyles.container}>
      <View style={commonStyles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Link href="/" asChild>
            <TouchableOpacity style={{ marginRight: 16 }}>
              <Icon name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
          </Link>
          <View>
            <Text style={commonStyles.title}>Архив игр</Text>
            {totalCount > 0 && (
              <Text style={commonStyles.subtitle}>Всего: {totalCount}</Text>
            )}
          </View>
        </View>
      </View>

      {error && <ErrorMessage message={error} />}

      <ScrollView
        style={commonStyles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {games.length === 0 ? (
          <View style={commonStyles.emptyState}>
            <Icon name="archive" size={48} color={colors.textSecondary} />
            <Text style={commonStyles.emptyStateText}>
              Нет архивных игр
            </Text>
            <Text style={commonStyles.emptyStateSubtext}>
              История игр будет доступна позже
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

export default ArchiveGamesScreen;
