// app/tournaments.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import { colors } from '../styles/commonStyles';
import { fetchTournamentTable, getCachedTournamentTable, TournamentTable } from '../services/tournamentsApi';
import { useNavigation } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TOURNAMENTS_NOW_KEY = 'tournaments_now';
const TOURNAMENTS_PAST_KEY = 'tournaments_past';
const CURRENT_TOURNAMENT_ID_KEY = 'current_tournament_id';

export default function TournamentsScreen() {
  const [activeTab, setActiveTab] = useState<number>(0);
    const [tables, setTables] = useState<{
    current: { name: string; id: string; data: TournamentTable[] }[];
    past: { name: string; id: string; data: TournamentTable[] }[];
    }>({ current: [], past: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const navigation = useNavigation();

  useEffect(() => {
    console.log('🔄 [Tournaments] useEffect запущен');
    loadTournamentsFromCache();
  }, []);

  const loadTournamentsFromCache = async () => {
    console.log('🔄 [Tournaments] loadTournamentsFromCache запущен');
    try {
      // Загружаем текущие турниры из кэша
      const cachedTournamentsNow = await AsyncStorage.getItem(TOURNAMENTS_NOW_KEY);
      console.log('🔄 [Tournaments] Загружаем current tournaments из кэша...');

      if (cachedTournamentsNow) {
        const currentTournaments = JSON.parse(cachedTournamentsNow);
        console.log(`✅ [Tournaments] Загружено ${currentTournaments.length} текущих турниров из кэша`);

        // Загружаем таблицы для текущих турниров из кэша
        const currentData = await Promise.all(
          currentTournaments.map(async (t: any) => {
            console.log(`🔄 [Tournaments] Получаем таблицу из кэша для текущего турнира: ${t.tournament_Name} (${t.tournament_ID})`);
            const data = await getCachedTournamentTable(t.tournament_ID);
            console.log(`✅ [Tournaments] Таблица для текущего турнира ${t.tournament_Name} загружена из кэша`);
            return {
              name: t.tournament_Name,
              id: t.tournament_ID,
              data,
            };
          })
        );

        console.log('✅ [Tournaments] Все текущие турниры загружены из кэша');
        setTables(prev => ({ ...prev, current: currentData }));
      } else {
        console.log('❌ [Tournaments] Нет данных о текущих турнирах в кэше');
      }

      // Загружаем прошедшие турниры из кэша (в фоне)
      const cachedTournamentsPast = await AsyncStorage.getItem(TOURNAMENTS_PAST_KEY);
      console.log('🔄 [Tournaments] Загружаем past tournaments из кэша...');

      if (cachedTournamentsPast) {
        const pastTournaments = JSON.parse(cachedTournamentsPast);
        console.log(`✅ [Tournaments] Загружено ${pastTournaments.length} прошедших турниров из кэша`);

        // Загружаем таблицы для прошедших турниров из кэша
        const pastData = await Promise.all(
          pastTournaments.map(async (t: any) => {
            console.log(`🔄 [Tournaments] Получаем таблицу из кэша для прошедшего турнира: ${t.tournament_Name} (${t.tournament_ID})`);
            const data = await getCachedTournamentTable(t.tournament_ID);
            console.log(`✅ [Tournaments] Таблица для прошедшего турнира ${t.tournament_Name} загружена из кэша`);
            return {
              name: t.tournament_Name,
              id: t.tournament_ID,
              data,
            };
          })
        );

        console.log('✅ [Tournaments] Все прошедшие турниры загружены из кэша');
        setTables(prev => ({ ...prev, past: pastData }));
      } else {
        console.log('❌ [Tournaments] Нет данных о прошедших турнирах в кэше');
      }
    } catch (e) {
      console.error('❌ [Tournaments] Error loading tournaments from cache:', e);
    } finally {
      setLoading(false);
      console.log('✅ [Tournaments] setLoading(false) вызван');
    }
  };

  const onRefresh = async () => {
    console.log('🔄 [Tournaments] pullToRefresh запущен');
    setRefreshing(true);
    try {
      // Обновляем только текущие турниры (через API и сохранение в кэш)
      const cachedTournamentsNow = await AsyncStorage.getItem(TOURNAMENTS_NOW_KEY);
      if (cachedTournamentsNow) {
        const currentTournaments = JSON.parse(cachedTournamentsNow);
        const currentData = await Promise.all(
          currentTournaments.map(async (t: any) => {
            console.log(`🔄 [Tournaments] Обновляем таблицу для текущего турнира: ${t.tournament_Name} (${t.tournament_ID})`);
            const data = await fetchTournamentTable(t.tournament_ID); // Обновляем кэш
            console.log(`✅ [Tournaments] Таблица для текущего турнира ${t.tournament_Name} обновлена`);
            return {
              name: t.tournament_Name,
              id: t.tournament_ID,
              data,
            };
          })
        );
        setTables(prev => ({ ...prev, current: currentData }));
        console.log('✅ [Tournaments] Все текущие турниры обновлены');
      }
    } catch (e) {
      console.error('❌ [Tournaments] Error refreshing tournament ', e);
    } finally {
      setRefreshing(false);
      console.log('✅ [Tournaments] pullToRefresh завершён');
    }
  };

  const renderTable = (name: string, tournamentId: string, data: TournamentTable[]) => {
    if (!data || !Array.isArray(data)) {
      console.log(`⚠️ [Tournaments] Нет данных для турнира ${name}`);
      return null;
    }

    console.log(`🖼️ [Tournaments] Рендер таблицы: ${name}, данных: ${data.length} строк`);
    return (
      <View key={tournamentId} style={styles.tableContainer}>
        <Text style={styles.tableTitle}>{name}</Text>
        <View style={styles.tableHeader}>
          <Text style={[styles.headerCell, styles.position]}>Поз.</Text>
          <Text style={[styles.headerCell, styles.team]}>Команда</Text>
          <Text style={[styles.headerCell, styles.games]}>И</Text>
          <Text style={[styles.headerCell, styles.points]}>О</Text>
        </View>
        {data.map((row, index) => (
          <View
            key={row.team_id}
            style={[
              styles.tableRow,
              index % 2 === 0 ? styles.evenRow : styles.oddRow
            ]}
          >
            <Text style={[styles.cell, styles.position]}>{row.position}</Text>
            <Text style={[styles.cell, styles.team]}>{row.team_name}</Text>
            <Text style={[styles.cell, styles.games]}>{row.games}</Text>
            <Text style={[styles.cell, styles.points]}>{row.points_2x}</Text>
          </View>
        ))}
        <TouchableOpacity
          style={styles.detailButton}
          onPress={() => navigation.navigate('tournaments/[id]', { id: tournamentId })}
        >
          <Text style={styles.detailButtonText}>Подробнее</Text>
        </TouchableOpacity>
      </View>
    );
  };

  if (loading) {
    console.log('🔄 [Tournaments] Отображаем Loading...');
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <Text style={styles.title}>Турниры</Text>
      <SegmentedControl
        values={['Текущие', 'Прошедшие']}
        selectedIndex={activeTab}
        onChange={(event) => {
          setActiveTab(event.nativeEvent.selectedSegmentIndex);
        }}
        style={styles.segmentedControl}
      />
      {activeTab === 0 && (
        <>
          {tables.current.length > 0 ? (
            tables.current.map(table => renderTable(table.name, table.id, table.data))
          ) : (
            <Text style={styles.emptyText}>Нет текущих турниров</Text>
          )}
        </>
      )}
      {activeTab === 1 && (
        <>
          {tables.past.length > 0 ? (
            tables.past.map(table => renderTable(table.name, table.id, table.data))
          ) : (
            <Text style={styles.emptyText}>Нет прошедших турниров</Text>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 16,
  },
  segmentedControl: {
    marginBottom: 20,
  },
  tableContainer: {
    marginBottom: 24,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  tableTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 12,
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    paddingBottom: 8,
    marginBottom: 8,
  },
  headerCell: {
    textAlign: 'center',
    fontWeight: 'bold',
    color: colors.text,
  },
  position: {
    width: 50,
  },
  team: {
    flex: 1,
    textAlign: 'left',
    paddingLeft: 8,
  },
  games: {
    width: 40,
  },
  wins: {
    width: 40,
  },
  losses: {
    width: 40,
  },
  points: {
    width: 40,
    fontWeight: 'bold',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  evenRow: {
    backgroundColor: '#f9f9f9',
  },
  oddRow: {
    backgroundColor: '#fff',
  },
  cell: {
    textAlign: 'center',
    color: colors.text,
  },
  detailButton: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: colors.primary,
    borderRadius: 8,
    alignItems: 'center',
  },
  detailButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  emptyText: {
    textAlign: 'center',
    color: colors.text,
    fontSize: 16,
    marginTop: 20,
  },
});