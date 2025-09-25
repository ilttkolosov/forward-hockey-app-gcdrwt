
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Image, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getPlayerById } from '../../data/playerData';
import Icon from '../../components/Icon';
import { Player } from '../../types';
import { colors, commonStyles } from '../../styles/commonStyles';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';

const styles = StyleSheet.create({
  photoContainer: {
    alignItems: 'center',
    marginVertical: 24,
    position: 'relative',
  },
  photo: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.background,
  },
  photoPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  captainBadge: {
    position: 'absolute',
    top: -8,
    right: '30%',
    backgroundColor: colors.primary,
    borderRadius: 15,
    paddingHorizontal: 10,
    paddingVertical: 4,
    minWidth: 30,
    alignItems: 'center',
  },
  captainText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: colors.surface,
  },
  playerName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
    marginTop: 16,
  },
  playerPosition: {
    fontSize: 18,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
  playerNumber: {
    fontSize: 48,
    fontWeight: 'bold',
    color: colors.primary,
    textAlign: 'center',
    marginTop: 8,
  },
  infoSection: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.background,
  },
  lastInfoRow: {
    borderBottomWidth: 0,
  },
  infoLabel: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
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
      console.log('Loading player data for ID:', id);
      
      const playerData = await getPlayerById(id!);
      setPlayer(playerData);
      
      if (!playerData) {
        setError('Игрок не найден');
      }
    } catch (err) {
      console.error('Error loading player data:', err);
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

  const getPositionColor = (position: string) => {
    switch (position.toLowerCase()) {
      case 'нападающий':
        return colors.error;
      case 'защитник':
        return colors.primary;
      case 'вратарь':
        return colors.warning;
      default:
        return colors.textSecondary;
    }
  };

  const getCaptainBadgeText = (captainStatus: string) => {
    if (captainStatus?.toLowerCase().includes('k')) return 'Капитан';
    if (captainStatus?.toLowerCase().includes('a')) return 'Ассистент';
    return null;
  };

  if (loading) {
    return (
      <SafeAreaView style={commonStyles.container}>
        <View style={commonStyles.header}>
          <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 16 }}>
            <Icon name="arrow-back" size={24} color={colors.text} />
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
            <Icon name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={commonStyles.title}>Игрок</Text>
        </View>
        <ErrorMessage message={error || 'Игрок не найден'} />
      </SafeAreaView>
    );
  }

  const captainBadgeText = getCaptainBadgeText(player.captainStatus || '');

  return (
    <SafeAreaView style={commonStyles.container}>
      <View style={commonStyles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 16 }}>
          <Icon name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={commonStyles.title}>Игрок</Text>
      </View>

      <ScrollView
        style={commonStyles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Player Photo and Basic Info */}
        <View style={styles.photoContainer}>
          {player.photo ? (
            <Image source={{ uri: player.photo }} style={styles.photo} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Icon name="person" size={48} color={colors.textSecondary} />
            </View>
          )}
          
          {captainBadgeText && (
            <View style={styles.captainBadge}>
              <Text style={styles.captainText}>{captainBadgeText}</Text>
            </View>
          )}
        </View>

        <Text style={styles.playerName}>{player.name}</Text>
        <Text style={[styles.playerPosition, { color: getPositionColor(player.position) }]}>
          {player.position}
        </Text>
        <Text style={styles.playerNumber}>#{player.number}</Text>

        {/* Personal Information */}
        <View style={styles.infoSection}>
          <Text style={styles.sectionTitle}>Личная информация</Text>
          
          {player.age && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Возраст</Text>
              <Text style={styles.infoValue}>{player.age} лет</Text>
            </View>
          )}
          
          {player.nationality && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Национальность</Text>
              <Text style={styles.infoValue}>{player.nationality}</Text>
            </View>
          )}
        </View>

        {/* Physical Stats */}
        <View style={styles.infoSection}>
          <Text style={styles.sectionTitle}>Физические данные</Text>
          
          {player.height && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Рост</Text>
              <Text style={styles.infoValue}>{player.height}</Text>
            </View>
          )}
          
          {player.weight && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Вес</Text>
              <Text style={styles.infoValue}>{player.weight}</Text>
            </View>
          )}
          
          {player.grip && (
            <View style={[styles.infoRow, styles.lastInfoRow]}>
              <Text style={styles.infoLabel}>Хват</Text>
              <Text style={styles.infoValue}>{player.grip}</Text>
            </View>
          )}
        </View>

        {/* Game Information */}
        <View style={styles.infoSection}>
          <Text style={styles.sectionTitle}>Игровая информация</Text>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Игровой номер</Text>
            <Text style={styles.infoValue}>#{player.number}</Text>
          </View>
          
          <View style={[styles.infoRow, styles.lastInfoRow]}>
            <Text style={styles.infoLabel}>Позиция</Text>
            <Text style={styles.infoValue}>{player.position}</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default PlayerDetailsScreen;
