
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <Stack>
        <Stack.Screen 
          name="index" 
          options={{ 
            title: 'ХК Форвард',
            headerShown: false 
          }} 
        />
        <Stack.Screen 
          name="players" 
          options={{ 
            title: 'Игроки',
            headerBackTitle: 'Назад'
          }} 
        />
        <Stack.Screen 
          name="coaches" 
          options={{ 
            title: 'Тренеры',
            headerBackTitle: 'Назад'
          }} 
        />
        <Stack.Screen 
          name="tournaments" 
          options={{ 
            title: 'Турниры',
            headerBackTitle: 'Назад'
          }} 
        />
        <Stack.Screen 
          name="upcoming" 
          options={{ 
            title: 'Предстоящие игры',
            headerBackTitle: 'Назад'
          }} 
        />
        <Stack.Screen 
          name="archive" 
          options={{ 
            title: 'Архив игр',
            headerBackTitle: 'Назад'
          }} 
        />
        <Stack.Screen 
          name="player/[id]" 
          options={{ 
            title: 'Игрок',
            headerBackTitle: 'Назад'
          }} 
        />
        <Stack.Screen 
          name="game/[id]" 
          options={{ 
            title: 'Матч',
            headerBackTitle: 'Назад'
          }} 
        />
      </Stack>
    </GestureHandlerRootView>
  );
}
