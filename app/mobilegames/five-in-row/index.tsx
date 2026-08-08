import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../../../components/Icon';
import { useTrackScreenView } from '../../../hooks/useTrackScreenView';
import { colors } from '../../../styles/commonStyles';
import PaperBoard from '../../../features/mobilegames/five-in-row/PaperBoard';
import {
  FIVE_IN_ROW_CONFIG as CONFIG,
  FIVE_IN_ROW_DIFFICULTY_NAMES,
} from '../../../features/mobilegames/five-in-row/gameConfig';
import {
  chooseComputerMove,
  findWinningLine,
  FiveInRowMark,
  FiveInRowMode,
  FiveInRowMove,
  getCellKey,
  getOppositeMark,
  GridPoint,
  logFiveInRow,
  WinningLine,
} from '../../../features/mobilegames/five-in-row/gameEngine';

const SETTINGS_STORAGE_KEY = 'five_in_row_settings_v1';

interface GameSettings {
  mode: Exclude<FiveInRowMode, 'online'>;
  difficulty: number;
  playerXName: string;
  playerOName: string;
}

const DEFAULT_SETTINGS: GameSettings = {
  mode: 'computer',
  difficulty: CONFIG.DEFAULT_DIFFICULTY,
  playerXName: 'Игрок 1',
  playerOName: 'Игрок 2',
};

const normalizePlayerName = (value: string, fallback: string) =>
  value.trim().replace(/\s+/g, ' ').slice(0, 24) || fallback;

const normalizeSettings = (value: Partial<GameSettings>): GameSettings => ({
  mode: value.mode === 'local' ? 'local' : 'computer',
  difficulty: Math.max(
    CONFIG.MIN_DIFFICULTY,
    Math.min(CONFIG.MAX_DIFFICULTY, Math.round(value.difficulty ?? 3))
  ),
  playerXName: normalizePlayerName(value.playerXName ?? '', 'Игрок 1'),
  playerOName: normalizePlayerName(value.playerOName ?? '', 'Игрок 2'),
});

const getPlayerName = (settings: GameSettings, mark: FiveInRowMark) => {
  if (mark === 'x') return settings.playerXName;
  if (settings.mode === 'computer') {
    return `Компьютер · ${FIVE_IN_ROW_DIFFICULTY_NAMES[settings.difficulty]}`;
  }
  return settings.playerOName;
};

