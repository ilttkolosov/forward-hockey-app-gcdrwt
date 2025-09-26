
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Game } from '../types';
import { colors, commonStyles } from '../styles/commonStyles';
import { useRouter } from 'expo-router';

interface GameCardProps {
  game: Game;
  showScore?: boolean;
}

export default function GameCard({ game, showScore = true }: GameCardProps) {
  const router = useRouter();

  const handlePress = () => {
    console.log('GameCard pressed, navigating to game:', game.id);
    router.push(`/game/${game.id}`);
  };

  const getStatusColor = (status: Game['status']) => {
    switch (status) {
      case 'live':
        return colors.error;
      case 'upcoming':
        return colors.warning;
      case 'finished':
        return colors.textSecondary;
      default:
        return colors.textSecondary;
    }
  };

  const getStatusText = (status: Game['status']) => {
    switch (status) {
      case 'live':
        return 'В ЭФИРЕ';
      case 'upcoming':
        return 'ПРЕДСТОЯЩАЯ';
      case 'finished':
        return 'ЗАВЕРШЕНА';
      default:
        return '';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
      month: 'short',
      day: 'numeric',
    });
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

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.7}>
      <View style={commonStyles.gameCard}>
        <View style={styles.header}>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(game.status) }]}>
            <Text style={styles.statusText}>{getStatusText(game.status)}</Text>
          </View>
          <Text style={commonStyles.textSecondary}>{formatDate(game.date)} • {game.time}</Text>
        </View>

        <View style={styles.teamsContainer}>
          <View style={styles.teamSection}>
            <Text style={styles.teamName}>{game.homeTeam}</Text>
            {showScore && game.homeScore !== undefined && (
              <View style={styles.scoreContainer}>
                <Text style={styles.score}>{game.homeScore}</Text>
                {game.team1_outcome && (
                  <Text style={[styles.outcome, { 
                    color: game.team1_outcome === 'win' ? colors.success : 
                           game.team1_outcome === 'loss' ? colors.error : colors.warning 
                  }]}>
                    {getOutcomeText(game.team1_outcome)}
                  </Text>
                )}
              </View>
            )}
          </View>

          <View style={styles.vsSection}>
            <Text style={styles.vsText}>VS</Text>
          </View>

          <View style={styles.teamSection}>
            <Text style={styles.teamName}>{game.awayTeam}</Text>
            {showScore && game.awayScore !== undefined && (
              <View style={styles.scoreContainer}>
                <Text style={styles.score}>{game.awayScore}</Text>
                {game.team2_outcome && (
                  <Text style={[styles.outcome, { 
                    color: game.team2_outcome === 'win' ? colors.success : 
                           game.team2_outcome === 'loss' ? colors.error : colors.warning 
                  }]}>
                    {getOutcomeText(game.team2_outcome)}
                  </Text>
                )}
              </View>
            )}
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={commonStyles.textSecondary}>{game.venue}</Text>
          {game.tournament && (
            <Text style={[commonStyles.textSecondary, styles.tournament]}>
              {game.tournament}
            </Text>
          )}
        </View>

        {/* Additional info for finished games */}
        {game.status === 'finished' && (game.league_name || game.season_name) && (
          <View style={styles.additionalInfo}>
            {game.league_name && (
              <Text style={styles.infoText}>Лига: {game.league_name}</Text>
            )}
            {game.season_name && (
              <Text style={styles.infoText}>Сезон: {game.season_name}</Text>
            )}
          </View>
        )}
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
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  teamSection: {
    flex: 1,
    alignItems: 'center',
  },
  teamName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  scoreContainer: {
    alignItems: 'center',
  },
  score: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.primary,
  },
  outcome: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  vsSection: {
    paddingHorizontal: 16,
  },
  vsText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tournament: {
    fontStyle: 'italic',
  },
  additionalInfo: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  infoText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 2,
  },
});
