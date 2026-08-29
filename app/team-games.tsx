import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import GameCard from '../components/GameCard';
import Icon from '../components/Icon';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import { getPastGamesForTeam74 } from '../data/gameData';
import type { Game } from '../types';
import { colors, commonStyles } from '../styles/commonStyles';
import { usePersistentBottomNavigationInset } from '../components/PersistentBottomNavigation';

const isCompletedForwardGame = (game: Game) => (
  (String(game.homeTeamId) === '74' || String(game.awayTeamId) === '74')
  && (
    game.status === 'finished'
    || new Date(game.event_date).getTime() + 100 * 60 * 1_000 < Date.now()
  )
);

export default function TeamGamesScreen() {
  const router = useRouter();
  const bottomInset = usePersistentBottomNavigationInset();
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async (force = false) => {
    try {
      setError(null);
      const result = await getPastGamesForTeam74(force);
      setGames(result.filter(isCompletedForwardGame));
    } catch {
      setError('Не удалось загрузить игры команды.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (loading) return <SafeAreaView style={commonStyles.container}><LoadingSpinner /></SafeAreaView>;
  if (error) return <SafeAreaView style={commonStyles.container}><ErrorMessage message={error} onRetry={load} /></SafeAreaView>;
  return (
    <SafeAreaView edges={['top']} style={commonStyles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}><Icon name="chevron-back" size={24} color={colors.text} /></TouchableOpacity>
        <View style={styles.headerText}><Text numberOfLines={1} style={commonStyles.title}>Все игры Динамо-Форвард</Text><Text style={commonStyles.textSecondary}>{games.length} завершённых матчей</Text></View>
      </View>
      <FlatList
        data={games}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <GameCard game={item} showScore />}
        contentContainerStyle={{ padding: 16, paddingBottom: bottomInset }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(true); }} />}
        ListEmptyComponent={<Text style={styles.empty}>Прошедшие игры не найдены.</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  backButton: { padding: 4, marginRight: 12 },
  headerText: { flex: 1 },
  empty: { color: colors.textSecondary, fontSize: 15, textAlign: 'center', marginTop: 50 },
});
