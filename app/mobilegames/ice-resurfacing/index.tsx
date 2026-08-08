import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  Modal,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
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
  IceDriveDirection,
  IceGamePhase,
  logIceGame,
  stepIceGame,
} from './gameEngine';
import { ICE_RESURFACING_CONFIG as CONFIG } from './gameConfig';

const BEST_TIME_STORAGE_KEY = 'ice_resurfacing_best_time_ms_v1';

const EMPTY_CONTROLS: IceGameControls = {
  drivePressed: false,
  steering: 0,
  direction: 'forward',
};

const PHASE_TEXT: Record<IceGamePhase, string> = {
  intro: 'Ворота открываются…',
  playing: 'Залейте всю площадку',
  returning: 'Заливка завершена — возвращайтесь в верхние ворота',
  parking: 'Машина в боксе, ворота закрываются…',
  won: 'Площадка готова!',
  crashed: 'Машина повреждена',
};

interface HoldControlButtonProps {
  active: boolean;
  disabled: boolean;
  accessibilityLabel: string;
  onActiveChange: (active: boolean) => void;
  style: StyleProp<ViewStyle>;
  activeStyle: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

/**
 * Manual-жест меняет состояние только по физическим событиям DOWN/UP. Поэтому
 * кнопка не может активироваться при рендере: true существует строго между
 * касанием и UP/CANCEL/FINALIZE. Руль и ход остаются независимыми жестами.
 */
function HoldControlButton({
  active,
  disabled,
  accessibilityLabel,
  onActiveChange,
  style,
  activeStyle,
  children,
}: HoldControlButtonProps) {
  const onActiveChangeRef = useRef(onActiveChange);
  const physicalTouchActiveRef = useRef(false);
  const accessibilityReleaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  useEffect(() => {
    onActiveChangeRef.current = onActiveChange;
  }, [onActiveChange]);

  const activateGesture = useCallback(() => {
    if (physicalTouchActiveRef.current) return;
    physicalTouchActiveRef.current = true;
    onActiveChangeRef.current(true);
  }, []);

  const finalizeGesture = useCallback(() => {
    physicalTouchActiveRef.current = false;
    onActiveChangeRef.current(false);
  }, []);

  const holdGesture = useMemo(
    () =>
      Gesture.Manual()
        .enabled(!disabled)
        .shouldCancelWhenOutside(true)
        .onTouchesDown((_event, stateManager) => {
          stateManager.activate();
          activateGesture();
        })
        .onTouchesUp((_event, stateManager) => {
          finalizeGesture();
          stateManager.end();
        })
        .onTouchesCancelled((_event, stateManager) => {
          finalizeGesture();
          stateManager.fail();
        })
        .onFinalize(finalizeGesture)
        .runOnJS(true),
    [activateGesture, disabled, finalizeGesture]
  );

  useEffect(() => {
    if (!disabled) return;
    finalizeGesture();
  }, [disabled, finalizeGesture]);

  useEffect(
    () => () => {
      if (accessibilityReleaseTimerRef.current) {
        clearTimeout(accessibilityReleaseTimerRef.current);
      }
    },
    []
  );

  const handleAccessibilityTap = () => {
    if (disabled) return;
    onActiveChangeRef.current(true);
    if (accessibilityReleaseTimerRef.current) {
      clearTimeout(accessibilityReleaseTimerRef.current);
    }
    accessibilityReleaseTimerRef.current = setTimeout(
      () => onActiveChangeRef.current(false),
      450
    );
  };

  return (
    <GestureDetector gesture={holdGesture}>
      <View
        style={[style, active && activeStyle, disabled && styles.controlButtonDisabled]}
        accessible
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled, selected: active }}
        onAccessibilityTap={handleAccessibilityTap}
      >
        {children}
      </View>
    </GestureDetector>
  );
}

