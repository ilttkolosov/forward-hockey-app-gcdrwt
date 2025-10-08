// components/SplashScreen.tsx

import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, commonStyles } from '../styles/commonStyles';

export default function SplashScreen() {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.text}>Не торопитесь.</Text>
      <Text style={styles.text}>Мы загружаем актуальные данные</Text>
      <Text style={styles.text}>с сайта www.hc-forward.com</Text>
      <Text style={styles.text}>www.hc-forward.com</Text>
      <Text style={styles.text}>необходимо немного подождать ...</Text>
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
  text: {
    marginTop: 16,
    fontSize: 16,
    color: colors.textSecondary,
  },
});