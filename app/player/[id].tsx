
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Image, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getPlayerById } from '../../data/playerData';
import { Player } from '../../types';
import { colors, commonStyles } from '../../styles/commonStyles';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';
import Icon from '../../components/Icon';

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
    flex: 1,
  },
  backButton: {
    padding: 8,
    borderRadius: 8,
  },
  content: {
    flex: 1,
  },
  playerHeader: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: colors.surface,
    marginBottom: 16,
  },
  photoContainer: {
    position: 'relative',
    marginBottom: 16,
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
    right: -8,
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 32,
    alignItems: 'center',
  },
  assistantBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: colors.warning,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 32,
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: colors.surface,
  },
  playerName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  playerPosition: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  playerNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.primary,
    textAlign: 'center',
  },
  captainStatusContainer: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    alignSelf: 'center',
  },
  captainStatusText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.surface,
    textAlign: 'center',
  },
  statsContainer: {
    backgroundColor: colors.surface,
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
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statItem: {
    width: '48%',
    marginBottom: 16,
  },
  statLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  nationalityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flagImage: {
    width: 20,
    height: 15,
    marginLeft: 8,
    borderRadius: 2,
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
      console.log('Загрузка данных игрока:', id);
      
      const playerData = await getPlayerById(id);
      if (playerData) {
        setPlayer(playerData);
        console.log('Данные игрока загружены:', playerData);
      } else {
        setError('Игрок не найден');
      }
    } catch (err) {
      console.error('Ошибка загрузки данных игрока:', err);
      setError('Ошибка загрузки данных игрока');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadPlayerData();
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

  const getCaptainBadgeInfo = (captainStatus?: string) => {
    if (!captainStatus) return null;
    
    const status = captainStatus.toLowerCase();
    if (status === 'k') {
      return { text: 'К', style: styles.captainBadge, fullText: 'Капитан' };
    }
    if (status === 'a') {
      return { text: 'А', style: styles.assistantBadge, fullText: 'Ассистент' };
    }
    return null;
  };

  const getNationalityInfo = (nationality?: string) => {
    if (!nationality) return null;
    
    const nat = nationality.toLowerCase();
    if (nat === 'rus') {
      return {
        name: 'Россия',
        flagUrl: 'https://flagcdn.com/w40/ru.png'
      };
    }
    return null;
  };

  const formatBirthDate = (dateString?: string) => {
    if (!dateString) return 'Не указано';
    
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch {
      return 'Не указано';
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Icon name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Загрузка...</Text>
        </View>
        <View style={styles.content}>
          <LoadingSpinner />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !player) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Icon name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Ошибка</Text>
        </View>
        <ScrollView
          style={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          <View style={styles.emptyState}>
            <Icon name="person" size={64} color={colors.textSecondary} style={styles.emptyStateIcon} />
            <Text style={styles.emptyStateTitle}>Игрок не найден</Text>
            <Text style={styles.emptyStateText}>
              {error || 'Информация об игроке недоступна. Попробуйте обновить страницу.'}
            </Text>
          </View>
          {error && <ErrorMessage message={error} />}
        </ScrollView>
      </SafeAreaView>
    );
  }

  const captainBadgeInfo = getCaptainBadgeInfo(player.captainStatus);
  const nationalityInfo = getNationalityInfo(player.nationality);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Icon name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{player.name}</Text>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.playerHeader}>
          <View style={styles.photoContainer}>
            {player.photo ? (
              <Image source={{ uri: player.photo }} style={styles.photo} />
            ) : (
              <View style={styles.photoPlaceholder}>
                <Icon name="person" size={48} color={colors.textSecondary} />
              </View>
            )}
            
            {captainBadgeInfo && (
              <View style={captainBadgeInfo.style}>
                <Text style={styles.badgeText}>{captainBadgeInfo.text}</Text>
              </View>
            )}
          </View>
          
          <Text style={styles.playerName}>{player.name}</Text>
          <Text style={[styles.playerPosition, { color: getPositionColor(player.position) }]}>
            {player.position}
          </Text>
          <Text style={styles.playerNumber}>#{player.number}</Text>
          
          {captainBadgeInfo && (
            <View style={[styles.captainStatusContainer, { backgroundColor: captainBadgeInfo.style.backgroundColor }]}>
              <Text style={styles.captainStatusText}>{captainBadgeInfo.fullText}</Text>
            </View>
          )}
        </View>

        <View style={styles.statsContainer}>
          <Text style={styles.sectionTitle}>Информация об игроке</Text>
          
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Дата рождения</Text>
              <Text style={styles.statValue}>{formatBirthDate(player.birthDate)}</Text>
            </View>
            
            {player.age && (
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Возраст</Text>
                <Text style={styles.statValue}>{player.age} лет</Text>
              </View>
            )}
            
            {player.height && (
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Рост</Text>
                <Text style={styles.statValue}>{player.height} см</Text>
              </View>
            )}
            
            {player.weight && (
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Вес</Text>
                <Text style={styles.statValue}>{player.weight} кг</Text>
              </View>
            )}
            
            {player.handedness && (
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Хват</Text>
                <Text style={styles.statValue}>{player.handedness}</Text>
              </View>
            )}
            
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Позиция</Text>
              <Text style={styles.statValue}>{player.position}</Text>
            </View>
            
            {nationalityInfo && (
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Национальность</Text>
                <View style={styles.nationalityContainer}>
                  <Text style={styles.statValue}>{nationalityInfo.name}</Text>
                  <Image 
                    source={{ uri: nationalityInfo.flagUrl }} 
                    style={styles.flagImage}
                    resizeMode="cover"
                  />
                </View>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default PlayerDetailsScreen;
