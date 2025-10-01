import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, FlatList, TextInput, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { commonStyles, colors } from '../../styles/commonStyles';
// import { SEASONS_MAP } from '../../utils/seasons'; // Больше не нужно для получения дат
import { formatGameDate } from '../../utils/dateUtils';
import { getGames } from '../../data/gameData'; // Импортируем новую функцию
import { Game } from '../../types'; // Импортируем тип Game
import ErrorMessage from '../../components/ErrorMessage';
import Icon from '../../components/Icon';
import LoadingSpinner from '../../components/LoadingSpinner';

const ITEMS_PER_PAGE = 20;

// --- Вспомогательная функция для определения дат начала и конца сезона по ID ---
// Предположим, ID сезона соответствует году начала сезона (например, ID 99 -> 2025-2026)
// Это нужно адаптировать под вашу логику определения ID сезона
const getSeasonDates = (seasonId: string): { startDate: string; endDate: string } | null => {
  // Парсим ID как число, предполагая, что оно связано с годом
  const seasonNumber = parseInt(seasonId);
  if (isNaN(seasonNumber)) {
    console.error(`Invalid season ID: ${seasonId}`);
    return null;
  }

  // Попробуем вычислить год начала сезона из ID
  // Пример: ID 99 -> 2025 год начала сезона (2025-2026)
  // Это гипотетическая логика. Нужно адаптировать под реальные ID и годы.
  // Допустим, ID 99 соответствует 2025 году начала.
  // const startYear = 2025; // Жёстко для примера
  const startYear = seasonNumber + 2026 - 99; // Пример вычисления года из ID, если ID 99 -> 2025

  // const startYear = seasonNumber; // Если ID уже является годом начала (менее вероятно)

  // Формируем даты: 01 июля startYear года по 31 мая (startYear + 1) года
  const startDate = `${startYear}-07-01`;
  const endDate = `${startYear + 1}-05-31`;

  console.log(`Season ID ${seasonId} corresponds to date range: ${startDate} to ${endDate}`);

  return { startDate, endDate };
};

// --- Функции для работы с исходом игры (outcome) ---
const getOutcomeText = (outcome: string | undefined): string => {
  switch (outcome) {
    case 'win':
      return 'Победа';
    case 'loss':
      return 'Поражение';
    case 'draw':
      return 'Ничья';
    default:
      return outcome || '';
  }
};

const getOutcomeColor = (outcome: string | undefined): string => {
  switch (outcome) {
    case 'win':
      return colors.success;
    case 'loss':
      return colors.error;
    case 'draw':
      return colors.warning; // или другой цвет для ничьей
    default:
      return colors.textSecondary;
  }
};

// --- Функции для работы с названием лиги (tournament) ---
const shortenLeagueName = (leagueName: string | undefined): string => {
  if (!leagueName) return '';

  // Extract meaningful part from league name
  const parts = leagueName.split(':');
  if (parts.length > 1) {
    const namePart = parts[1].trim();
    const words = namePart.split(',')[0].trim();
    const firstWord = words.split(' ')[0];
    return firstWord;
  }

  return leagueName.split(',')[0].trim();
};

const getLeagueDisplayName = (leagueName: string | undefined): string => {
  // If league is empty or null, return "Товарищеский матч" without truncation
  if (!leagueName || leagueName.trim() === '') {
    return 'Товарищеский матч';
  }

  // For non-empty leagues, apply truncation as before
  return shortenLeagueName(leagueName);
};

