
import React from 'react';
import { Game } from '../types';
import { useRouter } from 'expo-router';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { colors, commonStyles } from '../styles/commonStyles';
import { apiService } from '../services/apiService';

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
    marginHorizontal: 16,
    shadowColor: colors.shadow,
    shadowOffset: {
      width: 0,
      height: 2,
    },
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
    color: colors.textSecondary,
    fontWeight: '500',
  },
  status: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: 'hidden',
  },
  matchup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  team: {
    flex: 1,
    alignItems: 'center',
  },
  teamContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamLogo: {
    width: 24,
    height: 24,
    marginRight: 8,
    borderRadius: 12,
  },
  teamName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    flex: 1,
  },
  score: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.primary,
    marginHorizontal: 20,
  },
  vs: {
    fontSize: 14,
    color: colors.textSecondary,
    marginHorizontal: 20,
  },
  details: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateTime: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  venue: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  resultsContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 2,
  },
  teamResult: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  teamResultName: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
    flex: 1,
  },
  teamGoals: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.primary,
    marginHorizontal: 8,
  },
  outcomeText: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    minWidth: 60,
    textAlign: 'center',
  },
  outcomeWin: {
    backgroundColor: colors.success,
    color: colors.surface,
  },
  outcomeLoss: {
    backgroundColor: colors.error,
    color: colors.surface,
  },
  outcomeDraw: {
    backgroundColor: colors.warning,
    color: colors.surface,
  },
});

const GameCard: React.FC<GameCardProps> = ({ game, showScore = true, hideSeasonInfo = false }) => {
  const router = useRouter();

  const handlePress = () => {
    console.log('Navigating to game details:', game.id);
    router.push(`/game/${game.id}`);
  };

  const getStatusColor = (status: Game['status']) => {
    switch (status) {
      case 'live':
        return { backgroundColor: colors.success, color: colors.surface };
      case 'upcoming':
        return { backgroundColor: colors.warning, color: colors.surface };
      case 'finished':
        return { backgroundColor: colors.textSecondary, color: colors.surface };
      default:
        return { backgroundColor: colors.textSecondary, color: colors.surface };
    }
  };

  const getStatusText = (status: Game['status']) => {
    switch (status) {
      case 'live':
        return 'В ЭФИРЕ';
      case 'upcoming':
        return 'ПРЕДСТОЯЩИЙ';
      case 'finished':
        return 'ЗАВЕРШЕН';
      default:
        return 'НЕИЗВЕСТНО';
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
      console.error('Error formatting date:', error);
      return dateString;
    }
  };

  const formatDateTime = (dateString: string, timeString: string) => {
    const formattedDate = formatDate(dateString);
    
    // If time is 00:00, don't display it at all
    if (timeString === '00:00') {
      return formattedDate;
    }
    
    return `${formattedDate} • ${timeString}`;
  };

  const getTournamentName = () => {
    console.log('Getting tournament name for game (default logic):', {
      id: game.id,
      tournament: game.tournament
    });
    
    // Simple default logic: use tournament field or default to "Чемпионат"
    if (game.tournament && game.tournament.trim() !== '') {
      console.log('Using tournament field:', game.tournament);
      return game.tournament;
    }
    
    console.log('No tournament info found, using default "Чемпионат"');
    return 'Чемпионат';
  };

  const renderTeamWithLogo = (teamName: string, teamLogo?: string) => {
    return (
      <View style={styles.teamContainer}>
        {teamLogo && (
          <Image 
            source={{ uri: teamLogo }} 
            style={styles.teamLogo}
            onError={() => console.log('Failed to load team logo:', teamLogo)}
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
        return [styles.outcomeText, styles.outcomeWin];
      case 'loss':
        return [styles.outcomeText, styles.outcomeLoss];
      case 'nich':
        return [styles.outcomeText, styles.outcomeDraw];
      default:
        return [styles.outcomeText, styles.outcomeDraw];
    }
  };

  const renderDetailedResults = () => {
    if (!game.results || !game.homeTeamId || !game.awayTeamId) {
      return null;
    }

    const homeResult = game.results[game.homeTeamId];
    const awayResult = game.results[game.awayTeamId];

    if (!homeResult || !awayResult) {
      return null;
    }

    console.log('Rendering detailed results:', {
      homeTeam: game.homeTeam,
      homeResult,
      awayTeam: game.awayTeam,
      awayResult
    });

    return (
      <View style={styles.resultsContainer}>
        <View style={styles.resultRow}>
          <View style={styles.teamResult}>
            <Text style={styles.teamResultName} numberOfLines={1}>
              {game.homeTeam}
            </Text>
          </View>
          <Text style={styles.teamGoals}>{homeResult.goals}</Text>
          <Text style={getOutcomeStyle(homeResult.outcome)}>
            {apiService.getOutcomeText(homeResult.outcome)}
          </Text>
        </View>
        
        <View style={styles.resultRow}>
          <View style={styles.teamResult}>
            <Text style={styles.teamResultName} numberOfLines={1}>
              {game.awayTeam}
            </Text>
          </View>
          <Text style={styles.teamGoals}>{awayResult.goals}</Text>
          <Text style={getOutcomeStyle(awayResult.outcome)}>
            {apiService.getOutcomeText(awayResult.outcome)}
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
        <Text style={[styles.status, getStatusColor(game.status)]}>
          {getStatusText(game.status)}
        </Text>
      </View>

      <View style={styles.matchup}>
        <View style={styles.team}>
          {renderTeamWithLogo(game.homeTeam, game.homeTeamLogo)}
        </View>

        {showScore && game.homeScore !== undefined && game.awayScore !== undefined ? (
          <Text style={styles.score}>
            {game.homeScore} : {game.awayScore}
          </Text>
        ) : (
          <Text style={styles.vs}>VS</Text>
        )}

        <View style={styles.team}>
          {renderTeamWithLogo(game.awayTeam, game.awayTeamLogo)}
        </View>
      </View>

      {/* Show detailed results for finished games with new results structure */}
      {game.status === 'finished' && game.results && renderDetailedResults()}

      <View style={styles.details}>
        <Text style={styles.dateTime}>
          {formatDateTime(game.date, game.time)}
        </Text>
        <Text style={styles.venue}>
          {game.venue}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

export default GameCard;
