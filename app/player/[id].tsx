
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Image, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';
import Icon from '../../components/Icon';
import { Player } from '../../types';
import { getPlayerById } from '../../data/playerData';
import { colors, commonStyles } from '../../styles/commonStyles';

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 24,
    backgroundColor: colors.surface,
    marginBottom: 16,
    borderRadius: 12,
  },
  photoContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: colors.primary,
  },
  photo: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  number: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: 8,
  },
  badges: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  captainBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 8,
  },
  captainText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.surface,
  },
  positionBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  positionText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.surface,
  },
  infoSection: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
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
    borderBottomColor: colors.border,
  },
  infoRowLast: {
    borderBottomWidth: 0,
  },
  infoLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    flex: 1,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    textAlign: 'right',
  },
  nationalityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  nationalityText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginLeft: 8,
  },
});

export default function PlayerDetailsScreen() {
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
      console.log('Загрузка данных игрока с ID:', id);
      
      const playerData = await getPlayerById(id!);
      if (playerData) {
        setPlayer(playerData);
        console.log('Данные игрока загружены:', playerData);
      } else {
        setError('Игрок не найден');
      }
    } catch (error) {
      console.error('Ошибка загрузки данных игрока:', error);
      setError('Не удалось загрузить данные игрока');
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
      case 'вратарь':
      case 'goalkeeper':
      case 'g':
        return colors.error;
      case 'защитник':
      case 'defenseman':
      case 'd':
        return colors.primary;
      case 'нападающий':
      case 'forward':
      case 'f':
        return colors.success;
      default:
        return colors.textSecondary;
    }
  };

  const getCaptainBadgeInfo = () => {
    if (!player?.captainStatus) return null;
    
    switch (player.captainStatus.toLowerCase()) {
      case 'captain':
      case 'капитан':
        return { text: 'Капитан', color: colors.warning };
      case 'assistant':
      case 'ассистент':
        return { text: 'Ассистент', color: colors.secondary };
      default:
        return null;
    }
  };

  const getNationalityInfo = () => {
    if (!player?.nationality) return null;
    
    // Здесь можно добавить логику для отображения флагов
    return {
      flag: '🇷🇺', // По умолчанию российский флаг
      name: player.nationality,
    };
  };

  const formatBirthDate = () => {
    if (!player?.birthDate) return null;
    
    try {
      const date = new Date(player.birthDate);
      return date.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
    } catch (error) {
      return player.birthDate;
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={commonStyles.container}>
        <LoadingSpinner text="Загрузка данных игрока..." />
      </SafeAreaView>
    );
  }

  if (error || !player) {
    return (
      <SafeAreaView style={commonStyles.container}>
        <ErrorMessage message={error || 'Игрок не найден'} />
        <TouchableOpacity 
          style={[commonStyles.button, { margin: 16 }]} 
          onPress={() => router.back()}
        >
          <Text style={commonStyles.buttonText}>Назад</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const captainInfo = getCaptainBadgeInfo();
  const nationalityInfo = getNationalityInfo();

  return (
    <SafeAreaView style={commonStyles.container}>
      <ScrollView
        style={commonStyles.flex1}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.header}>
          <View style={styles.photoContainer}>
            {player.photo ? (
              <Image 
                source={{ uri: player.photo }} 
                style={styles.photo}
                defaultSource={require('../../assets/images/natively-dark.png')}
              />
            ) : (
              <Icon name="person" size={60} color={colors.textSecondary} />
            )}
          </View>
          
          <Text style={styles.name}>{player.name}</Text>
          <Text style={styles.number}>#{player.number}</Text>
          
          <View style={styles.badges}>
            {captainInfo && (
              <View style={[styles.captainBadge, { backgroundColor: captainInfo.color }]}>
                <Text style={styles.captainText}>{captainInfo.text}</Text>
              </View>
            )}
            <View style={[styles.positionBadge, { backgroundColor: getPositionColor(player.position) }]}>
              <Text style={styles.positionText}>{player.position}</Text>
            </View>
          </View>
        </View>

        <View style={styles.infoSection}>
          <Text style={styles.sectionTitle}>Основная информация</Text>
          
          {player.age && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Возраст</Text>
              <Text style={styles.infoValue}>{player.age} лет</Text>
            </View>
          )}
          
          {formatBirthDate() && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Дата рождения</Text>
              <Text style={styles.infoValue}>{formatBirthDate()}</Text>
            </View>
          )}
          
          {nationalityInfo && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Гражданство</Text>
              <View style={styles.nationalityContainer}>
                <Text style={styles.infoValue}>{nationalityInfo.flag}</Text>
                <Text style={styles.nationalityText}>{nationalityInfo.name}</Text>
              </View>
            </View>
          )}
          
          {player.height && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Рост</Text>
              <Text style={styles.infoValue}>{player.height} см</Text>
            </View>
          )}
          
          {player.weight && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Вес</Text>
              <Text style={styles.infoValue}>{player.weight} кг</Text>
            </View>
          )}
          
          {player.handedness && (
            <View style={[styles.infoRow, styles.infoRowLast]}>
              <Text style={styles.infoLabel}>Хват</Text>
              <Text style={styles.infoValue}>{player.handedness}</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
