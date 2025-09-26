
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from '../components/Icon';
import { Player } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';
import PlayerSearchBar from '../components/PlayerSearchBar';
import { getPlayers, checkApiAvailability, searchPlayers } from '../data/playerData';
import { commonStyles, colors } from '../styles/commonStyles';
import PlayerCard from '../components/PlayerCard';
import ErrorMessage from '../components/ErrorMessage';

const styles = StyleSheet.create({
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  playersContainer: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
  },
  playerCount: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  scrollToTopButton: {
    position: 'absolute',
    right: 16,
    bottom: 80,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
});

export default function PlayersScreen() {
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [filteredPlayers, setFilteredPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollToTopOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    initializeScreen();
  }, []);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredPlayers(allPlayers);
    } else {
      const filtered = searchPlayers(allPlayers, searchQuery);
      setFilteredPlayers(filtered);
    }
  }, [searchQuery, allPlayers]);

  const initializeScreen = async () => {
    console.log('Инициализация экрана игроков...');
    await loadPlayers();
  };

  const loadPlayers = async () => {
    try {
      setError(null);
      console.log('Загрузка игроков...');
      
      const apiAvailable = await checkApiAvailability();
      console.log('API доступен:', apiAvailable);
      
      const players = await getPlayers();
      console.log('Загружено игроков:', players.length);
      
      setAllPlayers(players);
      setFilteredPlayers(players);
    } catch (error) {
      console.error('Ошибка загрузки игроков:', error);
      setError('Не удалось загрузить список игроков. Проверьте подключение к интернету.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadPlayers();
  };

  const handleScroll = (event: any) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    const shouldShow = offsetY > 300;
    
    if (shouldShow !== showScrollToTop) {
      setShowScrollToTop(shouldShow);
      Animated.timing(scrollToTopOpacity, {
        toValue: shouldShow ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
  };

  const scrollToTop = () => {
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  };

  if (loading) {
    return (
      <SafeAreaView style={commonStyles.container}>
        <LoadingSpinner text="Загрузка игроков..." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={commonStyles.container}>
      <View style={styles.headerContainer}>
        <View>
          <Text style={styles.headerTitle}>Игроки</Text>
          <Text style={styles.playerCount}>
            {filteredPlayers.length} {filteredPlayers.length === 1 ? 'игрок' : 
             filteredPlayers.length < 5 ? 'игрока' : 'игроков'}
          </Text>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <PlayerSearchBar
          value={searchQuery}
          onChangeText={handleSearchChange}
          onClear={handleClearSearch}
          placeholder="Поиск игроков..."
        />
      </View>

      {error && <ErrorMessage message={error} />}

      <ScrollView
        ref={scrollViewRef}
        style={commonStyles.flex1}
        contentContainerStyle={styles.playersContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {filteredPlayers.length === 0 ? (
          <View style={commonStyles.emptyState}>
            <Icon name="person-off" size={48} color={colors.textSecondary} />
            <Text style={commonStyles.emptyStateTitle}>
              {searchQuery ? 'Игроки не найдены' : 'Нет игроков'}
            </Text>
            <Text style={commonStyles.emptyStateText}>
              {searchQuery 
                ? 'Попробуйте изменить поисковый запрос'
                : 'Список игроков пуст'
              }
            </Text>
          </View>
        ) : (
          filteredPlayers.map((player) => (
            <PlayerCard key={player.id} player={player} />
          ))
        )}
      </ScrollView>

      <Animated.View 
        style={[
          styles.scrollToTopButton,
          { opacity: scrollToTopOpacity }
        ]}
        pointerEvents={showScrollToTop ? 'auto' : 'none'}
      >
        <TouchableOpacity onPress={scrollToTop} style={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="keyboard-arrow-up" size={24} color={colors.surface} />
        </TouchableOpacity>
      </Animated.View>
    </SafeAreaView>
  );
}
