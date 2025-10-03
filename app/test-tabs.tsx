// app/test-tabs.tsx

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Icon from '../components/Icon';
import SegmentedControl from '@react-native-segmented-control/segmented-control'; // <-- Импортируем SegmentedControl
import { commonStyles, colors } from '../styles/commonStyles';

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

export default function TestTabsScreen() {
  const [index, setIndex] = useState(0); // <-- Состояние для SegmentedControl

  return (
    <SafeAreaView style={commonStyles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
          <Icon name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={commonStyles.title}>Тест вкладок</Text>
          <Text style={commonStyles.textSecondary}>проверка...</Text>
        </View>
      </View>

      {/* Segmented Control */}
      <SegmentedControl
        values={['Вкладка 1', 'Вкладка 2']} // <-- Названия вкладок
        selectedIndex={index} // <-- Текущий индекс
        onChange={(event) => {
          setIndex(event.nativeEvent.selectedSegmentIndex); // <-- Обновляем индекс
        }}
        style={styles.segmentedControl} // <-- Стиль
      />

      {/* Content */}
      <View style={styles.content}>
        {/* Отображаем нужный список в зависимости от индекса */}
        {index === 0 ? <TestList data={testData1} /> : <TestList data={testData2} />}
      </View>

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
  backButton: {
    marginRight: 16,
    padding: 4,
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  segmentedControl: {
    marginHorizontal: 16,
    marginVertical: 16,
  },
  content: {
    flex: 1,
  },
  listContainer: {
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