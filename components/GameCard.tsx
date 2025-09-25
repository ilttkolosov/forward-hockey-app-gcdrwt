
import React from 'react';
import { Game } from '../types';
import { useRouter } from 'expo-router';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { colors, commonStyles } from '../styles/commonStyles';

interface GameCardProps {
  game: Game;
  showScore?: boolean;
  hideSeasonInfo?: boolean; // New prop to control season display
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
  additionalInfo: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  infoLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  infoValue: {
    fontSize: 12,
    color: colors.text,
    fontWeight: '500',
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
    // If league_name exists and is not empty, use it as tournament name
    if (game.league_name && game.league_name.trim()) {
      return game.league_name;
    }
    
    // If tournament exists and is not empty, use it
    if (game.tournament && game.tournament.trim()) {
      return game.tournament;
    }
    
    // If no league/tournament info, it's a friendly match
    return 'Товарищеский матч';
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

      <View style={styles.details}>
        <Text style={styles.dateTime}>
          {formatDateTime(game.date, game.time)}
        </Text>
        <Text style={styles.venue}>
          {game.venue_name || game.venue}
        </Text>
      </View>

      {/* Additional info for detailed view - only show season if not hidden */}
      {!hideSeasonInfo && game.season_name && (
        <View style={styles.additionalInfo}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Сезон:</Text>
            <Text style={styles.infoValue}>{game.season_name}</Text>
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
};

export default GameCard;
