
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { commonStyles, colors } from '../styles/commonStyles';
import PlayerCard from '../components/PlayerCard';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import { Player } from '../types';
import { mockPlayers } from '../data/mockData';
import { Link } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import Icon from '../components/Icon';

export default function PlayersScreen() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      setError(null);
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // Sort players by position and number
      const sortedPlayers = [...mockPlayers].sort((a, b) => {
        const positionOrder = { 'Goaltender': 0, 'Defenseman': 1, 'Forward': 2 };
        const aOrder = positionOrder[a.position as keyof typeof positionOrder] ?? 3;
        const bOrder = positionOrder[b.position as keyof typeof positionOrder] ?? 3;
        
        if (aOrder !== bOrder) {
          return aOrder - bOrder;
        }
        return a.number - b.number;
      });
      
      setPlayers(sortedPlayers);
    } catch (err) {
      console.log('Error loading players:', err);
      setError('Failed to load players. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  if (loading) {
    return (
      <SafeAreaView style={commonStyles.container}>
        <LoadingSpinner />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={commonStyles.container}>
        <ErrorMessage message={error} onRetry={loadData} />
      </SafeAreaView>
    );
  }

  const groupedPlayers = players.reduce((acc, player) => {
    if (!acc[player.position]) {
      acc[player.position] = [];
    }
    acc[player.position].push(player);
    return acc;
  }, {} as Record<string, Player[]>);

  return (
    <SafeAreaView style={commonStyles.container}>
      <ScrollView
        style={commonStyles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}>
          <Link href="/" asChild>
            <TouchableOpacity style={{ marginRight: 16 }}>
              <Icon name="chevron-back" size={24} color={colors.text} />
            </TouchableOpacity>
          </Link>
          <View>
            <Text style={commonStyles.title}>Team Roster</Text>
            <Text style={commonStyles.textSecondary}>{players.length} players</Text>
          </View>
        </View>

        {/* Players by Position */}
        {Object.entries(groupedPlayers).map(([position, positionPlayers]) => (
          <View key={position} style={commonStyles.section}>
            <Text style={commonStyles.subtitle}>{position}s</Text>
            {positionPlayers.map((player) => (
              <PlayerCard key={player.id} player={player} />
            ))}
          </View>
        ))}

        {/* Bottom spacing */}
        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
