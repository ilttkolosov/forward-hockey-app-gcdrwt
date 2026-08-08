import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from '../../../components/Icon';
import { useTrackScreenView } from '../../../hooks/useTrackScreenView';
import { colors } from '../../../styles/commonStyles';
import IceRink from './IceRink';
import {
  buildCoveragePath,
  createIceGameSnapshot,
  createInitialIceGameState,
  formatIceGameTime,
  IceGameControls,
  IceGamePhase,
  logIceGame,
  stepIceGame,
} from './gameEngine';
import { ICE_RESURFACING_CONFIG as CONFIG } from './gameConfig';

const BEST_TIME_STORAGE_KEY = 'ice_resurfacing_best_time_ms_v1';

const EMPTY_CONTROLS: IceGameControls = {
  forward: false,
  left: false,
  right: false,
};

const PHASE_TEXT: Record<IceGamePhase, string> = {
  intro: 'Ворота открываются…',
  playing: 'Залейте всю площадку',
  returning: 'Лёд готов — возвращайтесь в верхние ворота',
  parking: 'Машина в боксе, ворота закрываются…',
  won: 'Площадка готова!',
  crashed: 'Машина повреждена',
};

type ControlName = keyof IceGameControls;

export default function IceResurfacingGameScreen() {
  const router = useRouter();
  const [initialEngine] = useState(createInitialIceGameState);
  const engineRef = useRef(initialEngine);
  const controlsRef = useRef<IceGameControls>({ ...EMPTY_CONTROLS });
  const coveragePathRef = useRef(buildCoveragePath(initialEngine));
  const lastCoverageRevisionRef = useRef(initialEngine.coverageRevision);
  const lastFrameTimestampRef = useRef<number | null>(null);
  const uiAccumulatorRef = useRef(0);
  const coveragePathAccumulatorRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);
  const victoryStoredRef = useRef(false);
  const isAppActiveRef = useRef(AppState.currentState === 'active');

  const [snapshot, setSnapshot] = useState(() =>
    createIceGameSnapshot(initialEngine, coveragePathRef.current)
  );
  const [bestTimeMs, setBestTimeMs] = useState<number | null>(null);
  const [isNewRecord, setIsNewRecord] = useState(false);

  useTrackScreenView('Мобильная игра — Заливка льда');

  const releaseAllControls = useCallback((reason: string) => {
    const hadActiveControl = Object.values(controlsRef.current).some(Boolean);
    controlsRef.current = { ...EMPTY_CONTROLS };
    if (hadActiveControl) logIceGame(`Управление отпущено: ${reason}`);
  }, []);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(BEST_TIME_STORAGE_KEY)
      .then(value => {
        if (!mounted || !value) return;
        const parsed = Number(value);
        if (Number.isFinite(parsed) && parsed > 0) {
          setBestTimeMs(parsed);
          logIceGame('Личный рекорд загружен', { bestTimeMs: parsed });
        }
      })
      .catch(error => console.warn('[Заливка льда] Не удалось загрузить рекорд:', error));

    return () => {
      mounted = false;
    };
  }, []);

  /**
   * Движок работает через requestAnimationFrame, но React получает снимок
   * только 30 раз в секунду. Это сохраняет плавность и не перегружает iPhone.
   */
  useEffect(() => {
    const frame = (timestamp: number) => {
      if (!isAppActiveRef.current) {
        // На паузе не движем машину и не прибавляем время даже в окружениях,
        // где requestAnimationFrame продолжает вызываться в фоне.
        lastFrameTimestampRef.current = null;
        animationFrameRef.current = requestAnimationFrame(frame);
        return;
      }

      if (lastFrameTimestampRef.current === null) {
        lastFrameTimestampRef.current = timestamp;
      }

      const deltaMs = timestamp - lastFrameTimestampRef.current;
      lastFrameTimestampRef.current = timestamp;
      stepIceGame(engineRef.current, controlsRef.current, deltaMs / 1000);
      uiAccumulatorRef.current += deltaMs;
      coveragePathAccumulatorRef.current += deltaMs;

      const coverageChanged =
        engineRef.current.coverageRevision !== lastCoverageRevisionRef.current;
      if (
        coverageChanged &&
        coveragePathAccumulatorRef.current >= CONFIG.COVERAGE_PATH_INTERVAL_MS
      ) {
        coveragePathRef.current = buildCoveragePath(engineRef.current);
        lastCoverageRevisionRef.current = engineRef.current.coverageRevision;
        coveragePathAccumulatorRef.current = 0;
      }

      if (uiAccumulatorRef.current >= CONFIG.UI_FRAME_INTERVAL_MS) {
        uiAccumulatorRef.current = 0;
        setSnapshot(createIceGameSnapshot(engineRef.current, coveragePathRef.current));
      }

      animationFrameRef.current = requestAnimationFrame(frame);
    };

    animationFrameRef.current = requestAnimationFrame(frame);
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      releaseAllControls('экран закрыт');
    };
  }, [releaseAllControls]);

  // При сворачивании нельзя оставлять виртуальную кнопку газа «зажатой».
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      isAppActiveRef.current = nextState === 'active';
      if (!isAppActiveRef.current) {
        releaseAllControls('приложение свёрнуто');
        lastFrameTimestampRef.current = null;
      } else {
        lastFrameTimestampRef.current = null;
        logIceGame('Приложение снова активно, отсчёт кадров восстановлен');
      }
    });
    return () => subscription.remove();
  }, [releaseAllControls]);

  // Рекорд сохраняется только после того, как машина вернулась и ворота закрылись.
  useEffect(() => {
    if (snapshot.phase !== 'won' || victoryStoredRef.current) return;
    victoryStoredRef.current = true;
    const wonTime = Math.round(snapshot.elapsedMs);
    const newRecord = bestTimeMs === null || wonTime < bestTimeMs;
    setIsNewRecord(newRecord);

    if (newRecord) {
      setBestTimeMs(wonTime);
      AsyncStorage.setItem(BEST_TIME_STORAGE_KEY, String(wonTime))
        .then(() => logIceGame('Новый рекорд сохранён', { bestTimeMs: wonTime }))
        .catch(error => console.warn('[Заливка льда] Не удалось сохранить рекорд:', error));
    }
  }, [bestTimeMs, snapshot.elapsedMs, snapshot.phase]);

  const restartGame = useCallback(() => {
    releaseAllControls('перезапуск');
    const newEngine = createInitialIceGameState();
    engineRef.current = newEngine;
    coveragePathRef.current = buildCoveragePath(newEngine);
    lastCoverageRevisionRef.current = newEngine.coverageRevision;
    lastFrameTimestampRef.current = null;
    uiAccumulatorRef.current = 0;
    coveragePathAccumulatorRef.current = 0;
    victoryStoredRef.current = false;
    setIsNewRecord(false);
    setSnapshot(createIceGameSnapshot(newEngine, coveragePathRef.current));
    logIceGame('Игра перезапущена пользователем');
  }, [releaseAllControls]);

  const handleBack = useCallback(() => {
    releaseAllControls('выход из игры');
    router.back();
  }, [releaseAllControls, router]);

  const canControl = snapshot.phase === 'playing' || snapshot.phase === 'returning';

  const setControl = useCallback((control: ControlName, active: boolean) => {
    const state = engineRef.current;
    const allowed = state.phase === 'playing' || state.phase === 'returning';
    const nextValue = active && allowed;
    if (controlsRef.current[control] === nextValue) return;
    controlsRef.current[control] = nextValue;
    logIceGame(`Кнопка ${control}: ${nextValue ? 'нажата' : 'отпущена'}`, {
      speed: Number(state.speed.toFixed(1)),
      phase: state.phase,
    });
  }, []);

  const speedPercent = Math.round((snapshot.speed / CONFIG.MAX_FORWARD_SPEED) * 100);
  const displayedRemainingPercent = Math.max(0, snapshot.remainingPercent).toFixed(1);
  const isResultVisible = snapshot.phase === 'won' || snapshot.phase === 'crashed';
  const didWin = snapshot.phase === 'won';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleBack}
          style={styles.headerButton}
          accessibilityRole="button"
          accessibilityLabel="Вернуться к списку игр"
        >
          <Icon name="chevron-back" size={27} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>Заливка льда</Text>
          <Text style={styles.headerSubtitle}>ледовая арена</Text>
        </View>
        <TouchableOpacity
          onPress={restartGame}
          style={styles.headerButton}
          accessibilityRole="button"
          accessibilityLabel="Начать игру заново"
        >
          <Icon name="refresh" size={25} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Требуемые показатели всегда находятся над площадкой. */}
      <View style={styles.hud}>
        <View style={styles.metricCard}>
          <View style={styles.metricIcon}>
            <Icon name="timer-outline" size={20} color={colors.primary} />
          </View>
          <View>
            <Text style={styles.metricLabel}>Время</Text>
            <Text style={styles.metricValue}>{formatIceGameTime(snapshot.elapsedMs)}</Text>
          </View>
        </View>
        <View style={styles.metricCard}>
          <View style={[styles.metricIcon, styles.snowMetricIcon]}>
            <Icon name="snow-outline" size={20} color="#59747D" />
          </View>
          <View>
            <Text style={styles.metricLabel}>Осталось</Text>
            <Text style={styles.metricValue}>{displayedRemainingPercent}%</Text>
          </View>
        </View>
      </View>

      <View
        style={[
          styles.phaseBanner,
          snapshot.phase === 'returning' && styles.phaseBannerReturning,
          snapshot.phase === 'crashed' && styles.phaseBannerError,
        ]}
      >
        <Text
          style={[
            styles.phaseText,
            snapshot.phase === 'returning' && styles.phaseTextReturning,
            snapshot.phase === 'crashed' && styles.phaseTextError,
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {snapshot.phase === 'playing' && snapshot.y < 0
            ? 'Зажмите газ и выезжайте на лёд'
            : PHASE_TEXT[snapshot.phase]}
        </Text>
      </View>

      <View style={styles.rinkContainer}>
        <IceRink snapshot={snapshot} />
      </View>

      {/* Нижняя часть экрана полностью отдана под удерживаемые кнопки. */}
      <View style={styles.controlsPanel}>
        <View style={styles.speedRow}>
          <Text style={styles.speedLabel}>СКОРОСТЬ</Text>
          <View style={styles.speedTrack}>
            <View style={[styles.speedFill, { width: `${speedPercent}%` }]} />
            <View style={styles.crashThresholdMarker} />
          </View>
          <Text style={styles.speedValue}>{speedPercent}%</Text>
        </View>

        <View style={styles.controlsRow}>
          <Pressable
            disabled={!canControl}
            onPressIn={() => setControl('left', true)}
            onPressOut={() => setControl('left', false)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Повернуть влево"
            style={({ pressed }) => [
              styles.steerButton,
              pressed && canControl && styles.controlButtonPressed,
              !canControl && styles.controlButtonDisabled,
            ]}
          >
            <Icon name="arrow-back" size={30} color={colors.primary} />
            <Text style={styles.steerButtonText}>ВЛЕВО</Text>
          </Pressable>

          <Pressable
            disabled={!canControl}
            onPressIn={() => setControl('forward', true)}
            onPressOut={() => setControl('forward', false)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Удерживать газ"
            style={({ pressed }) => [
              styles.forwardButton,
              pressed && canControl && styles.forwardButtonPressed,
              !canControl && styles.controlButtonDisabled,
            ]}
          >
            <Icon name="chevron-up" size={32} color={colors.white} />
            <Text style={styles.forwardButtonText}>ГАЗ</Text>
          </Pressable>

          <Pressable
            disabled={!canControl}
            onPressIn={() => setControl('right', true)}
            onPressOut={() => setControl('right', false)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Повернуть вправо"
            style={({ pressed }) => [
              styles.steerButton,
              pressed && canControl && styles.controlButtonPressed,
              !canControl && styles.controlButtonDisabled,
            ]}
          >
            <Icon name="arrow-forward" size={30} color={colors.primary} />
            <Text style={styles.steerButtonText}>ВПРАВО</Text>
          </Pressable>
        </View>
        <Text style={styles.brakingHint}>Отпустите газ, чтобы плавно затормозить</Text>
      </View>

      <Modal
        visible={isResultVisible}
        transparent
        animationType="fade"
        onRequestClose={handleBack}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.resultCard}>
            <View style={[styles.resultIcon, !didWin && styles.resultIconError]}>
              <Icon
                name={didWin ? 'trophy' : 'construct'}
                size={36}
                color={didWin ? colors.warning : colors.error}
              />
            </View>
            <Text style={styles.resultTitle}>
              {didWin ? 'Площадка готова!' : 'Zamboni сломалась'}
            </Text>
            <Text style={styles.resultDescription}>
              {didWin
                ? 'Вы залили лёд, вернули машину в ворота и закрыли арену.'
                : 'Удар о борт на высокой скорости завершил заезд. Перед поворотом отпускайте газ.'}
            </Text>

            <View style={styles.resultStats}>
              <View style={styles.resultStatItem}>
                <Text style={styles.resultStatLabel}>Время</Text>
                <Text style={styles.resultStatValue}>{formatIceGameTime(snapshot.elapsedMs)}</Text>
              </View>
              <View style={styles.resultDivider} />
              <View style={styles.resultStatItem}>
                <Text style={styles.resultStatLabel}>{didWin ? 'Лёд' : 'Скорость удара'}</Text>
                <Text style={styles.resultStatValue}>
                  {didWin
                    ? `${Math.max(0, 100 - snapshot.remainingPercent).toFixed(1)}%`
                    : `${Math.round(snapshot.crashImpactSpeed ?? 0)} ед.`}
                </Text>
              </View>
            </View>

            {didWin && isNewRecord && <Text style={styles.recordBadge}>НОВЫЙ РЕКОРД</Text>}
            {bestTimeMs !== null && (
              <Text style={styles.bestTimeText}>
                Лучшее время: {formatIceGameTime(bestTimeMs)}
              </Text>
            )}

            <TouchableOpacity style={styles.restartButton} onPress={restartGame}>
              <Icon name="refresh" size={21} color={colors.white} />
              <Text style={styles.restartButtonText}>Ещё один заезд</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.exitButton} onPress={handleBack}>
              <Text style={styles.exitButtonText}>К списку игр</Text>
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
    backgroundColor: '#F4F7F9',
  },
  header: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextContainer: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  headerSubtitle: {
    marginTop: -1,
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  hud: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  metricCard: {
    flex: 1,
    minHeight: 51,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 13,
    paddingHorizontal: 10,
  },
  metricIcon: {
    width: 32,
    height: 32,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#E8F1FB',
  },
  snowMetricIcon: {
    backgroundColor: '#E7EEF0',
  },
  metricLabel: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metricValue: {
    marginTop: 1,
    color: colors.primary,
    fontSize: 18,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  phaseBanner: {
    minHeight: 30,
    marginHorizontal: 12,
    marginTop: 6,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    backgroundColor: '#E8F1FB',
  },
  phaseBannerReturning: {
    backgroundColor: '#FFF1E9',
  },
  phaseBannerError: {
    backgroundColor: '#FDEDEC',
  },
  phaseText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  phaseTextReturning: {
    color: '#B44A20',
  },
  phaseTextError: {
    color: colors.error,
  },
  rinkContainer: {
    flex: 1,
    minHeight: 0,
    marginHorizontal: 6,
    marginVertical: 3,
    overflow: 'hidden',
  },
  controlsPanel: {
    paddingHorizontal: 15,
    paddingTop: 7,
    paddingBottom: 5,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
    shadowColor: '#172A3A',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -3 },
    elevation: 6,
  },
  speedRow: {
    height: 19,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  speedLabel: {
    width: 62,
    color: colors.textSecondary,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  speedTrack: {
    flex: 1,
    height: 7,
    overflow: 'hidden',
    borderRadius: 4,
    backgroundColor: '#E3E9ED',
  },
  speedFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  crashThresholdMarker: {
    position: 'absolute',
    left: `${(CONFIG.CRASH_SPEED / CONFIG.MAX_FORWARD_SPEED) * 100}%`,
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: colors.error,
  },
  speedValue: {
    width: 34,
    color: colors.primary,
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  steerButton: {
    width: 82,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#B7C8D5',
    borderRadius: 18,
    backgroundColor: '#F5F8FA',
  },
  steerButtonText: {
    marginTop: -2,
    color: colors.primary,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  forwardButton: {
    width: 90,
    height: 68,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 23,
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: '#D6E4EF',
    shadowColor: colors.primary,
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  forwardButtonPressed: {
    transform: [{ scale: 0.95 }],
    backgroundColor: '#102A4C',
  },
  forwardButtonText: {
    marginTop: -5,
    color: colors.white,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },
  controlButtonPressed: {
    transform: [{ scale: 0.95 }],
    backgroundColor: '#E2EDF5',
    borderColor: colors.accent,
  },
  controlButtonDisabled: {
    opacity: 0.42,
  },
  brakingHint: {
    marginTop: 1,
    color: colors.textSecondary,
    fontSize: 10,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(18, 37, 52, 0.65)',
  },
  resultCard: {
    width: '100%',
    maxWidth: 390,
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 18,
    borderRadius: 22,
    backgroundColor: colors.background,
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  resultIcon: {
    width: 68,
    height: 68,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 34,
    backgroundColor: '#FFF6DA',
  },
  resultIconError: {
    backgroundColor: '#FDEDEC',
  },
  resultTitle: {
    marginTop: 13,
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  resultDescription: {
    marginTop: 7,
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  resultStats: {
    width: '100%',
    height: 66,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    borderRadius: 14,
    backgroundColor: colors.backgroundAlt,
  },
  resultStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  resultStatLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  resultStatValue: {
    marginTop: 3,
    color: colors.primary,
    fontSize: 18,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  resultDivider: {
    width: 1,
    height: 34,
    backgroundColor: colors.border,
  },
  recordBadge: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 5,
    overflow: 'hidden',
    borderRadius: 10,
    color: '#875D00',
    backgroundColor: '#FFF1B8',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  bestTimeText: {
    marginTop: 10,
    color: colors.textSecondary,
    fontSize: 12,
  },
  restartButton: {
    width: '100%',
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 17,
    borderRadius: 13,
    backgroundColor: colors.primary,
  },
  restartButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '800',
  },
  exitButton: {
    marginTop: 4,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  exitButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
});
