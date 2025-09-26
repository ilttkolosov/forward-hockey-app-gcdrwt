
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
    marginBottom: 8,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  status: {
    fontSize: 12,
    fontWeight: '500',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  season: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
});

export default function TournamentCard({ tournament }: TournamentCardProps) {
  const getStatusColor = (status: Tournament['status']) => {
    switch (status) {
      case 'active':
        return colors.success;
      case 'finished':
        return colors.textSecondary;
      case 'upcoming':
        return colors.warning;
      default:
        return colors.textSecondary;
    }
  };

  const getStatusText = (status: Tournament['status']) => {
    switch (status) {
      case 'active':
        return 'Активный';
      case 'finished':
        return 'Завершен';
      case 'upcoming':
        return 'Предстоящий';
      default:
        return status;
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.name} numberOfLines={2}>
          {tournament.name}
        </Text>
        <Text style={[styles.status, { color: getStatusColor(tournament.status) }]}>
          {getStatusText(tournament.status)}
        </Text>
      </View>
      
      <Text style={styles.season}>{tournament.season}</Text>
      
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
}
