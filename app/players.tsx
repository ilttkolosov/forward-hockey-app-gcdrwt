
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import PlayerCard from '../components/PlayerCard';
import PlayerSearchBar from '../components/PlayerSearchBar';
import Icon from '../components/Icon';
import { Player } from '../types';
import { getPlayers, checkApiAvailability, searchPlayers } from '../data/playerData';
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
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  activeTab: {
    backgroundColor: colors.primary,
  },
  inactiveTab: {
    backgroundColor: 'transparent',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  activeTabText: {
    color: colors.surface,
  },
  inactiveTabText: {
    color: colors.textSecondary,
  },
  content: {
    flex: 1,
  },
  searchContainer: {
    overflow: 'hidden',
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
  searchResultsInfo: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  searchResultsText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});

type PlayerPosition = 'Вратари' | 'Защитники' | 'Нападающие';

const PlayersScreen: React.FC = () => {
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [filteredPlayers, setFilteredPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiAvailable, setApiAvailable] = useState<boolean | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [activeTab, setActiveTab] = useState<PlayerPosition>('Вратари');
  
  const searchHeight = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<ScrollView>(null);

  const tabs: PlayerPosition[] = ['Вратари', 'Защитники', 'Нападающие'];

  useEffect(() => {
    initializeScreen();
  }, []);

  useEffect(() => {
    // Фильтруем игроков при изменении поискового запроса или активной вкладки
    let filtered = allPlayers;
    
    console.log('Фильтрация игроков. Всего игроков:', allPlayers.length);
    console.log('Активная вкладка:', activeTab);
    console.log('Поисковый запрос:', searchQuery);
    
    // Фильтруем по позиции
    filtered = filtered.filter(player => {
      const matches = player.position === activeTab;
      if (!matches) {
        console.log(`Игрок ${player.name} (позиция: ${player.position}) не подходит для вкладки ${activeTab}`);
      }
      return matches;
    });
    
    console.log(`После фильтрации по позиции осталось ${filtered.length} игроков`);
    
    // Фильтруем по поисковому запросу
    if (searchQuery) {
      filtered = searchPlayers(filtered, searchQuery);
      console.log(`После поиска по запросу "${searchQuery}" осталось ${filtered.length} игроков`);
    }
    
    // Сортируем по игровому номеру
    filtered = filtered.sort((a, b) => a.number - b.number);
    
    setFilteredPlayers(filtered);
  }, [searchQuery, allPlayers, activeTab]);

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
      setAllPlayers(playersData);
      
      console.log(`Успешно загружено ${playersData.length} игроков`);
      
      // Логируем распределение по позициям для отладки
      const positionCounts = playersData.reduce((acc, player) => {
        acc[player.position] = (acc[player.position] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      console.log('Распределение игроков по позициям в UI:', positionCounts);
      
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

  const handleScroll = (event: any) => {
    const { contentOffset } = event.nativeEvent;
    
    // Показываем поиск при прокрутке вниз
    if (contentOffset.y < -50 && !showSearch) {
      setShowSearch(true);
      Animated.timing(searchHeight, {
        toValue: 80,
        duration: 300,
        useNativeDriver: false,
      }).start();
    }
  };

  const handleSearchChange = (query: string) => {
    console.log('Поиск игроков:', query);
    setSearchQuery(query);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setShowSearch(false);
    Animated.timing(searchHeight, {
      toValue: 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  };

  const handleTabPress = (tab: PlayerPosition) => {
    console.log('Переключение на вкладку:', tab);
    setActiveTab(tab);
    setSearchQuery(''); // Очищаем поиск при смене вкладки
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

      {/* Вкладки позиций */}
      <View style={styles.tabsContainer}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[
              styles.tab,
              activeTab === tab ? styles.activeTab : styles.inactiveTab,
            ]}
            onPress={() => handleTabPress(tab)}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === tab ? styles.activeTabText : styles.inactiveTabText,
              ]}
            >
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Animated.View style={[styles.searchContainer, { height: searchHeight }]}>
        {showSearch && (
          <PlayerSearchBar
            searchQuery={searchQuery}
            onSearchChange={handleSearchChange}
            onClear={handleClearSearch}
            placeholder="Поиск по имени, позиции или номеру..."
          />
        )}
      </Animated.View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.content}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {error && <ErrorMessage message={error} />}

        {searchQuery.length > 0 && (
          <View style={styles.searchResultsInfo}>
            <Text style={styles.searchResultsText}>
              Найдено игроков: {filteredPlayers.length}
            </Text>
          </View>
        )}

        {filteredPlayers.length === 0 ? (
          <View style={styles.emptyState}>
            <Icon 
              name={searchQuery.length > 0 ? "search" : "people"} 
              size={64} 
              color={colors.textSecondary} 
              style={styles.emptyStateIcon} 
            />
            <Text style={styles.emptyStateTitle}>
              {searchQuery.length > 0 
                ? 'Игроки не найдены' 
                : apiAvailable === false 
                  ? 'API недоступен' 
                  : `Нет игроков в категории "${activeTab}"`
              }
            </Text>
            <Text style={styles.emptyStateText}>
              {searchQuery.length > 0 
                ? `По запросу "${searchQuery}" игроки не найдены. Попробуйте изменить поисковый запрос.`
                : apiAvailable === false 
                  ? 'Не удается подключиться к серверу. Проверьте подключение к интернету и попробуйте снова.'
                  : `Информация об игроках в категории "${activeTab}" будет добавлена в ближайшее время`
              }
            </Text>
          </View>
        ) : (
          <View style={styles.playersContainer}>
            {filteredPlayers.map((player) => (
              <PlayerCard key={player.id} player={player} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

export default PlayersScreen;
