
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, FlatList, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { commonStyles, colors } from '../../styles/commonStyles';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';
import Icon from '../../components/Icon';
import { fetchPastGames, getOutcomeText, getOutcomeColor } from '../../data/pastGameData';
import { SEASONS_MAP } from '../../utils/seasons';
import { enrichGamesWithSeasons, filterGamesBySeason, GameWithSeason } from '../../utils/gameUtils';
import { formatGameDate } from '../../utils/dateUtils';

const ITEMS_PER_PAGE = 10;

const styles = StyleSheet.create({
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
  headerInfo: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  searchButton: {
    marginLeft: 16,
    padding: 8,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
  },
  clearButton: {
    marginLeft: 12,
    padding: 4,
  },
  gameCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.border,
    boxShadow: `0px 2px 8px ${colors.shadow}`,
    elevation: 2,
  },
  gameHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  teamsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  teamInfo: {
    flex: 1,
    alignItems: 'center',
  },
  teamLogo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginBottom: 8,
    backgroundColor: colors.backgroundAlt,
  },
  teamName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  scoreContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  score: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 4,
  },
  outcomeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  teamOutcome: {
    flex: 1,
    alignItems: 'center',
  },
  outcomeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  gameInfo: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  infoIcon: {
    marginRight: 8,
  },
  infoText: {
    fontSize: 13,
    color: colors.textSecondary,
    flex: 1,
  },
  dateTime: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  loadingMore: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  loadingMoreText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 8,
  },
});

