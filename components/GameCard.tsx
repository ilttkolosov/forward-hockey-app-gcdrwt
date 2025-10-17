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
import Ionicons from '@expo/vector-icons/Ionicons'; // ← ДОБАВЛЕНО

interface GameCardProps {
  game: Game;
  showScore?: boolean;
}

const hasValidOutcome = (outcome: string | undefined): boolean => {
  return outcome != null && outcome !== '' && outcome !== 'unknown';
};

// Вспомогательная функция для форматирования даты с днём недели
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
    console.log('GameCard pressed, navigating to game:', game.id);
    router.push(`/game/${game.id}`);
  };

  if (!game) {
    console.warn('GameCard received undefined game prop');
    return null;
  }

  const {
    id,
    homeTeam,
    awayTeam,
    homeTeamLogo,
    awayTeamLogo,
    date,
    time,
    venue,
    status,
    tournament,
    homeScore,
    awayScore,
    sp_video, // ← поле видео
    homeOutcome,
    awayOutcome,
    event_date,
    team1_first,
    team1_second,
    team1_third,
    team2_first,
    team2_second,
    team2_third,
  } = game;

  const homeTeamName = homeTeam?.name || '—';
  const awayTeamName = awayTeam?.name || '—';

  // --- ДИНАМИЧЕСКАЯ ЛОГИКА СТАТУСА И БЕЙДЖЕЙ ---
  const getDynamicGameStatus = (gameDateStr: string, homeOutcome?: string, awayOutcome?: string) => {
    if (hasValidOutcome(homeOutcome) || hasValidOutcome(awayOutcome)) {
      return {
        isToday: false,
        isWithin3Days: false,
        isLive: false,
        isFinished: true,
      };
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

  const { isToday, isWithin3Days, isLive, isFinished } = getDynamicGameStatus(event_date, homeOutcome, awayOutcome);
  const statusText = getStatusText(isToday, isWithin3Days, isLive, isFinished);

  // --- Форматируем дату с днём недели ---
  const displayDate = formatDateWithWeekday(event_date, time);

  // --- Функции для работы с исходом игры ---
  const getOutcomeText = (outcome: string | undefined): string => {
    switch (outcome) {
      case 'win': return 'Победа';
      case 'loss': return 'Поражение';
      case 'draw': return 'Ничья';
      default: return outcome || '';
    }
  };

  // --- Функции для работы с названием лиги ---
  const getLeagueDisplayName = (leagueName: string | undefined): string => {
    if (!leagueName || leagueName.trim() === '') {
      return 'Товарищеский матч';
    }
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
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(isLive, isFinished) }]}>
              <Text style={styles.statusText}>{statusText}</Text>
            </View>
          )}
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
                <Text style={styles.placeholderText}>
                  {homeTeamName.charAt(0)}
                </Text>
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

          {/* VS + Иконка видео */}
          <View style={styles.vsSection}>
            <Text style={styles.vsText}>VS</Text>
            {/* Иконка видео — по центру по горизонтали, внизу под "VS" */}
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
                <Text style={styles.placeholderText}>
                  {awayTeamName.charAt(0)}
                </Text>
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
              {(!tournament || tournament.trim() === '') ? '🤝 ' : '🏆 '}{getLeagueDisplayName(tournament)}
            </Text>
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
    paddingHorizontal: 8,
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
    paddingTop: 20, // отступ сверху, чтобы "VS" был выше
    alignItems: 'center', // ← центрируем по горизонтали
  },
  vsText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8, // отступ под "VS"
  },
  videoIconContainer: {
    // Иконка уже в центре благодаря alignItems: 'center' у vsSection
  },
  footer: {},
  gameInfo: {
    gap: 4,
  },
  leagueText: {
    fontSize: 12,
    fontStyle: 'italic',
  },
});