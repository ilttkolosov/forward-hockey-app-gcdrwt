
import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, commonStyles } from '../styles/commonStyles';
import { Player } from '../types';
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
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  photoContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    overflow: 'hidden',
  },
  photo: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  info: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  number: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.primary,
    marginLeft: 8,
  },
  badges: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  captainBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 6,
  },
  captainText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.surface,
  },
  positionBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  positionText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.surface,
  },
  details: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  detailText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginRight: 12,
  },
});

export default function PlayerCard({ player }: PlayerCardProps) {
  const router = useRouter();

  const getPositionColor = (position: string) => {
    switch (position.toLowerCase()) {
      case 'вратарь':
      case 'goalkeeper':
      case 'g':
        return colors.error;
      case 'защитник':
      case 'defenseman':
      case 'd':
        return colors.primary;
      case 'нападающий':
      case 'forward':
      case 'f':
        return colors.success;
      default:
        return colors.textSecondary;
    }
  };

  const getCaptainBadgeInfo = () => {
    if (!player.captainStatus) return null;
    
    switch (player.captainStatus.toLowerCase()) {
      case 'captain':
      case 'капитан':
        return { text: 'К', color: colors.warning };
      case 'assistant':
      case 'ассистент':
        return { text: 'А', color: colors.secondary };
      default:
        return null;
    }
  };

  const handlePress = () => {
    router.push(`/player/${player.id}`);
  };

  const captainInfo = getCaptainBadgeInfo();

  return (
    <TouchableOpacity style={styles.card} onPress={handlePress}>
      <View style={styles.content}>
        <View style={styles.photoContainer}>
          {player.photo ? (
            <Image 
              source={{ uri: player.photo }} 
              style={styles.photo}
              defaultSource={require('../assets/images/natively-dark.png')}
            />
          ) : (
            <Icon name="person" size={30} color={colors.textSecondary} />
          )}
        </View>
        
        <View style={styles.info}>
          <View style={styles.header}>
            <Text style={styles.name} numberOfLines={1}>
              {player.name}
            </Text>
            <Text style={styles.number}>#{player.number}</Text>
          </View>
          
          <View style={styles.badges}>
            {captainInfo && (
              <View style={[styles.captainBadge, { backgroundColor: captainInfo.color }]}>
                <Text style={styles.captainText}>{captainInfo.text}</Text>
              </View>
            )}
            <View style={[styles.positionBadge, { backgroundColor: getPositionColor(player.position) }]}>
              <Text style={styles.positionText}>{player.position}</Text>
            </View>
          </View>
          
          <View style={styles.details}>
            {player.age && (
              <Text style={styles.detailText}>{player.age} лет</Text>
            )}
            {player.height && (
              <Text style={styles.detailText}>{player.height} см</Text>
            )}
            {player.weight && (
              <Text style={styles.detailText}>{player.weight} кг</Text>
            )}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}
