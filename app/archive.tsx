
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { getAllSeasons } from '../utils/seasons';
import { commonStyles, colors } from '../styles/commonStyles';
import Icon from '../components/Icon';

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    marginRight: 16,
    padding: 8,
  },
  headerTitle: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  seasonsContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  seasonTile: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
    boxShadow: `0px 2px 8px ${colors.shadow}`,
    elevation: 2,
  },
  seasonTileContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  seasonIcon: {
    marginRight: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  seasonIconText: {
    fontSize: 24,
  },
  seasonInfo: {
    flex: 1,
  },
  seasonName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  seasonPeriod: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  chevronIcon: {
    marginLeft: 8,
  },
});

const seasonIcons = ['🏆', '📅', '⏳', '🗓️'];

const SeasonSelectorScreen = () => {
  const router = useRouter();
  const seasons = getAllSeasons(); // ← синхронно, без задержек

  const handlePress = (id: number) => {
    console.log('SeasonSelector: Navigating to season:', id);
    router.push(`/season/${id}`);
  };

  const handleBackPress = () => {
    router.back();
  };

  const formatSeasonPeriod = (season: typeof seasons[0]): string => {
    const startYear = season.start.getFullYear();
    const endYear = season.end.getFullYear();
    return `${startYear}-${endYear}`;
  };

  return (
    <SafeAreaView style={commonStyles.container}>
      {/* Header with Back Button */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBackPress}>
          <Icon name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitle}>
          <Text style={styles.title}>Архив матчей</Text>
          <Text style={styles.subtitle}>Выберите сезон для просмотра игр</Text>
        </View>
      </View>

      {/* Seasons List */}
      <ScrollView 
        style={styles.seasonsContainer}
        showsVerticalScrollIndicator={false}
      >
        {seasons.map((season, index) => (
          <TouchableOpacity
            key={season.id}
            style={styles.seasonTile}
            onPress={() => handlePress(season.id)}
            activeOpacity={0.7}
          >
            <View style={styles.seasonTileContent}>
              <View style={styles.seasonIcon}>
                <Text style={styles.seasonIconText}>
                  {seasonIcons[index % seasonIcons.length]}
                </Text>
              </View>
              <View style={styles.seasonInfo}>
                <Text style={styles.seasonName}>{season.name}</Text>
                <Text style={styles.seasonPeriod}>
                  {formatSeasonPeriod(season)}
                </Text>
              </View>
              <Icon 
                name="chevron-forward" 
                size={20} 
                color={colors.textSecondary} 
                style={styles.chevronIcon}
              />
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
};

export default SeasonSelectorScreen;
