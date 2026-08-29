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
import { primeGameDetailsCache } from '../data/gameData';

interface GameCardCompactProps {
  game: Game;
  showScore?: boolean;
  onPress?: () => void;
}

// Форматирование даты с днём недели (как в GameCard)
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

const hasValidOutcome = (outcome: string | undefined): boolean => {
  return outcome != null && outcome !== '' && outcome !== 'unknown';
};

export default function GameCardCompact({ game, showScore = true, onPress }: GameCardCompactProps) {
  const router = useRouter();
  const handlePress = () => {
    primeGameDetailsCache(game);
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
    season_name,
  } = game;

  const homeTeamName = homeTeam?.name || '—';
  const awayTeamName = awayTeam?.name || '—';

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
    if (isWithin3Days) return colors.warning;
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

  // --- ОПРЕДЕЛЕНИЕ, ПОКАЗЫВАТЬ ЛИ СЧЁТ ВМЕСТО VS ---
  const shouldShowScoreInsteadOfVS = isFinished && showScore && homeScore != null && awayScore != null;

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
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(isLive, isFinished, isWithin3Days) }]}>
              <Text style={styles.statusText}>{statusText}</Text>
            </View>
          ) : null}
          <Text style={commonStyles.textSecondary}>
            {displayDate}
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
            {/* Исход НЕ отображаем — убрано */}
          </View>

          {/* Счёт или VS */}
          {shouldShowScoreInsteadOfVS ? (
            <View style={styles.scoreSection}>
              <Text style={styles.finalScore}>
                {homeScore}  :  {awayScore}
              </Text>
              {sp_video?.trim() && (
                <View style={styles.videoIconContainer}>
                  <Ionicons name="videocam" size={20} color={colors.primary} />
                </View>
              )}
            </View>
          ) : (
            <View style={styles.vsSection}>
              <Text style={styles.vsText}>VS</Text>
              {sp_video?.trim() && (
                <View style={styles.videoIconContainer}>
                  <Ionicons name="videocam" size={20} color={colors.primary} />
                </View>
              )}
            </View>
          )}

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
            {/* Исход НЕ отображаем — убрано */}
          </View>
        </View>

        {/* Footer */}
        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.gameInfoRow}>
            <Text style={[commonStyles.textSecondary, styles.leagueText]} numberOfLines={1}>
              {(!tournament || tournament.trim() === 'Товарищеский матч') ? '🤝 ' : '🏆 '}
              {getLeagueDisplayName(tournament)}
            </Text>
            {season_name && season_name.trim() !== '' && (
              <Text style={[commonStyles.textSecondary, styles.seasonText]} numberOfLines={1}>
                {season_name}
              </Text>
            )}
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
    paddingHorizontal: 1,
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
    minHeight: 32,
  },
  // Секция счёта вместо VS
  scoreSection: {
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 5,
  },
  finalScore: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.primary,
    marginBottom: 4,
  },
  // Секция VS (для незавершённых игр)
  vsSection: {
    paddingHorizontal: 12,
    justifyContent: 'flex-start',
    paddingTop: 20,
    alignItems: 'center',
  },
  vsText: {
    fontSize: 28,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
  },
  videoIconContainer: {
    // Иконка по центру благодаря alignItems: 'center'
  },
  footer: {
    marginTop: 4,
  },
  gameInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  leagueText: {
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'left',
    flex: 1, // Занимает всё доступное пространство слева
    marginRight: 8, // Отступ от сезона
  },
  seasonText: {
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'right',
    flexShrink: 1, // Сжимается, если места мало
  },
});
