
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, RefreshControl, TextInput, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TabView, SceneMap, TabBar } from 'react-native-tab-view';
import { commonStyles, colors } from '../styles/commonStyles';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import Icon from '../components/Icon';
import { Player } from '../types';
import { getPlayers, searchPlayers, groupPlayersByPosition } from '../data/playerData';
import { getPositionTabName, getCaptainBadgeText, getHandednessText } from '../utils/playerUtils';
import { useRouter } from 'expo-router';
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
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchInput: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabBar: {
    backgroundColor: colors.background,
    elevation: 0,
    shadowOpacity: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tabIndicator: {
    backgroundColor: colors.primary,
    height: 3,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'none',
  },
  playerCard: {
    backgroundColor: colors.cardBackground,
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
  },
  playerNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.primary,
  },
  captainBadge: {
    backgroundColor: colors.error,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 6,
    minWidth: 28,
    alignItems: 'center',
  },
  captainBadgeText: {
    color: colors.background,
    fontSize: 14,
    fontWeight: 'bold',
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

const PlayerCard: React.FC<PlayerCardProps> = ({ player, onPress }) => {
  const captainBadgeText = getCaptainBadgeText(player.captainStatus || '');
  
  return (
    <TouchableOpacity style={styles.playerCard} onPress={() => onPress(player)}>
      <Image
        source={player.photo ? { uri: player.photo } : require('../assets/images/natively-dark.png')}
        style={styles.playerAvatar}
        cachePolicy="memory-disk"
      />
      <View style={styles.playerInfo}>
        <Text style={styles.playerName}>{player.name}</Text>
        <Text style={styles.playerDetails}>
          {player.position} • {getHandednessText(player.handedness || '')}
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
        <Text style={styles.playerNumber}>#{player.number}</Text>
      </View>
    </TouchableOpacity>
  );
};

interface PlayerListProps {
  players: Player[];
  searchQuery: string;
  refreshing: boolean;
  onRefresh: () => void;
  onPlayerPress: (player: Player) => void;
}

const PlayerList: React.FC<PlayerListProps> = ({ 
  players, 
  searchQuery, 
  refreshing, 
  onRefresh, 
  onPlayerPress 
}) => {
  const filteredPlayers = searchPlayers(players, searchQuery);

  const renderPlayer = ({ item }: { item: Player }) => (
    <PlayerCard player={item} onPress={onPlayerPress} />
  );

  if (filteredPlayers.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>
          {searchQuery ? 'Игроки не найдены' : 'Нет игроков в этой позиции'}
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={filteredPlayers}
      renderItem={renderPlayer}
      keyExtractor={(item) => item.id}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      contentContainerStyle={{ paddingVertical: 8 }}
      showsVerticalScrollIndicator={false}
    />
  );
};

export default function PlayersScreen() {
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [index, setIndex] = useState(0);

  const positions = ['Вратарь', 'Защитник', 'Нападающий'];
  const [routes] = useState(
    positions.map(position => ({
      key: position,
      title: getPositionTabName(position),
    }))
  );

  const loadData = async () => {
    try {
      setError(null);
      console.log('Loading players data...');
      const playersData = await getPlayers();
      setPlayers(playersData);
      console.log(`Loaded ${playersData.length} players`);
    } catch (err) {
      console.log('Error loading players:', err);
      setError('Не удалось загрузить список игроков. Попробуйте еще раз.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setShowSearch(true);
    loadData();
  }, []);

  const handlePlayerPress = (player: Player) => {
    router.push(`/player/${player.id}`);
  };

  const handleBackPress = () => {
    router.back();
  };

  const groupedPlayers = groupPlayersByPosition(players);

  const renderScene = SceneMap(
    positions.reduce((acc, position) => {
      acc[position] = () => (
        <PlayerList
          players={groupedPlayers[position] || []}
          searchQuery={searchQuery}
          refreshing={refreshing}
          onRefresh={onRefresh}
          onPlayerPress={handlePlayerPress}
        />
      );
      return acc;
    }, {} as any)
  );

  const renderTabBar = (props: any) => (
    <TabBar
      {...props}
      style={styles.tabBar}
      indicatorStyle={styles.tabIndicator}
      labelStyle={styles.tabLabel}
      activeColor={colors.primary}
      inactiveColor={colors.textSecondary}
    />
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <LoadingSpinner />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <ErrorMessage message={error} onRetry={loadData} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBackPress}>
          <Icon name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitle}>
          <Text style={styles.title}>Игроки</Text>
          <Text style={styles.subtitle}>{players.length} игроков</Text>
        </View>
      </View>

      {/* Search Bar */}
      {showSearch && (
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Поиск игроков..."
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      )}

      {/* Tab View */}
      <TabView
        navigationState={{ index, routes }}
        renderScene={renderScene}
        renderTabBar={renderTabBar}
        onIndexChange={setIndex}
        initialLayout={{ width: Dimensions.get('window').width }}
      />
    </SafeAreaView>
  );
}
