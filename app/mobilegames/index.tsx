// app/mobilegames/index.tsx
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Href, useRouter } from 'expo-router';
import { colors, commonStyles } from '../../styles/commonStyles';
import Icon from '../../components/Icon';

interface MobileGameCard {
  id: string;
  name: string;
  description: string;
  href: Href;
  icon: 'grid-outline' | 'snow-outline' | 'close-circle-outline';
  accent: string;
  isNew?: boolean;
}

const games: MobileGameCard[] = [
  {
    id: 'memory',
    name: 'Memory',
    description: 'Найди пары игроков',
    href: '/mobilegames/1',
    icon: 'grid-outline',
    accent: colors.primary,
  },
  {
    id: 'ice-resurfacing',
    name: 'Заливка льда',
    description: 'Управляй Zamboni и подготовь площадку',
    href: '/mobilegames/ice-resurfacing',
    icon: 'snow-outline',
    accent: colors.accent,
  },
  {
    id: 'five-in-row',
    name: 'Х - О, 5 в ряд',
    description: 'Бесконечное поле, компьютер или два игрока',
    href: '/mobilegames/five-in-row',
    icon: 'close-circle-outline',
    accent: '#C4543D',
    isNew: true,
  },
  //{ id: 'hockey', name: 'Хоккей', description: 'Сыграй в аэрохоккей' },
];

export default function MobileGamesScreen() {
  const router = useRouter();

  const handleBackPress = () => {
    router.back();
  };

  return (
    <SafeAreaView style={commonStyles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
          <Icon name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={commonStyles.title}>🎮 Мини-игры</Text>
      </View>

      {/* Content */}
      <ScrollView contentContainerStyle={styles.content}>
        {games.map((game) => (
          <TouchableOpacity
            key={game.id}
            style={styles.gameCard}
            onPress={() => router.push(game.href)}
            activeOpacity={0.7}
          >
            <View style={[styles.iconContainer, { backgroundColor: `${game.accent}14` }]}>
              <Icon name={game.icon} size={29} color={game.accent} />
            </View>
            <View style={styles.textContainer}>
              <View style={styles.gameTitleRow}>
                <Text style={styles.gameName}>{game.name}</Text>
                {game.isNew && <Text style={styles.newBadge}>НОВАЯ</Text>}
              </View>
              <Text style={styles.gameDesc}>{game.description}</Text>
            </View>
            <Icon name="chevron-forward" size={21} color={colors.textSecondary} />
          </TouchableOpacity>
        ))}
        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: 16,
  },
  backButton: {
    marginRight: 16,
    padding: 4,
  },
  content: {
    paddingHorizontal: 16,
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
  gameTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  newBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    overflow: 'hidden',
    borderRadius: 8,
    color: '#A4411C',
    backgroundColor: '#FFF0E8',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
});
