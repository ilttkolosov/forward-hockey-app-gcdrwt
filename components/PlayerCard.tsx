
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Player } from '../types';
import { colors, commonStyles } from '../styles/commonStyles';

interface PlayerCardProps {
  player: Player;
}

export default function PlayerCard({ player }: PlayerCardProps) {
  const getPositionColor = (position: string) => {
    switch (position.toLowerCase()) {
      case 'forward':
        return colors.error;
      case 'defenseman':
        return colors.primary;
      case 'goaltender':
        return colors.warning;
      default:
        return colors.textSecondary;
    }
  };

  return (
    <View style={commonStyles.card}>
      <View style={styles.header}>
        <View style={styles.numberContainer}>
          <Text style={styles.number}>{player.number}</Text>
        </View>
        <View style={styles.playerInfo}>
          <Text style={styles.name}>{player.name}</Text>
          <View style={[styles.positionBadge, { backgroundColor: getPositionColor(player.position) }]}>
            <Text style={styles.positionText}>{player.position}</Text>
          </View>
        </View>
      </View>

      {(player.age || player.height || player.weight || player.nationality) && (
        <View style={styles.details}>
          {player.age && (
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Age:</Text>
              <Text style={styles.detailValue}>{player.age}</Text>
            </View>
          )}
          {player.height && (
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Height:</Text>
              <Text style={styles.detailValue}>{player.height}</Text>
            </View>
          )}
          {player.weight && (
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Weight:</Text>
              <Text style={styles.detailValue}>{player.weight}</Text>
            </View>
          )}
          {player.nationality && (
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Nationality:</Text>
              <Text style={styles.detailValue}>{player.nationality}</Text>
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
    alignItems: 'center',
    marginBottom: 12,
  },
  numberContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  number: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.background,
  },
  playerInfo: {
    flex: 1,
  },
  name: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  positionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  positionText: {
    color: colors.background,
    fontSize: 12,
    fontWeight: '600',
  },
  details: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
    marginRight: 4,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
});
