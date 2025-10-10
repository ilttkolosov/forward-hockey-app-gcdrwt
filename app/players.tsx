// app/players.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { commonStyles, colors } from '../styles/commonStyles';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import Icon from '../components/Icon';
import { Player } from '../types';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import { getPlayers, searchPlayers, getMassiv1, getMassiv2, getMassiv3 } from '../data/playerData';
import { getPositionTabName, getHandednessText } from '../utils/playerUtils';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { playerDownloadService } from '../services/playerDataService'; // ← добавили

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
    justifyContent: 'space-between',
  },
  backButton: {
    marginRight: 16,
    padding: 8,
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  searchButton: {
    padding: 8,
    marginLeft: 8,
  },
  // Search Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-start',
  },
  modalContent: {
    backgroundColor: colors.background,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  searchTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  closeButton: {
    padding: 8,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
  },
  clearButton: {
    marginLeft: 12,
    padding: 4,
  },
  playerCard: {
    backgroundColor: colors.card,
    marginHorizontal: 16,
    marginVertical: 6,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  playerAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.border,
    marginRight: 16,
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  playerDetails: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  numberContainer: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  captainBadge: {
    backgroundColor: colors.error,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 8,
    minWidth: 28,
    alignItems: 'center',
  },
  captainBadgeText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: 'bold',
  },
  playerNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.primary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});

interface PlayerCardProps {
  player: Player;
  onPress: (player: Player) => void;
}

const formatName = (fullName: string | null | undefined): string => {
  if (!fullName) return 'Игрок';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  if (parts.length >= 2) {
    const [lastName, firstName] = parts;
    return `${firstName} ${lastName}`;
  }
  return fullName;
};

const PlayerCard: React.FC<PlayerCardProps> = ({ player, onPress }) => {
  const captainBadgeText = player.captainStatus;

  return (
    <TouchableOpacity style={styles.playerCard} onPress={() => onPress(player)}>
      <Image
        source={player.photo ? { uri: player.photo } : require('../assets/images/natively-dark.png')}
        style={styles.playerAvatar}
        cachePolicy="memory-disk"
      />
      <View style={styles.playerInfo}>
        <Text style={styles.playerName}>{formatName(player.name)}</Text>
        <Text style={styles.playerDetails}>
          {player.position} • Хват: {getHandednessText(player.handedness || '')}
        </Text>
        <Text style={styles.playerDetails}>
          {player.age ? `${player.age} лет` : 'Возраст не указан'}
        </Text>
      </View>
      <View style={styles.numberContainer}>
        {captainBadgeText && (
          <View style={styles.captainBadge}>
            <Text style={styles.captainBadgeText}>{captainBadgeText}</Text>
          </View>
        )}
        <Text style={[styles.playerNumber, { fontSize: 30 }]}>#{player.number}</Text>
      </View>
    </TouchableOpacity>
  );
};

export default function PlayersScreen() {
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [index, setIndex] = useState(0);
  const [playersReady, setPlayersReady] = useState(false); // ← флаг готовности

  const positions = ['Вратарь', 'Защитник', 'Нападающий'];

  const getPlayersForPosition = (selectedIndex: number): Player[] => {
    switch (selectedIndex) {
      case 0: return getMassiv1();
      case 1: return getMassiv2();
      case 2: return getMassiv3();
      default: return [];
    }
  };

  // Проверяем, готовы ли данные
  const checkPlayersReady = async () => {
    const ready = await playerDownloadService.isDataLoaded();
    setPlayersReady(ready);
    if (ready) {
      // Данные есть — загружаем их
      try {
        const playersData = await getPlayers(); // теперь getPlayers() вернёт кэш
        setPlayers(playersData);
        setLoading(false);
      } catch (err) {
        console.error('Error loading players from storage:', err);
        setError('Не удалось загрузить данные игроков.');
        setLoading(false);
      }
    } else {
      // Данных нет — продолжаем ждать
      setLoading(true);
      // Повторная проверка через 1 секунду
      setTimeout(checkPlayersReady, 1000);
    }
  };

  useEffect(() => {
    checkPlayersReady();
  }, []);

  const handlePlayerPress = (player: Player) => {
    if (showSearchModal) {
      setShowSearchModal(false);
      setSearchQuery('');
    }
    router.push(`/player/${player.id}`);
  };

  const handleBackPress = () => {
    router.back();
  };

  const handleSearchPress = () => {
    setShowSearchModal(true);
  };

  const handleCloseSearch = () => {
    setShowSearchModal(false);
    setSearchQuery('');
  };

  const handleClearSearch = () => {
    setSearchQuery('');
  };

  if (loading && !playersReady) {
    return (
      <SafeAreaView style={commonStyles.container}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ marginTop: 16, fontSize: 16, color: colors.textSecondary, textAlign: 'center' }}>
            Загрузка данных игроков...
          </Text>
          <Text style={{ marginTop: 8, fontSize: 14, color: colors.textSecondary, textAlign: 'center' }}>
            Это может занять до 1-2 минут при первом запуске.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={commonStyles.container}>
        <ErrorMessage message={error} onRetry={() => checkPlayersReady()} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={commonStyles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
          <Icon name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={commonStyles.title}>Игроки</Text>
          <Text style={commonStyles.textSecondary}>{players.length} игроков</Text>
        </View>
        <TouchableOpacity onPress={handleSearchPress} style={styles.searchButton}>
          <Icon name="search" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>
      {/* Segmented Control */}
      <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
        <SegmentedControl
          values={positions}
          selectedIndex={index}
          onChange={(event) => setIndex(event.nativeEvent.selectedSegmentIndex)}
          tintColor={colors.primary}
          fontStyle={{ fontSize: 14, fontWeight: '600' }}
          activeFontStyle={{ fontWeight: '700' }}
          springEnabled={false}
        />
      </View>
      {/* Players List */}
      <FlatList
        data={getPlayersForPosition(index)}
        renderItem={({ item }) => (
          <PlayerCard player={item} onPress={handlePlayerPress} />
        )}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingVertical: 8, paddingHorizontal: 16 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={commonStyles.errorContainer}>
            <Text style={commonStyles.text}>Нет игроков в этой позиции.</Text>
            <Text style={commonStyles.textSecondary}>
              Попробуйте выбрать другую позицию или обновить страницу.
            </Text>
          </View>
        }
      />
      {/* Search Modal */}
      <Modal
        visible={showSearchModal}
        animationType="slide"
        transparent={true}
        onRequestClose={handleCloseSearch}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.searchHeader}>
              <Text style={styles.searchTitle}>Поиск игроков</Text>
              <TouchableOpacity style={styles.closeButton} onPress={handleCloseSearch}>
                <Icon name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <View style={styles.searchInputContainer}>
              <Icon name="search" size={20} color={colors.textSecondary} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Поиск по всем игрокам..."
                placeholderTextColor={colors.textSecondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={handleClearSearch} style={styles.clearButton}>
                  <Icon name="close" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
            <FlatList
              data={searchPlayers(players, searchQuery)}
              renderItem={({ item }) => (
                <PlayerCard key={item.id} player={item} onPress={handlePlayerPress} />
              )}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ maxHeight: 400 }}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={commonStyles.errorContainer}>
                  <Text style={commonStyles.text}>Игроки не найдены.</Text>
                  <Text style={commonStyles.textSecondary}>
                    Попробуйте изменить поисковый запрос или обновить страницу.
                  </Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>
      <View style={{ height: 32 }} />
    </SafeAreaView>
  );
}