
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
  photoContainer: {
    position: 'relative',
    marginRight: 16,
  },
  photo: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.background,
  },
  photoPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  captainBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
  },
  assistantBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: colors.warning,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
  },
  badgeText: {
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
    fontWeight: '500',
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
  numberContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 16,
  },
  number: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.primary,
    minWidth: 40,
    textAlign: 'center',
  },
});

const PlayerCard: React.FC<PlayerCardProps> = ({ player }) => {
  const router = useRouter();

  const getPositionColor = (position: string) => {
    const pos = position.toLowerCase();
    
    // Обрабатываем как старые, так и новые названия позиций
    if (pos.includes('нападающ') || pos === 'нападающие') {
      return colors.error;
    }
    if (pos.includes('защитник') || pos === 'защитники') {
      return colors.primary;
    }
    if (pos.includes('вратар') || pos === 'вратари') {
      return colors.warning;
    }
    
    return colors.textSecondary;
  };

  const getCaptainBadgeInfo = () => {
    const ka = player.captainStatus;
    if (!ka) return null;
    
    const status = ka.toLowerCase();
    if (status === 'k') {
      return { text: 'К', style: styles.captainBadge, title: 'Капитан' };
    }
    if (status === 'a') {
      return { text: 'А', style: styles.assistantBadge, title: 'Ассистент' };
    }
    return null;
  };

  const handlePress = () => {
    console.log('Переход к деталям игрока:', player.id);
    router.push(`/player/${player.id}`);
  };

  const captainBadgeInfo = getCaptainBadgeInfo();

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
        
        {captainBadgeInfo && (
          <View style={captainBadgeInfo.style}>
            <Text style={styles.badgeText}>{captainBadgeInfo.text}</Text>
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
          {player.handedness && (
            <Text style={styles.detail}>Хват: {player.handedness}</Text>
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
