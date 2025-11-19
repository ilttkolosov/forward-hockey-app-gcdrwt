// components/CommandCard.tsx
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import { colors, commonStyles } from '../styles/commonStyles';
import { useRouter } from 'expo-router';

interface CommandCardProps {
  teamId: string;
  teamName: string;
  logoUri: string | null;
  position: string;
  games: string;
  wins: string;
  losses: string;
  draws: string;
  overtime_wins: string;
  overtime_losses: string;
  points_2x: string;
  goals_for: string;
  goals_against: string;
  goal_diff: string;
  ppg_percent: string;
  pkpercent: string;
  tournamentId: string;
}

export default function CommandCard({
  teamId,
  teamName,
  logoUri,
  position,
  games,
  wins,
  losses,
  draws,
  overtime_wins,
  overtime_losses,
  points_2x,
  goals_for,
  goals_against,
  goal_diff,
  ppg_percent,
  pkpercent,
  tournamentId,
}: CommandCardProps) {

  const router = useRouter();

  const handlePress = () => {
    console.log(`[CommandCard] Нажата команда ${teamId} в турнире ${tournamentId}`);
    router.push({
      pathname: `/command/${teamId}`,
      params: { tournamentId },
    });
  };

    const safePercent = (value: string): string => {
    if (!value || value === '-' || isNaN(parseFloat(value))) return '0.0';
    return parseFloat(value).toFixed(1);
    };

    const displayGoalDiff = !goal_diff || goal_diff === '-' || goal_diff === ''
    ? '0'
    : goal_diff.startsWith('-')
        ? goal_diff
        : `+${goal_diff}`;



  // Вспомогательная функция для скрытия нулевых значений
  const showIfNonZero = (value: string, label: string) => {
    if (parseInt(value, 10) === 0) return null;
    return (
      <View style={styles.statItem}>
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={styles.statValue}>{value}</Text>
      </View>
    );
  };

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.7}>
      <View style={commonStyles.gameCard}>
        {/* Заголовок: место и очки */}
        <View style={styles.header}>
          <Text style={styles.positionText}>Текущее место в турнире {position}</Text>
          <Text style={commonStyles.textSecondary}>{points_2x} очков</Text>
        </View>

        {/* Название и логотип */}
        <View style={styles.teamRow}>
          {logoUri ? (
            <Image source={{ uri: logoUri }} style={styles.logo} resizeMode="contain" />
          ) : (
            <View style={styles.placeholderLogo}>
              <Text style={styles.placeholderText}>{teamName.charAt(0)}</Text>
            </View>
          )}
          <Text style={styles.teamName} numberOfLines={1}>
            {teamName}
          </Text>
        </View>

        {/* Основная статистика */}
        <View style={styles.statsSection}>
          {/* Обязательные поля */}
          <StatRow label="Игр" value={games} />
          <StatRow label="Побед" value={wins} color={colors.success} />
          <StatRow label="Поражений" value={losses} color={colors.error} />
          {/* Условные поля */}
          {showIfNonZero(draws, 'Н')}
          {showIfNonZero(overtime_wins, 'ВБ')}
          {showIfNonZero(overtime_losses, 'ПБ')}
        </View>

        {/* Дополнительная статистика */}
        <View style={styles.extraStatsSection}>
          <StatRow label="Заб" value={goals_for} />
          <StatRow label="Проп" value={goals_against} />
          <StatRow label="+/-" value={displayGoalDiff} />
          <StatRow label="%Б" value={safePercent(ppg_percent)} />
          <StatRow label="%М" value={safePercent(pkpercent)} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

// Компонент строки статистики
const StatRow = ({
  label,
  value,
  color = colors.text,
}: {
  label: string;
  value: string;
  color?: string;
}) => (
  <View style={styles.statRow}>
    <Text style={[styles.statLabel, { color }]}>{label}</Text>
    <Text style={[styles.statValue, { color }]}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  positionText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.primary,
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  logo: {
    width: 48,
    height: 48,
    marginRight: 12,
  },
  placeholderLogo: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  placeholderText: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  teamName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  statsSection: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 12,
  },
  extraStatsSection: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
  },
  statRow: {
    alignItems: 'center',
    minWidth: 40,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },
});