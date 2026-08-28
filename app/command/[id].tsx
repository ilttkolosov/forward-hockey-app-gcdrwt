// app/command/[id].tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import { colors, commonStyles } from '../../styles/commonStyles';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';
import GameCardCompact from '../../components/GameCardCompact';
import { getGames } from '../../data/gameData';
import type { Game } from '../../types';
import {
  getCachedTournamentTable,
  fetchTournamentTable,
  getCachedTournamentConfig,
  fetchTournamentConfig,
  TournamentConfig,
} from '../../services/tournamentsApi';
import { loadTeamLogo } from '../../services/teamStorage';
import Icon from '../../components/Icon';
import { useReferenceDataRevision } from '../../services/referenceDataUpdates';
import { loadTournamentCatalog } from '../../services/tournamentCatalog';

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
  teamHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: colors.surface,
  },
  teamLogo: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 16,
  },
  placeholderLogo: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  placeholderText: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  teamName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  tournamentName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginTop: 8,
    paddingHorizontal: 16,
  },
  content: {
    flex: 1,
  },
  gamesListContainer: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
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
headerRight: {
  width: 44, // ≈ ширина backButton + padding
},
// Абсолютно центрированный заголовок
centeredHeader: {
  position: 'absolute',
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
  justifyContent: 'center',
  alignItems: 'center',
  flexDirection: 'row',
  zIndex: 0,
  pointerEvents: 'none',
},
headerLogo: {
  width: 32,
  height: 32,
  marginRight: 8,
  borderRadius: 16,
},
headerLogoPlaceholder: {
  width: 32,
  height: 32,
  borderRadius: 16,
  backgroundColor: colors.border,
  justifyContent: 'center',
  alignItems: 'center',
  marginRight: 8,
},
headerLogoText: {
  fontSize: 20,
  fontWeight: '700',
  color: colors.textSecondary,
},
headerTitle: {
  fontSize: 22,
  fontWeight: '700',
  color: colors.text,
  textAlign: 'center',
},
statsSection: {
  paddingHorizontal: 16,
  paddingVertical: 16,
  backgroundColor: colors.surface,
  marginBottom: 16,
},
statsTitle: {
  fontSize: 16,
  fontWeight: '600',
  color: colors.text,
  //textAlign: 'center',
},
// Новый контейнер для статистики — растягиваем на всю ширину и центрируем содержимое
statsContent: {
  width: '100%',
  alignItems: 'center',
  marginTop: 0,
},
statsGrid: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  justifyContent: 'center', // ← центрируем элементы
  gap: 4,
  //maxWidth: 1000, // ограничение для больших экранов
},
statItem: {
  alignItems: 'center',
  marginTop: 8,
  minWidth: 80,
  maxWidth: 100,
},
statLabel: {
  fontSize: 12,
  color: colors.textSecondary,
  //fontWeight: '500',
  marginBottom: 4,
  textAlign: 'center',
},
statValue: {
  fontSize: 16,
  fontWeight: '700',
  color: colors.text,
  textAlign: 'center',
},
// Горизонтальный разделитель
divider: {
  height: 1,
  backgroundColor: colors.border,
  marginTop: 16,
},
// Заголовок перед вкладками
gamesHeader: {
  fontSize: 18,
  fontWeight: '700',
  color: colors.text,
  //textAlign: 'center',
  //marginVertical: 12,
  paddingHorizontal: 16,
},
segmentedContainer: {
  paddingHorizontal: 16,
  paddingVertical: 8,
},
scrollView: {
  flex: 1,
},
});

