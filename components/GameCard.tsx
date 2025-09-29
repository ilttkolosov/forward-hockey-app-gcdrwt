
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Game } from '../types';
import { colors, commonStyles } from '../styles/commonStyles';
import { useRouter } from 'expo-router';
import { getCachedTeamLogo } from '../utils/teamLogos';
import { formatGameDate } from '../utils/dateUtils';

interface GameCardProps {
  game: Game;
  showScore?: boolean;
}

// Helper function to determine game status with new badge logic
const getGameStatus = (game: Game) => {
  const now = new Date();
  const gameDate = new Date(game.event_date);
  
  // Check if game is today
  const isToday = gameDate.toDateString() === now.toDateString();
  
  // Check if game is within next 3 days
  const daysDiff = Math.ceil((gameDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const isWithin3Days = daysDiff >= 0 && daysDiff <= 3;
  
  // Check if game is live (5 minutes before to 90 minutes after)
  const liveStart = new Date(gameDate.getTime() - 5 * 60 * 1000);   // –5 мин
  const liveEnd = new Date(gameDate.getTime() + 90 * 60 * 1000);   // +90 мин
  const isLive = now >= liveStart && now <= liveEnd;
  
  return { isToday, isWithin3Days, isLive };
};

export default function GameCard({ game, showScore = true }: GameCardProps) {
  const router = useRouter();

  const handlePress = () => {
    console.log('GameCard pressed, navigating to game:', game.id);
    router.push(`/game/${game.id}`);
  };

  const getStatusColor = (status: Game['status'], isLive?: boolean) => {
    if (isLive) return colors.success; // Green for LIVE
    
    switch (status) {
      case 'live':
        return colors.success;
      case 'upcoming':
        return colors.warning;
      case 'finished':
        return colors.textSecondary;
      default:
        return colors.textSecondary;
    }
  };

  const getStatusText = (status: Game['status'], isToday?: boolean, isWithin3Days?: boolean, isLive?: boolean) => {
    if (isLive) return 'LIVE';
    
    // New badge logic for upcoming games
    if (status === 'upcoming') {
      if (isToday) return 'СЕГОДНЯ';
      if (isWithin3Days) return 'СКОРО';
      return 'ПРЕДСТОЯЩАЯ';
    }
    
    switch (status) {
      case 'live':
        return 'LIVE';
      case 'finished':
        return ''; // Remove "ЗАВЕРШЕНА" badge for finished games
      default:
        return '';
    }
  };

  const formatDate = (dateString: string, timeString?: string) => {
    // Use the centralized date formatting utility
    const fullDateString = timeString && timeString !== '00:00' 
      ? `${dateString} ${timeString}:00` 
      : `${dateString} 00:00:00`;
    
    return formatGameDate(fullDateString);
  };

  const getOutcomeText = (outcome: string) => {
    switch (outcome) {
      case 'win':
        return 'П';
      case 'loss':
        return 'Пор';
      case 'nich':
        return 'Н';
      default:
        return '';
    }
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

  const getLeagueDisplayName = (leagueName: string | null): string => {
    // If league is empty or null, return "Товарищеский матч" without truncation
    if (!leagueName || leagueName.trim() === '') {
      return 'Товарищеский матч';
    }
    
    // For non-empty leagues, apply truncation as before
    return shortenLeagueName(leagueName);
  };

  // Get game status for upcoming games
  const { isToday, isWithin3Days, isLive } = game.status === 'upcoming' ? getGameStatus(game) : { isToday: false, isWithin3Days: false, isLive: false };
  const statusText = getStatusText(game.status, isToday, isWithin3Days, isLive);

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.7}>
      <View style={commonStyles.gameCard}>
        <View style={styles.header}>
          {statusText && (
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(game.status, isLive) }]}>
              <Text style={styles.statusText}>{statusText}</Text>
            </View>
          )}
          <Text style={commonStyles.textSecondary}>
            {formatDate(game.date, game.time)}
          </Text>
        </View>

        <View style={styles.teamsContainer}>
          {/* Home Team Container */}
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
            {showScore && game.homeScore !== undefined && (
              <Text style={styles.score}>{game.homeScore}</Text>
            )}
            {/* Outcome Badge centered under team name */}
            {game.team1_outcome && (
              <View style={styles.outcomeBadgeContainer}>
                <Text style={[styles.outcomeText, { 
                  color: game.team1_outcome === 'win' ? colors.success : 
                         game.team1_outcome === 'loss' ? colors.error : colors.warning 
                }]}>
                  {getOutcomeText(game.team1_outcome)}
                </Text>
              </View>
            )}
          </View>

          {/* VS Section - Aligned with bottom of team names */}
          <View style={styles.vsSection}>
            <Text style={styles.vsText}>VS</Text>
          </View>

          {/* Away Team Container */}
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
            {showScore && game.awayScore !== undefined && (
              <Text style={styles.score}>{game.awayScore}</Text>
            )}
            {/* Outcome Badge centered under team name */}
            {game.team2_outcome && (
              <View style={styles.outcomeBadgeContainer}>
                <Text style={[styles.outcomeText, { 
                  color: game.team2_outcome === 'win' ? colors.success : 
                         game.team2_outcome === 'loss' ? colors.error : colors.warning 
                }]}>
                  {getOutcomeText(game.team2_outcome)}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.footer}>
          <View style={styles.gameInfo}>
            {game.venue && (
              <Text style={commonStyles.textSecondary} numberOfLines={1}>
                📍 {game.venue}
              </Text>
            )}
            <Text style={[commonStyles.textSecondary, styles.leagueText]} numberOfLines={1}>
              {(!game.league_name || game.league_name.trim() === '') ? '🤝 ' : '🏆 '}{getLeagueDisplayName(game.league_name)}
            </Text>
            {/* Season field removed as requested */}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: colors.background,
    fontSize: 12,
    fontWeight: '700',
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
    marginBottom: 8,
    borderRadius: 24,
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
  // VS Section - Positioned to align with bottom of team names
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
