
import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { Player } from '../types';
import { colors, commonStyles } from '../styles/commonStyles';

interface PlayerCardProps {
  player: Player;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    marginHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: colors.shadow,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  photo: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 16,
    backgroundColor: colors.background,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  position: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  details: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  detail: {
    fontSize: 12,
    color: colors.textSecondary,
    marginRight: 12,
    marginBottom: 2,
  },
  number: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.primary,
    minWidth: 40,
    textAlign: 'center',
  },
  numberContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 16,
  },
});

const PlayerCard: React.FC<PlayerCardProps> = ({ player }) => {
  const getPositionColor = (position: string) => {
    switch (position.toLowerCase()) {
      case 'нападающий':
        return colors.error;
      case 'защитник':
        return colors.primary;
      case 'вратарь':
        return colors.warning;
      default:
        return colors.textSecondary;
    }
  };

  return (
    <View style={styles.card}>
      {player.photo ? (
        <Image source={{ uri: player.photo }} style={styles.photo} />
      ) : (
        <View style={styles.photo} />
      )}
      
      <View style={styles.info}>
        <Text style={styles.name}>{player.name}</Text>
        <Text style={[styles.position, { color: getPositionColor(player.position) }]}>
          {player.position}
        </Text>
        
        <View style={styles.details}>
          {player.age && (
            <Text style={styles.detail}>Возраст: {player.age}</Text>
          )}
          {player.height && (
            <Text style={styles.detail}>Рост: {player.height}</Text>
          )}
          {player.weight && (
            <Text style={styles.detail}>Вес: {player.weight}</Text>
          )}
          {player.nationality && (
            <Text style={styles.detail}>{player.nationality}</Text>
          )}
        </View>
      </View>

      <View style={styles.numberContainer}>
        <Text style={styles.number}>#{player.number}</Text>
      </View>
    </View>
  );
};

export default PlayerCard;
