
import React, { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../styles/commonStyles';
import { getPlayers } from '../data/playerData';
import PlayerDataLoadingScreen from '../components/PlayerDataLoadingScreen';

export default function RootLayout() {
  const [isInitializing, setIsInitializing] = useState(true);
  const [initializationError, setInitializationError] = useState<string | null>(null);

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      console.log('Initializing app...');
      
      // Initialize player data on app startup
      // This will either load from local storage (if available) or fetch from API (first launch)
      await getPlayers();
      
      console.log('App initialization completed');
      setIsInitializing(false);
    } catch (error) {
      console.error('App initialization failed:', error);
      setInitializationError('Ошибка инициализации приложения');
      setIsInitializing(false);
    }
  };

  if (isInitializing) {
    return <PlayerDataLoadingScreen />;
  }

  if (initializationError) {
    return <PlayerDataLoadingScreen error={initializationError} onRetry={initializeApp} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="dark" backgroundColor={colors.background} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="players" />
        <Stack.Screen name="player/[id]" />
        <Stack.Screen name="upcoming" />
        <Stack.Screen name="archive" />
        <Stack.Screen name="game/[id]" />
        <Stack.Screen name="season/[id]" />
        <Stack.Screen name="tournaments" />
        <Stack.Screen name="coaches" />
      </Stack>
    </GestureHandlerRootView>
  );
}