export default function TeamDetailScreen() {
  const router = useRouter();
  const { id: teamId, tournamentId } = useLocalSearchParams<{ id: string; tournamentId: string }>();
  const referenceRevision = useReferenceDataRevision([
    'teams',
    'venues',
    'leagues',
    'seasons',
    'tournaments',
  ]);
  const [teamName, setTeamName] = useState<string>('');
  const [teamLogoUri, setTeamLogoUri] = useState<string | null>(null);
  const [tournamentName, setTournamentName] = useState<string>('');
  const [stats, setStats] = useState<any>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState(0); // 0 = past, 1 = upcoming

  const loadTeamData = useCallback(async () => {
    void referenceRevision;
    if (!teamId || !tournamentId) {
      setError('Недостаточно параметров: teamId или tournamentId');
      setLoading(false);
      return;
    }

    try {
      // 1. Загружаем турнирную таблицу (для статистики)
      let table = await getCachedTournamentTable(tournamentId);
      if (table === null) {
        table = await fetchTournamentTable(tournamentId);
      }

      const teamRow = table.find((row: any) => String(row.team_id) === String(teamId));
      if (!teamRow) {
        throw new Error('Команда не найдена в турнирной таблице');
      }

      setTeamName(teamRow.team_name);
      setStats(teamRow);

      // 2. Загружаем логотип
      const logo = await loadTeamLogo(teamId).catch(() => null);
      setTeamLogoUri(logo);

      // 3. Загружаем конфигурацию турнира (для league_id и season_id)
      let tournamentConfig: TournamentConfig | null = await getCachedTournamentConfig(tournamentId);
      if (!tournamentConfig) {
        tournamentConfig = await fetchTournamentConfig(tournamentId);
      }

      // 4. Получаем название турнира
      const catalog = await loadTournamentCatalog();
      const allTournaments = [...catalog.current, ...catalog.past];
      const foundTournament = allTournaments.find((t: any) => String(t.tournament_ID) === tournamentId);
      setTournamentName(foundTournament?.tournament_Name || `Турнир ID: ${tournamentId}`);

      // 5. Загружаем игры КОМАНДЫ в ЭТОМ ТУРНИРЕ
      if (!tournamentConfig?.league_id || !tournamentConfig?.season_id) {
        console.warn('⚠️ Не удалось получить league_id/season_id — загружаем все игры команды');
        const allGames = await getGames({ teams: teamId, useCache: true });
        setGames(allGames);
      } else {
        const games = await getGames({
          teams: teamId,
          league: String(tournamentConfig.league_id),
          season: String(tournamentConfig.season_id),
          useCache: true,
        });
        setGames(games);
      }
    } catch (err: any) {
      console.error('💥 [TeamDetail] Ошибка загрузки данных:', err);
      setError(err.message || 'Не удалось загрузить данные команды');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [referenceRevision, teamId, tournamentId]);

  useEffect(() => {
    loadTeamData();
  }, [loadTeamData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadTeamData();
  };

  const handleBackPress = () => router.back();

  // Фильтрация игр
  const now = new Date();
  const pastGames = games
    .filter(g => new Date(g.event_date) < now)
    .sort((a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime());

  const upcomingGames = games
    .filter(g => new Date(g.event_date) >= now)
    .sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime());

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
        <ErrorMessage message={error} onRetry={loadTeamData} />
      </SafeAreaView>
    );
  }

    return (
    <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.headerContainer}>
          <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
            <Icon name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.centeredHeader}>
            {teamLogoUri ? (
              <Image source={{ uri: teamLogoUri }} style={styles.headerLogo} resizeMode="contain" />
            ) : (
              <View style={styles.headerLogoPlaceholder}>
                <Text style={styles.headerLogoText}>{teamName.charAt(0)}</Text>
              </View>
            )}
            <Text style={styles.headerTitle} numberOfLines={1}>
              {teamName}
            </Text>
          </View>
          <View style={styles.headerRight} />
        </View>
      <ScrollView
        style={styles.scrollView}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Stats */}
        {stats && (
          <View style={styles.statsSection}>
            <Text style={styles.statsTitle}>Статистика в турнире:</Text>
            <Text style={[styles.statsTitle, { marginTop: 4, fontSize: 18, fontWeight: '700' }]}>
              {tournamentName}
            </Text>
            <View style={styles.statsContent}>
              <View style={styles.statsGrid}>
                <StatItem label="Место" value={`#${stats.position}`} />
                <StatItem label="Игры" value={stats.games} />
                <StatItem label="Победы" value={stats.wins} color={colors.success} />
                <StatItem label="Поражения" value={stats.losses} color={colors.error} />
                {stats.draws !== '0' && <StatItem label="Ничьи" value={stats.draws} />}
                {stats.overtime_wins !== '0' && <StatItem label="ВБ" value={stats.overtime_wins} />}
                {stats.overtime_losses !== '0' && <StatItem label="ПБ" value={stats.overtime_losses} />}
                <StatItem label="Очки" value={stats.points_2x} />
                <StatItem label="Забито" value={stats.goals_for} />
                <StatItem label="Пропущено" value={stats.goals_against} />
                <StatItem
                  label="+/-"
                  value={stats.goal_diff?.startsWith('-') ? stats.goal_diff : `+${stats.goal_diff}`}
                />
                <StatItem
                  label="% реализации большинства"
                  value={`${parseFloat(stats.ppg_percent || 0).toFixed(1)}%`}
                />
                <StatItem
                  label="% нейтрализации большинства"
                  value={`${parseFloat(stats.pkpercent || stats.penalty_kill_percent || 0).toFixed(1)}%`}
                />
              </View>
            </View>
            <View style={styles.divider} />
          </View>
        )}

        {/* Заголовок перед вкладками */}
        <Text style={styles.gamesHeader}>
          Все игры команды {teamName} в текущем турнире
        </Text>

        {/* Tabs */}
        <View style={styles.segmentedContainer}>
          <SegmentedControl
            values={['Предстоящие', 'Прошедшие']}
            selectedIndex={activeTab}
            onChange={(e) => setActiveTab(e.nativeEvent.selectedSegmentIndex)}
            tintColor={colors.primary}
            fontStyle={{ fontSize: 14, fontWeight: '600' }}
            activeFontStyle={{ 
              fontWeight: '700',
              color: colors.background, // ← Контрастный цвет для активной вкладки (например, белый)
            }}
          />
        </View>

        {/* Games List */}
        <View style={styles.gamesListContainer}>
          
          {activeTab === 0

            ? upcomingGames.length > 0
              ? upcomingGames.map(game => <GameCardCompact key={game.id} game={game} showScore />)
              : <Text style={[commonStyles.text, { textAlign: 'center' }]}>Нет предстоящих игр</Text>          
            : pastGames.length > 0
              ? pastGames.map(game => <GameCardCompact key={game.id} game={game} showScore />)
              : <Text style={[commonStyles.text, { textAlign: 'center' }]}>Нет прошедших игр</Text>
          }

        </View>

        {/* Отступ снизу */}
        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const StatItem = ({ label, value, color = colors.text }: { label: string; value: string; color?: string }) => (
  <View style={styles.statItem}>
    <Text style={[styles.statLabel, { color }]}>{label}</Text>
    <Text style={[styles.statValue, { color }]}>{value}</Text>
  </View>
);
