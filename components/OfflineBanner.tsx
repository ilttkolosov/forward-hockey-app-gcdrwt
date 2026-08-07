import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNetworkStatus } from '../contexts/NetworkStatusContext';
import { colors } from '../styles/commonStyles';

export default function OfflineBanner() {
  const { isOffline, usingCachedData } = useNetworkStatus();
  if (!isOffline && !usingCachedData) return null;

  return (
    <View accessibilityRole="alert" style={styles.container}>
      <Text style={styles.text}>
        {isOffline
          ? 'Нет подключения к интернету. Показаны последние сохранённые данные.'
          : 'Не удалось обновить данные. Показана последняя сохранённая версия.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.warning,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  text: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});
