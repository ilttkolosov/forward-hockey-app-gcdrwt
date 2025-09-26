
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Tournament } from '../types';
import { colors, commonStyles } from '../styles/commonStyles';

interface TournamentCardProps {
  tournament: Tournament;
}

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
        return 'ACTIVE';
      case 'finished':
        return 'FINISHED';
      case 'upcoming':
        return 'UPCOMING';
      default:
        return '';
    }
  };

  return (
    <View style={commonStyles.card}>
      <View style={styles.header}>
        <View style={styles.tournamentInfo}>
          <Text style={styles.name}>{tournament.name}</Text>
          <Text style={styles.season}>{tournament.season}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(tournament.status) }]}>
          <Text style={styles.statusText}>{getStatusText(tournament.status)}</Text>
        </View>
      </View>

      {(tournament.teams || tournament.games) && (
        <View style={styles.stats}>
          {tournament.teams && (
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{tournament.teams}</Text>
              <Text style={styles.statLabel}>Teams</Text>
            </View>
          )}
          {tournament.games && (
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{tournament.games}</Text>
              <Text style={styles.statLabel}>Games</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  tournamentInfo: {
    flex: 1,
    marginRight: 16,
  },
  name: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  season: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: colors.background,
    fontSize: 12,
    fontWeight: '600',
  },
  stats: {
    flexDirection: 'row',
    gap: 24,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
});
