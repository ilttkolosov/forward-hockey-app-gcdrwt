// app/tournaments/index.tsx - МИНИМАЛИСТИЧНАЯ ВЕРСИЯ
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, commonStyles } from '../../styles/commonStyles';

export default function TournamentsScreen() {
  const router = useRouter();

  const handleTournament1Press = () => {
    console.log("Navigating to tournament 1");
    router.push('/tournaments/76');
  };

  const handleTournament2Press = () => {
    console.log("Navigating to tournament 2");
    router.push('/tournaments/74');
  };

  return (
    <SafeAreaView style={commonStyles.container}>
      <View style={styles.content}>
        <Text style={commonStyles.title}>Выберите турнир</Text>
        <TouchableOpacity style={styles.button} onPress={handleTournament1Press}>
          <Text style={styles.buttonText}>Турнир 1</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={handleTournament2Press}>
          <Text style={styles.buttonText}>Турнир 2</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  button: {
    backgroundColor: colors.primary,
    padding: 16,
    marginVertical: 8,
    borderRadius: 8,
    width: '80%',
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
});