export default function SeasonGamesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const seasonId = Number(id);
  const season = SEASONS_MAP[seasonId];
  const router = useRouter();

  const [allGames, setAllGames] = useState<GameWithSeason[]>([]);
  const [filteredGames, setFilteredGames] = useState<GameWithSeason[]>([]);
  const [displayedGames, setDisplayedGames] = useState<GameWithSeason[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      console.log(`=== Season Games: Loading games for season ${seasonId} ===`);
      
      // Load all past games
      const pastGames = await fetchPastGames();
      console.log(`Season Games: Received ${pastGames.length} games`);
      
      // Enrich games with season information
      const enrichedGames = enrichGamesWithSeasons(pastGames);
      setAllGames(enrichedGames);
      
      // Filter games by selected season
      const seasonGames = filterGamesBySeason(enrichedGames, seasonId);
      console.log(`Season Games: Found ${seasonGames.length} games for season ${seasonId}`);
      
      setFilteredGames(seasonGames);
      
      // Load first page
      const firstPage = seasonGames.slice(0, ITEMS_PER_PAGE);
      setDisplayedGames(firstPage);
      setCurrentPage(1);
      
    } catch (err) {
      console.error('Season Games: Error loading data:', err);
      setError('Не удалось загрузить игры сезона. Попробуйте еще раз.');
    } finally {
      setLoading(false);
    }
  }, [seasonId]);

  const loadMoreGames = useCallback(() => {
    if (loadingMore || displayedGames.length >= filteredGames.length) {
      return;
    }

    setLoadingMore(true);
    
    setTimeout(() => {
      const nextPage = currentPage + 1;
      const startIndex = currentPage * ITEMS_PER_PAGE;
      const endIndex = startIndex + ITEMS_PER_PAGE;
      const newGames = filteredGames.slice(startIndex, endIndex);
      
      setDisplayedGames(prev => [...prev, ...newGames]);
      setCurrentPage(nextPage);
      setLoadingMore(false);
      
      console.log(`Loaded page ${nextPage}, showing ${displayedGames.length + newGames.length} of ${filteredGames.length} games`);
    }, 500);
  }, [loadingMore, displayedGames.length, filteredGames, currentPage]);

  useEffect(() => {
    if (!season) {
      setError('Сезон не найден');
      setLoading(false);
      return;
    }
    loadData();
  }, [loadData, season]);

  // Search functionality
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredGames(filterGamesBySeason(allGames, seasonId));
    } else {
      const seasonGames = filterGamesBySeason(allGames, seasonId);
      const searchResults = seasonGames.filter(game => 
        game.homeTeam.toLowerCase().includes(searchQuery.toLowerCase()) ||
        game.awayTeam.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (game.tournamentName && game.tournamentName.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (game.arenaName && game.arenaName.toLowerCase().includes(searchQuery.toLowerCase()))
      );
      setFilteredGames(searchResults);
    }
    
    // Reset pagination when search changes
    setCurrentPage(1);
    setDisplayedGames(filteredGames.slice(0, ITEMS_PER_PAGE));
  }, [searchQuery, allGames, seasonId]);

  const handleGamePress = (gameId: string) => {
    console.log('Season Games: Navigating to game:', gameId);
    router.push(`/game/${gameId}`);
  };

  const handleBackPress = () => {
    router.back();
  };

  const handleClearSearch = () => {
    setSearchQuery('');
  };

  const shortenLeagueName = (leagueName: string | null): string => {
    if (!leagueName) return '';
    
    const parts = leagueName.split(':');
    if (parts.length > 1) {
      const namePart = parts[1].trim();
      const words = namePart.split(',')[0].trim();
      const firstWord = words.split(' ')[0];
      return firstWord;
    }
    
    return leagueName.split(',')[0].trim();
  };

  const renderGameCard = ({ item: game }: { item: GameWithSeason }) => {
    return (
      <TouchableOpacity
        style={styles.gameCard}
        onPress={() => handleGamePress(game.event_id)}
        activeOpacity={0.7}
      >
        {/* Date and Time */}
        <View style={styles.gameHeader}>
          <Text style={styles.dateTime}>
            {formatGameDate(game.event_date)}
          </Text>
        </View>

        {/* Teams and Score */}
        <View style={styles.teamsContainer}>
          {/* Home Team */}
          <View style={styles.teamInfo}>
            {game.homeTeamLogo ? (
              <Image
                source={{ uri: game.homeTeamLogo }}
                style={styles.teamLogo}
                defaultSource={require('../../assets/images/natively-dark.png')}
              />
            ) : (
              <View style={styles.teamLogo} />
            )}
            <Text style={styles.teamName} numberOfLines={2}>
              {game.homeTeam}
            </Text>
          </View>

          {/* Score */}
          <View style={styles.scoreContainer}>
            <Text style={styles.score}>
              {game.homeGoals} : {game.awayGoals}
            </Text>
          </View>

          {/* Away Team */}
          <View style={styles.teamInfo}>
            {game.awayTeamLogo ? (
              <Image
                source={{ uri: game.awayTeamLogo }}
                style={styles.teamLogo}
                defaultSource={require('../../assets/images/natively-dark.png')}
              />
            ) : (
              <View style={styles.teamLogo} />
            )}
            <Text style={styles.teamName} numberOfLines={2}>
              {game.awayTeam}
            </Text>
          </View>
        </View>

        {/* Outcomes */}
        {(game.homeOutcome || game.awayOutcome) && (
          <View style={styles.outcomeContainer}>
            <View style={styles.teamOutcome}>
              <Text style={[styles.outcomeText, { color: getOutcomeColor(game.homeOutcome) }]}>
                {getOutcomeText(game.homeOutcome)}
              </Text>
            </View>
            <View style={styles.scoreContainer} />
            <View style={styles.teamOutcome}>
              <Text style={[styles.outcomeText, { color: getOutcomeColor(game.awayOutcome) }]}>
                {getOutcomeText(game.awayOutcome)}
              </Text>
            </View>
          </View>
        )}

        {/* Game Information */}
        {(game.tournamentName || game.arenaName) && (
          <View style={styles.gameInfo}>
            {game.tournamentName && (
              <View style={styles.infoRow}>
                <Icon name="trophy" size={16} color={colors.textSecondary} style={styles.infoIcon} />
                <Text style={styles.infoText}>{shortenLeagueName(game.tournamentName)}</Text>
              </View>
            )}
            
            {game.arenaName && (
              <View style={styles.infoRow}>
                <Icon name="location" size={16} color={colors.textSecondary} style={styles.infoIcon} />
                <Text style={styles.infoText}>{game.arenaName}</Text>
              </View>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderFooter = () => {
    if (!loadingMore) return null;
    
    return (
      <View style={styles.loadingMore}>
        <LoadingSpinner />
        <Text style={styles.loadingMoreText}>Загружаем еще игры...</Text>
      </View>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Icon name="calendar" size={64} color={colors.textSecondary} />
      <Text style={styles.emptyText}>
        {searchQuery ? 'Игры не найдены' : 'Нет игр в этом сезоне'}
      </Text>
      <Text style={styles.emptySubtext}>
        {searchQuery 
          ? 'Попробуйте изменить поисковый запрос'
          : 'Игры этого сезона появятся здесь после их проведения'
        }
      </Text>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={commonStyles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={handleBackPress}>
            <Icon name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            <Text style={styles.title}>
              {season ? season.name : 'Загрузка...'}
            </Text>
            <Text style={styles.subtitle}>Загружаем игры...</Text>
          </View>
        </View>
        <View style={commonStyles.loadingContainer}>
          <LoadingSpinner />
          <Text style={[commonStyles.textSecondary, { marginTop: 16 }]}>
            Загружаем игры сезона...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={commonStyles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={handleBackPress}>
            <Icon name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            <Text style={styles.title}>
              {season ? season.name : 'Ошибка'}
            </Text>
            <Text style={styles.subtitle}>Ошибка загрузки</Text>
          </View>
        </View>
        <ErrorMessage message={error} onRetry={loadData} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={commonStyles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBackPress}>
          <Icon name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.title}>{season.name}</Text>
          <Text style={styles.subtitle}>
            {filteredGames.length > 0 
              ? `${filteredGames.length} ${filteredGames.length === 1 ? 'игра' : filteredGames.length < 5 ? 'игры' : 'игр'}`
              : 'Нет игр'
            }
          </Text>
        </View>
        <TouchableOpacity
          style={styles.searchButton}
          onPress={() => setShowSearch(!showSearch)}
        >
          <Icon name="search" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Search Input */}
      {showSearch && (
        <View style={styles.searchContainer}>
          <View style={styles.searchInputContainer}>
            <Icon name="search" size={20} color={colors.textSecondary} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Поиск по командам, турниру, арене..."
              placeholderTextColor={colors.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity style={styles.clearButton} onPress={handleClearSearch}>
                <Icon name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Games List */}
      <FlatList
        data={displayedGames}
        renderItem={renderGameCard}
        keyExtractor={(item) => item.id}
        onEndReached={loadMoreGames}
        onEndReachedThreshold={0.1}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={renderEmpty}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={displayedGames.length === 0 ? { flex: 1 } : { paddingBottom: 32 }}
      />
    </SafeAreaView>
  );
}
