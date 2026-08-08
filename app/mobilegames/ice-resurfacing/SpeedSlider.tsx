import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  PanResponder,
  StyleSheet,
  View,
} from 'react-native';
import { colors } from '../../../styles/commonStyles';

const THUMB_SIZE = 28;
const ACCESSIBILITY_STEP = 5;

interface SpeedSliderProps {
  /** Значение в процентах от 0 до 100. */
  value: number;
  disabled?: boolean;
  onValueChange: (value: number) => void;
  onSlidingComplete?: (value: number) => void;
}

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

/**
 * Ползунок написан на стандартном PanResponder, поэтому не требует нового
 * native-модуля и сразу работает в уже собранной Expo-конфигурации iOS.
 */
export default function SpeedSlider({
  value,
  disabled = false,
  onValueChange,
  onSlidingComplete,
}: SpeedSliderProps) {
  const [layoutWidth, setLayoutWidth] = useState(0);
  const valueRef = useRef(clampPercent(value));
  const disabledRef = useRef(disabled);
  const startValueRef = useRef(valueRef.current);
  const onValueChangeRef = useRef(onValueChange);
  const onSlidingCompleteRef = useRef(onSlidingComplete);

  useEffect(() => {
    valueRef.current = clampPercent(value);
  }, [value]);

  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  useEffect(() => {
    onValueChangeRef.current = onValueChange;
    onSlidingCompleteRef.current = onSlidingComplete;
  }, [onSlidingComplete, onValueChange]);

  const emitValue = (nextValue: number) => {
    const roundedValue = Math.round(clampPercent(nextValue));
    if (roundedValue === valueRef.current) return roundedValue;
    valueRef.current = roundedValue;
    onValueChangeRef.current(roundedValue);
    return roundedValue;
  };

  const valueFromLocation = (locationX: number) => {
    const usableWidth = Math.max(1, layoutWidth - THUMB_SIZE);
    return ((locationX - THUMB_SIZE / 2) / usableWidth) * 100;
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabledRef.current,
        onMoveShouldSetPanResponder: () => !disabledRef.current,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: event => {
          startValueRef.current = emitValue(
            valueFromLocation(event.nativeEvent.locationX)
          );
        },
        onPanResponderMove: (_event, gestureState) => {
          const usableWidth = Math.max(1, layoutWidth - THUMB_SIZE);
          emitValue(startValueRef.current + (gestureState.dx / usableWidth) * 100);
        },
        onPanResponderRelease: () => {
          onSlidingCompleteRef.current?.(valueRef.current);
        },
        onPanResponderTerminate: () => {
          onSlidingCompleteRef.current?.(valueRef.current);
        },
      }),
    // Ширина меняется только после layout/поворота экрана. Обработчики и
    // текущее значение читаются через ref и не пересоздают responder на движении.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layoutWidth]
  );

  const handleLayout = (event: LayoutChangeEvent) => {
    setLayoutWidth(event.nativeEvent.layout.width);
  };

  const normalizedValue = clampPercent(value);
  const usableWidth = Math.max(0, layoutWidth - THUMB_SIZE);
  const thumbLeft = (normalizedValue / 100) * usableWidth;

  return (
    <View
      style={[styles.touchArea, disabled && styles.disabled]}
      onLayout={handleLayout}
      accessibilityRole="adjustable"
      accessibilityLabel="Заданная скорость"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(normalizedValue) }}
      accessibilityActions={[
        { name: 'increment', label: 'Увеличить скорость' },
        { name: 'decrement', label: 'Уменьшить скорость' },
      ]}
      onAccessibilityAction={event => {
        if (disabled) return;
        const change =
          event.nativeEvent.actionName === 'increment'
            ? ACCESSIBILITY_STEP
            : -ACCESSIBILITY_STEP;
        const nextValue = emitValue(valueRef.current + change);
        onSlidingCompleteRef.current?.(nextValue);
      }}
      {...panResponder.panHandlers}
    >
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            normalizedValue >= 60 && styles.fillInSlipZone,
            { width: `${normalizedValue}%` },
          ]}
        />
        {/* Оранжевая риска показывает порог заноса при полном вывороте. */}
        <View style={styles.slipMarker} />
      </View>
      <View style={[styles.thumb, { left: thumbLeft }]}>
        <View style={styles.thumbCenter} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  touchArea: {
    height: 38,
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.42,
  },
  track: {
    height: 10,
    marginHorizontal: THUMB_SIZE / 2,
    overflow: 'hidden',
    borderRadius: 5,
    backgroundColor: '#DFE7EC',
  },
  fill: {
    height: '100%',
    borderRadius: 5,
    backgroundColor: colors.accent,
  },
  fillInSlipZone: {
    backgroundColor: '#E59B2D',
  },
  slipMarker: {
    position: 'absolute',
    left: '60%',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: '#B96817',
    opacity: 0.9,
  },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#D7E4ED',
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: colors.primary,
    shadowColor: '#0F2742',
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  thumbCenter: {
    width: 6,
    height: 12,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
    opacity: 0.92,
  },
});
