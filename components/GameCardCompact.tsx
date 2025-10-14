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

interface GameCardCompactProps {
  game: Game;
  showScore?: boolean;
}

const hasValidOutcome = (outcome: string | undefined): boolean => {
  return outcome != null && outcome !== '' && outcome !== 'unknown';
};

// Извлекает число из строки вида "3", "3Б", "10П" → 3, 3, 10
const extractNumericScore = (score: string | number | null | undefined): number => {
  if (score == null) return 0;
  const scoreStr = String(score).trim();
  const match = scoreStr.match(/^\d+/);
  return match ? parseInt(match[0], 10) : 0;
};

export default function GameCardCompact({ game, showScore = true }: GameCardCompactProps) {
  const router = useRouter();
  const handlePress = () => {
    console.log('GameCardCompact pressed, navigating to game:', game.id);
    router.push(`/game/${game.id}`);
  };

  if (!game) {
    console.warn('GameCardCompact received undefined game prop');
    return null;
  }

  const {
    homeTeam,
    awayTeam,
    homeTeamLogo,
    awayTeamLogo,
    date,
    time,
    event_date,
    homeScore,
    awayScore,
  } = game;

  const homeTeamName = homeTeam?.name || '—';
  const awayTeamName = awayTeam?.name || '—';

  // Логика статуса
  const getDynamicGameStatus = (gameDateStr: string) => {
    const now = new Date();
    const gameDate = new Date(gameDateStr);
    const isToday = gameDate.toDateString() === now.toDateString();
    const daysDiff = Math.ceil((gameDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const isWithin3Days = daysDiff >= 0 && daysDiff <= 3;
    const liveStart = new Date(gameDate.getTime() - 5 * 60 * 1000);
    const liveEnd = new Date(gameDate.getTime() + 90 * 60 * 1000);
    const isLive = now >= liveStart && now <= liveEnd;
    const isFinished = hasValidOutcome(game.homeOutcome) || hasValidOutcome(game.awayOutcome) || now > liveEnd;
    return { isToday, isWithin3Days, isLive, isFinished };
  };

  const { isLive, isFinished } = getDynamicGameStatus(event_date);

  const getStatusColor = (isLive: boolean, isFinished: boolean) => {
    if (isLive) return colors.success;
    if (isFinished) return colors.textSecondary;
    return colors.warning;
  };

  const getStatusText = (isToday: boolean, isWithin3Days: boolean, isLive: boolean, isFinished: boolean) => {
    if (isLive) return 'LIVE';
    if (isFinished) return '';
    if (isToday) return 'СЕГОДНЯ';
    if (isWithin3Days) return 'СКОРО';
    return 'ПРЕДСТОЯЩАЯ';
  };

  const { isToday, isWithin3Days } = getDynamicGameStatus(event_date);
  const statusText = getStatusText(isToday, isWithin3Days, isLive, isFinished);

  // === ЛОГИКА ОПРЕДЕЛЕНИЯ ЦВЕТА СЧЁТА ===
  const homeScoreNum = extractNumericScore(homeScore);
  const awayScoreNum = extractNumericScore(awayScore);
  let homeScoreColor = colors.primary;
  let awayScoreColor = colors.primary;

  if (isFinished || isLive) {
    if (homeScoreNum > awayScoreNum) {
      awayScoreColor = colors.textSecondary;
    } else if (awayScoreNum > homeScoreNum) {
      homeScoreColor = colors.textSecondary;
    }
  }

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.7}>
      <View style={commonStyles.gameCard}>
        {/* Header: Дата и время */}
        {statusText ? (
          <View style={styles.headerWithBadge}>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(isLive, isFinished) }]}>
              <Text style={styles.statusText}>{statusText}</Text>
            </View>
            <Text style={[commonStyles.textSecondary, styles.dateWithBadge]}>
              {date}
              {time && time !== '00:00' && <> • {time}</>}
            </Text>
          </View>
        ) : (
          <View style={styles.headerWithoutBadge}>
            <Text style={[commonStyles.textSecondary, styles.dateAlone]}>
              {date}
              {time && time !== '00:00' && <> • {time}</>}
            </Text>
          </View>
        )}

        {/* Teams and Score */}
        <View style={styles.teamsContainer}>
          {/* Home Team */}
          <View style={styles.teamColumn}>
            {homeTeamLogo ? (
              <Image source={{ uri: homeTeamLogo }} style={styles.teamLogo} resizeMode="contain" />
            ) : (
              <View style={styles.placeholderLogo}>
                <Text style={styles.placeholderText}>{homeTeamName.charAt(0)}</Text>
              </View>
            )}
            <Text style={styles.teamName} numberOfLines={3}>
              {homeTeamName}
            </Text>
          </View>

          {/* VS or Score — по центру */}
          <View style={styles.vsScoreContainer}>
            {showScore && (isLive || isFinished) ? (
              <View style={styles.scoreRow}>
                <Text style={[styles.bigScore, { color: homeScoreColor }]}>
                  {homeScore ?? 0}
                </Text>
                <Text style={[styles.bigScore, { color: colors.textSecondary, fontWeight: '600', marginHorizontal: 6 }]}>
                  :
                </Text>
                <Text style={[styles.bigScore, { color: awayScoreColor }]}>
                  {awayScore ?? 0}
                </Text>
              </View>
            ) : (
              <Text style={styles.vsText}>VS</Text>
            )}
          </View>

          {/* Away Team */}
          <View style={styles.teamColumn}>
            {awayTeamLogo ? (
              <Image source={{ uri: awayTeamLogo }} style={styles.teamLogo} resizeMode="contain" />
            ) : (
              <View style={styles.placeholderLogo}>
                <Text style={styles.placeholderText}>{awayTeamName.charAt(0)}</Text>
              </View>
            )}
            <Text style={styles.teamName} numberOfLines={3}>
              {awayTeamName}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // Стили для заголовка С бейджем
  headerWithBadge: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  dateWithBadge: {
    textAlign: 'right',
    flex: 1,
    marginLeft: 8,
  },
  // Стили для заголовка БЕЗ бейджа
  headerWithoutBadge: {
    alignItems: 'center',
    marginBottom: 8,
  },
  dateAlone: {
    textAlign: 'center',
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
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 0,
  },
  teamColumn: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  teamLogo: {
    width: 48,
    height: 48,
    marginBottom: 6,
  },
  placeholderLogo: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
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
    marginBottom: 4,
    maxWidth: '100%',
  },
  vsScoreContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  vsText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigScore: {
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
  },
});