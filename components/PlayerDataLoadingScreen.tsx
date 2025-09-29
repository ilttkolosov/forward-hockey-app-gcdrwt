
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, commonStyles } from '../styles/commonStyles';
import LoadingSpinner from './LoadingSpinner';
import Icon from './Icon';

interface PlayerDataLoadingScreenProps {
  error?: string | null;
  onRetry?: () => void;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  content: {
    alignItems: 'center',
    maxWidth: 300,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
  },
  loadingText: {
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
    marginTop: 24,
  },
  errorContainer: {
    alignItems: 'center',
  },
  errorIcon: {
    marginBottom: 16,
  },
  errorText: {
    fontSize: 16,
    color: colors.error,
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  retryButtonText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});

export default function PlayerDataLoadingScreen({ error, onRetry }: PlayerDataLoadingScreenProps) {
  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <View style={styles.errorContainer}>
            <Icon 
              name="alert-circle" 
              size={48} 
              color={colors.error} 
              style={styles.errorIcon}
            />
            <Text style={styles.errorText}>{error}</Text>
            {onRetry && (
              <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
                <Icon name="refresh" size={16} color={colors.background} />
                <Text style={styles.retryButtonText}>Повторить</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>ХК Динамо Форвард 2014</Text>
        <Text style={styles.subtitle}>Санкт-Петербург</Text>
        
        <LoadingSpinner />
        <Text style={styles.loadingText}>Загрузка данных игроков...</Text>
      </View>
    </SafeAreaView>
  );
}