export default function IceResurfacingGameScreen() {
  const router = useRouter();
  const [initialEngine] = useState(createInitialIceGameState);
  const engineRef = useRef(initialEngine);
  const controlsRef = useRef<IceGameControls>({ ...EMPTY_CONTROLS });
  const coveragePathRef = useRef(buildCoveragePath(initialEngine));
  const lastCoverageRevisionRef = useRef(initialEngine.coverageRevision);
  const lastFrameTimestampRef = useRef<number | null>(null);
  const physicsAccumulatorRef = useRef(0);
  const uiAccumulatorRef = useRef(0);
  const coveragePathAccumulatorRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);
  const resumeAnimationLoopRef = useRef<() => void>(() => undefined);
  const victoryStoredRef = useRef(false);
  const isAppActiveRef = useRef(AppState.currentState === 'active');

  const [snapshot, setSnapshot] = useState(() =>
    createIceGameSnapshot(initialEngine, coveragePathRef.current)
  );
  const [bestTimeMs, setBestTimeMs] = useState<number | null>(null);
  const [isNewRecord, setIsNewRecord] = useState(false);
  const [driveDirection, setDriveDirection] =
    useState<IceDriveDirection>('forward');
  const [steeringCommand, setSteeringCommand] = useState(0);
  const [driveButtonPressed, setDriveButtonPressed] = useState(false);

  useTrackScreenView('Мобильная игра — Заливка льда');

  const releaseAllControls = useCallback((reason: string) => {
    const hadActiveControl =
      controlsRef.current.drivePressed || controlsRef.current.steering !== 0;
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
   * requestAnimationFrame на ProMotion-экране может приходить 120 раз/с.
   * Физика здесь работает фиксированно 30 раз/с, React не обновляется чаще,
   * а после победы/аварии и в фоне цикл полностью останавливается.
   */
  useEffect(() => {
    let disposed = false;

    const isTerminalPhase = () =>
      engineRef.current.phase === 'won' || engineRef.current.phase === 'crashed';

    function scheduleFrame() {
      if (
        disposed ||
        !isAppActiveRef.current ||
        isTerminalPhase() ||
        animationFrameRef.current !== null
      ) {
        return;
      }
      animationFrameRef.current = requestAnimationFrame(frame);
    }

    function frame(timestamp: number) {
      animationFrameRef.current = null;
      if (disposed || !isAppActiveRef.current || isTerminalPhase()) return;

      if (lastFrameTimestampRef.current === null) {
        lastFrameTimestampRef.current = timestamp;
        scheduleFrame();
        return;
      }

      const maximumFrameDelta =
        CONFIG.PHYSICS_STEP_MS * CONFIG.MAX_PHYSICS_STEPS_PER_FRAME;
      const deltaMs = Math.min(
        Math.max(0, timestamp - lastFrameTimestampRef.current),
        maximumFrameDelta
      );
      lastFrameTimestampRef.current = timestamp;
      physicsAccumulatorRef.current += deltaMs;

      let physicsSteps = 0;
      while (
        physicsAccumulatorRef.current >= CONFIG.PHYSICS_STEP_MS &&
        physicsSteps < CONFIG.MAX_PHYSICS_STEPS_PER_FRAME &&
        !isTerminalPhase()
      ) {
        stepIceGame(
          engineRef.current,
          controlsRef.current,
          CONFIG.PHYSICS_STEP_MS / 1000
        );
        physicsAccumulatorRef.current -= CONFIG.PHYSICS_STEP_MS;
        uiAccumulatorRef.current += CONFIG.PHYSICS_STEP_MS;
        coveragePathAccumulatorRef.current += CONFIG.PHYSICS_STEP_MS;
        physicsSteps += 1;
      }

      // После большой паузы не пытаемся проиграть сотни пропущенных кадров.
      if (physicsSteps >= CONFIG.MAX_PHYSICS_STEPS_PER_FRAME) {
        physicsAccumulatorRef.current = Math.min(
          physicsAccumulatorRef.current,
          CONFIG.PHYSICS_STEP_MS
        );
      }

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

      if (
        physicsSteps > 0 &&
        (uiAccumulatorRef.current >= CONFIG.UI_FRAME_INTERVAL_MS ||
          isTerminalPhase())
      ) {
        uiAccumulatorRef.current = 0;
        setSnapshot(createIceGameSnapshot(engineRef.current, coveragePathRef.current));
      }

      if (isTerminalPhase()) {
        releaseAllControls('игра завершена');
        return;
      }
      scheduleFrame();
    }

    resumeAnimationLoopRef.current = () => {
      lastFrameTimestampRef.current = null;
      physicsAccumulatorRef.current = 0;
      scheduleFrame();
    };
    scheduleFrame();

    return () => {
      disposed = true;
      resumeAnimationLoopRef.current = () => undefined;
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
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
        setDriveDirection('forward');
        setSteeringCommand(0);
        setDriveButtonPressed(false);
        if (animationFrameRef.current !== null) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
        lastFrameTimestampRef.current = null;
        physicsAccumulatorRef.current = 0;
      } else {
        resumeAnimationLoopRef.current();
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
    setDriveDirection('forward');
    setSteeringCommand(0);
    setDriveButtonPressed(false);
    const newEngine = createInitialIceGameState();
    engineRef.current = newEngine;
    coveragePathRef.current = buildCoveragePath(newEngine);
    lastCoverageRevisionRef.current = newEngine.coverageRevision;
    lastFrameTimestampRef.current = null;
    physicsAccumulatorRef.current = 0;
    uiAccumulatorRef.current = 0;
    coveragePathAccumulatorRef.current = 0;
    victoryStoredRef.current = false;
    setIsNewRecord(false);
    setSnapshot(createIceGameSnapshot(newEngine, coveragePathRef.current));
    resumeAnimationLoopRef.current();
    logIceGame('Игра перезапущена пользователем');
  }, [releaseAllControls]);

  const handleBack = useCallback(() => {
    releaseAllControls('выход из игры');
    router.back();
  }, [releaseAllControls, router]);

  const canControl = snapshot.phase === 'playing' || snapshot.phase === 'returning';

  const setSteering = useCallback((direction: -1 | 1, active: boolean) => {
    const state = engineRef.current;
    const allowed = state.phase === 'playing' || state.phase === 'returning';
    if (active && !allowed) return;

    // onPressOut от старой кнопки не должен сбросить новую команду, если
    // пользователь успел перенести палец с левой стрелки на правую.
    const currentSteering = controlsRef.current.steering;
    const nextSteering = active
      ? direction
      : currentSteering === direction
        ? 0
        : currentSteering;
    if (currentSteering === nextSteering) return;

    controlsRef.current.steering = nextSteering;
    setSteeringCommand(nextSteering);
    logIceGame(
      `Руль ${direction < 0 ? 'влево' : 'вправо'}: ${active ? 'нажат' : 'отпущен'}`,
      {
        requestedSteering: nextSteering,
        wheelAngleDegrees: Number(
          ((state.steeringAngle * 180) / Math.PI).toFixed(1)
        ),
        speed: Number(state.speed.toFixed(1)),
        phase: state.phase,
      }
    );
  }, []);

  const setDriveActive = useCallback((active: boolean) => {
    const state = engineRef.current;
    const allowed = state.phase === 'playing' || state.phase === 'returning';
    if (active && !allowed) return;
    const nextValue = active && allowed;
    if (controlsRef.current.drivePressed === nextValue) return;

    controlsRef.current.drivePressed = nextValue;
    setDriveButtonPressed(nextValue);
    logIceGame(`Кнопка хода: ${nextValue ? 'нажата' : 'отпущена'}`, {
      actualSpeedPercent: Math.round(
        (Math.abs(state.speed) / CONFIG.MAX_FORWARD_SPEED) * 100
      ),
      direction: controlsRef.current.direction,
      boardSpeedLimitPercent: Math.round(state.boardSpeedLimitRatio * 100),
      phase: state.phase,
    });
  }, []);

  const selectDirection = useCallback((direction: IceDriveDirection) => {
    const state = engineRef.current;
    const allowed = state.phase === 'playing' || state.phase === 'returning';
    if (!allowed || controlsRef.current.direction === direction) return;
    controlsRef.current.direction = direction;
    setDriveDirection(direction);
    logIceGame(`Рычаг: ${direction === 'forward' ? 'вперёд' : 'назад'}`, {
      speed: Number(state.speed.toFixed(1)),
      drivePressed: controlsRef.current.drivePressed,
      phase: state.phase,
    });
  }, []);

  const speedPercent = Math.round(
    (Math.abs(snapshot.speed) / CONFIG.MAX_FORWARD_SPEED) * 100
  );
  const boardLimitPercent = Math.round(snapshot.boardSpeedLimitRatio * 100);
  const isBoardLimiterActive = boardLimitPercent < 100;
  const wheelAngleDegrees = Math.round((snapshot.steeringAngle * 180) / Math.PI);
  const actualDirectionText =
    Math.abs(snapshot.speed) < 0.5
      ? 'стоп'
      : snapshot.speed > 0
        ? 'вперёд'
        : 'назад';
  const remainingPercent = Math.max(0, snapshot.remainingPercent);
  const displayedRemainingPercent =
    remainingPercent > 0 && remainingPercent < 1
      ? remainingPercent.toFixed(3)
      : remainingPercent.toFixed(1);
  const phaseMessage = snapshot.incompleteReturnWarning
    ? 'Заливка ещё не завершена. Вернитесь на лёд и закончите работу.'
    : snapshot.phase === 'returning' && !snapshot.timerFinished
      ? 'Ворота открыты — залейте больше 99% площадки'
      : snapshot.phase === 'playing' && !snapshot.timerStarted
        ? 'Зажмите кнопку хода и выезжайте на лёд'
        : PHASE_TEXT[snapshot.phase];
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
          snapshot.incompleteReturnWarning && styles.phaseBannerIncomplete,
        ]}
      >
        <Text
          style={[
            styles.phaseText,
            snapshot.phase === 'returning' && styles.phaseTextReturning,
            snapshot.phase === 'crashed' && styles.phaseTextError,
            snapshot.incompleteReturnWarning && styles.phaseTextIncomplete,
          ]}
          numberOfLines={snapshot.incompleteReturnWarning ? 2 : 1}
          adjustsFontSizeToFit
        >
          {phaseMessage}
        </Text>
      </View>

      <View style={styles.rinkContainer}>
        <IceRink snapshot={snapshot} />
      </View>

      {/* Левый и правый контуры используют независимые идентификаторы касаний:
          руль можно держать левой рукой одновременно с газом под правой. */}
      <View style={styles.controlsPanel}>
        <View style={styles.controlInfoRow}>
          <View style={styles.directionBlock}>
            <Text style={styles.controlSectionLabel}>РЫЧАГ</Text>
            <View style={styles.directionSwitch}>
              <Pressable
                disabled={!canControl}
                onPress={() => selectDirection('forward')}
                accessibilityRole="button"
                accessibilityState={{ selected: driveDirection === 'forward' }}
                accessibilityLabel="Рычаг вперёд"
                style={[
                  styles.directionButton,
                  driveDirection === 'forward' && styles.directionButtonActive,
                  !canControl && styles.controlButtonDisabled,
                ]}
              >
                <Icon
                  name="chevron-up"
                  size={14}
                  color={driveDirection === 'forward' ? colors.white : colors.primary}
                />
                <Text
                  style={[
                    styles.directionButtonText,
                    driveDirection === 'forward' && styles.directionButtonTextActive,
                  ]}
                >
                  ВПЕРЁД
                </Text>
              </Pressable>
              <Pressable
                disabled={!canControl}
                onPress={() => selectDirection('reverse')}
                accessibilityRole="button"
                accessibilityState={{ selected: driveDirection === 'reverse' }}
                accessibilityLabel="Рычаг назад"
                style={[
                  styles.directionButton,
                  driveDirection === 'reverse' && styles.directionButtonReverseActive,
                  !canControl && styles.controlButtonDisabled,
                ]}
              >
                <Icon
                  name="chevron-down"
                  size={14}
                  color={driveDirection === 'reverse' ? colors.white : colors.primary}
                />
                <Text
                  style={[
                    styles.directionButtonText,
                    driveDirection === 'reverse' && styles.directionButtonTextActive,
                  ]}
                >
                  НАЗАД
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.speedBlock}>
            <View style={styles.speedHeaderRow}>
              <Text style={styles.controlSectionLabel}>ФАКТИЧЕСКАЯ СКОРОСТЬ</Text>
              <Text style={styles.speedValue}>{speedPercent}%</Text>
            </View>
            <View style={styles.speedTrack}>
              <View style={[styles.speedFill, { width: `${speedPercent}%` }]} />
              {isBoardLimiterActive && (
                <View
                  style={[
                    styles.boardLimitMarker,
                    { left: `${boardLimitPercent}%` },
                  ]}
                />
              )}
            </View>
            <Text
              style={[
                styles.speedMetaText,
                isBoardLimiterActive && styles.speedMetaTextLimited,
              ]}
              numberOfLines={1}
            >
              {isBoardLimiterActive
                ? `Лимит у борта: ${boardLimitPercent}%`
                : `${actualDirectionText} · отпускание — торможение`}
            </Text>
          </View>
        </View>

        <View style={styles.controlsMainRow}>
          <View style={styles.steeringGroup}>
            <Text style={styles.controlSectionLabel}>РУЛЬ</Text>
            <View style={styles.steeringButtonsRow}>
              <HoldControlButton
                active={steeringCommand === -1}
                disabled={!canControl}
                accessibilityLabel="Удерживать поворот влево"
                onActiveChange={active => setSteering(-1, active)}
                style={styles.steerButton}
                activeStyle={styles.controlButtonPressed}
              >
                <Icon name="arrow-back" size={38} color={colors.primary} />
              </HoldControlButton>

              <HoldControlButton
                active={steeringCommand === 1}
                disabled={!canControl}
                accessibilityLabel="Удерживать поворот вправо"
                onActiveChange={active => setSteering(1, active)}
                style={styles.steerButton}
                activeStyle={styles.controlButtonPressed}
              >
                <Icon name="arrow-forward" size={38} color={colors.primary} />
              </HoldControlButton>
            </View>
          </View>

          <View
            style={styles.wheelStatus}
            accessibilityLabel={`Передние колёса ${wheelAngleDegrees} градусов`}
          >
            <View style={styles.wheelAxle}>
              <View
                style={[
                  styles.wheelIndicator,
                  { transform: [{ rotate: `${wheelAngleDegrees}deg` }] },
                ]}
              />
              <View
                style={[
                  styles.wheelIndicator,
                  { transform: [{ rotate: `${wheelAngleDegrees}deg` }] },
                ]}
              />
            </View>
            <Text style={styles.wheelStatusLabel}>ПЕРЕДНИЕ КОЛЁСА</Text>
            <Text style={styles.wheelStatusValue}>
              {wheelAngleDegrees === 0
                ? 'прямо'
                : `${Math.abs(wheelAngleDegrees)}° ${wheelAngleDegrees < 0 ? 'влево' : 'вправо'}`}
            </Text>
          </View>

          <View style={styles.driveButtonGroup}>
            <Text style={[styles.controlSectionLabel, styles.driveSectionLabel]}>
              ХОД
            </Text>
            <HoldControlButton
              active={driveButtonPressed}
              disabled={!canControl}
              accessibilityLabel={`Удерживать движение ${
                driveDirection === 'forward' ? 'вперёд' : 'назад'
              }`}
              onActiveChange={setDriveActive}
              style={styles.driveButton}
              activeStyle={styles.driveButtonPressed}
            >
              <Icon
                name={driveDirection === 'forward' ? 'chevron-up' : 'chevron-down'}
                size={31}
                color={driveButtonPressed ? colors.white : colors.primary}
              />
              <Text
                style={[
                  styles.driveButtonText,
                  driveButtonPressed && styles.driveButtonTextPressed,
                ]}
              >
                {driveDirection === 'forward' ? 'ВПЕРЁД' : 'НАЗАД'}
              </Text>
            </HoldControlButton>
          </View>
        </View>
        <Text style={styles.brakingHint}>
          Отпустите кнопку хода, чтобы плавно остановиться
        </Text>
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
                    ? `${Math.max(0, 100 - snapshot.remainingPercent).toFixed(2)}%`
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
  phaseBannerIncomplete: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: '#D69A25',
    backgroundColor: '#FFF4D9',
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
  phaseTextIncomplete: {
    color: '#8A5810',
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
    paddingTop: 6,
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
  controlInfoRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  directionBlock: {
    width: 116,
  },
  controlSectionLabel: {
    color: colors.textSecondary,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  directionSwitch: {
    height: 38,
    flexDirection: 'row',
    marginTop: 3,
    padding: 2,
    borderWidth: 1,
    borderColor: '#C8D5DE',
    borderRadius: 11,
    backgroundColor: '#EDF2F5',
  },
  directionButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  directionButtonActive: {
    backgroundColor: colors.primary,
  },
  directionButtonReverseActive: {
    backgroundColor: '#526B7D',
  },
  directionButtonText: {
    marginTop: -3,
    color: colors.primary,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.15,
  },
  directionButtonTextActive: {
    color: colors.white,
  },
  speedBlock: {
    flex: 1,
    minWidth: 0,
  },
  speedHeaderRow: {
    height: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  speedValue: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  speedTrack: {
    height: 9,
    marginTop: 3,
    overflow: 'hidden',
    borderRadius: 5,
    backgroundColor: '#DFE7EC',
  },
  speedFill: {
    height: '100%',
    borderRadius: 5,
    backgroundColor: colors.accent,
  },
  boardLimitMarker: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 3,
    marginLeft: -2,
    backgroundColor: '#B96817',
  },
  speedMetaText: {
    marginTop: 4,
    color: colors.textSecondary,
    fontSize: 8,
    fontWeight: '700',
  },
  speedMetaTextLimited: {
    color: '#A76017',
  },
  controlsMainRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 5,
  },
  steeringGroup: {
    width: 168,
  },
  steeringButtonsRow: {
    height: 66,
    flexDirection: 'row',
    gap: 6,
    marginTop: 3,
  },
  steerButton: {
    flex: 1,
    height: 66,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#B7C8D5',
    borderRadius: 20,
    backgroundColor: '#F5F8FA',
  },
  wheelStatus: {
    flex: 1,
    height: 59,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 5,
  },
  wheelAxle: {
    height: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 17,
  },
  wheelIndicator: {
    width: 5,
    height: 14,
    borderRadius: 2.5,
    backgroundColor: colors.primary,
  },
  wheelStatusLabel: {
    marginTop: 1,
    color: colors.textSecondary,
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 0.45,
  },
  wheelStatusValue: {
    marginTop: 1,
    color: colors.primary,
    fontSize: 9,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  driveButtonGroup: {
    width: 96,
  },
  driveSectionLabel: {
    textAlign: 'right',
  },
  driveButton: {
    width: 96,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 3,
    borderWidth: 3,
    borderColor: '#B7C8D5',
    borderRadius: 20,
    backgroundColor: '#F5F8FA',
    shadowColor: colors.primary,
    shadowOpacity: 0.22,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  driveButtonPressed: {
    transform: [{ scale: 0.95 }],
    borderColor: colors.accent,
    backgroundColor: colors.primary,
  },
  driveButtonText: {
    marginTop: -4,
    color: colors.primary,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.65,
  },
  driveButtonTextPressed: {
    color: colors.white,
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
    marginTop: 0,
    color: colors.textSecondary,
    fontSize: 9,
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
