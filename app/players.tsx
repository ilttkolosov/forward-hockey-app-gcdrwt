
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Dimensions, Animated, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TabView, SceneMap, TabBar } from 'react-native-tab-view';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
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
    paddingTop: 50, // Account for status bar
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
  searchResults: {
    maxHeight: 400,
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
  animatedContainer: {
    flex: 1,
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
  if (!fullName) {
    return 'Игрок'; // или '', но лучше что-то понятное
  }

  const parts = fullName.trim().split(/\s+/);

  if (parts.length === 1) {
    return parts[0];
  }

  if (parts.length >= 2) {
    const [lastName, firstName] = parts;
    return `${firstName} ${lastName}`;
  }

  return fullName;
};


const PlayerCard: React.FC<PlayerCardProps> = ({ player, onPress }) => {
  const captainBadgeText = player.captainStatus;
  //const captainBadgeText = getCaptainBadgeText(player.captainStatus || '');
  
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

interface PlayerListProps {
  players: Player[];
  searchQuery: string;
  onPlayerPress: (player: Player) => void;
  onPullDown: () => void;
  animatedValue: Animated.Value;
  isActive: boolean;
}

const PlayerList: React.FC<PlayerListProps> = ({ 
  players, 
  searchQuery, 
  onPlayerPress,
  onPullDown,
  animatedValue,
  isActive
}) => {
  const filteredPlayers = searchPlayers(players, searchQuery);

  const renderPlayer = (player: Player, index: number) => (
    <Animated.View
      key={player.id}
      style={{
        opacity: animatedValue,
        transform: [{
          translateX: animatedValue.interpolate({
            inputRange: [0, 1],
            outputRange: [isActive ? 0 : 50, 0],
          })
        }]
      }}
    >
      <PlayerCard player={player} onPress={onPlayerPress} />
    </Animated.View>
  );

  const onGestureEvent = (event: any) => {
    // Handle pull down gesture
    if (event.nativeEvent.translationY > 100 && event.nativeEvent.velocityY > 0) {
      onPullDown();
    }
  };

  const onHandlerStateChange = (event: any) => {
    if (event.nativeEvent.state === State.END) {
      if (event.nativeEvent.translationY > 100 && event.nativeEvent.velocityY > 0) {
        onPullDown();
      }
    }
  };

  if (filteredPlayers.length === 0) {
    return (
      <Animated.View style={[styles.emptyContainer, { opacity: animatedValue }]}>
        <Text style={styles.emptyText}>
          {searchQuery ? 'Игроки не найдены' : 'Нет игроков в этой позиции'}
        </Text>
      </Animated.View>
    );
  }

  return (
    <PanGestureHandler
      onGestureEvent={onGestureEvent}
      onHandlerStateChange={onHandlerStateChange}
    >
      <Animated.ScrollView
        style={styles.animatedContainer}
        contentContainerStyle={{ paddingVertical: 8 }}
        showsVerticalScrollIndicator={false}
      >
        {filteredPlayers.map((player, index) => renderPlayer(player, index))}
      </Animated.ScrollView>
    </PanGestureHandler>
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

  // Animation values for smooth transitions
  const animatedValues = useRef([
    new Animated.Value(1), // Goalies
    new Animated.Value(0), // Defense
    new Animated.Value(0), // Forwards
  ]).current;

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
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Animate tab transitions
  useEffect(() => {
    animatedValues.forEach((animValue, i) => {
      Animated.spring(animValue, {
        toValue: i === index ? 1 : 0,
        useNativeDriver: false,
        tension: 100,
        friction: 8,
      }).start();
    });
  }, [index, animatedValues]);

  const handlePlayerPress = (player: Player) => {
    // Close search modal if open
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
    console.log('Search icon pressed - opening search modal');
    setShowSearchModal(true);
  };

  const handleCloseSearch = () => {
    setShowSearchModal(false);
    setSearchQuery('');
  };

  const handleClearSearch = () => {
    setSearchQuery('');
  };

  const groupedPlayers = groupPlayersByPosition(players);

  // Get all players for search (across all positions)
  const allPlayersForSearch = Object.values(groupedPlayers).flat();

  const renderScene = ({ route }: { route: { key: string } }) => {
    const positionIndex = positions.indexOf(route.key);
    return (
      <PlayerList
        players={groupedPlayers[route.key] || []}
        searchQuery=""
        onPlayerPress={handlePlayerPress}
        onPullDown={handleSearchPress}
        animatedValue={animatedValues[positionIndex]}
        isActive={positionIndex === index}
      />
    );
  };

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
        <TouchableOpacity style={styles.searchButton} onPress={handleSearchPress}>
          <Icon name="search" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Tab View with Smooth Animations */}
      <TabView
        navigationState={{ index, routes }}
        renderScene={renderScene}
        renderTabBar={renderTabBar}
        onIndexChange={setIndex}
        initialLayout={{ width: Dimensions.get('window').width }}
        animationEnabled={true}
        swipeEnabled={true}
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
                <TouchableOpacity style={styles.clearButton} onPress={handleClearSearch}>
                  <Icon name="close" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>

            {/* Search Results */}
            <Animated.ScrollView
              style={styles.searchResults}
              contentContainerStyle={{ paddingVertical: 8 }}
              showsVerticalScrollIndicator={false}
            >
              {searchPlayers(allPlayersForSearch, searchQuery).map((player, index) => (
                <PlayerCard key={player.id} player={player} onPress={handlePlayerPress} />
              ))}
              {searchQuery && searchPlayers(allPlayersForSearch, searchQuery).length === 0 && (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>Игроки не найдены</Text>
                </View>
              )}
            </Animated.ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
