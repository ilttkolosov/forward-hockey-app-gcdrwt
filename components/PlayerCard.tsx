
import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Player } from '../types';
import { colors, commonStyles } from '../styles/commonStyles';
import Icon from './Icon';

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
  photoPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 16,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoContainer: {
    position: 'relative',
  },
  captainBadge: {
    position: 'absolute',
    top: -4,
    right: 12,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
  },
  captainText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: colors.surface,
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
  const router = useRouter();

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

  const getCaptainBadgeText = (captainStatus: string) => {
    if (captainStatus?.toLowerCase().includes('k')) return 'К';
    if (captainStatus?.toLowerCase().includes('a')) return 'А';
    return null;
  };

  const handlePress = () => {
    console.log('Navigating to player details:', player.id);
    router.push(`/player/${player.id}`);
  };

  const captainBadgeText = getCaptainBadgeText(player.captainStatus || '');

  return (
    <TouchableOpacity style={styles.card} onPress={handlePress}>
      <View style={styles.photoContainer}>
        {player.photo ? (
          <Image source={{ uri: player.photo }} style={styles.photo} />
        ) : (
          <View style={styles.photoPlaceholder}>
            <Icon name="person" size={24} color={colors.textSecondary} />
          </View>
        )}
        
        {captainBadgeText && (
          <View style={styles.captainBadge}>
            <Text style={styles.captainText}>{captainBadgeText}</Text>
          </View>
        )}
      </View>
      
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
          {player.grip && (
            <Text style={styles.detail}>Хват: {player.grip}</Text>
          )}
        </View>
      </View>

      <View style={styles.numberContainer}>
        <Text style={styles.number}>#{player.number}</Text>
      </View>
    </TouchableOpacity>
  );
};

export default PlayerCard;
