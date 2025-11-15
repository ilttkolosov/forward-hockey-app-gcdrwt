// app/tournaments/index.tsx
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import { colors, commonStyles } from '../../styles/commonStyles';
import { fetchTournamentTable, getCachedTournamentTable, TournamentTable } from '../../services/tournamentsApi';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from '../../components/Icon';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { loadTeamLogo } from '../../services/teamStorage';
import { getGames } from '../../data/gameData';
// Импортируем функции для загрузки конфигурации турнира
import { fetchTournamentConfig, getCachedTournamentConfig } from '../../services/tournamentsApi';
import { useTrackScreenView } from '../../hooks/useTrackScreenView';

const TOURNAMENTS_NOW_KEY = 'tournaments_now';
const TOURNAMENTS_PAST_KEY = 'tournaments_past';

// Функция склонения
export const getDeclension = (number: number, words: string[]): string => {
  const n = Math.abs(number);
  if (n % 10 === 1 && n % 100 !== 11) return `${number} ${words[0]}`;
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return `${number} ${words[1]}`;
  return `${number} ${words[2]}`;
};

interface TournamentTableRowWithLogo {
  team_id: string;
  position: string;
  team_name: string;
  games: string;
  wins: string;
  losses: string;
  draws: string;
  overtime_wins: string;
  overtime_losses: string;
  points_2x: string;
  pkpercent: string;
  logo_uri: string | null;
}
type TournamentTableWithLogos = TournamentTableRowWithLogo[];

// === ГЛОБАЛЬНЫЙ ФЛАГ ЗАГРУЗКИ ===
const ongoingPreloads = new Set<string>();

