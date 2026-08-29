// components/GameCard.tsx
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
import { primeGameDetailsCache } from '../data/gameData';

interface GameCardProps {
  game: Game;
  showScore?: boolean;
}

// Проверка валидности исхода
const hasValidOutcome = (outcome: string | undefined): boolean => {
  return outcome != null && outcome !== '' && outcome !== 'unknown';
};

// Форматирование даты
const formatDateWithWeekday = (dateString: string, timeString?: string): string => {
  try {
    const date = new Date(dateString);
    const day = date.getDate();
    const month = date.toLocaleDateString('ru-RU', { month: 'short' }).replace('.', '');
    const weekday = date.toLocaleDateString('ru-RU', { weekday: 'short' });
    const time = timeString && timeString !== '00:00' ? ` • ${timeString}` : '';
    return `${day} ${month} • ${weekday}${time}`;
  } catch (error) {
    console.warn('Failed to format date with weekday:', dateString);
    return dateString + (timeString ? ` • ${timeString}` : '');
  }
};

export default function GameCard({ game, showScore = true }: GameCardProps) {
  const router = useRouter();
  const handlePress = () => {
    primeGameDetailsCache(game);
    router.push(`/game/${game.id}`);
  };

  if (!game) {
    console.warn('GameCard received undefined game prop');
    return null;
  }

  const {
    homeTeam,
    awayTeam,
    homeTeamLogo,
    awayTeamLogo,
    date,
    time,
    venue,
    tournament,
    season,
    season_name,
    homeScore,
    awayScore,
    sp_video,
    homeOutcome,
    awayOutcome,
    event_date,
  } = game;

  const homeTeamName = homeTeam?.name || '—';
  const awayTeamName = awayTeam?.name || '—';
  const seasonName = season?.name || season_name || '';

  // --- СТАТУС ИГРЫ ---
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
    const isFinished = now > liveEnd;
    return { isToday, isWithin3Days, isLive, isFinished };
  };

  const getStatusColor = (isLive: boolean, isFinished: boolean, isWithin3Days: boolean) => {
    if (isLive) return colors.success;
    if (isFinished) return colors.textSecondary;
    if (isWithin3Days) return colors.warning; // СКОРО — контрастный цвет
    return colors.primary;
  };

  const getStatusText = (isToday: boolean, isWithin3Days: boolean, isLive: boolean, isFinished: boolean) => {
    if (isLive) return 'LIVE';
    if (isFinished) return 'ЗАВЕРШЕНА';
    if (isToday) return 'СЕГОДНЯ';
    if (isWithin3Days) return 'СКОРО';
    return 'ПРЕДСТОЯЩАЯ';
  };

  const { isToday, isWithin3Days, isLive, isFinished } = getDynamicGameStatus(event_date, homeOutcome, awayOutcome);
  const statusText = getStatusText(isToday, isWithin3Days, isLive, isFinished);
  const displayDate = formatDateWithWeekday(event_date, time);

  // --- ОБРАБОТКА ИСХОДА С ЛОГИРОВАНИЕМ ---
  const getOutcomeText = (outcome: string | undefined): string => {
    //console.log(`[GameCard] getOutcomeText called with:`, outcome, typeof outcome);
    if (!outcome) return '';
    const lower = outcome.toLowerCase().trim();
    switch (lower) {
      case 'win': return 'Победа';
      case 'loss': return 'Поражение';
      case 'draw': return 'Ничья';
      case 'overtimewin': return 'Победа в ОТ';
      case 'overtimeloss': return 'Поражение в ОТ';      
      case 'bullitwin': return 'Победа ПБ';
      case 'bullitlose': return 'Поражение ПБ';
      default:
        //console.warn(`[GameCard] Unknown outcome: "${outcome}"`);
        return outcome;
    }
  };

  const getLeagueDisplayName = (leagueName: string | undefined): string => {
    if (!leagueName || leagueName.trim() === '') return 'Товарищеский матч';
    const parts = leagueName.split(':');
    if (parts.length > 1) {
      const namePart = parts[1].trim();
      const words = namePart.split(',')[0].trim();
      const firstWord = words.split(' ')[0];
      return firstWord;
    }
    return leagueName;
  };

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.7}>
      <View style={commonStyles.gameCard}>
        {/* Header */}
        <View style={styles.header}>
          {statusText && (
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(isLive, isFinished, isWithin3Days) }]}>
              <Text style={styles.statusText}>{statusText}</Text>
            </View>
          )}
          <Text style={commonStyles.textSecondary}>{displayDate}</Text>
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
            <Text style={styles.teamName} numberOfLines={2}>{homeTeamName}</Text>
            {showScore && (isLive || isFinished) && <Text style={styles.score}>{homeScore ?? 0}</Text>}
            {isFinished && homeOutcome && (
              <View style={styles.outcomeBadgeContainer}>
                <Text style={[styles.outcomeText, {
                  color: ['win', 'overtimewin', 'bullitwin'].includes(homeOutcome) ? colors.success :
                         ['loss', 'overtimeloss', 'bullitlose'].includes(homeOutcome) ? colors.error : colors.warning
                }]}>
                  {getOutcomeText(homeOutcome)}
                </Text>
              </View>
            )}
          </View>

          {/* VS + Видео */}
          <View style={styles.vsSection}>
            <Text style={styles.vsText}>VS</Text>
            {sp_video?.trim() && (
              <View style={styles.videoIconContainer}>
                <Ionicons name="videocam" size={20} color={colors.primary} />
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
            <Text style={styles.teamName} numberOfLines={2}>{awayTeamName}</Text>
            {showScore && (isLive || isFinished) && <Text style={styles.score}>{awayScore ?? 0}</Text>}
            {isFinished && awayOutcome && (
              <View style={styles.outcomeBadgeContainer}>
                <Text style={[styles.outcomeText, {
                  color: ['win', 'overtimewin', 'bullitwin'].includes(awayOutcome) ? colors.success :
                         ['loss', 'overtimeloss', 'bullitlose'].includes(awayOutcome) ? colors.error : colors.warning
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
            {venue && <Text style={commonStyles.textSecondary} numberOfLines={1}>📍 {typeof venue === 'string' ? venue : venue.name}</Text>}
            <View style={styles.competitionRow}>
              <Text style={[commonStyles.textSecondary, styles.leagueText]} numberOfLines={1}>
                {(!tournament || tournament.trim() === 'Товарищеский матч') ? '🤝 ' : '🏆 '}{getLeagueDisplayName(tournament)}
              </Text>
              {seasonName && (
                <Text style={[commonStyles.textSecondary, styles.seasonText]} numberOfLines={1}>
                  {seasonName}
                </Text>
              )}
            </View>
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
    paddingHorizontal: 1,
  },
  teamLogo: {
    width: 48,
    height: 48,
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
  vsSection: {
    paddingHorizontal: 16,
    justifyContent: 'flex-start',
    paddingTop: 20,
    alignItems: 'center',
  },
  vsText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
  },
  videoIconContainer: {},
  footer: {},
  gameInfo: {
    gap: 4,
  },
  competitionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  leagueText: {
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'left',
    flex: 1,
    marginRight: 8,
  },
  seasonText: {
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'right',
    flexShrink: 1,
  },
});
