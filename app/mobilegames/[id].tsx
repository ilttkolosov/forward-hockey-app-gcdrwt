// app/mobilegames/[id].tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Dimensions,
  Modal,
  ScrollView,
  Animated,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getPlayers } from '../../data/playerData';
import { Player } from '../../types';
import { colors, commonStyles } from '../../styles/commonStyles';
import Icon from '../../components/Icon';
import LoadingSpinner from '../../components/LoadingSpinner';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';

const { width } = Dimensions.get('window');

// Конфигурация уровней: [столбцы, строки]
const LEVEL_CONFIG = [
  [3, 4], // Уровень 1 → 4 столбца, 3 строки = 12 карточек
  [3, 7], // Уровень 2 → 7×3 = 21
  [4, 6], // Уровень 3 → 6×4 = 24
  [4, 8], // Уровень 4 → 8×4 = 32
  [5, 8], // Уровень 5 → 8×5 = 40
];

const RECORDS_KEY = 'memory_game_records';

export default function MemoryGameScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [players, setPlayers] = useState<Player[]>([]);
  const [cards, setCards] = useState<{ id: string; playerId: string; isFlipped: boolean; isMatched: boolean }[]>([]);
  const [flippedCards, setFlippedCards] = useState<string[]>([]);
  const [moves, setMoves] = useState(0);
  const [gameCompleted, setGameCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentLevel, setCurrentLevel] = useState(0);
  const [timer, setTimer] = useState(0);
  const [pairsFound, setPairsFound] = useState(0);
  const [records, setRecords] = useState<Record<string, number>>({});
  const [showRecordsModal, setShowRecordsModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const shakeAnimationsRef = useRef<Animated.Value[]>([]);

  // === Инициализация анимаций ПОСЛЕ загрузки cards ===
  useEffect(() => {
    // Создаём новый массив анимаций, соответствующий текущему количеству карточек
    shakeAnimationsRef.current = cards.map(() => new Animated.Value(0));
  }, [cards]);

  // Загрузка рекордов
  const loadRecords = useCallback(async () => {
    try {
      const data = await AsyncStorage.getItem(RECORDS_KEY);
      if (data) {
        setRecords(JSON.parse(data));
      }
    } catch (err) {
      console.error('Не удалось загрузить рекорды:', err);
    }
  }, []);

  // Сохранение рекорда
  const saveRecord = useCallback(async (level: number, time: number) => {
    const levelKey = `level_${level + 1}`;
    const newRecords = { ...records, [levelKey]: time };
    setRecords(newRecords);
    try {
      await AsyncStorage.setItem(RECORDS_KEY, JSON.stringify(newRecords));
    } catch (err) {
      console.error('Не удалось сохранить рекорд:', err);
    }
  }, [records]);

  // Инициализация уровня
  const initLevel = useCallback(async (levelIndex: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimer(0);
    setMoves(0);
    setPairsFound(0);
    setGameCompleted(false);
    setIsProcessing(false);
    setCurrentLevel(levelIndex);

    const [cols, rows] = LEVEL_CONFIG[levelIndex];
    const totalCards = cols * rows;
    const neededPlayers = Math.ceil(totalCards / 2);

    try {
      const allPlayers = await getPlayers();
      const playersWithPhoto = allPlayers.filter(p => p.photoPath && p.photoPath.trim() !== '');

      if (playersWithPhoto.length < neededPlayers) {
        Alert.alert('Ошибка', `Недостаточно игроков с фото для уровня ${levelIndex + 1}.`);
        router.back();
        return;
      }

      const selectedPlayers = playersWithPhoto.slice(0, neededPlayers);
      const pairs = selectedPlayers.flatMap(p => [p.id, p.id]);
      const shuffled = [...pairs].sort(() => Math.random() - 0.5).slice(0, totalCards);
      const initialCards = shuffled.map((playerId, index) => ({
        id: `card-${index}`,
        playerId,
        isFlipped: false,
        isMatched: false,
      }));

      setCards(initialCards);
      setPlayers(allPlayers);
      setFlippedCards([]);
      timerRef.current = setInterval(() => setTimer(prev => prev + 1), 1000);
    } catch (err) {
      console.error('Ошибка инициализации уровня:', err);
      Alert.alert('Ошибка', 'Не удалось загрузить уровень.');
      router.back();
    }
  }, [router]);

  const completeLevel = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setGameCompleted(true);

    const levelKey = `level_${currentLevel + 1}`;
    const isNewRecord = !records[levelKey] || timer < records[levelKey];
    if (isNewRecord) {
      const newRecords = { ...records, [levelKey]: timer };
      setRecords(newRecords);
      AsyncStorage.setItem(RECORDS_KEY, JSON.stringify(newRecords));
    }

    Alert.alert(
      'Победа!',
      `Уровень ${currentLevel + 1} завершён!\nВремя: ${timer} сек\nХоды: ${moves}\n${isNewRecord ? '🏆 Новый рекорд!' : ''}`,
      [
        { text: 'Следующий уровень', onPress: () => {
          if (currentLevel < LEVEL_CONFIG.length - 1) {
            initLevel(currentLevel + 1);
          } else {
            Alert.alert('Поздравляем!', 'Вы прошли все уровни!');
          }
        } },
        { text: 'Новая игра', onPress: () => initLevel(0) },
      ]
    );
  }, [currentLevel, timer, moves, records, initLevel]);

  const handleCardPress = (cardId: string) => {
    if (gameCompleted || isProcessing) return;

    const card = cards.find(c => c.id === cardId);
    if (!card || card.isFlipped || card.isMatched) return;

    const newCards = cards.map(c => c.id === cardId ? { ...c, isFlipped: true } : c);
    setCards(newCards);
    const newFlipped = [...flippedCards, cardId];

    if (newFlipped.length === 2) {
      setIsProcessing(true);
      setMoves(m => m + 1);
      const [firstId, secondId] = newFlipped;
      const firstCard = newCards.find(c => c.id === firstId)!;
      const secondCard = newCards.find(c => c.id === secondId)!;

      if (firstCard.playerId === secondCard.playerId) {
        // === АНИМАЦИЯ ПОДРАГИВАНИЯ ===
        const firstAnim = shakeAnimationsRef.current.find((_, idx) => cards[idx].id === firstId) || new Animated.Value(0);
        const secondAnim = shakeAnimationsRef.current.find((_, idx) => cards[idx].id === secondId) || new Animated.Value(0);

        const shake1 = Animated.sequence([
          Animated.timing(firstAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
          Animated.timing(firstAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
          Animated.timing(firstAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
          Animated.timing(firstAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
          Animated.timing(firstAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
        ]);
        const shake2 = Animated.sequence([
          Animated.timing(secondAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
          Animated.timing(secondAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
          Animated.timing(secondAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
          Animated.timing(secondAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
          Animated.timing(secondAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
        ]);

        Animated.parallel([shake1, shake2]).start(() => {
          const updatedCards = newCards.map(c =>
            c.id === firstId || c.id === secondId ? { ...c, isMatched: true } : c
          );
          setCards(updatedCards);
          setFlippedCards([]);
          setPairsFound(p => p + 1);
          setIsProcessing(false);

          const unmatched = updatedCards.filter(c => !c.isMatched);
          if (unmatched.length === 0) completeLevel();
        });
      } else {
        setTimeout(() => {
          const resetCards = newCards.map(c =>
            c.id === firstId || c.id === secondId ? { ...c, isFlipped: false } : c
          );
          setCards(resetCards);
          setFlippedCards([]);
          setIsProcessing(false);
        }, 1500);
      }
    } else {
      setFlippedCards(newFlipped);
    }
  };

  const getPlayerById = (playerId: string) => players.find(p => p.id === playerId);

  const handleBack = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    router.back();
  };

  useEffect(() => {
    if (id === '1') {
      AsyncStorage.getItem(RECORDS_KEY).then(data => {
        if (data) setRecords(JSON.parse(data));
      });
      initLevel(0);
    } else {
      Alert.alert('Игра не найдена');
      router.back();
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [id, initLevel, router]);

  // === РАСЧЁТ РАЗМЕРА ===
  const calculateCardSize = () => {
    const { height } = Dimensions.get('window');
    const headerHeight = 60;
    const footerHeight = 80;
    const safeAreaPadding = insets.top + insets.bottom;
    const padding = 32;
    const availableHeight = height - headerHeight - footerHeight - safeAreaPadding - padding;
    const [cols, rows] = LEVEL_CONFIG[currentLevel];
    const gapX = 8;
    const cardSizeByWidth = (width - 32 - (cols - 1) * gapX) / cols;
    const gapY = 8;
    const cardSizeByHeight = (availableHeight - (rows - 1) * gapY) / rows;
    return Math.min(cardSizeByWidth, cardSizeByHeight, 120);
  };

  const cardSize = calculateCardSize();
  const [cols, rows] = LEVEL_CONFIG[currentLevel];

  return (
    <SafeAreaView style={commonStyles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Icon name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Memory — Уровень {currentLevel + 1}</Text>
        <View style={styles.stats}>
          <Text style={styles.statText}>⏱️ {timer}</Text>
          <Text style={styles.statText}>🎯 {pairsFound}</Text>
        </View>
      </View>

      {/* Игровое поле */}
      <ScrollView contentContainerStyle={styles.board} showsVerticalScrollIndicator={false}>
        {cards.map((card, index) => {
          const player = getPlayerById(card.playerId);
          const translateX = shakeAnimationsRef.current[index] || new Animated.Value(0);
          return (
            <Animated.View
              key={card.id}
              style={[
                styles.cardWrapper,
                { width: cardSize, height: cardSize },
                { transform: [{ translateX }] },
              ]}
            >
              <TouchableOpacity
                style={[styles.card, { opacity: card.isMatched ? 0 : 1 }]}
                onPress={() => handleCardPress(card.id)}
                disabled={card.isFlipped || card.isMatched || isProcessing}
                activeOpacity={0.7}
              >
                {card.isFlipped ? (
                  player?.photoPath ? (
                    <Image
                      source={{ uri: player.photoPath }}
                      style={styles.cardImage}
                      contentFit="cover" // ← исправлено
                    />
                  ) : (
                    <View style={styles.placeholder}>
                      <Text style={styles.placeholderText}>
                        {player?.name?.charAt(0) || '?'}
                      </Text>
                    </View>
                  )
                ) : (
                  <View style={styles.cardBack}>
                    <Icon name="hockey-sticks" type='material-community' size={32} color={colors.card} />
                  </View>
                )}
              </TouchableOpacity>
            </Animated.View>
          );
        })}
      </ScrollView>

      {/* Кнопка рекордов */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.recordsButton}
          onPress={() => setShowRecordsModal(true)}
        >
          <Text style={styles.recordsButtonText}>🏆 Рекорды</Text>
        </TouchableOpacity>
      </View>

      {/* Модальное окно рекордов */}
      <Modal
        visible={showRecordsModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowRecordsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Рекорды по уровням</Text>
              <TouchableOpacity onPress={() => setShowRecordsModal(false)}>
                <Icon name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {LEVEL_CONFIG.map((_, idx) => {
                const key = `level_${idx + 1}`;
                return (
                  <View key={key} style={styles.recordRow}>
                    <Text style={styles.recordLabel}>Уровень {idx + 1}</Text>
                    <Text style={styles.recordValue}>
                      {records[key] ? `${records[key]} сек` : '—'}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
            <TouchableOpacity
              style={styles.closeModalButton}
              onPress={() => setShowRecordsModal(false)}
            >
              <Text style={styles.closeModalText}>Закрыть</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  backButton: { marginRight: 16, padding: 4 },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
    textAlign: 'center',
  },
  stats: { flexDirection: 'row', gap: 12 },
  statText: { fontSize: 16, color: colors.primary, fontWeight: '600' },
  board: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'flex-start',
    padding: 16,
    gap: 8,
  },
  cardWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  cardBack: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  recordsButton: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  recordsButtonText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.background,
    borderRadius: 16,
    width: '90%',
    maxHeight: '70%',
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  recordRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  recordLabel: { fontSize: 16, color: colors.text },
  recordValue: { fontSize: 16, color: colors.primary, fontWeight: '600' },
  closeModalButton: {
    marginTop: 16,
    backgroundColor: colors.surface,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  closeModalText: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '600',
  },
});