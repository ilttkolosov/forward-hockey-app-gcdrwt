// components/GameCardCompact.tsx
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import { Game } from '../types';
import { colors, commonStyles } from '../styles/commonStyles';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

interface GameCardCompactProps {
  game: Game;
  showScore?: boolean;
  onPress?: () => void;
}

// === ДОБАВЛЕНА ЛОГИКА СТАТУСА ===
const hasValidOutcome = (outcome: string | undefined): boolean => {
  return outcome != null && outcome !== '' && outcome !== 'unknown';
};

const getDynamicGameStatus = (gameDateStr: string, homeOutcome?: string, awayOutcome?: string) => {
  if (hasValidOutcome(homeOutcome) || hasValidOutcome(awayOutcome)) {
    return { isToday: false, isWithin3Days: false, isLive: false, isFinished: true };
  }
  const now = new Date();
  const gameDate = new Date(gameDateStr);
  const isToday = gameDate.toDateString() === now.toDateString();
  const daysDiff = Math.ceil((gameDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const isWithin3Days = daysDiff >= 0 && daysDiff <= 3;
  const liveStart = new Date(gameDate.getTime() - 5 * 60 * 1000);
  const liveEnd = new Date(gameDate.getTime() + 90 * 60 * 1000);
  const isLive = now >= liveStart && now <= liveEnd;
  return { isToday, isWithin3Days, isLive, isFinished: false };
};

const getStatusText = (isToday: boolean, isWithin3Days: boolean, isLive: boolean, isFinished: boolean): string => {
  if (isLive) return 'LIVE';
  if (isFinished) return '';
  if (isToday) return 'СЕГОДНЯ';
  if (isWithin3Days) return 'СКОРО';
  return 'ПРЕДСТОЯЩАЯ';
};

const getStatusColor = (isLive: boolean, isFinished: boolean): string => {
  if (isLive) return colors.success;
  if (isFinished) return colors.textSecondary;
  return colors.warning;
};
// === КОНЕЦ ЛОГИКИ СТАТУСА ===

export default function GameCardCompact({ game, showScore = true, onPress }: GameCardCompactProps) {
  const router = useRouter();
  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      router.push(`/game/${game.id}`);
    }
  };

  if (!game) return null;

  const {
    homeTeam,
    awayTeam,
    homeTeamLogo,
    awayTeamLogo,
    date,
    time,
    venue,
    tournament,
    homeScore,
    awayScore,
    sp_video,
    homeOutcome,
    awayOutcome,
    event_date,
  } = game;

  const homeTeamName = homeTeam?.name || '—';
  const awayTeamName = awayTeam?.name || '—';

  // === ОПРЕДЕЛЕНИЕ СТАТУСА ===
  const { isToday, isWithin3Days, isLive, isFinished } = getDynamicGameStatus(event_date, homeOutcome, awayOutcome);
  const statusText = getStatusText(isToday, isWithin3Days, isLive, isFinished);

  const getOutcomeText = (outcome: string | undefined): string => {
    switch (outcome) {
      case 'win': return 'Победа';
      case 'loss': return 'Поражение';
      case 'draw': return 'Ничья';
      default: return outcome || '';
    }
  };

  const getLeagueDisplayName = (leagueName: string | undefined): string => {
    if (!leagueName || leagueName.trim() === '') {
      return 'Товарищеский матч';
    }
    const parts = leagueName.split(':');
    if (parts.length > 1) {
      return parts[1].split(',')[0].trim().split(' ')[0];
    }
    return leagueName.split(',')[0].trim();
  };

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.7} style={styles.container}>
      <View style={commonStyles.gameCard}>
        {/* Header */}
        <View style={styles.header}>
          {statusText ? (
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(isLive, isFinished) }]}>
              <Text style={styles.statusText}>{statusText}</Text>
            </View>
          ) : null}
          <Text style={commonStyles.textSecondary}>
            {date}
            {time && time !== '00:00' && ` • ${time}`}
          </Text>
        </View>

        {/* Teams */}
        <View style={styles.teamsContainer}>
          {/* Home Team */}
          <View style={styles.teamContainer}>
            {homeTeamLogo ? (
              <Image source={{ uri: homeTeamLogo }} style={styles.teamLogo} resizeMode="contain" />
            ) : (
              <View style={styles.placeholderLogo}>
                <Text style={styles.placeholderText}>{homeTeamName.charAt(0)}</Text>
              </View>
            )}
            <Text style={styles.teamName} numberOfLines={2}>
              {homeTeamName}
            </Text>
            {showScore && (isLive || isFinished) && (
              <Text style={styles.score}>{homeScore ?? 0}</Text>
            )}
            {isFinished && homeOutcome && (
              <View style={styles.outcomeBadgeContainer}>
                <Text style={[styles.outcomeText, {
                  color: homeOutcome === 'win' ? colors.success :
                         homeOutcome === 'loss' ? colors.error : colors.warning
                }]}>
                  {getOutcomeText(homeOutcome)}
                </Text>
              </View>
            )}
          </View>

          {/* VS Section */}
          <View style={styles.vsSection}>
            <Text style={styles.vsText}>VS</Text>
            {sp_video && sp_video.trim() !== '' && (
              <View style={styles.videoIconContainer}>
                <Ionicons name="videocam" size={24} color={colors.primary} />
              </View>
            )}
          </View>

          {/* Away Team */}
          <View style={styles.teamContainer}>
            {awayTeamLogo ? (
              <Image source={{ uri: awayTeamLogo }} style={styles.teamLogo} resizeMode="contain" />
            ) : (
              <View style={styles.placeholderLogo}>
                <Text style={styles.placeholderText}>{awayTeamName.charAt(0)}</Text>
              </View>
            )}
            <Text style={styles.teamName} numberOfLines={2}>
              {awayTeamName}
            </Text>
            {showScore && (isLive || isFinished) && (
              <Text style={styles.score}>{awayScore ?? 0}</Text>
            )}
            {isFinished && awayOutcome && (
              <View style={styles.outcomeBadgeContainer}>
                <Text style={[styles.outcomeText, {
                  color: awayOutcome === 'win' ? colors.success :
                         awayOutcome === 'loss' ? colors.error : colors.warning
                }]}>
                  {getOutcomeText(awayOutcome)}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.gameInfo}>
            {venue && (
              <Text style={commonStyles.textSecondary} numberOfLines={1}>
                📍 {typeof venue === 'string' ? venue : venue.name}
              </Text>
            )}
            <Text style={[commonStyles.textSecondary, styles.leagueText]} numberOfLines={1}>
              {(!tournament || tournament.trim() === '') ? '🤝 ' : '🏆 '}
              {getLeagueDisplayName(tournament)}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
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
    marginBottom: 6,
  },
  teamContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  teamLogo: {
    width: 40,
    height: 40,
    marginBottom: 6,
  },
  placeholderLogo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  placeholderText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  teamName: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    lineHeight: 16,
    minHeight: 32, // ← 2 строки
    numberOfLines: 2,
  },
  score: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.primary,
    marginBottom: 4,
  },
  outcomeBadgeContainer: {
    alignItems: 'center',
  },
  outcomeText: {
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
  },
  vsSection: {
    paddingHorizontal: 12,
    justifyContent: 'flex-start',
    paddingTop: 20,
    alignItems: 'center',
  },
  vsText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
  },
  videoIconContainer: {
    // Иконка уже по центру благодаря alignItems: 'center'
  },
  footer: {
    marginTop: 4,
  },
  gameInfo: {
    gap: 4,
  },
  leagueText: {
    fontSize: 12,
    fontStyle: 'italic',
  },
});