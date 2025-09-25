
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { commonStyles, colors } from '../styles/commonStyles';
import CoachCard from '../components/CoachCard';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import { Coach } from '../types';
import { mockCoaches } from '../data/mockData';
import { Link } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import Icon from '../components/Icon';

export default function CoachesScreen() {
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      setError(null);
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 800));
      
      setCoaches(mockCoaches);
    } catch (err) {
      console.log('Error loading coaches:', err);
      setError('Failed to load coaches. Please try again.');
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
            <Text style={commonStyles.title}>Coaching Staff</Text>
            <Text style={commonStyles.textSecondary}>{coaches.length} coaches</Text>
          </View>
        </View>

        {/* Coaches List */}
        {coaches.length > 0 ? (
          coaches.map((coach) => (
            <CoachCard key={coach.id} coach={coach} />
          ))
        ) : (
          <View style={commonStyles.errorContainer}>
            <Text style={commonStyles.text}>No coaches information available.</Text>
          </View>
        )}

        {/* Bottom spacing */}
        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
