
import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { Coach } from '../types';
import { colors, commonStyles } from '../styles/commonStyles';

interface CoachCardProps {
  coach: Coach;
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
  role: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '500',
    marginBottom: 4,
  },
  experience: {
    fontSize: 12,
    color: colors.textSecondary,
  },
});

const CoachCard: React.FC<CoachCardProps> = ({ coach }) => {
  return (
    <View style={styles.card}>
      {coach.photo ? (
        <Image source={{ uri: coach.photo }} style={styles.photo} />
      ) : (
        <View style={styles.photo} />
      )}
      
      <View style={styles.info}>
        <Text style={styles.name}>{coach.name}</Text>
        <Text style={styles.role}>{coach.role}</Text>
        {coach.experience && (
          <Text style={styles.experience}>Опыт: {coach.experience}</Text>
        )}
      </View>
    </View>
  );
};

export default CoachCard;