export default function FiveInRowGameScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  const settingsRef = useRef<GameSettings>(DEFAULT_SETTINGS);
  const [draftSettings, setDraftSettings] =
    useState<GameSettings>(DEFAULT_SETTINGS);
  const [settingsVisible, setSettingsVisible] = useState(true);

  const boardRef = useRef<Map<string, FiveInRowMark>>(new Map());
  const [moves, setMoves] = useState<FiveInRowMove[]>([]);
  const [turn, setTurn] = useState<FiveInRowMark>('x');
  const turnRef = useRef<FiveInRowMark>('x');
  const [winningLine, setWinningLine] = useState<WinningLine | null>(null);
  const winningLineRef = useRef<WinningLine | null>(null);
  const [resultVisible, setResultVisible] = useState(false);
  const [isComputerThinking, setIsComputerThinking] = useState(false);
  const computerThinkingRef = useRef(false);
  const computerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gameGenerationRef = useRef(0);

  const [boardSize, setBoardSize] = useState({ width: 0, height: 0 });
  const boardSizeRef = useRef(boardSize);
  const [viewCenter, setViewCenter] = useState<GridPoint>({ x: 0, y: 0 });
  const viewCenterRef = useRef<GridPoint>({ x: 0, y: 0 });
  const [cellSize, setCellSize] = useState<number>(CONFIG.DEFAULT_CELL_SIZE);
  const cellSizeRef = useRef<number>(CONFIG.DEFAULT_CELL_SIZE);
  const panStartRef = useRef<GridPoint>({ x: 0, y: 0 });
  const panCellSizeRef = useRef<number>(CONFIG.DEFAULT_CELL_SIZE);
  const zoomStartRef = useRef<number>(CONFIG.DEFAULT_CELL_SIZE);

  useTrackScreenView('Мобильная игра — Крестики-нолики, 5 в ряд');

  const updateViewCenter = useCallback((center: GridPoint) => {
    viewCenterRef.current = center;
    setViewCenter(center);
  }, []);

  const updateCellSize = useCallback((size: number) => {
    const next = Math.max(
      CONFIG.MIN_CELL_SIZE,
      Math.min(CONFIG.MAX_CELL_SIZE, size)
    );
    cellSizeRef.current = next;
    setCellSize(next);
  }, []);

  const resetView = useCallback(() => {
    updateViewCenter({ x: 0, y: 0 });
    updateCellSize(CONFIG.DEFAULT_CELL_SIZE);
    logFiveInRow('Камера возвращена к началу координат');
  }, [updateCellSize, updateViewCenter]);

  const clearComputerTimer = useCallback(() => {
    if (computerTimerRef.current) {
      clearTimeout(computerTimerRef.current);
      computerTimerRef.current = null;
    }
    computerThinkingRef.current = false;
    setIsComputerThinking(false);
  }, []);

  const resetGame = useCallback(
    (nextSettings?: GameSettings) => {
      clearComputerTimer();
      gameGenerationRef.current += 1;
      boardRef.current = new Map();
      turnRef.current = 'x';
      winningLineRef.current = null;
      setMoves([]);
      setTurn('x');
      setWinningLine(null);
      setResultVisible(false);
      resetView();
      const activeSettings = nextSettings ?? settingsRef.current;
      logFiveInRow('Новая партия создана', {
        mode: activeSettings.mode,
        difficulty:
          activeSettings.mode === 'computer'
            ? activeSettings.difficulty
            : undefined,
        playerX: activeSettings.playerXName,
        playerO:
          activeSettings.mode === 'computer'
            ? 'Компьютер'
            : activeSettings.playerOName,
      });
    },
    [clearComputerTimer, resetView]
  );

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(SETTINGS_STORAGE_KEY)
      .then(raw => {
        if (!active || !raw) return;
        const loaded = normalizeSettings(JSON.parse(raw) as Partial<GameSettings>);
        settingsRef.current = loaded;
        setSettings(loaded);
        setDraftSettings(loaded);
        logFiveInRow('Настройки загружены', {
          mode: loaded.mode,
          difficulty: loaded.difficulty,
        });
      })
      .catch(error =>
        console.warn('[Крестики-нолики] Не удалось загрузить настройки:', error)
      );
    return () => {
      active = false;
    };
  }, []);

  useEffect(
    () => () => {
      if (computerTimerRef.current) clearTimeout(computerTimerRef.current);
    },
    []
  );

  const ensureCellVisible = useCallback(
    (point: GridPoint) => {
      const size = boardSizeRef.current;
      if (size.width <= 0 || size.height <= 0) return;
      const scale = cellSizeRef.current;
      const center = viewCenterRef.current;
      const screenX = size.width / 2 + (point.x - center.x) * scale;
      const screenY = size.height / 2 + (point.y - center.y) * scale;
      const margin = scale * 1.25;
      let nextX = center.x;
      let nextY = center.y;

      if (screenX < margin) nextX -= (margin - screenX) / scale;
      else if (screenX > size.width - margin) {
        nextX += (screenX - (size.width - margin)) / scale;
      }
      if (screenY < margin) nextY -= (margin - screenY) / scale;
      else if (screenY > size.height - margin) {
        nextY += (screenY - (size.height - margin)) / scale;
      }
      if (nextX !== center.x || nextY !== center.y) {
        updateViewCenter({ x: nextX, y: nextY });
      }
    },
    [updateViewCenter]
  );

  /** Единственная точка записи хода для человека, ИИ и будущей сети. */
  const applyMove = useCallback(
    (point: GridPoint, mark: FiveInRowMark, source: 'player' | 'computer' | 'network') => {
      if (winningLineRef.current || turnRef.current !== mark) return false;
      const key = getCellKey(point.x, point.y);
      if (boardRef.current.has(key)) return false;

      const nextBoard = new Map(boardRef.current);
      const move: FiveInRowMove = {
        x: point.x,
        y: point.y,
        mark,
        moveNumber: nextBoard.size + 1,
      };
      nextBoard.set(key, mark);
      boardRef.current = nextBoard;
      setMoves(previous => [...previous, move]);
      ensureCellVisible(point);

      const winner = findWinningLine(nextBoard, move);
      logFiveInRow('Ход принят', {
        source,
        moveNumber: move.moveNumber,
        mark,
        x: point.x,
        y: point.y,
        winner: winner?.mark ?? null,
      });

      if (winner) {
        winningLineRef.current = winner;
        setWinningLine(winner);
        computerThinkingRef.current = false;
        setIsComputerThinking(false);
        setTimeout(() => setResultVisible(true), CONFIG.WIN_LINE_DRAW_DURATION_MS);
        logFiveInRow('Партия завершена', {
          winner: winner.mark,
          playerName: getPlayerName(settingsRef.current, winner.mark),
          moves: move.moveNumber,
          lineLength: winner.cells.length,
        });
        return true;
      }

      const nextTurn = getOppositeMark(mark);
      turnRef.current = nextTurn;
      setTurn(nextTurn);
      return true;
    },
    [ensureCellVisible]
  );

  useEffect(() => {
    if (
      settings.mode !== 'computer' ||
      turn !== 'o' ||
      winningLine ||
      settingsVisible
    ) {
      return;
    }

    clearComputerTimer();
    computerThinkingRef.current = true;
    setIsComputerThinking(true);
    const generation = gameGenerationRef.current;
    const boardSnapshot = new Map(boardRef.current);
    logFiveInRow('ИИ начал расчёт', {
      level: settings.difficulty,
      boardMoves: boardSnapshot.size,
    });

    computerTimerRef.current = setTimeout(() => {
      if (
        generation !== gameGenerationRef.current ||
        turnRef.current !== 'o' ||
        winningLineRef.current
      ) {
        return;
      }
      const selected = chooseComputerMove(
        boardSnapshot,
        settings.difficulty,
        'o'
      );
      computerThinkingRef.current = false;
      setIsComputerThinking(false);
      applyMove(selected, 'o', 'computer');
      computerTimerRef.current = null;
    }, CONFIG.COMPUTER_THINK_DELAY_MS);

    return () => {
      if (computerTimerRef.current) {
        clearTimeout(computerTimerRef.current);
        computerTimerRef.current = null;
      }
    };
  }, [
    applyMove,
    clearComputerTimer,
    settings.difficulty,
    settings.mode,
    settingsVisible,
    turn,
    winningLine,
  ]);

  const handleBoardTap = useCallback(
    (screenX: number, screenY: number) => {
      if (
        winningLineRef.current ||
        computerThinkingRef.current ||
        (settingsRef.current.mode === 'computer' && turnRef.current === 'o')
      ) {
        return;
      }
      const size = boardSizeRef.current;
      const scale = cellSizeRef.current;
      const center = viewCenterRef.current;
      const point = {
        x: Math.round(center.x + (screenX - size.width / 2) / scale),
        y: Math.round(center.y + (screenY - size.height / 2) / scale),
      };
      applyMove(point, turnRef.current, 'player');
    },
    [applyMove]
  );

  const beginPan = useCallback(() => {
    panStartRef.current = viewCenterRef.current;
    panCellSizeRef.current = cellSizeRef.current;
  }, []);

  const updatePan = useCallback(
    (translationX: number, translationY: number) => {
      const start = panStartRef.current;
      const scale = panCellSizeRef.current;
      updateViewCenter({
        x: start.x - translationX / scale,
        y: start.y - translationY / scale,
      });
    },
    [updateViewCenter]
  );

  const beginZoom = useCallback(() => {
    zoomStartRef.current = cellSizeRef.current;
  }, []);

  const updateZoom = useCallback(
    (scale: number) => updateCellSize(zoomStartRef.current * scale),
    [updateCellSize]
  );

  const boardGesture = useMemo(() => {
    const pan = Gesture.Pan()
      .minDistance(8)
      .onBegin(beginPan)
      .onUpdate(event => updatePan(event.translationX, event.translationY))
      .runOnJS(true);
    const pinch = Gesture.Pinch()
      .onBegin(beginZoom)
      .onUpdate(event => updateZoom(event.scale))
      .runOnJS(true);
    const tap = Gesture.Tap()
      .maxDistance(7)
      .onEnd(event => handleBoardTap(event.x, event.y))
      .runOnJS(true);
    return Gesture.Simultaneous(pan, pinch, tap);
  }, [beginPan, beginZoom, handleBoardTap, updatePan, updateZoom]);

  const handleBoardLayout = useCallback((event: LayoutChangeEvent) => {
    const next = {
      width: event.nativeEvent.layout.width,
      height: event.nativeEvent.layout.height,
    };
    boardSizeRef.current = next;
    setBoardSize(next);
  }, []);

  const openSettings = useCallback(() => {
    setDraftSettings(settingsRef.current);
    setResultVisible(false);
    setSettingsVisible(true);
  }, []);

  const applySettings = useCallback(() => {
    Keyboard.dismiss();
    const normalized = normalizeSettings(draftSettings);
    settingsRef.current = normalized;
    setSettings(normalized);
    setDraftSettings(normalized);
    setSettingsVisible(false);
    resetGame(normalized);
    AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(normalized)).catch(
      error =>
        console.warn('[Крестики-нолики] Не удалось сохранить настройки:', error)
    );
    logFiveInRow('Настройки применены', {
      mode: normalized.mode,
      difficulty: normalized.difficulty,
      playerX: normalized.playerXName,
      playerO: normalized.playerOName,
    });
  }, [draftSettings, resetGame]);

  const activePlayerName = getPlayerName(settings, turn);
  const lastMove = moves[moves.length - 1] ?? null;
  const winnerName = winningLine
    ? getPlayerName(settings, winningLine.mark)
    : '';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.headerButton}
          accessibilityRole="button"
          accessibilityLabel="Вернуться к списку игр"
        >
          <Icon name="chevron-back" size={27} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle} numberOfLines={1} adjustsFontSizeToFit>
            Крестики-нолики, 5 в ряд
          </Text>
          <Text style={styles.headerSubtitle}>
            бесконечное поле · {settings.mode === 'computer' ? 'против компьютера' : '2 игрока'}
          </Text>
        </View>
        <TouchableOpacity
          onPress={openSettings}
          style={styles.headerButton}
          accessibilityRole="button"
          accessibilityLabel="Настройки игры"
        >
          <Icon name="settings-outline" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.playersRow}>
        <View
          style={[
            styles.playerCard,
            turn === 'x' && !winningLine && styles.playerCardActive,
          ]}
        >
          <Text style={[styles.playerMark, styles.xMark]}>×</Text>
          <View style={styles.playerTextBlock}>
            <Text style={styles.playerRole}>КРЕСТИКИ · ПЕРВЫЙ ХОД</Text>
            <Text style={styles.playerName} numberOfLines={1}>
              {settings.playerXName}
            </Text>
          </View>
        </View>
        <View
          style={[
            styles.playerCard,
            turn === 'o' && !winningLine && styles.playerCardActiveO,
          ]}
        >
          <Text style={[styles.playerMark, styles.oMark]}>○</Text>
          <View style={styles.playerTextBlock}>
            <Text style={styles.playerRole}>
              {settings.mode === 'computer'
                ? `УРОВЕНЬ ${settings.difficulty}`
                : 'НОЛИКИ'}
            </Text>
            <Text style={styles.playerName} numberOfLines={1}>
              {getPlayerName(settings, 'o')}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.statusRow}>
        <View style={styles.statusDot} />
        <Text style={styles.statusText} numberOfLines={1}>
          {winningLine
            ? `Победил ${winnerName}`
            : isComputerThinking
              ? 'Компьютер обдумывает ход…'
              : `Ход: ${activePlayerName}`}
        </Text>
        <Text style={styles.movesText}>Ходов: {moves.length}</Text>
      </View>

      <View style={styles.boardFrame} onLayout={handleBoardLayout}>
        <GestureDetector gesture={boardGesture}>
          <View style={styles.boardGestureSurface}>
            {boardSize.width > 0 && boardSize.height > 0 && (
              <PaperBoard
                width={boardSize.width}
                height={boardSize.height}
                center={viewCenter}
                cellSize={cellSize}
                moves={moves}
                lastMove={lastMove}
                winningLine={winningLine}
              />
            )}
          </View>
        </GestureDetector>

        <View style={styles.zoomControls}>
          <TouchableOpacity
            onPress={() => updateCellSize(cellSizeRef.current + CONFIG.ZOOM_STEP)}
            style={styles.zoomButton}
            accessibilityLabel="Увеличить поле"
          >
            <Icon name="add" size={21} color={colors.primary} />
          </TouchableOpacity>
          <View style={styles.zoomDivider} />
          <TouchableOpacity
            onPress={() => updateCellSize(cellSizeRef.current - CONFIG.ZOOM_STEP)}
            style={styles.zoomButton}
            accessibilityLabel="Уменьшить поле"
          >
            <Icon name="remove" size={21} color={colors.primary} />
          </TouchableOpacity>
          <View style={styles.zoomDivider} />
          <TouchableOpacity
            onPress={resetView}
            style={styles.zoomButton}
            accessibilityLabel="Вернуться к центру поля"
          >
            <Icon name="locate-outline" size={19} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {moves.length === 0 && (
          <View pointerEvents="none" style={styles.boardHint}>
            <Icon name="hand-left-outline" size={20} color="#597487" />
            <Text style={styles.boardHintText}>
              Коснитесь клетки · перемещайте поле пальцем
            </Text>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          onPress={() => resetGame()}
          style={styles.secondaryButton}
          accessibilityRole="button"
        >
          <Icon name="refresh" size={20} color={colors.primary} />
          <Text style={styles.secondaryButtonText}>Новая партия</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={openSettings}
          style={styles.primaryButton}
          accessibilityRole="button"
        >
          <Icon name="options-outline" size={19} color={colors.white} />
          <Text style={styles.primaryButtonText}>Режим и игроки</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={settingsVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSettingsVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setSettingsVisible(false)}
          />
          <View
            style={[
              styles.settingsSheet,
              { paddingBottom: Math.max(22, insets.bottom + 10) },
            ]}
          >
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>Настройки партии</Text>
                <Text style={styles.sheetSubtitle}>Крестики всегда ходят первыми</Text>
              </View>
              <TouchableOpacity
                onPress={() => setSettingsVisible(false)}
                style={styles.closeButton}
              >
                <Icon name="close" size={23} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.sectionLabel}>РЕЖИМ ИГРЫ</Text>
              <View style={styles.modeGrid}>
                <TouchableOpacity
                  onPress={() =>
                    setDraftSettings(previous => ({
                      ...previous,
                      mode: 'computer',
                    }))
                  }
                  style={[
                    styles.modeCard,
                    draftSettings.mode === 'computer' && styles.modeCardActive,
                  ]}
                >
                  <Icon
                    name="hardware-chip-outline"
                    size={24}
                    color={
                      draftSettings.mode === 'computer'
                        ? colors.primary
                        : colors.textSecondary
                    }
                  />
                  <Text style={styles.modeTitle}>Компьютер</Text>
                  <Text style={styles.modeDescription}>5 уровней сложности</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() =>
                    setDraftSettings(previous => ({
                      ...previous,
                      mode: 'local',
                    }))
                  }
                  style={[
                    styles.modeCard,
                    draftSettings.mode === 'local' && styles.modeCardActive,
                  ]}
                >
                  <Icon
                    name="people-outline"
                    size={24}
                    color={
                      draftSettings.mode === 'local'
                        ? colors.primary
                        : colors.textSecondary
                    }
                  />
                  <Text style={styles.modeTitle}>Два игрока</Text>
                  <Text style={styles.modeDescription}>По очереди на устройстве</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() =>
                    Alert.alert(
                      'Сетевая игра',
                      'Каркас сетевой партии уже заложен. Подключение комнат и сервера добавим следующим этапом.'
                    )
                  }
                  style={[styles.modeCard, styles.modeCardOnline]}
                >
                  <View style={styles.soonBadge}>
                    <Text style={styles.soonBadgeText}>ПОЗЖЕ</Text>
                  </View>
                  <Icon name="globe-outline" size={24} color="#8C9AA3" />
                  <Text style={styles.modeTitle}>По сети</Text>
                  <Text style={styles.modeDescription}>Механизм подготовлен</Text>
                </TouchableOpacity>
              </View>

              {draftSettings.mode === 'computer' && (
                <>
                  <Text style={styles.sectionLabel}>СЛОЖНОСТЬ КОМПЬЮТЕРА</Text>
                  <View style={styles.difficultyRow}>
                    {[1, 2, 3, 4, 5].map(level => (
                      <TouchableOpacity
                        key={level}
                        onPress={() =>
                          setDraftSettings(previous => ({
                            ...previous,
                            difficulty: level,
                          }))
                        }
                        style={[
                          styles.difficultyButton,
                          draftSettings.difficulty === level &&
                            styles.difficultyButtonActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.difficultyNumber,
                            draftSettings.difficulty === level &&
                              styles.difficultyNumberActive,
                          ]}
                        >
                          {level}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.difficultyCaption}>
                    {FIVE_IN_ROW_DIFFICULTY_NAMES[draftSettings.difficulty]}
                  </Text>
                </>
              )}

              <Text style={styles.sectionLabel}>ИМЕНА ИГРОКОВ</Text>
              <View style={styles.inputGroup}>
                <View style={[styles.inputMark, styles.inputMarkX]}>
                  <Text style={[styles.inputMarkText, styles.xMark]}>×</Text>
                </View>
                <View style={styles.inputBlock}>
                  <Text style={styles.inputLabel}>
                    {draftSettings.mode === 'computer' ? 'Ваше имя' : 'Игрок 1'}
                  </Text>
                  <TextInput
                    value={draftSettings.playerXName}
                    onChangeText={playerXName =>
                      setDraftSettings(previous => ({ ...previous, playerXName }))
                    }
                    maxLength={24}
                    placeholder="Игрок 1"
                    placeholderTextColor="#A5AFB5"
                    style={styles.nameInput}
                    returnKeyType="done"
                  />
                </View>
              </View>

              {draftSettings.mode === 'local' && (
                <View style={styles.inputGroup}>
                  <View style={[styles.inputMark, styles.inputMarkO]}>
                    <Text style={[styles.inputMarkText, styles.oMark]}>○</Text>
                  </View>
                  <View style={styles.inputBlock}>
                    <Text style={styles.inputLabel}>Игрок 2</Text>
                    <TextInput
                      value={draftSettings.playerOName}
                      onChangeText={playerOName =>
                        setDraftSettings(previous => ({ ...previous, playerOName }))
                      }
                      maxLength={24}
                      placeholder="Игрок 2"
                      placeholderTextColor="#A5AFB5"
                      style={styles.nameInput}
                      returnKeyType="done"
                    />
                  </View>
                </View>
              )}

              <View style={styles.rulesNote}>
                <Icon name="information-circle-outline" size={20} color="#557589" />
                <Text style={styles.rulesNoteText}>
                  Ставьте знак только в пустую клетку. Первый непрерывный ряд из
                  пяти или больше знаков по горизонтали, вертикали или диагонали
                  приносит победу.
                </Text>
              </View>

              <TouchableOpacity onPress={applySettings} style={styles.applyButton}>
                <Text style={styles.applyButtonText}>Начать новую партию</Text>
                <Icon name="arrow-forward" size={20} color={colors.white} />
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={resultVisible && Boolean(winningLine)}
        transparent
        animationType="fade"
        onRequestClose={() => setResultVisible(false)}
      >
        <View style={styles.resultBackdrop}>
          <View style={styles.resultCard}>
            <View style={styles.resultIconRing}>
              <Text
                style={[
                  styles.resultMark,
                  winningLine?.mark === 'x' ? styles.xMark : styles.oMark,
                ]}
              >
                {winningLine?.mark === 'x' ? '×' : '○'}
              </Text>
            </View>
            <Text style={styles.resultEyebrow}>ПЯТЬ В РЯД</Text>
            <Text style={styles.resultTitle}>{winnerName} победил!</Text>
            <Text style={styles.resultDescription}>
              Непрерывная линия из {winningLine?.cells.length ?? 5} знаков · ходов{' '}
              {moves.length}
            </Text>
            <TouchableOpacity
              onPress={() => resetGame()}
              style={styles.resultPrimaryButton}
            >
              <Icon name="refresh" size={20} color={colors.white} />
              <Text style={styles.resultPrimaryText}>Новая партия</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={openSettings} style={styles.resultSecondaryButton}>
              <Text style={styles.resultSecondaryText}>Изменить режим и игроков</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
  },
  headerTextContainer: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 5,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 21,
    fontWeight: '800',
  },
  headerSubtitle: {
    marginTop: 1,
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '500',
  },
  playersRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 8,
  },
  playerCard: {
    flex: 1,
    minWidth: 0,
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: '#F8FAFB',
  },
  playerCardActive: {
    borderColor: '#729BC4',
    backgroundColor: '#EDF4FB',
  },
  playerCardActiveO: {
    borderColor: '#D88A78',
    backgroundColor: '#FFF2EE',
  },
  playerMark: {
    width: 34,
    marginRight: 4,
    fontSize: 37,
    lineHeight: 42,
    fontWeight: '500',
    textAlign: 'center',
  },
  xMark: {
    color: '#214C82',
  },
  oMark: {
    color: '#C4543D',
  },
  playerTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  playerRole: {
    color: colors.textSecondary,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.45,
  },
  playerName: {
    marginTop: 3,
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  statusRow: {
    height: 34,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  statusDot: {
    width: 7,
    height: 7,
    marginRight: 7,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  statusText: {
    flex: 1,
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  movesText: {
    marginLeft: 8,
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
  },
  boardFrame: {
    flex: 1,
    minHeight: 250,
    marginHorizontal: 9,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#C9D4D9',
    borderRadius: 18,
    backgroundColor: '#F7F1E3',
    shadowColor: '#21394A',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  boardGestureSurface: {
    flex: 1,
  },
  zoomControls: {
    position: 'absolute',
    top: 10,
    right: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#C9D4D9',
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.92)',
    shadowColor: '#1B365D',
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  zoomButton: {
    width: 38,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomDivider: {
    height: 1,
    backgroundColor: colors.border,
  },
  boardHint: {
    position: 'absolute',
    left: 22,
    right: 58,
    bottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.82)',
  },
  boardHintText: {
    marginLeft: 7,
    color: '#526B7B',
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },
  footer: {
    height: 64,
    flexDirection: 'row',
    gap: 9,
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  secondaryButton: {
    flex: 1,
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#BACAD5',
    borderRadius: 13,
    backgroundColor: '#F7FAFC',
  },
  secondaryButtonText: {
    marginLeft: 6,
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  primaryButton: {
    flex: 1.2,
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: colors.primary,
  },
  primaryButtonText: {
    marginLeft: 6,
    color: colors.white,
    fontSize: 12,
    fontWeight: '800',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(20,35,48,0.45)',
  },
  settingsSheet: {
    maxHeight: '90%',
    paddingHorizontal: 16,
    paddingBottom: 22,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: colors.background,
  },
  sheetHandle: {
    width: 44,
    height: 4,
    alignSelf: 'center',
    marginTop: 9,
    marginBottom: 9,
    borderRadius: 2,
    backgroundColor: '#CBD5DB',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sheetTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  sheetSubtitle: {
    marginTop: 2,
    color: colors.textSecondary,
    fontSize: 11,
  },
  closeButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    backgroundColor: '#F1F4F6',
  },
  sectionLabel: {
    marginTop: 6,
    marginBottom: 7,
    color: colors.textSecondary,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.75,
  },
  modeGrid: {
    flexDirection: 'row',
    gap: 7,
    marginBottom: 14,
  },
  modeCard: {
    flex: 1,
    minHeight: 92,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 13,
    backgroundColor: '#F8FAFB',
  },
  modeCardActive: {
    borderWidth: 2,
    borderColor: colors.accent,
    backgroundColor: '#EDF5FC',
  },
  modeCardOnline: {
    opacity: 0.72,
  },
  soonBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
    backgroundColor: '#E6EBEE',
  },
  soonBadgeText: {
    color: '#6C7D87',
    fontSize: 6,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  modeTitle: {
    marginTop: 5,
    color: colors.text,
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  modeDescription: {
    marginTop: 2,
    color: colors.textSecondary,
    fontSize: 7.5,
    lineHeight: 10,
    textAlign: 'center',
  },
  difficultyRow: {
    flexDirection: 'row',
    gap: 8,
  },
  difficultyButton: {
    flex: 1,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CCD7DE',
    borderRadius: 11,
    backgroundColor: '#F7F9FA',
  },
  difficultyButtonActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  difficultyNumber: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '900',
  },
  difficultyNumberActive: {
    color: colors.white,
  },
  difficultyCaption: {
    height: 27,
    paddingTop: 5,
    color: colors.primary,
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  inputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  inputMark: {
    width: 44,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
  },
  inputMarkX: {
    backgroundColor: '#EAF2FA',
  },
  inputMarkO: {
    backgroundColor: '#FFF0EB',
  },
  inputMarkText: {
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '500',
  },
  inputBlock: {
    flex: 1,
    marginLeft: 10,
  },
  inputLabel: {
    marginBottom: 3,
    color: colors.textSecondary,
    fontSize: 9,
    fontWeight: '700',
  },
  nameInput: {
    height: 42,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#C9D5DC',
    borderRadius: 11,
    color: colors.text,
    backgroundColor: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  rulesNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 1,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 11,
    backgroundColor: '#EEF4F7',
  },
  rulesNoteText: {
    flex: 1,
    marginLeft: 7,
    color: '#526B78',
    fontSize: 9,
    lineHeight: 13,
    fontWeight: '600',
  },
  applyButton: {
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 7,
    marginBottom: 4,
    borderRadius: 14,
    backgroundColor: colors.primary,
  },
  applyButtonText: {
    marginRight: 8,
    color: colors.white,
    fontSize: 14,
    fontWeight: '800',
  },
  resultBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: 'rgba(21,36,49,0.55)',
  },
  resultCard: {
    width: '100%',
    maxWidth: 390,
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 18,
    borderRadius: 23,
    backgroundColor: colors.background,
  },
  resultIconRing: {
    width: 78,
    height: 78,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 11,
    borderWidth: 3,
    borderColor: '#E7A51A',
    borderRadius: 39,
    backgroundColor: '#FFF8E8',
  },
  resultMark: {
    fontSize: 57,
    lineHeight: 64,
    fontWeight: '500',
  },
  resultEyebrow: {
    color: '#B57A0C',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.15,
  },
  resultTitle: {
    marginTop: 6,
    color: colors.text,
    fontSize: 23,
    fontWeight: '900',
    textAlign: 'center',
  },
  resultDescription: {
    marginTop: 7,
    marginBottom: 18,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  resultPrimaryButton: {
    width: '100%',
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: colors.primary,
  },
  resultPrimaryText: {
    marginLeft: 7,
    color: colors.white,
    fontSize: 14,
    fontWeight: '800',
  },
  resultSecondaryButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  resultSecondaryText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
});
