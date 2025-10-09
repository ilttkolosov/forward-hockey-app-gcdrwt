// components/SplashScreen.tsx
import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { colors } from '../styles/commonStyles';

export default function SplashScreen({ message = 'Загрузка...' }: { message?: string }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>ХК Динамо Форвард 2014</Text>
      <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 24,
  },
  loader: {
    marginBottom: 16,
  },
  message: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});