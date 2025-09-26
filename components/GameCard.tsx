
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
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
          <Text style={commonStyles.textSecondary}>
            {formatDate(game.date)} • {game.time}
          </Text>
        </View>

        <View style={styles.teamsContainer}>
          <View style={styles.teamSection}>
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
          <View style={styles.gameInfo}>
            {game.venue && (
              <Text style={commonStyles.textSecondary} numberOfLines={1}>
                📍 {game.venue}
              </Text>
            )}
            {game.league_name && (
              <Text style={[commonStyles.textSecondary, styles.leagueText]} numberOfLines={1}>
                🏆 {game.league_name}
              </Text>
            )}
            {game.season_name && (
              <Text style={[commonStyles.textSecondary, styles.seasonText]} numberOfLines={1}>
                📅 {game.season_name}
              </Text>
            )}
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
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  teamSection: {
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
    marginTop: 8,
  },
  gameInfo: {
    gap: 4,
  },
  leagueText: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  seasonText: {
    fontSize: 12,
    fontStyle: 'italic',
  },
});