export default function TournamentsScreen() {
  const [activeTab, setActiveTab] = useState<number>(0);
  const [tables, setTables] = useState<{
    current: { name: string; id: string; data: TournamentTableWithLogos[] }[];
    past: { name: string; id: string; data: TournamentTableWithLogos[] }[];
  }>({ current: [], past: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();

  // === ФОНОВАЯ ЗАГРУЗКА ИГР ТЕКУЩЕГО ТУРНИРА ===
  const preloadCurrentTournamentGames = async (tournamentId: string, leagueId: string, seasonId: string) => {
    const cacheKey = `t_${tournamentId}`;
    if (ongoingPreloads.has(cacheKey)) return;

    ongoingPreloads.add(cacheKey);
    console.log(`[Tournaments] 🎮 Запуск фоновой загрузки игр для турнира ${tournamentId}`);

    try {
      await getGames({
        league: leagueId,
        season: seasonId,
        useCache: true, // ←←← ОДИНАКОВЫЙ ПАРАМЕТР С ДЕТАЛЬНОЙ СТРАНИЦЕЙ
      });
      console.log(`[Tournaments] ✅ Игры для турнира ${tournamentId} загружены и закэшированы`);
    } catch (err) {
      console.error(`[Tournaments] ❌ Ошибка загрузки игр для турнира ${tournamentId}:`, err);
    } finally {
      ongoingPreloads.delete(cacheKey);
    }
  };

  const loadTournamentsFromCache = async () => {
    try {
      const cachedTournamentsNow = await AsyncStorage.getItem(TOURNAMENTS_NOW_KEY);
      const cachedTournamentsPast = await AsyncStorage.getItem(TOURNAMENTS_PAST_KEY);

      let currentData: any[] = [];
      if (cachedTournamentsNow) {
        const currentTournaments = JSON.parse(cachedTournamentsNow);
        currentData = await Promise.all(
          currentTournaments.map(async (t: any) => {
            const data = await getCachedTournamentTable(t.tournament_ID);
            const tableWithLogos = await addLogosToTable(data);
            return {
              name: t.tournament_Name,
              id: String(t.tournament_ID),
              data: tableWithLogos,
            };
          })
        );

        // === ЗАПУСКАЕМ ФОНОВУЮ ЗАГРУЗКУ ДЛЯ ПЕРВОГО ТУРНИРА ===
        if (currentData.length > 0) {
          const firstTournament = currentData[0];
          // Загружаем конфигурацию турнира (league_id, season_id)
          (async () => {
            try {
              let config = await getCachedTournamentConfig(firstTournament.id);
              if (!config) {
                config = await fetchTournamentConfig(firstTournament.id);
              }
              if (config?.league_id && config?.season_id) {
                setTimeout(() => {
                  preloadCurrentTournamentGames(
                    firstTournament.id,
                    String(config!.league_id),
                    String(config!.season_id)
                  );
                }, 500);
              } else {
                console.warn(`[Tournaments] ❌ Нет league_id/season_id для турнира ${firstTournament.id}`);
              }
            } catch (err) {
              console.error(`[Tournaments] ❌ Ошибка загрузки конфигурации для турнира ${firstTournament.id}:`, err);
            }
          })();
        }
      }

      let pastData: any[] = [];
      if (cachedTournamentsPast) {
        const pastTournaments = JSON.parse(cachedTournamentsPast);
        pastData = await Promise.all(
          pastTournaments.map(async (t: any) => {
            const data = await getCachedTournamentTable(t.tournament_ID);
            const tableWithLogos = await addLogosToTable(data);
            return {
              name: t.tournament_Name,
              id: String(t.tournament_ID),
              data: tableWithLogos,
            };
          })
        );
      }

      setTables({ current: currentData, past: pastData });
    } catch (e) {
      console.error('[Tournaments] Error loading tournaments from cache:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTournamentsFromCache();
  }, []);

  //useTrackScreenView('Экран турниров');

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      const cachedTournamentsNow = await AsyncStorage.getItem(TOURNAMENTS_NOW_KEY);
      if (cachedTournamentsNow) {
        const currentTournaments = JSON.parse(cachedTournamentsNow);
        const currentData = await Promise.all(
          currentTournaments.map(async (t: any) => {
            const data = await fetchTournamentTable(t.tournament_ID);
            const tableWithLogos = await addLogosToTable(data);
            return {
              name: t.tournament_Name,
              id: t.tournament_ID,
              data: tableWithLogos,
            };
          })
        );
        setTables(prev => ({ ...prev, current: currentData }));
      }
    } catch (e) {
      console.error('❌ [Tournaments] Error refreshing tournament ', e);
    } finally {
      setRefreshing(false);
    }
  };

  const addLogosToTable = async (table: TournamentTable[]): Promise<TournamentTableWithLogos> => {
    const tableWithLogos = await Promise.all(
      table.map(async (row) => {
        const logo_uri = await loadTeamLogo(row.team_id.toString()).catch((error) => {
          console.error(`❌ [Tournaments] Ошибка загрузки логотипа для команды ${row.team_id}:`, error);
          return null;
        });
        return {
          team_id: row.team_id,
          position: row.position,
          team_name: row.team_name,
          games: row.games,
          wins: row.wins,
          losses: row.losses,
          draws: row.draws,
          overtime_wins: row.overtime_wins,
          overtime_losses: row.overtime_losses,
          points_2x: row.points_2x,
          pkpercent: row.pkpercent,
          logo_uri,
        };
      })
    );
    return tableWithLogos;
  };

  const handleBackPress = () => router.back();
  const handleDetailsPress = (tournamentId: string) => {
    router.push(`/tournaments/${tournamentId}`);
  };

  const renderTable = (name: string, tournamentId: string, data: TournamentTableWithLogos[]) => {
    if (!data || !Array.isArray(data)) return null;

    return (
      <View key={tournamentId} style={styles.tableContainer}>
        <Text style={styles.tableTitle}>{name}</Text>
        <View style={styles.tableHeader}>
          <Text style={[styles.headerCell, styles.position]}></Text>
          <Text style={[styles.headerCell, styles.team]}></Text>
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
            <View style={styles.teamCellContent}>
              {row.logo_uri ? (
                <Image source={{ uri: row.logo_uri }} style={styles.teamLogo} />
              ) : (
                <View style={styles.teamLogoPlaceholder} />
              )}
              <Text style={[styles.cell, styles.teamName]}>{row.team_name}</Text>
              <TouchableOpacity
                onPress={() => router.push({
                  pathname: `/command/${row.team_id}`,
                  params: { tournamentId: tournamentId }
                })}
                style={styles.navArrowContainer}
              >
                <Icon name="information-circle-outline" type="Ionicons" size={20} color={colors.primary} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.cell, styles.games]}>{row.games}</Text>
            <Text style={[styles.cell, styles.points]}>{row.points_2x}</Text>
          </View>
        ))}
        <TouchableOpacity
          style={styles.detailButton}
          onPress={() => handleDetailsPress(String(tournamentId))}
        >
          <Text style={styles.detailButtonText}>Подробнее</Text>
        </TouchableOpacity>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={commonStyles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
            <Icon name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={commonStyles.title}>Турниры</Text>
            <Text style={commonStyles.textSecondary}>Загрузка...</Text>
          </View>
          <View style={styles.searchButton} />
        </View>
        <View style={commonStyles.loadingContainer}>
          <Text style={commonStyles.text}>Загрузка...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={commonStyles.container}>
      {/* Header */}
      <View style={styles.headerContainer}>
        {/* Кнопка "Назад" */}
        <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
          <Icon name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>

        {/* Абсолютно центрированный заголовок */}
        <Text style={styles.headerTitle}>Турниры</Text>

        {/* Пустой элемент справа для баланса */}
        <View style={styles.headerRight} />
      </View>

      {/* Segmented Control */}
      <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
        <SegmentedControl
          values={[
            `Текущие (${tables.current.length})`,
            `Прошедшие (${tables.past.length})`,
          ]}
          selectedIndex={activeTab}
          onChange={(event) => setActiveTab(event.nativeEvent.selectedSegmentIndex)}
          tintColor={colors.primary}
          fontStyle={{ fontSize: 14, fontWeight: '600' }}
          activeFontStyle={{ fontWeight: '700' }}
          springEnabled={false}
        />
      </View>

      <ScrollView
        style={styles.contentContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {activeTab === 0 && (
          tables.current.length > 0
            ? tables.current.map(table => renderTable(table.name, table.id, table.data))
            : <View style={commonStyles.errorContainer}><Text style={commonStyles.text}>Нет текущих турниров</Text></View>
        )}
        {activeTab === 1 && (
          tables.past.length > 0
            ? tables.past.map(table => renderTable(table.name, table.id, table.data))
            : <View style={commonStyles.errorContainer}><Text style={commonStyles.text}>Нет прошедших турниров</Text></View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    padding: 8,
    zIndex: 1, // чтобы кнопка оставалась кликабельной
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    zIndex: 0,
  },
  headerRight: {
    width: 44, // ≈ ширина backButton + padding
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  searchButton: {
    padding: 8,
    marginLeft: 8,
  },
  contentContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  tableContainer: {
    marginBottom: 24,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 8,
    marginTop: 12,
  },
  tableTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 12,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingBottom: 8,
    marginBottom: 8,
  },
  headerCell: {
    textAlign: 'center',
    fontWeight: 'bold',
    color: colors.text,
  },
  position: { width: 30 },
  team: { flex: 1, textAlign: 'left', paddingLeft: 8 },
  games: { width: 35 },
  points: { width: 35, fontWeight: 'bold', fontSize: 15 },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: 'center',
  },
  evenRow: { backgroundColor: '#f0f0f0' },
  oddRow: { backgroundColor: '#ffffff' },
  cell: { textAlign: 'center', color: colors.text },
  teamCellContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 8,
  },
  teamLogo: {
    width: 24,
    height: 24,
    marginRight: 8,
  },
  teamLogoPlaceholder: {
    width: 24,
    height: 24,
    marginRight: 8,
    backgroundColor: colors.border,
  },
  teamName: {
    color: colors.text,
    flex: 1,
    flexWrap: 'wrap',
    textAlign: 'left',
    fontSize: 16,
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
  navArrowContainer: {
  marginLeft: 'auto',
  paddingVertical: 4,
  paddingHorizontal: 6,
  },
  navArrow: {
    color: colors.primary,
    fontWeight: 'bold',
    fontSize: 16,
  },
});