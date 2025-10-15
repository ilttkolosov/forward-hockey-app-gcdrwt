// app/mobilegames/index.tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, commonStyles } from '../../styles/commonStyles';
import Icon from '../../components/Icon';

const games = [
  { id: '1', name: 'Memory', description: 'Найди пары игроков' },
  // Можно добавить другие игры позже
];

export default function MobileGamesScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={commonStyles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>🎮 Мини-игры</Text>
        {games.map((game) => (
          <TouchableOpacity
            key={game.id}
            style={styles.gameCard}
            onPress={() => router.push(`/mobilegames/${game.id}`)}
            activeOpacity={0.7}
          >
            <View style={styles.iconContainer}>
              <Icon name="game-controller" size={28} color={colors.primary} />
            </View>
            <View style={styles.textContainer}>
              <Text style={styles.gameName}>{game.name}</Text>
              <Text style={styles.gameDesc}>{game.description}</Text>
            </View>
          </TouchableOpacity>
        ))}
        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 24,
    textAlign: 'center',
  },
  gameCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  textContainer: {
    flex: 1,
  },
  gameName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  gameDesc: {
    fontSize: 14,
    color: colors.textSecondary,
  },
});