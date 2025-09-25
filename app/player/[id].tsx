
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Image, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getPlayerById } from '../../data/playerData';
import { Player } from '../../types';
import { colors, commonStyles } from '../../styles/commonStyles';
import Icon from '../../components/Icon';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';

const styles = StyleSheet.create({
  playerHeader: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: colors.surface,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  playerImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 16,
    backgroundColor: colors.background,
  },
  playerName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  playerPosition: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '600',
    marginBottom: 4,
  },
  playerNumber: {
    fontSize: 48,
    fontWeight: 'bold',
    color: colors.primary,
    opacity: 0.3,
    position: 'absolute',
    top: 16,
    right: 16,
  },
  statsContainer: {
    backgroundColor: colors.surface,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    padding: 16,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 16,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  statLabel: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  positionBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 8,
  },
  positionText: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: '600',
  },
});

const PlayerDetailsScreen: React.FC = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [player, setPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      loadPlayerData();
    }
  }, [id]);

  const loadPlayerData = async () => {
    try {
      setError(null);
      console.log('Loading player details for ID:', id);
      
      const playerData = await getPlayerById(id!);
      if (playerData) {
        setPlayer(playerData);
        console.log('Player details loaded successfully');
      } else {
        setError('Игрок не найден');
      }
    } catch (err) {
      console.error('Error loading player details:', err);
      setError('Ошибка загрузки данных игрока. Проверьте подключение к интернету.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadPlayerData();
  };

  if (loading) {
    return (
      <SafeAreaView style={commonStyles.container}>
        <View style={commonStyles.header}>
          <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 16 }}>
            <Icon name="arrow-left" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={commonStyles.title}>Игрок</Text>
        </View>
        <LoadingSpinner />
      </SafeAreaView>
    );
  }

  if (error || !player) {
    return (
      <SafeAreaView style={commonStyles.container}>
        <View style={commonStyles.header}>
          <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 16 }}>
            <Icon name="arrow-left" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={commonStyles.title}>Игрок</Text>
        </View>
        <ErrorMessage message={error || 'Игрок не найден'} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={commonStyles.container}>
      <View style={commonStyles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 16 }}>
          <Icon name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={commonStyles.title}>Игрок</Text>
      </View>

      <ScrollView
        style={commonStyles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Player Header */}
        <View style={styles.playerHeader}>
          <Text style={styles.playerNumber}>#{player.number}</Text>
          
          {player.photo ? (
            <Image source={{ uri: player.photo }} style={styles.playerImage} />
          ) : (
            <View style={[styles.playerImage, { justifyContent: 'center', alignItems: 'center' }]}>
              <Icon name="user" size={48} color={colors.textSecondary} />
            </View>
          )}
          
          <Text style={styles.playerName}>{player.name}</Text>
          
          <View style={styles.positionBadge}>
            <Text style={styles.positionText}>{player.position}</Text>
          </View>
        </View>

        {/* Player Stats */}
        <View style={styles.statsContainer}>
          <Text style={styles.statsTitle}>Информация об игроке</Text>
          
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Номер</Text>
            <Text style={styles.statValue}>#{player.number}</Text>
          </View>
          
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Позиция</Text>
            <Text style={styles.statValue}>{player.position}</Text>
          </View>
          
          {player.age && (
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Возраст</Text>
              <Text style={styles.statValue}>{player.age} лет</Text>
            </View>
          )}
          
          {player.height && (
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Рост</Text>
              <Text style={styles.statValue}>{player.height}</Text>
            </View>
          )}
          
          {player.weight && (
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Вес</Text>
              <Text style={styles.statValue}>{player.weight}</Text>
            </View>
          )}
          
          {player.nationality && (
            <View style={[styles.statRow, { borderBottomWidth: 0 }]}>
              <Text style={styles.statLabel}>Гражданство</Text>
              <Text style={styles.statValue}>{player.nationality}</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default PlayerDetailsScreen;
