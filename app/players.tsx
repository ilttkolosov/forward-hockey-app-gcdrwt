
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import PlayerCard from '../components/PlayerCard';
import Icon from '../components/Icon';
import { Player } from '../types';
import { getPlayers } from '../data/playerData';
import { commonStyles, colors } from '../styles/commonStyles';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';

const PlayersScreen: React.FC = () => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setError(null);
      console.log('Loading players from API...');
      
      const playersData = await getPlayers();
      setPlayers(playersData);
      
      console.log(`Successfully loaded ${playersData.length} players`);
    } catch (err) {
      console.error('Error loading players:', err);
      setError('Ошибка загрузки списка игроков. Проверьте подключение к интернету.');
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
          <Text style={commonStyles.title}>Игроки</Text>
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
        <Text style={commonStyles.title}>Игроки</Text>
      </View>

      <ScrollView
        style={commonStyles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {error && <ErrorMessage message={error} />}

        {players.length === 0 ? (
          <View style={commonStyles.emptyState}>
            <Icon name="users" size={64} color={colors.textSecondary} />
            <Text style={commonStyles.emptyStateTitle}>Нет данных об игроках</Text>
            <Text style={commonStyles.emptyStateText}>
              Информация об игроках будет добавлена в ближайшее время
            </Text>
          </View>
        ) : (
          <View style={{ padding: 8 }}>
            {players.map((player) => (
              <PlayerCard key={player.id} player={player} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

export default PlayersScreen;
