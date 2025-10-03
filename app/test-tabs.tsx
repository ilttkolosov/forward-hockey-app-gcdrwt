// app/test-tabs.tsx

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TabView, SceneMap, TabBar } from 'react-native-tab-view';
import { commonStyles, colors } from '../styles/commonStyles';

const { width } = Dimensions.get('window');

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

// --- СЦЕНЫ ДЛЯ TABVIEW ---
const FirstRoute = () => <TestList data={testData1} />;
const SecondRoute = () => <TestList data={testData2} />;
// --- КОНЕЦ СЦЕН ---

export default function TestTabsScreen() {
  const [index, setIndex] = useState(0);
  const [routes] = useState([
    { key: 'first', title: 'Вкладка 1' },
    { key: 'second', title: 'Вкладка 2' },
  ]);

  const renderScene = SceneMap({
    first: FirstRoute,
    second: SecondRoute,
  });

  const renderTabBar = (props: any) => (
    <TabBar
      {...props}
      style={styles.tabBar}
      indicatorStyle={styles.tabIndicator}
      labelStyle={styles.tabLabel}
      activeColor={colors.primary}
      inactiveColor={colors.textSecondary}
    />
  );

  return (
    <SafeAreaView style={commonStyles.container}>
      <View style={styles.header}>
        <Text style={commonStyles.title}>Тест вкладок</Text>
      </View>
      <TabView
        navigationState={{ index, routes }}
        renderScene={renderScene}
        renderTabBar={renderTabBar}
        onIndexChange={setIndex}
        initialLayout={{ width }}
        animationEnabled={true}
        swipeEnabled={true}
      />
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