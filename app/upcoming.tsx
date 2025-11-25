// app/upcoming.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import { commonStyles, colors } from '../styles/commonStyles';
import GameCard from '../components/GameCard';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import { Game } from '../types';
import {
  getUpcomingGamesMasterData,
  getPastGamesForTeam74,
} from '../data/gameData';
import Icon from '../components/Icon';
import { StyleSheet } from 'react-native';
import { useTrackScreenView } from '../hooks/useTrackScreenView';
import { useRouter } from 'expo-router';

export default function TeamGamesScreen() {
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');
  const [upcomingGames, setUpcomingGames] = useState<Game[]>([]);
  const [pastGames, setPastGames] = useState<Game[]>([]);
  const [upcomingCount, setUpcomingCount] = useState(0);
  const [pastCount, setPastCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();

  const upcomingListRef = useRef<FlatList<Game>>(null);
  const pastListRef = useRef<FlatList<Game>>(null);

  const handleBackPress = () => {
    router.back();
  };

  const loadUpcoming = async () => {
    try {
      const games = await getUpcomingGamesMasterData();
      setUpcomingGames(games);
      setUpcomingCount(games.length);
    } catch (err) {
      console.error('Error loading upcoming games:', err);
      setError('Не удалось загрузить предстоящие игры.');
    }
  };

  const loadPast = async () => {
    try {
      const games = await getPastGamesForTeam74();
      setPastGames(games);
      setPastCount(games.length);
    } catch (err) {
      console.error('Error loading past games:', err);
      setError('Не удалось загрузить прошедшие игры.');
    }
  };

  const loadData = async () => {
    setError(null);
    try {
      await Promise.all([loadUpcoming(), loadPast()]);
    } catch (err) {
      // Ошибки обрабатываются внутри
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  //Аналитика экрана
  useTrackScreenView('Экран все игры Динамо-Форвард');

  const handleTabChange = (index: number) => {
    const newTab = index === 0 ? 'upcoming' : 'past';
    setActiveTab(newTab);

    // Скролл вверх при смене вкладки
    if (newTab === 'upcoming' && upcomingListRef.current) {
      upcomingListRef.current.scrollToOffset({ offset: 0, animated: true });
    } else if (newTab === 'past' && pastListRef.current) {
      pastListRef.current.scrollToOffset({ offset: 0, animated: true });
    }
  };

  const renderGame = ({ item }: { item: Game }) => (
    <GameCard game={item} showScore={activeTab === 'past'} />
  );

  const renderEmpty = () => (
    <View style={commonStyles.errorContainer}>
      <Text style={commonStyles.text}>
        {activeTab === 'upcoming' ? 'Нет предстоящих игр' : 'Нет прошедших игр'}
      </Text>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={commonStyles.container}>
        <LoadingSpinner />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={commonStyles.container}>
        <ErrorMessage message={error} onRetry={loadData} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={commonStyles.container}>
      {/* Fixed Header */}
      <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <TouchableOpacity onPress={handleBackPress} style={{ marginRight: 16 }}>
            <Icon name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.screenTitle}>Все игры Динамо-Форвард</Text>
        </View>

        {/* Segmented Control — как в players.tsx */}
        <SegmentedControl
          values={[`Предстоящие (${upcomingCount})`, `Прошедшие (${pastCount})`]}
          selectedIndex={activeTab === 'upcoming' ? 0 : 1}
          onChange={(event) => handleTabChange(event.nativeEvent.selectedSegmentIndex)}
          tintColor={colors.primary}
          fontStyle={{ fontSize: 14, fontWeight: '600' }}
          activeFontStyle={{ fontWeight: '700' }}
          springEnabled={false}
        />
      </View>

      {/* Scrollable Content */}
      {activeTab === 'upcoming' ? (
        <FlatList
          ref={upcomingListRef}
          data={upcomingGames}
          renderItem={renderGame}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 64 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={renderEmpty()}
        />
      ) : (
        <FlatList
          ref={pastListRef}
          data={pastGames}
          renderItem={renderGame}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 64 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={renderEmpty()}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screenTitle: {
    fontSize: 20,        // ↓ меньше, чем у commonStyles.title (обычно 24)
    fontWeight: '600',   // ↓ чуть легче (вместо bold / 700)
    color: colors.text,
  },
});