
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, TextInput, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { commonStyles, colors } from '../styles/commonStyles';
import TournamentCard from '../components/TournamentCard';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import { Tournament } from '../types';
import { mockTournaments } from '../data/mockData';
import { Link } from 'expo-router';
import Icon from '../components/Icon';

export default function TournamentsScreen() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchModal, setShowSearchModal] = useState(false);

  const loadData = async () => {
    try {
      setError(null);
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 800));
      
      setTournaments(mockTournaments);
    } catch (err) {
      console.log('Error loading tournaments:', err);
      setError('Failed to load tournaments. Please try again.');
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

  const handleSearchPress = () => {
    console.log('Search icon pressed - opening search modal');
    setShowSearchModal(true);
  };

  const handleCloseSearch = () => {
    setShowSearchModal(false);
    setSearchQuery('');
  };

  const handleClearSearch = () => {
    setSearchQuery('');
  };

  // Filter tournaments based on search query
  const filteredTournaments = searchQuery.trim() 
    ? tournaments.filter(tournament => 
        tournament.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tournament.description?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : tournaments;

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

  const activeTournaments = filteredTournaments.filter(t => t.status === 'active');
  const upcomingTournaments = filteredTournaments.filter(t => t.status === 'upcoming');
  const finishedTournaments = filteredTournaments.filter(t => t.status === 'finished');

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
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24, paddingHorizontal: 16 }}>
          <Link href="/" asChild>
            <TouchableOpacity style={{ marginRight: 16, padding: 4 }}>
              <Icon name="chevron-back" size={24} color={colors.text} />
            </TouchableOpacity>
          </Link>
          <View style={{ flex: 1 }}>
            <Text style={commonStyles.title}>Турниры</Text>
            <Text style={commonStyles.textSecondary}>{tournaments.length} турниров</Text>
          </View>
          <TouchableOpacity style={{ padding: 8, marginLeft: 8 }} onPress={handleSearchPress}>
            <Icon name="search" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* Active Tournaments */}
        {activeTournaments.length > 0 && (
          <View style={[commonStyles.section, { paddingHorizontal: 16 }]}>
            <Text style={commonStyles.subtitle}>Текущие турниры</Text>
            {activeTournaments.map((tournament) => (
              <TournamentCard key={tournament.id} tournament={tournament} />
            ))}
          </View>
        )}

        {/* Upcoming Tournaments */}
        {upcomingTournaments.length > 0 && (
          <View style={[commonStyles.section, { paddingHorizontal: 16 }]}>
            <Text style={commonStyles.subtitle}>Предстоящие турниры</Text>
            {upcomingTournaments.map((tournament) => (
              <TournamentCard key={tournament.id} tournament={tournament} />
            ))}
          </View>
        )}

        {/* Finished Tournaments */}
        {finishedTournaments.length > 0 && (
          <View style={[commonStyles.section, { paddingHorizontal: 16 }]}>
            <Text style={commonStyles.subtitle}>Завершенные турниры</Text>
            {finishedTournaments.map((tournament) => (
              <TournamentCard key={tournament.id} tournament={tournament} />
            ))}
          </View>
        )}

        {filteredTournaments.length === 0 && (
          <View style={commonStyles.errorContainer}>
            <Text style={commonStyles.text}>
              {searchQuery ? 'Турниры не найдены' : 'Нет информации о турнирах.'}
            </Text>
            {searchQuery && (
              <Text style={commonStyles.textSecondary}>
                Попробуйте изменить поисковый запрос
              </Text>
            )}
          </View>
        )}

        {/* Bottom spacing */}
        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Search Modal */}
      <Modal
        visible={showSearchModal}
        animationType="slide"
        transparent={true}
        onRequestClose={handleCloseSearch}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          justifyContent: 'flex-start',
        }}>
          <View style={{
            backgroundColor: colors.background,
            borderBottomLeftRadius: 16,
            borderBottomRightRadius: 16,
            paddingTop: 50, // Account for status bar
            paddingBottom: 20,
            paddingHorizontal: 16,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.25,
            shadowRadius: 8,
            elevation: 8,
            maxHeight: '80%',
          }}>
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginBottom: 16,
            }}>
              <Text style={{
                fontSize: 18,
                fontWeight: '600',
                color: colors.text,
                flex: 1,
              }}>Поиск турниров</Text>
              <TouchableOpacity style={{ padding: 8 }} onPress={handleCloseSearch}>
                <Icon name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: colors.surface,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              paddingHorizontal: 12,
              height: 48,
              marginBottom: 16,
            }}>
              <Icon name="search" size={20} color={colors.textSecondary} style={{ marginRight: 8 }} />
              <TextInput
                style={{
                  flex: 1,
                  fontSize: 16,
                  color: colors.text,
                  paddingVertical: 0,
                }}
                placeholder="Поиск турниров..."
                placeholderTextColor={colors.textSecondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity style={{ padding: 4, marginLeft: 8 }} onPress={handleClearSearch}>
                  <Icon name="close" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>

            {/* Search Results */}
            <ScrollView
              style={{ maxHeight: 400 }}
              contentContainerStyle={{ paddingBottom: 20 }}
              showsVerticalScrollIndicator={false}
            >
              {searchQuery && filteredTournaments.map((tournament) => (
                <TournamentCard key={tournament.id} tournament={tournament} />
              ))}
              {searchQuery && filteredTournaments.length === 0 && (
                <View style={commonStyles.errorContainer}>
                  <Text style={commonStyles.text}>Турниры не найдены</Text>
                  <Text style={commonStyles.textSecondary}>
                    Попробуйте изменить поисковый запрос
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
