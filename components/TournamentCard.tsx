
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, commonStyles } from '../styles/commonStyles';
import { Tournament } from '../types';

interface TournamentCardProps {
  tournament: Tournament;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    marginHorizontal: 8,
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
  name: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  status: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: 'hidden',
  },
  season: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 12,
  },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.primary,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
});

const TournamentCard: React.FC<TournamentCardProps> = ({ tournament }) => {
  const getStatusColor = (status: Tournament['status']) => {
    switch (status) {
      case 'active':
        return { backgroundColor: colors.success, color: colors.surface };
      case 'upcoming':
        return { backgroundColor: colors.warning, color: colors.surface };
      case 'finished':
        return { backgroundColor: colors.textSecondary, color: colors.surface };
      default:
        return { backgroundColor: colors.textSecondary, color: colors.surface };
    }
  };

  const getStatusText = (status: Tournament['status']) => {
    switch (status) {
      case 'active':
        return 'АКТИВНЫЙ';
      case 'upcoming':
        return 'ПРЕДСТОЯЩИЙ';
      case 'finished':
        return 'ЗАВЕРШЕН';
      default:
        return 'НЕИЗВЕСТНО';
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.name}>{tournament.name}</Text>
        <Text style={[styles.status, getStatusColor(tournament.status)]}>
          {getStatusText(tournament.status)}
        </Text>
      </View>

      <Text style={styles.season}>Сезон {tournament.season}</Text>

      <View style={styles.stats}>
        {tournament.teams && (
          <View style={styles.stat}>
            <Text style={styles.statValue}>{tournament.teams}</Text>
            <Text style={styles.statLabel}>Команд</Text>
          </View>
        )}
        
        {tournament.games && (
          <View style={styles.stat}>
            <Text style={styles.statValue}>{tournament.games}</Text>
            <Text style={styles.statLabel}>Игр</Text>
          </View>
        )}
      </View>
    </View>
  );
};

export default TournamentCard;
