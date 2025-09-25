
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import PlayerCard from '../components/PlayerCard';
import Icon from '../components/Icon';
import { Player } from '../types';
import { getPlayers, checkApiAvailability } from '../data/playerData';
import { commonStyles, colors } from '../styles/commonStyles';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginLeft: 16,
  },
  backButton: {
    padding: 8,
    borderRadius: 8,
  },
  content: {
    flex: 1,
  },
  playersContainer: {
    padding: 8,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 64,
  },
  emptyStateIcon: {
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});

const PlayersScreen: React.FC = () => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiAvailable, setApiAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    initializeScreen();
  }, []);

  const initializeScreen = async () => {
    console.log('Инициализация экрана игроков...');
    
    // Проверяем доступность API при запуске
    const isApiAvailable = await checkApiAvailability();
    setApiAvailable(isApiAvailable);
    
    if (!isApiAvailable) {
      setError('Ошибка доступа к API игроков. Проверьте подключение к интернету.');
      setLoading(false);
      return;
    }
    
    await loadPlayers();
  };

  const loadPlayers = async () => {
    try {
      setError(null);
      console.log('Загрузка игроков...');
      
      const playersData = await getPlayers();
      setPlayers(playersData);
      
      console.log(`Успешно загружено ${playersData.length} игроков`);
    } catch (err) {
      console.error('Ошибка загрузки игроков:', err);
      setError('Ошибка загрузки списка игроков. Попробуйте обновить страницу.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadPlayers();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Link href="/" asChild>
            <TouchableOpacity style={styles.backButton}>
              <Icon name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
          </Link>
          <Text style={styles.title}>Игроки</Text>
        </View>
        <View style={styles.content}>
          <LoadingSpinner />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Link href="/" asChild>
          <TouchableOpacity style={styles.backButton}>
            <Icon name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
        </Link>
        <Text style={styles.title}>Игроки</Text>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {error && <ErrorMessage message={error} />}

        {players.length === 0 ? (
          <View style={styles.emptyState}>
            <Icon name="people" size={64} color={colors.textSecondary} style={styles.emptyStateIcon} />
            <Text style={styles.emptyStateTitle}>
              {apiAvailable === false ? 'API недоступен' : 'Нет игроков'}
            </Text>
            <Text style={styles.emptyStateText}>
              {apiAvailable === false 
                ? 'Не удается подключиться к серверу. Проверьте подключение к интернету и попробуйте снова.'
                : 'Информация об игроках будет добавлена в ближайшее время'
              }
            </Text>
          </View>
        ) : (
          <View style={styles.playersContainer}>
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
