
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, FlatList, TextInput, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { commonStyles, colors } from '../../styles/commonStyles';
import { SEASONS_MAP } from '../../utils/seasons';
import { formatGameDate } from '../../utils/dateUtils';
import { fetchPastGames, getOutcomeText, getOutcomeColor } from '../../data/pastGameData';
import { enrichGamesWithSeasons, filterGamesBySeason, GameWithSeason } from '../../utils/gameUtils';
import ErrorMessage from '../../components/ErrorMessage';
import Icon from '../../components/Icon';
import LoadingSpinner from '../../components/LoadingSpinner';

const ITEMS_PER_PAGE = 20;

export default function SeasonGamesScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const seasonId = parseInt(id as string);
  const season = SEASONS_MAP[seasonId];

  const [allGames, setAllGames] = useState<GameWithSeason[]>([]);
  const [filteredGames, setFilteredGames] = useState<GameWithSeason[]>([]);
  const [displayedGames, setDisplayedGames] = useState<GameWithSeason[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      console.log('Loading games for season:', seasonId);
      
      const pastGames = await fetchPastGames();
      const enrichedGames = enrichGamesWithSeasons(pastGames);
      const seasonGames = filterGamesBySeason(enrichedGames, seasonId);
      
      setAllGames(seasonGames);
      setFilteredGames(seasonGames);
      setDisplayedGames(seasonGames.slice(0, ITEMS_PER_PAGE));
      setCurrentPage(1);
      
      console.log(`Loaded ${seasonGames.length} games for season ${seasonId}`);
    } catch (err) {
      console.error('Error loading season games:', err);
      setError('Не удалось загрузить игры сезона. Попробуйте еще раз.');
    } finally {
      setLoading(false);
    }
  }, [seasonId]);

  useEffect(() => {
    loadData();
  }, [loadData, season]);

  // Filter games based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredGames(allGames);
      setDisplayedGames(allGames.slice(0, ITEMS_PER_PAGE));
      setCurrentPage(1);
    } else {
      const filtered = allGames.filter(game => 
        game.homeTeam.toLowerCase().includes(searchQuery.toLowerCase()) ||
        game.awayTeam.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (game.tournamentName && game.tournamentName.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (game.arenaName && game.arenaName.toLowerCase().includes(searchQuery.toLowerCase()))
      );
      setFilteredGames(filtered);
      setDisplayedGames(filtered.slice(0, ITEMS_PER_PAGE));
      setCurrentPage(1);
    }
  }, [searchQuery, allGames, seasonId]);

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

  const shortenLeagueName = (leagueName: string | null): string => {
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

  const getLeagueDisplayName = (leagueName: string | null): string => {
    // If league is empty or null, return "Товарищеский матч" without truncation
    if (!leagueName || leagueName.trim() === '') {
      return 'Товарищеский матч';
    }
    
    // For non-empty leagues, apply truncation as before
    return shortenLeagueName(leagueName);
  };

  const renderGameCard = ({ item: game }: { item: GameWithSeason }) => (
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
          {game.homeTeamLogo ? (
            <Image 
              source={{ uri: game.homeTeamLogo }} 
              style={styles.teamLogo}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.placeholderLogo}>
              <Text style={styles.placeholderText}>
                {game.homeTeam.charAt(0)}
              </Text>
            </View>
          )}
          <Text style={styles.teamName} numberOfLines={2}>
            {game.homeTeam}
          </Text>
          <Text style={styles.score}>{game.homeGoals}</Text>
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
          {game.awayTeamLogo ? (
            <Image 
              source={{ uri: game.awayTeamLogo }} 
              style={styles.teamLogo}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.placeholderLogo}>
              <Text style={styles.placeholderText}>
                {game.awayTeam.charAt(0)}
              </Text>
            </View>
          )}
          <Text style={styles.teamName} numberOfLines={2}>
            {game.awayTeam}
          </Text>
          <Text style={styles.score}>{game.awayGoals}</Text>
          <View style={styles.outcomeBadgeContainer}>
            <Text style={[styles.outcomeText, { color: getOutcomeColor(game.awayOutcome) }]}>
              {getOutcomeText(game.awayOutcome)}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <View style={styles.gameInfo}>
          {game.arenaName && (
            <Text style={commonStyles.textSecondary} numberOfLines={1}>
              📍 {game.arenaName}
            </Text>
          )}
          <Text style={[commonStyles.textSecondary, styles.leagueText]} numberOfLines={1}>
            {(!game.tournamentName || game.tournamentName.trim() === '') ? '🤝 ' : '🏆 '}{getLeagueDisplayName(game.tournamentName)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={{ padding: 20 }}>
        <LoadingSpinner />
      </View>
    );
  };

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

  if (!season) {
    return (
      <SafeAreaView style={commonStyles.container}>
        <ErrorMessage message="Сезон не найден" onRetry={() => router.back()} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={commonStyles.container}>
      <View style={commonStyles.content}>
        {/* Header */}
        <View style={styles.headerContainer}>
          <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
            <Icon name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerTextContainer}>
            <Text style={commonStyles.title}>{season.name}</Text>
            <Text style={commonStyles.textSecondary}>
              {filteredGames.length} {filteredGames.length === 1 ? 'игра' : 'игр'}
            </Text>
          </View>
          <TouchableOpacity onPress={handleSearchPress} style={styles.searchButton}>
            <Icon name="search" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* Games List */}
        <FlatList
          data={displayedGames}
          renderItem={renderGameCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={renderFooter}
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
              data={searchQuery ? filteredGames : []}
              renderItem={renderGameCard}
              keyExtractor={(item) => item.id}
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
