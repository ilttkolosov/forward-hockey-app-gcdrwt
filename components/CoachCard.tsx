
import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { colors, commonStyles } from '../styles/commonStyles';
import { Coach } from '../types';
import Icon from './Icon';

interface CoachCardProps {
  coach: Coach;
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

export default function CoachCard({ coach }: CoachCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.content}>
        <View style={styles.photoContainer}>
          {coach.photo ? (
            <Image 
              source={{ uri: coach.photo }} 
              style={styles.photo}
              defaultSource={require('../assets/images/natively-dark.png')}
            />
          ) : (
            <Icon name="person" size={30} color={colors.textSecondary} />
          )}
        </View>
        
        <View style={styles.info}>
          <Text style={styles.name}>{coach.name}</Text>
          <Text style={styles.role}>{coach.role}</Text>
          {coach.experience && (
            <Text style={styles.experience}>Опыт: {coach.experience}</Text>
          )}
        </View>
      </View>
    </View>
  );
}
