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
import { useTrackScreenView } from '../../hooks/useTrackScreenView';

const { width } = Dimensions.get('window');

// Конфигурация уровней: [столбцы, строки]
const LEVEL_CONFIG = [
  [3, 4], // Уровень 1 → 3 столбца, 4 строки = 12 карточек
  [3, 6], // Уровень 2 → 3×6 = 18
  [4, 7], // Уровень 3 → 4×7 = 28
  [4, 8], // Уровень 4 → 4×8 = 32
  [5, 8], // Уровень 5 → 5×8 = 40
  [6, 10], // Уровень 6 → 6×10 = 60
];

const RECORDS_KEY = 'memory_game_records';

export default function MemoryGameScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [players, setPlayers] = useState<Player[]>([]);
  const [cards, setCards] = useState<{
    id: string;
    playerId: string;
    isFlipped: boolean;
    isMatched: boolean;
    showInfo?: boolean;
    infoText?: string;
  }[]>([]);
  const [flippedCards, setFlippedCards] = useState<string[]>([]);
  const [moves, setMoves] = useState(0);
  const [gameCompleted, setGameCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentLevel, setCurrentLevel] = useState(0);
  const [timer, setTimer] = useState(0);
  const [pairsFound, setPairsFound] = useState(0);
  const [records, setRecords] = useState<Record<string, { moves: number; time: number }>>({});
  const [showRecordsModal, setShowRecordsModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const timerRef = useRef<number | ReturnType<typeof setInterval> | null>(null);
  const blinkAnimationsRef = useRef<Animated.Value[]>([]);

  useEffect(() => {
    blinkAnimationsRef.current = cards.map(() => new Animated.Value(1));
  }, [cards]);


  const loadRecords = useCallback(async () => {
    try {
      const data = await AsyncStorage.getItem(RECORDS_KEY);
      if (data) setRecords(JSON.parse(data));
    } catch (err) {
      console.error('Не удалось загрузить рекорды:', err);
    }
  }, []);

  const saveRecord = useCallback(async (level: number, moves: number, time: number) => {
    const levelKey = `level_${level + 1}`;
    const currentRecord = records[levelKey];
    const isNewRecord = !currentRecord || 
      (moves < currentRecord.moves) || 
      (moves === currentRecord.moves && time < currentRecord.time);
    
    if (isNewRecord) {
      const newRecords = { ...records, [levelKey]: { moves, time } };
      setRecords(newRecords);
      await AsyncStorage.setItem(RECORDS_KEY, JSON.stringify(newRecords));
    }
  }, [records]);

  const clearRecords = useCallback(async () => {
    Alert.alert(
      'Сброс рекордов',
      'Вы уверены, что хотите сбросить свои рекорды?',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Сбросить',
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.removeItem(RECORDS_KEY);
              setRecords({});
              setShowRecordsModal(false);
              Alert.alert('Рекорды сброшены', 'Все рекорды удалены.');
            } catch (err) {
              console.error('Ошибка сброса рекордов:', err);
            }
          },
        },
      ]
    );
  }, []);

  const formatNameForInfo = (fullName: string | undefined): string => {
    if (!fullName) return 'Игрок';
    const parts = fullName.trim().split(/\s+/);
    if (parts.length >= 2) {
      const lastName = parts[0];
      const firstName = parts[1];
      return `${firstName} ${lastName}`;
    }
    return parts[0] || 'Игрок';
  };

  const selectRandomPlayers = (allPlayers: Player[], count: number): Player[] => {
    const shuffled = [...allPlayers].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  };

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

      const selectedPlayers = selectRandomPlayers(playersWithPhoto, neededPlayers);
      const pairs = selectedPlayers.flatMap(p => [p.id, p.id]);
      const shuffled = [...pairs].sort(() => Math.random() - 0.5).slice(0, totalCards);
      const initialCards = shuffled.map((playerId, index) => ({
        id: `card-${index}`,
        playerId,
        isFlipped: false,
        isMatched: false,
        showInfo: false,
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
    saveRecord(currentLevel, moves, timer);

    Alert.alert(
      'Победа!',
      `Уровень ${currentLevel + 1} завершён!\nВремя: ${timer} сек\nХоды: ${moves}`,
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
  }, [currentLevel, timer, moves, saveRecord, initLevel]);

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
        // === ОСТАНОВКА ТАЙМЕРА ===
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }

        // === МИГАНИЕ ФОТО ===
        const firstBlink = blinkAnimationsRef.current.find((_, idx) => cards[idx].id === firstId) || new Animated.Value(1);
        const secondBlink = blinkAnimationsRef.current.find((_, idx) => cards[idx].id === secondId) || new Animated.Value(1);

        const blink = (anim: Animated.Value) => Animated.sequence([
          Animated.timing(anim, { toValue: 0, duration: 150, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 1, duration: 150, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration: 150, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 1, duration: 150, useNativeDriver: true }),
        ]);

        Animated.parallel([blink(firstBlink), blink(secondBlink)]).start(() => {
          // === ПОДГОТОВКА ТЕКСТА ===
          const player1 = players.find(p => p.id === firstCard.playerId);
          const player2 = players.find(p => p.id === secondCard.playerId);
          const name1 = formatNameForInfo(player1?.name);
          const name2 = formatNameForInfo(player2?.name);
          const number1 = player1?.number ?? 0;
          const number2 = player2?.number ?? 0;

          // === ПОКАЗЫВАЕМ ТЕКСТ 2 СЕКУНДЫ ===
          const infoCards = newCards.map(c => {
            if (c.id === firstId) {
              return { ...c, showInfo: true, infoText: `${name1}, #${number1}` };
            }
            if (c.id === secondId) {
              return { ...c, showInfo: true, infoText: `${name2}, #${number2}` };
            }
            return c;
          });
          setCards(infoCards);

          setTimeout(() => {
            // === ПОЛНОЕ УДАЛЕНИЕ КАРТОЧЕК БЕЗ ВОЗВРАТА К ФОТО ===
            const finalCards = infoCards.map(c =>
              c.id === firstId || c.id === secondId ? { ...c, isMatched: true, showInfo: false, isFlipped: false } : c
            );
            setCards(finalCards);
            setFlippedCards([]);
            setPairsFound(p => p + 1);
            setIsProcessing(false);

            const unmatched = finalCards.filter(c => !c.isMatched);
            if (unmatched.length === 0) {
              completeLevel();
            } else {
              // === ВОЗОБНОВЛЕНИЕ ТАЙМЕРА ===
              timerRef.current = setInterval(() => setTimer(prev => prev + 1), 1000);
            }
          }, 650);
        });
      } else {
        // === НЕТ ДРОЖАНИЯ — ЖДЁМ 1.5 СЕК ===
        setTimeout(() => {
          const resetCards = newCards.map(c =>
            c.id === firstId || c.id === secondId ? { ...c, isFlipped: false } : c
          );
          setCards(resetCards);
          setFlippedCards([]);
          setIsProcessing(false);
        }, 900);
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
      loadRecords();
      initLevel(0);
    } else {
      Alert.alert('Игра не найдена');
      router.back();
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [id, initLevel, loadRecords, router]);

  // Расчёт размера карточки
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

      {/* Игровое поле — ВСЕ КАРТОЧКИ, включая isMatched */}
      <ScrollView contentContainerStyle={styles.board} showsVerticalScrollIndicator={false}>
        {cards.map((card, index) => {
          const player = getPlayerById(card.playerId);
          const opacity = blinkAnimationsRef.current[index] || new Animated.Value(1);
          return (
            <Animated.View
              key={card.id}
              style={[
                styles.cardWrapper,
                { width: cardSize, height: cardSize },
                { opacity: card.isMatched ? 0 : 1 },
              ]}
            >
              <TouchableOpacity
                style={styles.card}
                onPress={() => handleCardPress(card.id)}
                disabled={card.isFlipped || card.isMatched || isProcessing}
                activeOpacity={0.7}
              >
                {card.showInfo ? (
                  <View style={styles.infoOverlay}>
                    <Text style={styles.infoText}>{card.infoText}</Text>
                  </View>
                ) : card.isFlipped ? (
                  player?.photoPath ? (
                    <Image source={{ uri: player.photoPath }} style={styles.cardImage} contentFit="cover" />
                  ) : (
                    <View style={styles.placeholder}>
                      <Text style={styles.placeholderText}>
                        {player?.name?.charAt(0) || '?'}
                      </Text>
                    </View>
                  )
                ) : (
                  <View style={styles.cardBack}>
                    <Icon name="hockey-sticks" type="material-community" size={32} color={colors.card} />
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
                const record = records[key];
                return (
                  <View key={key} style={styles.recordRow}>
                    <Text style={styles.recordLabel}>Уровень {idx + 1}</Text>
                    <View style={styles.recordValues}>
                      <Text style={styles.recordValue}>{record ? `${record.moves} ходов` : '—'}</Text>
                      <Text style={styles.recordValue}>{record ? `${record.time} сек` : ''}</Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
            <TouchableOpacity
              style={[styles.closeModalButton, { backgroundColor: colors.error }]}
              onPress={clearRecords}
            >
              <Text style={[styles.closeModalText, { color: colors.background }]}>Сбросить рекорды</Text>
            </TouchableOpacity>
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
  cardImage: { width: '100%', height: '100%' },
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
  infoOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    padding: 8,
  },
  infoText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
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
  recordValues: { alignItems: 'flex-end' },
  recordValue: { fontSize: 14, color: colors.primary, fontWeight: '600' },
  closeModalButton: {
    marginTop: 12,
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