export default function SeasonGamesScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const seasonId = id as string; // ID сезона строка

  // Получаем информацию о сезоне (например, название) из SEASONS_MAP или другим способом
  // const seasonInfo = SEASONS_MAP[parseInt(seasonId)]; // Пока оставим как есть, но нужно убедиться, что SEASONS_MAP адаптирован
  // const seasonName = seasonInfo?.name || `Сезон ${seasonId}`; // Фолбэк на ID, если не найден
  // Пока используем ID как имя, если SEASONS_MAP не обновлён
  const seasonName = `Сезон ${seasonId}`; // Или получите из другого источника, если SEASONS_MAP обновлён

  const [allGames, setAllGames] = useState<Game[]>([]);
  const [filteredGames, setFilteredGames] = useState<Game[]>([]); // <-- ИСПРАВЛЕНО: добавлена недостающая ]
  const [displayedGames, setDisplayedGames] = useState<Game[]>([]); // Используем для отображения с пагинацией
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false); // Не используется в этом варианте, так как загружаем всё сразу
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1); // Не используется в этом варианте

  const loadData = useCallback(async () => {
    try {
      setError(null);
      console.log('Loading games for season ID:', seasonId);

      // Получаем диапазон дат для сезона
      const seasonDates = getSeasonDates(seasonId);
      if (!seasonDates) {
        setError('Не удалось определить даты сезона');
        setLoading(false);
        return;
      }

      const { startDate, endDate } = seasonDates;

      // Используем getGames с фильтром по дате и команде 74
      const seasonGames = await getGames({
        date_from: startDate,
        date_to: endDate,
        teams: '74', // Фильтр по команде с ID 74
      });

      setAllGames(seasonGames);
      setFilteredGames(seasonGames);
      setDisplayedGames(seasonGames); // Показываем все загруженные игры, пагинация не используется
      // setCurrentPage(1); // Не нужно

      console.log(`Loaded ${seasonGames.length} games for season ${seasonId} (${startDate} to ${endDate})`);
    } catch (err) {
      console.error('Error loading season games:', err);
      setError('Не удалось загрузить игры сезона. Попробуйте еще раз.');
    } finally {
      setLoading(false);
    }
  }, [seasonId]);

  useEffect(() => {
    loadData();
  }, [loadData, seasonId]);

  // Filter games based on search query - АДАПТИРУЕМ ПОД НОВЫЙ ТИП Game
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredGames(allGames);
      setDisplayedGames(allGames); // Показываем все отфильтрованные игры
      // setCurrentPage(1); // Не нужно
    } else {
      const filtered = allGames.filter(game =>
        // game.homeTeam.name, game.awayTeam.name, game.tournament (если это строка), game.venue_name
        (game.homeTeam?.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (game.awayTeam?.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (game.tournament && game.tournament.toLowerCase().includes(searchQuery.toLowerCase())) || // tournament - строка
        (game.venue_name && game.venue_name.toLowerCase().includes(searchQuery.toLowerCase())) // venue_name - строка
      );
      setFilteredGames(filtered);
      setDisplayedGames(filtered); // Показываем отфильтрованные игры
      // setCurrentPage(1); // Не нужно
    }
  }, [searchQuery, allGames]);

  const handleGamePress = (gameId: string) => {
    console.log('Navigating to game:', gameId);
    // Close search modal if open
    if (showSearchModal) {
      setShowSearchModal(false);
      setSearchQuery('');
    }
    router.push(`/game/${gameId}`);
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

  const renderGameCard = ({ item: game }: { item: Game }) => ( // Меняем тип item на Game
    <TouchableOpacity
      style={commonStyles.gameCard}
      onPress={() => handleGamePress(game.id)}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <Text style={commonStyles.textSecondary}>
          {formatGameDate(game.event_date)} 
        </Text>
      </View>

      <View style={styles.teamsContainer}>
        <View style={styles.teamContainer}>
          {game.homeTeamLogo ? ( // Используем homeTeamLogo из Game
            <Image
              source={{ uri: game.homeTeamLogo }} // URI уже из локального хранилища
              style={styles.teamLogo}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.placeholderLogo}>
              <Text style={styles.placeholderText}>
                {game.homeTeam?.name?.charAt(0) || '?'} 
              </Text>
            </View>
          )}
          <Text style={styles.teamName} numberOfLines={2}>
            {game.homeTeam?.name || '—'} 
          </Text>
          <Text style={styles.score}>{game.homeScore}</Text> {/* Используем homeScore */}
          <View style={styles.outcomeBadgeContainer}>
            <Text style={[styles.outcomeText, { color: getOutcomeColor(game.homeOutcome) }]}>
              {getOutcomeText(game.homeOutcome)}
            </Text>
          </View>
        </View>

        <View style={styles.vsSection}>
          <Text style={styles.vsText}>VS</Text>
        </View>

        <View style={styles.teamContainer}>
          {game.awayTeamLogo ? ( // Используем awayTeamLogo из Game
            <Image
              source={{ uri: game.awayTeamLogo }} // URI уже из локального хранилища
              style={styles.teamLogo}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.placeholderLogo}>
              <Text style={styles.placeholderText}>
                {game.awayTeam?.name?.charAt(0) || '?'} 
              </Text>
            </View>
          )}
          <Text style={styles.teamName} numberOfLines={2}>
            {game.awayTeam?.name || '—'} 
          </Text>
          <Text style={styles.score}>{game.awayScore}</Text> {/* Используем awayScore */}
          <View style={styles.outcomeBadgeContainer}>
            <Text style={[styles.outcomeText, { color: getOutcomeColor(game.awayOutcome) }]}>
              {getOutcomeText(game.awayOutcome)} 
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <View style={styles.gameInfo}>
          {game.venue_name && ( // Используем venue_name из Game
            <Text style={commonStyles.textSecondary} numberOfLines={1}>
              📍 {game.venue_name}
            </Text>
          )}
          <Text style={[commonStyles.textSecondary, styles.leagueText]} numberOfLines={1}>
            {(!game.tournament || game.tournament.trim() === '') ? '🤝 ' : '🏆 '}{getLeagueDisplayName(game.tournament)} 
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  // renderFooter больше не используется, так как пагинация отключена
  // const renderFooter = () => {
  //   if (!loadingMore) return null;
  //   return (
  //     <View style={{ padding: 20 }}>
  //       <LoadingSpinner />
  //     </View>
  //   );
  // };

  const renderEmpty = () => (
    <View style={commonStyles.errorContainer}>
      <Text style={commonStyles.text}>
        {searchQuery ? 'Игры не найдены' : 'Нет игр в этом сезоне'}
      </Text>
      <Text style={commonStyles.textSecondary}>
        {searchQuery ? 'Попробуйте изменить поисковый запрос' : 'Проверьте позже'}
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

  // Проверка сезона может быть адаптирована, если SEASONS_MAP использует строковые ключи
  // if (!season) {
  //   return (
  //     <SafeAreaView style={commonStyles.container}>
  //       <ErrorMessage message="Сезон не найден" onRetry={() => router.back()} />
  //     </SafeAreaView>
  //   );
  // }

  return (
    <SafeAreaView style={commonStyles.container}>
      <View style={commonStyles.content}>
        {/* Header */}
        <View style={styles.headerContainer}>
          <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
            <Icon name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerTextContainer}>
            <Text style={commonStyles.title}>{seasonName}</Text> {/* Используем seasonName */}
            <Text style={commonStyles.textSecondary}>
              {filteredGames.length} {filteredGames.length === 1 ? 'игра' : filteredGames.length < 5 ? 'игры' : 'игр'}
            </Text>
          </View>
          <TouchableOpacity onPress={handleSearchPress} style={styles.searchButton}>
            <Icon name="search" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* Games List */}
        <FlatList
          data={displayedGames} // Используем displayedGames
          renderItem={renderGameCard}
          keyExtractor={(item) => item.id} // ID игры из нового объекта Game
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={renderEmpty}
          // ListFooterComponent={renderFooter} // Убрано
        />
      </View>

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
              <Text style={styles.searchTitle}>Поиск игр</Text>
              <TouchableOpacity style={styles.closeButton} onPress={handleCloseSearch}>
                <Icon name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.searchInputContainer}>
              <Icon name="search" size={20} color={colors.textSecondary} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Поиск по командам, турнирам..."
                placeholderTextColor={colors.textSecondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={handleClearSearch} style={styles.clearButton}>
                  <Icon name="close" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>

            {/* Search Results */}
            <FlatList
              data={searchQuery ? filteredGames : []} // Используем filteredGames для результатов поиска
              renderItem={renderGameCard}
              keyExtractor={(item) => item.id} // ID игры из нового объекта Game
              contentContainerStyle={styles.searchResults}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={searchQuery ? renderEmpty : null}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 16,
  },
  backButton: {
    marginRight: 16,
    padding: 4,
  },
  headerTextContainer: {
    flex: 1,
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
    maxHeight: '80%',
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
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    height: 48,
    marginBottom: 16,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    paddingVertical: 0,
  },
  clearButton: {
    padding: 4,
    marginLeft: 8,
  },
  searchResults: {
    paddingBottom: 20,
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: 16,
  },
  teamsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  teamContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  teamLogo: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    marginBottom: 8,
  },
  placeholderLogo: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  placeholderText: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  teamName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 8,
    minHeight: 36,
  },
  score: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.primary,
    marginBottom: 4,
  },
  outcomeBadgeContainer: {
    alignItems: 'center',
  },
  outcomeText: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  // VS Section - Aligned with bottom of team names
  vsSection: {
    paddingHorizontal: 16,
    justifyContent: 'flex-start',
    paddingTop: 56, // Logo (48px) + margin (8px) = 56px to align with team names
  },
  vsText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  footer: {
    marginTop: 8,
  },
  gameInfo: {
    gap: 4,
  },
  leagueText: {
    fontSize: 12,
    fontStyle: 'italic',
  },
});