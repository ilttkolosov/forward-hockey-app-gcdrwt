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
import { useNavigation, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from '../../components/Icon';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image'; // <-- Импортируем Image
import { loadTeamLogo } from '../../services/teamStorage'; // <-- Импортируем функцию для получения URI логотипа

const TOURNAMENTS_NOW_KEY = 'tournaments_now';
const TOURNAMENTS_PAST_KEY = 'tournaments_past';
const CURRENT_TOURNAMENT_ID_KEY = 'current_tournament_id';

// Функция для склонения слов по числу
const getDeclension = (number: number, words: string[]): string => {
  const n = Math.abs(number);
  if (n % 10 === 1 && n % 100 !== 11) {
    return `${number} ${words[0]}`;
  }
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) {
    return `${number} ${words[1]}`;
  }
  return `${number} ${words[2]}`;
};

// Тип для строки таблицы с логотипом
interface TournamentTableRowWithLogo {
  team_id: string; // или number, в зависимости от вашего API
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
  logo_uri: string | null; // Исправляем тип: логотип может быть строкой или null
}

// Тип для турнирной таблицы с логотипами
type TournamentTableWithLogos = TournamentTableRowWithLogo[];

export default function TournamentsScreen() {
  const [activeTab, setActiveTab] = useState<number>(0);
  const [tables, setTables] = useState<{
    current: { name: string; id: string; data: TournamentTableWithLogos[] }[];
    past: { name: string; id: string; data: TournamentTableWithLogos[] }[];
  }>({ current: [], past: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();
  const navigation = useNavigation();

  useEffect(() => {
    console.log('🔄 [Tournaments] useEffect запущен');
    loadTournamentsFromCache();
  }, [activeTab]);

  const loadTournamentsFromCache = async () => {
    console.log('🔄 [Tournaments] loadTournamentsFromCache запущен');
    try {
      // Загружаем текущие турниры из кэша
      const cachedTournamentsNow = await AsyncStorage.getItem(TOURNAMENTS_NOW_KEY);
      console.log('🔄 [Tournaments] Загружаем current tournaments из кэша...');
      if (cachedTournamentsNow) {
        const currentTournaments = JSON.parse(cachedTournamentsNow);
        console.log(`✅ [Tournaments] Загружено ${currentTournaments.length} текущих турниров из кэша`);
        // Загружаем таблицы для текущих турниров из кэша и добавляем логотипы
        const currentData = await Promise.all(
          currentTournaments.map(async (t: any) => {
            console.log(`🔄 [Tournaments] Получаем таблицу из кэша для текущего турнира: ${t.tournament_Name} (${t.tournament_ID})`);
            const data = await getCachedTournamentTable(t.tournament_ID);
            console.log(`✅ [Tournaments] Таблица для текущего турнира ${t.tournament_Name} загружена из кэша`);
            const tableWithLogos = await addLogosToTable(data);
            console.log(`✅ [Tournaments] Логотипы добавлены к таблице турнира ${t.tournament_Name}`);
            return {
              name: t.tournament_Name,
              id: String(t.tournament_ID),
              data: tableWithLogos,
            };
          })
        );
        console.log('✅ [Tournaments] Все текущие турниры загружены из кэша с логотипами');
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
        // Загружаем таблицы для прошедших турниров из кэша и добавляем логотипы
        const pastData = await Promise.all(
          pastTournaments.map(async (t: any) => {
            console.log(`🔄 [Tournaments] Получаем таблицу из кэша для прошедшего турнира: ${t.tournament_Name} (${t.tournament_ID})`);
            const data = await getCachedTournamentTable(t.tournament_ID);
            console.log(`✅ [Tournaments] Таблица для прошедшего турнира ${t.tournament_Name} загружена из кэша`);
            const tableWithLogos = await addLogosToTable(data);
            console.log(`✅ [Tournaments] Логотипы добавлены к таблице турнира ${t.tournament_Name}`);
            return {
              name: t.tournament_Name,
              id: t.tournament_ID,
              data: tableWithLogos,
            };
          })
        );
        console.log('✅ [Tournaments] Все прошедшие турниры загружены из кэша с логотипами');
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
            const tableWithLogos = await addLogosToTable(data);
            console.log(`✅ [Tournaments] Логотипы добавлены к обновлённой таблице турнира ${t.tournament_Name}`);
            return {
              name: t.tournament_Name,
              id: t.tournament_ID,
              data: tableWithLogos,
            };
          })
        );
        setTables(prev => ({ ...prev, current: currentData }));
        console.log('✅ [Tournaments] Все текущие турниры обновлены с логотипами');
      }
    } catch (e) {
      console.error('❌ [Tournaments] Error refreshing tournament ', e);
    } finally {
      setRefreshing(false);
      console.log('✅ [Tournaments] pullToRefresh завершён');
    }
  };

  // Функция для добавления URI логотипов к таблице
  const addLogosToTable = async (table: TournamentTable[]): Promise<TournamentTableWithLogos> => {
    console.log(`🖼️ [Tournaments] Начинаем добавление логотипов к таблице из ${table.length} строк`);
    const tableWithLogos = await Promise.all(
      table.map(async (row) => {
        const logo_uri = await loadTeamLogo(row.team_id.toString()).catch((error) => {
            console.error(`❌ [Tournaments] Ошибка загрузки логотипа для команды ${row.team_id}:`, error);
            return null; // Возвращаем null при ошибке, так как тип logo_uri теперь string | null
        });
        // Возвращаем объект, который соответствует типу TournamentTableRowWithLogo
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
          logo_uri, // Теперь logo_uri может быть string или null
        };
      })
    );
    console.log(`✅ [Tournaments] Логотипы добавлены к таблице, всего строк: ${tableWithLogos.length}`);
    return tableWithLogos;
  };

  const handleBackPress = () => {
    router.back();
  };

  const handleDetailsPress = (tournamentId: string) => {
    router.push(`/tournaments/${tournamentId}`);
  };

  const renderTable = (name: string, tournamentId: string, data: TournamentTableWithLogos[]) => {
    if (!data || !Array.isArray(data)) {
      console.log(`⚠️ [Tournaments] Нет данных для турнира ${name}`);
      return null;
    }
    // Добавляем явное указание типа для каждой строки
    return (
      <View key={tournamentId} style={styles.tableContainer}>
        <Text style={styles.tableTitle}>{name}</Text>
        <View style={styles.tableHeader}>
          <Text style={[styles.headerCell, styles.position]}></Text>
          <Text style={[styles.headerCell, styles.team]}></Text>
          <Text style={[styles.headerCell, styles.games]}>И</Text>
          <Text style={[styles.headerCell, styles.points]}>О</Text>
        </View>
        {data.map((row: TournamentTableRowWithLogo, index) => ( // Явно указываем тип строки
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
                <Image
                  source={{ uri: row.logo_uri }}
                  style={styles.teamLogo}
                />
              ) : (
                <View style={styles.teamLogoPlaceholder} />
              )}
              <Text style={[styles.cell, styles.teamName]}>{row.team_name}</Text>
            </View>
            <Text style={[styles.cell, styles.games]}>{row.games}</Text>
            <Text style={[styles.cell, styles.points]}>{row.points_2x}</Text>
          </View>
        ))}
        {/* Кнопка "Подробнее" */}
        <TouchableOpacity
          style={styles.detailButton}
          onPress={() => handleDetailsPress(String(tournamentId))} // Передаем ID турнира
        >
          <Text style={styles.detailButtonText}>Подробнее</Text>
        </TouchableOpacity>
      </View>
    );
  };

  if (loading) {
    console.log('🔄 [Tournaments] Отображаем Loading...');
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
          {/* Пустой View для выравнивания */}
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
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
          <Icon name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={commonStyles.title}>Турниры</Text>
          <Text style={commonStyles.textSecondary}>
            {activeTab === 0
              ? getDeclension(tables.current.length, ['текущий', 'текущих', 'текущих'])
              : getDeclension(tables.past.length, ['прошедший', 'прошедших', 'прошедших'])
            }
          </Text>
        </View>
        {/* Пустой View для выравнивания */}
        <View style={styles.searchButton} />
      </View>

      {/* Segmented Control */}
      <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
        <SegmentedControl
          values={['Текущие', 'Прошедшие']}
          selectedIndex={activeTab}
          onChange={(event) => setActiveTab(event.nativeEvent.selectedSegmentIndex)}
          tintColor={colors.primary}
          fontStyle={{ fontSize: 14, fontWeight: '600' }}
          activeFontStyle={{ fontWeight: '700' }}
          springEnabled={false} // ←←← отключает анимацию "прыжка"
        />
      </View>

      <ScrollView
        style={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {activeTab === 0 && (
          <>
            {tables.current.length > 0 ? (
              tables.current.map(table => renderTable(table.name, table.id, table.data))
            ) : (
              <View style={commonStyles.errorContainer}>
                <Text style={commonStyles.text}>Нет текущих турниров</Text>
                <Text style={commonStyles.textSecondary}>
                  Попробуйте обновить страницу или проверьте позже.
                </Text>
              </View>
            )}
          </>
        )}
        {activeTab === 1 && (
          <>
            {tables.past.length > 0 ? (
              tables.past.map(table => renderTable(table.name, table.id, table.data))
            ) : (
              <View style={commonStyles.errorContainer}>
                <Text style={commonStyles.text}>Нет прошедших турниров</Text>
                <Text style={commonStyles.textSecondary}>
                  Попробуйте обновить страницу или проверьте позже.
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    justifyContent: 'space-between',
  },
  backButton: {
    marginRight: 16,
    padding: 8,
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
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    marginHorizontal: 16,
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
    // Убираем нижнюю границу, чтобы не было линии под заголовком
    // borderBottomWidth: 1,
    // borderBottomColor: colors.border,
    paddingBottom: 8,
    marginBottom: 8,
  },
  headerCell: {
    textAlign: 'center',
    fontWeight: 'bold',
    color: colors.text,
  },
  position: {
    width: 30, // Минимальная ширина для номера позиции
  },
  team: {
    flex: 1, // Остальное место для команды
    textAlign: 'left', // Выравнивание по левому краю
    paddingLeft: 8,
  },
  games: {
    width: 35, // Уменьшенная ширина для игр
  },
  points: {
    width: 35, // Уменьшенная ширина для очков
    fontWeight: 'bold',
    fontSize: 15,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    // Добавляем верхнюю границу для всех строк, чтобы создать разделители
    borderTopWidth: 1,
    borderTopColor: colors.border,
    // Исправляем вертикальное выравнивание: центрируем содержимое строки
    alignItems: 'center',
  },
  evenRow: {
    backgroundColor: '#f0f0f0', // Светло-серый фон для четных строк
  },
  oddRow: {
    backgroundColor: '#ffffff', // Белый фон для нечетных строк
  },
  cell: {
    textAlign: 'center',
    color: colors.text,
    // Убираем flex: 1, чтобы ячейки следовали стилям position, team, games, points
  },
  teamCellContent: {
    flex: 1, // Ячейка "Команда" должна занять всё доступное пространство
    flexDirection: 'row',
    alignItems: 'center', // Центрируем логотип и текст по вертикали
    paddingLeft: 8,
  },
  teamLogo: {
    width: 24,
    height: 24,
    marginRight: 8,
    borderRadius: 0, // Убираем скругление углов логотипа
  },
  teamLogoPlaceholder: {
    width: 24,
    height: 24,
    marginRight: 8,
    borderRadius: 0, // Убираем скругление углов плейсхолдера
    backgroundColor: colors.border, // Цвет фона плейсхолдера
  },
  teamName: {
    color: colors.text,
    flex: 1, // Текст команды растягивается внутри своей области
    flexWrap: 'wrap', // Разрешаем перенос текста на новую строку
    textAlign: 'left', // Выравнивание по левому краю
    fontSize: 16, // Увеличиваем размер шрифта для названия команды
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