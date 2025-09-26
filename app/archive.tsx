
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, RefreshControl, TouchableOpacity, Image, StyleSheet, FlatList, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { commonStyles, colors } from '../styles/commonStyles';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import { fetchPastGames, fetchPastGamesCount, getOutcomeText, getOutcomeColor } from '../data/pastGameData';
import { Link, useRouter } from 'expo-router';
import Icon from '../components/Icon';
import { getCachedTeamLogo } from '../utils/teamLogos';
import { formatGameDate, getSeasonFromGameDate } from '../utils/dateUtils';
import SeasonPill from '../components/SeasonPill';

interface EnrichedPastGame {
  id: string;
  event_id: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamLogo: string;
  awayTeamLogo: string;
  homeGoals: number;
  awayGoals: number;
  homeOutcome: string;
  awayOutcome: string;
  date: string;
  time: string;
  event_date: string;
  tournamentName: string | null;
  arenaName: string | null;
  seasonName: string | null;
}

const ITEMS_PER_PAGE = 10;

const styles = StyleSheet.create({
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
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  backButton: {
    marginRight: 16,
    padding: 4,
  },
  headerInfo: {
    flex: 1,
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
  seasonFilterContainer: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  seasonPillsContainer: {
    paddingHorizontal: 16,
    flexDirection: 'row',
  },
});

export default function GameArchiveScreen() {
  const [allGames, setAllGames] = useState<EnrichedPastGame[]>([]);
  const [displayedGames, setDisplayedGames] = useState<EnrichedPastGame[]>([]);
  const [filteredGames, setFilteredGames] = useState<EnrichedPastGame[]>([]);
  const [gamesCount, setGamesCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [availableSeasons, setAvailableSeasons] = useState<string[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string | null>(null);
  const router = useRouter();

  const loadData = async () => {
    try {
      setError(null);
      console.log('=== Archive Screen: Loading data ===');
      
      // Load past games and count concurrently
      const [pastGames, count] = await Promise.all([
        fetchPastGames(),
        fetchPastGamesCount()
      ]);
      
      console.log(`Archive Screen: Received ${pastGames.length} games, count: ${count}`);
      
      setAllGames(pastGames);
      setGamesCount(count);
      
      // Extract available seasons
      const seasons = extractAvailableSeasons(pastGames);
      setAvailableSeasons(seasons);
      
      // Set initial filtered games (all games or current season)
      const currentSeason = seasons.length > 0 ? seasons[0] : null;
      setSelectedSeason(currentSeason);
      
      const gamesToShow = currentSeason ? filterGamesBySeason(pastGames, currentSeason) : pastGames;
      setFilteredGames(gamesToShow);
      
      // Load first page
      const firstPage = gamesToShow.slice(0, ITEMS_PER_PAGE);
      setDisplayedGames(firstPage);
      setCurrentPage(1);
      
      if (pastGames.length === 0 && count > 0) {
        console.warn('Archive Screen: Count is positive but games array is empty - this indicates a data processing issue');
      }
      
    } catch (err) {
      console.error('Archive Screen: Error loading data:', err);
      setError('Не удалось загрузить архив игр. Попробуйте еще раз.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

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
    }, 500); // Small delay to show loading indicator
  }, [loadingMore, displayedGames.length, filteredGames.length, currentPage]);

  useEffect(() => {
    loadData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    setCurrentPage(0);
    setDisplayedGames([]);
    setFilteredGames([]);
    setSelectedSeason(null);
    loadData();
  };

  const handleGamePress = (gameId: string) => {
    console.log('Archive Screen: Navigating to game:', gameId);
    router.push(`/game/${gameId}`);
  };

  const shortenLeagueName = (leagueName: string | null): string => {
    if (!leagueName) return '';
    
    // Extract meaningful part from league name
    // Example: "107: Первенство Санкт-Петербурга, группа А" → "Первенство"
    const parts = leagueName.split(':');
    if (parts.length > 1) {
      const namePart = parts[1].trim();
      const words = namePart.split(',')[0].trim(); // Take part before comma
      const firstWord = words.split(' ')[0]; // Take first meaningful word
      return firstWord;
    }
    
    return leagueName.split(',')[0].trim(); // Fallback
  };

  const extractAvailableSeasons = (games: EnrichedPastGame[]): string[] => {
    const seasonsSet = new Set<string>();
    
    games.forEach(game => {
      let season: string;
      
      // Check if game has explicit season name
      if (game.seasonName) {
        // Extract season from format "99: Сезон 2025-2026"
        const parts = game.seasonName.split(':');
        if (parts.length > 1) {
          season = parts[1].trim();
        } else {
          season = game.seasonName;
        }
      } else {
        // Calculate season from game date
        season = getSeasonFromGameDate(game.event_date);
      }
      
      seasonsSet.add(season);
    });
    
    // Sort seasons in descending order (newest first)
    return Array.from(seasonsSet).sort((a, b) => {
      // Extract years from season strings like "Сезон 2025-2026"
      const yearA = parseInt(a.match(/(\d{4})-(\d{4})/)?.[2] || '0');
      const yearB = parseInt(b.match(/(\d{4})-(\d{4})/)?.[2] || '0');
      return yearB - yearA;
    });
  };

  const filterGamesBySeason = (games: EnrichedPastGame[], season: string): EnrichedPastGame[] => {
    return games.filter(game => {
      let gameSeason: string;
      
      if (game.seasonName) {
        const parts = game.seasonName.split(':');
        gameSeason = parts.length > 1 ? parts[1].trim() : game.seasonName;
      } else {
        gameSeason = getSeasonFromGameDate(game.event_date);
      }
      
      return gameSeason === season;
    });
  };

  const handleSeasonFilter = (season: string) => {
    console.log('Filtering by season:', season);
    setSelectedSeason(season);
    
    const filtered = season === 'Все сезоны' ? allGames : filterGamesBySeason(allGames, season);
    setFilteredGames(filtered);
    
    // Reset pagination
    setCurrentPage(1);
    const firstPage = filtered.slice(0, ITEMS_PER_PAGE);
    setDisplayedGames(firstPage);
  };

  const renderGameCard = ({ item: game }: { item: EnrichedPastGame }) => {
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
                defaultSource={require('../assets/images/natively-dark.png')}
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
                defaultSource={require('../assets/images/natively-dark.png')}
              />
            ) : (
              <View style={styles.teamLogo} />
            )}
            <Text style={styles.teamName} numberOfLines={2}>
              {game.awayTeam}
            </Text>
          </View>
        </View>

        {/* Outcomes - Aligned under team names */}
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

        {/* Game Information - Hide season, shorten league name */}
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
      <Icon name="archive" size={64} color={colors.textSecondary} />
      <Text style={styles.emptyText}>Нет игр в архиве</Text>
      <Text style={styles.emptySubtext}>
        {gamesCount > 0 
          ? `Найдено ${gamesCount} игр, но не удалось их обработать`
          : 'Архивные игры появятся здесь после проведения матчей'
        }
      </Text>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={commonStyles.container}>
        <View style={styles.headerContainer}>
          <Link href="/" asChild>
            <TouchableOpacity style={styles.backButton}>
              <Icon name="chevron-back" size={24} color={colors.text} />
            </TouchableOpacity>
          </Link>
          <View style={styles.headerInfo}>
            <Text style={commonStyles.title}>Архив игр</Text>
            <Text style={commonStyles.textSecondary}>Загружаем...</Text>
          </View>
        </View>
        <View style={commonStyles.loadingContainer}>
          <LoadingSpinner />
          <Text style={[commonStyles.textSecondary, { marginTop: 16 }]}>
            Загружаем архив игр...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={commonStyles.container}>
        <View style={styles.headerContainer}>
          <Link href="/" asChild>
            <TouchableOpacity style={styles.backButton}>
              <Icon name="chevron-back" size={24} color={colors.text} />
            </TouchableOpacity>
          </Link>
          <View style={styles.headerInfo}>
            <Text style={commonStyles.title}>Архив игр</Text>
            <Text style={commonStyles.textSecondary}>Ошибка загрузки</Text>
          </View>
        </View>
        <ErrorMessage message={error} onRetry={loadData} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={commonStyles.container}>
      {/* Header */}
      <View style={styles.headerContainer}>
        <Link href="/" asChild>
          <TouchableOpacity style={styles.backButton}>
            <Icon name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
        </Link>
        <View style={styles.headerInfo}>
          <Text style={commonStyles.title}>Архив игр</Text>
          <Text style={commonStyles.textSecondary}>
            {gamesCount > 0 ? `Всего игр: ${gamesCount}` : 'Нет сыгранных игр'}
          </Text>
        </View>
      </View>

      {/* Season Filter Pills */}
      {availableSeasons.length > 0 && (
        <View style={styles.seasonFilterContainer}>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.seasonPillsContainer}
          >
            <SeasonPill
              season="Все сезоны"
              isActive={selectedSeason === null || selectedSeason === 'Все сезоны'}
              onPress={() => handleSeasonFilter('Все сезоны')}
            />
            {availableSeasons.map((season) => (
              <SeasonPill
                key={season}
                season={season}
                isActive={selectedSeason === season}
                onPress={handleSeasonFilter}
              />
            ))}
          </ScrollView>
        </View>
      )}

      {/* Games List with Infinite Scroll */}
      <FlatList
        data={displayedGames}
        renderItem={renderGameCard}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
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
