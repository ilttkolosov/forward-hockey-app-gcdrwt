// components/GameCard.tsx

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import { Game } from '../types'; // Убедитесь, что импортируете Game из правильного места
import { colors, commonStyles } from '../styles/commonStyles'; // Убедитесь, что импортируете стили
import { useRouter } from 'expo-router';

interface GameCardProps {
  game: Game; // Используем обновлённый тип Game
  showScore?: boolean;
}

export default function GameCard({ game, showScore = true }: GameCardProps) {
  const router = useRouter();

  const handlePress = () => {
    console.log('GameCard pressed, navigating to game:', game.id);
    router.push(`/game/${game.id}`);
  };

  // --- АДАПТИРОВАННАЯ ЛОГИКА ДЛЯ НОВЫХ ДАННЫХ ---
  if (!game) {
    console.warn('GameCard received undefined game prop');
    return null;
  }

  // Извлекаем данные, используя новые поля из объекта Game
  const {
    id,
    homeTeam,
    awayTeam,
    homeTeamLogo, // URI из локального хранилища
    awayTeamLogo, // URI из локального хранилища
    date, // Уже отформатированная дата из gameData.ts
    time, // Уже отформатированное время из gameData.ts
    venue,
    status, // Статус из gameData.ts
    tournament,
    homeScore,
    awayScore,
    sp_video,
    homeOutcome,
    awayOutcome,
    event_date, // Необходима для определения статуса
    team1_first,
    team1_second,
    team1_third,
    team2_first,
    team2_second,
    team2_third,
  } = game;

  // Используем имена команд из объектов
  const homeTeamName = homeTeam?.name || '—';
  const awayTeamName = awayTeam?.name || '—';

  // --- ЛОГИКА ДЛЯ ОПРЕДЕЛЕНИЯ СТАТУСА И БЕЙДЖЕЙ (сохранена из предыдущего кода) ---
  const getGameStatus = (gameDateStr: string) => {
    const now = new Date();
    const gameDate = new Date(gameDateStr);

    // Проверка, является ли игра сегодняшней
    const isToday = gameDate.toDateString() === now.toDateString();

    // Проверка, входит ли игра в следующие 3 дня
    const daysDiff = Math.ceil((gameDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const isWithin3Days = daysDiff >= 0 && daysDiff <= 3;

    // Проверка, является ли игра живой (5 минут до + 90 минут после)
    const liveStart = new Date(gameDate.getTime() - 5 * 60 * 1000); // –5 мин
    const liveEnd = new Date(gameDate.getTime() + 90 * 60 * 1000); // +90 мин
    const isLive = now >= liveStart && now <= liveEnd;

    return { isToday, isWithin3Days, isLive };
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

    // Новая логика бейджей для предстоящих игр
    if (status === 'upcoming') {
      if (isToday) return 'СЕГОДНЯ';
      if (isWithin3Days) return 'СКОРО';
      return 'ПРЕДСТОЯЩАЯ';
    }

    switch (status) {
      case 'live':
        return 'LIVE';
      case 'finished':
        return ''; // Убираем "ЗАВЕРШЕНА" бейдж для завершенных игр
      default:
        return '';
    }
  };

  // Получаем статус игры для предстоящих игр
  const { isToday, isWithin3Days, isLive } = status === 'upcoming' ? getGameStatus(event_date) : { isToday: false, isWithin3Days: false, isLive: status === 'live' };
  const statusText = getStatusText(status, isToday, isWithin3Days, isLive);

  // --- Функции для работы с исходом игры (outcome) ---
  const getOutcomeText = (outcome: string | undefined): string => {
    switch (outcome) {
      case 'win':
        return 'Победа';
      case 'loss':
        return 'Поражение';
      case 'draw':
        return 'Ничья';
      // case 'nich': // Если 'nich' используется вместо 'draw'
      //   return 'Ничья';
      default:
        return outcome || '';
    }
  };

  // --- Функции для работы с названием лиги (tournament) ---
  const getLeagueDisplayName = (leagueName: string | undefined): string => {
    if (!leagueName || leagueName.trim() === '') {
      return 'Товарищеский матч';
    }
    // Применяем обрезание, как в старом коде, если нужно
     const parts = leagueName.split(':');
     if (parts.length > 1) {
       const namePart = parts[1].trim();
       const words = namePart.split(',')[0].trim();
       const firstWord = words.split(' ')[0];
       return firstWord;
     }
    // return leagueName.split(',')[0].trim();
    return leagueName; // Возвращаем как есть, если обрезание не нужно
  };

  // --- КОНЕЦ ЛОГИКИ ---

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.7}>
      <View style={commonStyles.gameCard}>
        {/* Header */}
        <View style={styles.header}>
          {statusText && (
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(status, isLive) }]}>
              <Text style={styles.statusText}>{statusText}</Text>
            </View>
          )}
          <Text style={commonStyles.textSecondary}>
            {date}
            {time && time !== '00:00' && (
              <>
                {' • '}
                {time}
              </>
            )}
          </Text>
        </View>

        {/* Teams */}
        <View style={styles.teamsContainer}>
          {/* Home Team Container */}
          <View style={styles.teamContainer}>
            {homeTeamLogo ? (
              <Image 
                source={{ uri: homeTeamLogo }} 
                style={styles.teamLogo}
                resizeMode="contain"
              />
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
            {showScore && homeScore !== undefined && (
              <Text style={styles.score}>{homeScore}</Text>
            )}
            {/* Outcome Badge centered under team name */}
            {homeOutcome && (
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

          {/* VS Section - Aligned with bottom of team names */}
          <View style={styles.vsSection}>
            <Text style={styles.vsText}>VS</Text>
          </View>

          {/* Away Team Container */}
          <View style={styles.teamContainer}>
            {awayTeamLogo ? (
              <Image 
                source={{ uri: awayTeamLogo }} 
                style={styles.teamLogo}
                resizeMode="contain"
              />
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
            {showScore && awayScore !== undefined && (
              <Text style={styles.score}>{awayScore}</Text>
            )}
            {/* Outcome Badge centered under team name */}
            {awayOutcome && (
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
    //borderRadius: 24,
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
    minHeight: 36, // Для выравнивания по высоте
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
    justifyContent: 'center', // Центрируем по вертикали внутри своего контейнера
    //justifyContent: 'flex-start',
    paddingTop: 25, // Logo (48px) + margin (8px) = 56px to align with team names. 
                        // Или используем marginBottom у teamName для более точного контроля.
  },
  vsText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textSecondary,
    // Выравнивание по нижнему краю teamName. 
    // Поскольку teamName имеет minHeight и marginBottom, 
    // VS будет выровнен по нижнему краю этого блока.
    // Если нужно точное позиционирование, можно использовать absolute или adjust.
    // Для простоты и гибкости оставим как есть.
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