
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, commonStyles } from '../styles/commonStyles';
import { apiService } from '../services/apiService';
import { Game } from '../types';

interface GameCardProps {
  game: Game;
  showScore?: boolean;
  hideSeasonInfo?: boolean;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  tournament: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.primary,
    backgroundColor: colors.primary + '15',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  status: {
    fontSize: 12,
    fontWeight: '500',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  matchInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  team: {
    flex: 1,
    alignItems: 'center',
  },
  teamWithLogo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  teamLogo: {
    width: 24,
    height: 24,
    marginRight: 8,
    borderRadius: 12,
  },
  teamName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    flexShrink: 1,
  },
  score: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginHorizontal: 16,
  },
  vs: {
    fontSize: 16,
    color: colors.textSecondary,
    marginHorizontal: 16,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  dateTime: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  venue: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'right',
    flex: 1,
  },
  resultsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  resultBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    minWidth: 60,
    alignItems: 'center',
  },
  resultText: {
    fontSize: 12,
    fontWeight: '600',
  },
  winBadge: {
    backgroundColor: colors.success + '20',
  },
  winText: {
    color: colors.success,
  },
  lossBadge: {
    backgroundColor: colors.error + '20',
  },
  lossText: {
    color: colors.error,
  },
  drawBadge: {
    backgroundColor: colors.textSecondary + '20',
  },
  drawText: {
    color: colors.textSecondary,
  },
});

export default function GameCard({ game, showScore = false, hideSeasonInfo = false }: GameCardProps) {
  const router = useRouter();

  const handlePress = () => {
    router.push(`/game/${game.id}`);
  };

  const getStatusColor = (status: Game['status']) => {
    switch (status) {
      case 'live':
        return colors.error;
      case 'finished':
        return colors.success;
      case 'upcoming':
        return colors.warning;
      default:
        return colors.textSecondary;
    }
  };

  const getStatusText = (status: Game['status']) => {
    switch (status) {
      case 'live':
        return 'В эфире';
      case 'finished':
        return 'Завершен';
      case 'upcoming':
        return 'Предстоящий';
      default:
        return status;
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch (error) {
      console.error('Ошибка форматирования даты:', error);
      return dateString;
    }
  };

  const formatDateTime = (dateString: string, timeString: string) => {
    const formattedDate = formatDate(dateString);
    if (timeString && timeString !== '00:00') {
      return `${formattedDate} в ${timeString}`;
    }
    return formattedDate;
  };

  const getTournamentName = () => {
    // Приоритет league_name, затем tournament, затем fallback
    if (game.league_name && game.league_name.trim() !== '') {
      return game.league_name;
    }
    if (game.tournament && game.tournament.trim() !== '') {
      return game.tournament;
    }
    return 'Товарищеский матч';
  };

  const renderTeamWithLogo = (teamName: string, logoUrl?: string) => {
    return (
      <View style={styles.teamWithLogo}>
        {logoUrl && logoUrl !== '' && (
          <Image 
            source={{ uri: logoUrl }} 
            style={styles.teamLogo}
            defaultSource={require('../assets/images/natively-dark.png')}
          />
        )}
        <Text style={styles.teamName} numberOfLines={2}>
          {teamName}
        </Text>
      </View>
    );
  };

  const getOutcomeStyle = (outcome: string) => {
    switch (outcome) {
      case 'win':
        return [styles.resultBadge, styles.winBadge];
      case 'loss':
        return [styles.resultBadge, styles.lossBadge];
      case 'nich':
        return [styles.resultBadge, styles.drawBadge];
      default:
        return [styles.resultBadge, styles.drawBadge];
    }
  };

  const getOutcomeTextStyle = (outcome: string) => {
    switch (outcome) {
      case 'win':
        return [styles.resultText, styles.winText];
      case 'loss':
        return [styles.resultText, styles.lossText];
      case 'nich':
        return [styles.resultText, styles.drawText];
      default:
        return [styles.resultText, styles.drawText];
    }
  };

  const renderDetailedResults = () => {
    if (game.status !== 'finished' || !game.team1_outcome || !game.team2_outcome) {
      return null;
    }

    return (
      <View style={styles.resultsContainer}>
        <View style={getOutcomeStyle(game.team1_outcome)}>
          <Text style={getOutcomeTextStyle(game.team1_outcome)}>
            {apiService.getOutcomeText(game.team1_outcome)}
          </Text>
        </View>
        <View style={getOutcomeStyle(game.team2_outcome)}>
          <Text style={getOutcomeTextStyle(game.team2_outcome)}>
            {apiService.getOutcomeText(game.team2_outcome)}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <TouchableOpacity style={styles.card} onPress={handlePress}>
      <View style={styles.header}>
        <Text style={styles.tournament}>
          {getTournamentName()}
        </Text>
        <Text style={[styles.status, { color: getStatusColor(game.status) }]}>
          {getStatusText(game.status)}
        </Text>
      </View>

      <View style={styles.matchInfo}>
        <View style={styles.team}>
          {renderTeamWithLogo(game.homeTeam, game.homeTeamLogo)}
        </View>

        {showScore && game.status === 'finished' && game.homeScore !== undefined && game.awayScore !== undefined ? (
          <Text style={styles.score}>
            {game.homeScore} : {game.awayScore}
          </Text>
        ) : (
          <Text style={styles.vs}>vs</Text>
        )}

        <View style={styles.team}>
          {renderTeamWithLogo(game.awayTeam, game.awayTeamLogo)}
        </View>
      </View>

      {renderDetailedResults()}

      <View style={styles.footer}>
        <Text style={styles.dateTime}>
          {formatDateTime(game.date, game.time)}
        </Text>
        <Text style={styles.venue} numberOfLines={1}>
          {game.venue}
        </Text>
      </View>
    </TouchableOpacity>
  );
}
