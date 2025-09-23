
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Coach } from '../types';
import { colors, commonStyles } from '../styles/commonStyles';

interface CoachCardProps {
  coach: Coach;
}

export default function CoachCard({ coach }: CoachCardProps) {
  const getRoleColor = (role: string) => {
    if (role.toLowerCase().includes('head')) {
      return colors.primary;
    } else if (role.toLowerCase().includes('assistant')) {
      return colors.secondary;
    } else {
      return colors.accent;
    }
  };

  return (
    <View style={commonStyles.card}>
      <View style={styles.header}>
        <View style={[styles.roleIndicator, { backgroundColor: getRoleColor(coach.role) }]} />
        <View style={styles.coachInfo}>
          <Text style={styles.name}>{coach.name}</Text>
          <Text style={styles.role}>{coach.role}</Text>
          {coach.experience && (
            <Text style={styles.experience}>{coach.experience} experience</Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  roleIndicator: {
    width: 4,
    height: 60,
    borderRadius: 2,
    marginRight: 16,
  },
  coachInfo: {
    flex: 1,
  },
  name: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  role: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.primary,
    marginBottom: 2,
  },
  experience: {
    fontSize: 14,
    color: colors.textSecondary,
  },
});
