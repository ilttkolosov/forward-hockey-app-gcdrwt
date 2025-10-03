// app/test-tabs.tsx

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { useRouter } from 'expo-router';
import Icon from '../components/Icon';

import { commonStyles, colors } from '../styles/commonStyles';

const Tab = createMaterialTopTabNavigator();

const router = useRouter(); // <-- Убедитесь, что это есть

// --- ДОБАВЛЕНО: Функция возврата ---
const handleBackPress = () => {
router.back();
};
// --- КОНЕЦ ДОБАВЛЕНИЯ ---


// --- ТЕСТОВЫЕ ДАННЫЕ ---
const testData1 = [
  { id: '1', name: 'Игрок 1 из Tab 1' },
  { id: '2', name: 'Игрок 2 из Tab 1' },
  { id: '3', name: 'Игрок 3 из Tab 1' },
];

const testData2 = [
  { id: '4', name: 'Игрок 4 из Tab 2' },
  { id: '5', name: 'Игрок 5 из Tab 2' },
  { id: '6', name: 'Игрок 6 из Tab 2' },
];
// --- КОНЕЦ ТЕСТОВЫХ ДАННЫХ ---

// --- КОМПОНЕНТ ДЛЯ ОТОБРАЖЕНИЯ СПИСКА ---
const TestList = ({ data }: { data: { id: string; name: string }[] }) => (
  <ScrollView style={styles.listContainer}>
    {data.map((item) => (
      <View key={item.id} style={styles.listItem}>
        <Text style={styles.listItemText}>{item.name}</Text>
      </View>
    ))}
  </ScrollView>
);
// --- КОНЕЦ КОМПОНЕНТА ---

// --- ЭКРАНЫ ДЛЯ TABS ---
function FirstTab() {
  return <TestList data={testData1} />;
}

function SecondTab() {
  return <TestList data={testData2} />;
}
// --- КОНЕЦ ЭКРАНОВ ---

export default function TestTabsScreen() {
  return (
    <SafeAreaView style={commonStyles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
          <Icon name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={commonStyles.title}>Тест вкладок</Text>
          <Text style={commonStyles.textSecondary}>проверка...</Text>
        </View>
      </View>

      {/* Tab Navigator */}
      {/* --- ИСПРАВЛЕНО: Убран NavigationContainer, так как он уже есть на корневом уровне --- */}
      <Tab.Navigator
        screenOptions={{
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textSecondary,
          tabBarLabelStyle: styles.tabLabel,
          tabBarIndicatorStyle: styles.tabIndicator,
          tabBarStyle: styles.tabBar,
        }}
      >
        <Tab.Screen name="First" component={FirstTab} options={{ title: 'Вкладка 1' }} />
        <Tab.Screen name="Second" component={SecondTab} options={{ title: 'Вкладка 2' }} />
      </Tab.Navigator>
      {/* --- КОНЕЦ ИСПРАВЛЕНИЯ --- */}

      {/* Bottom spacing */}
      <View style={{ height: 32 }} />
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
  },
  tabBar: {
    backgroundColor: colors.background,
    elevation: 0,
    shadowOpacity: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tabIndicator: {
    backgroundColor: colors.primary,
    height: 3,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'none',
  },
  listContainer: {
    flex: 1,
    padding: 16,
  },
  listItem: {
    padding: 16,
    marginBottom: 8,
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  listItemText: {
    fontSize: 16,
    color: colors.text,
  },
});