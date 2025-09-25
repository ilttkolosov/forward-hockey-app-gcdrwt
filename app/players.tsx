
import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import PlayerCard from '../components/PlayerCard';
import Icon from '../components/Icon';
import { Player } from '../types';
import { getPlayers } from '../data/playerData';
import { commonStyles, colors } from '../styles/commonStyles';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';

type PlayerTab = 'Вратари' | 'Защитники' | 'Нападающие';

const styles = StyleSheet.create({
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    marginHorizontal: 16,
    marginVertical: 8,
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
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  activeTabText: {
    color: colors.surface,
  },
  searchContainer: {
    backgroundColor: colors.surface,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    marginLeft: 12,
  },
  searchPlaceholder: {
    color: colors.textSecondary,
  },
});

const PlayersScreen: React.FC = () => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PlayerTab>('Вратари');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setError(null);
      console.log('Loading players from API...');
      
      const playersData = await getPlayers();
      setPlayers(playersData);
      
      console.log(`Successfully loaded ${playersData.length} players`);
    } catch (err) {
      console.error('Error loading players:', err);
      setError('Ошибка загрузки списка игроков. Проверьте подключение к интернету.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    setShowSearch(true); // Show search when pulling down
    loadData();
  };

  // Group players by position
  const playersByPosition = useMemo(() => {
    const grouped = {
      'Вратари': [] as Player[],
      'Защитники': [] as Player[],
      'Нападающие': [] as Player[],
    };

    players.forEach(player => {
      const position = player.position;
      if (position === 'Вратарь') {
        grouped['Вратари'].push(player);
      } else if (position === 'Защитник') {
        grouped['Защитники'].push(player);
      } else if (position === 'Нападающий') {
        grouped['Нападающие'].push(player);
      }
    });

    return grouped;
  }, [players]);

  // Filter players based on search query
  const filteredPlayers = useMemo(() => {
    const playersInTab = playersByPosition[activeTab];
    
    if (!searchQuery.trim()) {
      return playersInTab;
    }

    const query = searchQuery.toLowerCase().trim();
    return playersInTab.filter(player => 
      player.name.toLowerCase().includes(query)
    );
  }, [playersByPosition, activeTab, searchQuery]);

  const tabs: PlayerTab[] = ['Вратари', 'Защитники', 'Нападающие'];

  if (loading) {
    return (
      <SafeAreaView style={commonStyles.container}>
        <View style={commonStyles.header}>
          <Link href="/" asChild>
            <TouchableOpacity style={{ marginRight: 16 }}>
              <Icon name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
          </Link>
          <Text style={commonStyles.title}>Игроки</Text>
        </View>
        <LoadingSpinner />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={commonStyles.container}>
      <View style={commonStyles.header}>
        <Link href="/" asChild>
          <TouchableOpacity style={{ marginRight: 16 }}>
            <Icon name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
        </Link>
        <Text style={commonStyles.title}>Игроки</Text>
      </View>

      {/* Position Tabs */}
      <View style={styles.tabContainer}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.activeTab]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Search Bar */}
      {showSearch && (
        <View style={styles.searchContainer}>
          <Icon name="search" size={20} color={colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Поиск по имени или фамилии..."
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="words"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Icon name="close-circle" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      )}

      <ScrollView
        style={commonStyles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {error && <ErrorMessage message={error} />}

        {filteredPlayers.length === 0 ? (
          <View style={commonStyles.emptyState}>
            <Icon name="people" size={64} color={colors.textSecondary} />
            <Text style={commonStyles.emptyStateTitle}>
              {searchQuery ? 'Игроки не найдены' : `Нет ${activeTab.toLowerCase()}`}
            </Text>
            <Text style={commonStyles.emptyStateText}>
              {searchQuery 
                ? 'Попробуйте изменить поисковый запрос'
                : `Информация о ${activeTab.toLowerCase()} будет добавлена в ближайшее время`
              }
            </Text>
          </View>
        ) : (
          <View style={{ padding: 8 }}>
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
