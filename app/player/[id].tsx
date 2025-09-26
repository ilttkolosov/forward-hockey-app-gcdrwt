
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors, commonStyles } from '../../styles/commonStyles';
import { getPlayerById } from '../../data/playerData';
import { Player } from '../../types';
import Icon from '../../components/Icon';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';
import { formatPlayerBirthDate, getHandednessText, getCaptainBadgeText } from '../../utils/playerUtils';
import { Image } from 'expo-image';

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
  backButton: {
    marginRight: 16,
    padding: 8,
  },
  headerTitle: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  content: {
    flex: 1,
  },
  playerHeader: {
    alignItems: 'center',
    paddingVertical: 32,
    backgroundColor: colors.card,
    marginBottom: 16,
  },
  playerAvatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.border,
    marginBottom: 16,
  },
  playerName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 8,
    paddingHorizontal: 24,
    flexWrap: 'wrap',
  },
  playerPosition: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  numberContainer: {
    alignItems: 'center',
  },
  playerNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.primary,
  },
  captainBadge: {
    backgroundColor: colors.error,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 8,
  },
  captainBadgeText: {
    color: colors.background,
    fontSize: 18,
    fontWeight: 'bold',
  },
  infoSection: {
    backgroundColor: colors.card,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoRowLast: {
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
    textAlign: 'right',
    flex: 1,
    marginLeft: 16,
  },
});

export default function PlayerDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [player, setPlayer] = useState<Player | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadPlayerData = useCallback(async () => {
    if (!id || isLoading) {
      console.log('Skipping player load - no ID or already loading:', { id, isLoading });
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      console.log('Loading player data for ID:', id);
      
      const playerData = await getPlayerById(id);
      
      if (playerData) {
        setPlayer(playerData);
        console.log('Player data loaded successfully:', playerData.name);
      } else {
        setError('Игрок не найден');
        console.log('Player not found for ID:', id);
      }
    } catch (err) {
      console.error('Error loading player:', err);
      setError('Не удалось загрузить данные игрока. Попробуйте еще раз.');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [id, isLoading]);

  useEffect(() => {
    if (id) {
      loadPlayerData();
    }
  }, [id]); // Only depend on id, not loadPlayerData to prevent double calls

  const onRefresh = () => {
    setRefreshing(true);
    loadPlayerData();
  };

  const handleBackPress = () => {
    router.back();
  };

  const getCaptainStatusText = (): string => {
    if (player?.captainStatus === 'К') return 'Капитан';
    if (player?.captainStatus === 'А') return 'Ассистент капитана';
    return '—';
  };

  if (isLoading && !player) {
    return (
      <SafeAreaView style={styles.container}>
        <LoadingSpinner />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <ErrorMessage message={error} onRetry={loadPlayerData} />
      </SafeAreaView>
    );
  }

  if (!player) {
    return (
      <SafeAreaView style={styles.container}>
        <ErrorMessage message="Игрок не найден" onRetry={loadPlayerData} />
      </SafeAreaView>
    );
  }

  const fullCaptainText = getCaptainStatusText();

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBackPress}>
          <Icon name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitle}>
          <Text style={styles.title}>{player.name}</Text>
          <Text style={styles.subtitle}>#{player.number} • {player.position}</Text>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Player Header */}
        <View style={styles.playerHeader}>
          <Image
            source={player.photo ? { uri: player.photo } : require('../../assets/images/natively-dark.png')}
            style={styles.playerAvatar}
            cachePolicy="memory-disk"
          />
          <Text style={styles.playerName}>{player.fullName || player.name}</Text>
          <Text style={styles.playerPosition}>{player.position}</Text>
          
          {/* Captain Badge positioned above player number */}
          <View style={styles.numberContainer}>
            {fullCaptainText !== '—' && (
              <View style={styles.captainBadge}>
                <Text style={styles.captainBadgeText}>{fullCaptainText}</Text>
              </View>
            )}
            <Text style={styles.playerNumber}>#{player.number}</Text>
          </View>
        </View>

        {/* Personal Information */}
        <View style={styles.infoSection}>
          <Text style={styles.sectionTitle}>Личная информация</Text>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Дата рождения</Text>
            <Text style={styles.infoValue}>
              {player.birthDate ? formatPlayerBirthDate(player.birthDate) : '—'}
            </Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Возраст</Text>
            <Text style={styles.infoValue}>
              {player.age ? `${player.age} лет` : '—'}
            </Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Рост</Text>
            <Text style={styles.infoValue}>
              {player.height ? `${player.height} см` : '—'}
            </Text>
          </View>
          
          <View style={[styles.infoRow, styles.infoRowLast]}>
            <Text style={styles.infoLabel}>Вес</Text>
            <Text style={styles.infoValue}>
              {player.weight ? `${player.weight} кг` : '—'}
            </Text>
          </View>
        </View>

        {/* Game Information - Status field removed as requested */}
        <View style={styles.infoSection}>
          <Text style={styles.sectionTitle}>Игровая информация</Text>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Хват</Text>
            <Text style={styles.infoValue}>
              {getHandednessText(player.handedness || '')}
            </Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Номер</Text>
            <Text style={styles.infoValue}>#{player.number}</Text>
          </View>
          
          <View style={[styles.infoRow, styles.infoRowLast]}>
            <Text style={styles.infoLabel}>Позиция</Text>
            <Text style={styles.infoValue}>{player.position}</Text>
          </View>
        </View>

        {/* Bottom spacing */}
        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
