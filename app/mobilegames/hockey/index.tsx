// app/mobilegames/hockey/index.tsx
import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Svg, { Rect, Circle, Path } from 'react-native-svg';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import Icon from '../../../components/Icon';
import { colors, commonStyles } from '../../../styles/commonStyles';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// === НАСТРОЙКИ ПОЛЯ ===
const PADDING = 24;
const FIELD_WIDTH = SCREEN_WIDTH - 2 * PADDING;
const FIELD_HEIGHT = SCREEN_HEIGHT * 0.55; // оставляем место под счёт и кнопку
const GOAL_WIDTH = 140;
const GOAL_HEIGHT = 50;

// 1. СКРУГЛЕНИЕ АРЕНЫ — увеличено (было 30, стало 60)
const FIELD_CORNER_RADIUS = 60; // ← ← ← МЕНЯЙТЕ ЭТОТ ПАРАМЕТР, ЧТОБЫ ИЗМЕНИТЬ РАДИУС УГЛОВ

const GOALIE_WIDTH = GOAL_WIDTH / 2; // 3. Ширина вратаря = 1/2 ширины ворот
const GOALIE_HEIGHT = 24;
const GOALIE_TOP_OFFSET = 20; // расстояние от верхней границы поля до вратаря

// 5. ОСТРОВОК — высота увеличена, добавлена выпуклость
const PADDLE_WIDTH = 100;
const PADDLE_HEIGHT = 40; // высота увеличена для удобства управления
const PADDLE_CURVATURE_RADIUS = 30; // ← ← ← РАДИУС ВЫПУКЛОСТИ ВЕРХНЕЙ ГРАНИ ОСТРОВКА

const PUCK_RADIUS = 14;

const INITIAL_PUCK = {
  x: PADDING + FIELD_WIDTH / 2,
  y: PADDING + FIELD_HEIGHT - 100,
  vx: 160,
  vy: -180,
};

export default function HockeyGameScreen() {
  const router = useRouter();
  const [puck, setPuck] = useState(INITIAL_PUCK);
  const [paddleX, setPaddleX] = useState(PADDING + (FIELD_WIDTH - PADDLE_WIDTH) / 2);
  const [score, setScore] = useState(0);
  const [penalties, setPenalties] = useState(0);
  const lastTimeRef = useRef<number | null>(null);

  const handleBackPress = () => {
    router.back();
  };

  const updatePuck = (deltaTime: number) => {
    setPuck((prev) => {
      let { x, y, vx, vy } = prev;
      const dt = deltaTime / 1000;

      x += vx * dt;
      y += vy * dt;

      // === ОТСКОК ОТ ВЕРХНЕЙ ГРАНИЦЫ ===
      if (y - PUCK_RADIUS <= PADDING) {
        y = PADDING + PUCK_RADIUS;
        vy = -vy * 0.95;
      }

      // === ОТСКОК ОТ ЛЕВОЙ/ПРАВОЙ ГРАНИЦ ===
      // Учитываем скругление: если шайба в угловой зоне — отскок как от окружности
      const leftCornerCenterX = PADDING + FIELD_CORNER_RADIUS;
      const leftCornerCenterY = PADDING + FIELD_CORNER_RADIUS;
      const rightCornerCenterX = PADDING + FIELD_WIDTH - FIELD_CORNER_RADIUS;
      const rightCornerCenterY = PADDING + FIELD_CORNER_RADIUS;

      const handleCornerCollision = (
        cx: number,
        cy: number
      ): { x: number; y: number; vx: number; vy: number } | null => {
        const dx = x - cx;
        const dy = y - cy;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance + PUCK_RADIUS <= FIELD_CORNER_RADIUS) return null;

        if (distance < FIELD_CORNER_RADIUS + PUCK_RADIUS) {
          // Нормаль от центра угла к шайбе
          const nx = dx / distance;
          const ny = dy / distance;

          // Отражение скорости
          const dot = vx * nx + vy * ny;
          vx -= 2 * dot * nx;
          vy -= 2 * dot * ny;

          // Выталкиваем шайбу за пределы угла
          const overlap = FIELD_CORNER_RADIUS + PUCK_RADIUS - distance;
          x += nx * overlap;
          y += ny * overlap;

          return { x, y, vx: vx * 0.95, vy: vy * 0.95 };
        }
        return null;
      };

      // Проверка левого угла
      const leftCollision = handleCornerCollision(leftCornerCenterX, leftCornerCenterY);
      if (leftCollision) {
        return leftCollision;
      }

      // Проверка правого угла
      const rightCollision = handleCornerCollision(rightCornerCenterX, rightCornerCenterY);
      if (rightCollision) {
        return rightCollision;
      }

      // Прямые стенки (вертикальные участки вне углов)
      if (x - PUCK_RADIUS <= PADDING && y > PADDING + FIELD_CORNER_RADIUS) {
        x = PADDING + PUCK_RADIUS;
        vx = -vx * 0.95;
      } else if (
        x + PUCK_RADIUS >= PADDING + FIELD_WIDTH &&
        y > PADDING + FIELD_CORNER_RADIUS
      ) {
        x = PADDING + FIELD_WIDTH - PUCK_RADIUS;
        vx = -vx * 0.95;
      }

      // === ВЫЛЕТ ВНИЗ → штраф ===
      if (y - PUCK_RADIUS > PADDING + FIELD_HEIGHT) {
        setPenalties((p) => p + 1);
        // Сброс шайбы
        return { ...INITIAL_PUCK, x: PADDING + Math.random() * FIELD_WIDTH };
      }

      // === ВЫЛЕТ ВВЕРХ В ЗОНУ ВОРОТ → гол ===
      const inGoalZoneHorizontally =
        x >= PADDING + (FIELD_WIDTH - GOAL_WIDTH) / 2 &&
        x <= PADDING + (FIELD_WIDTH + GOAL_WIDTH) / 2;
      if (y + PUCK_RADIUS < PADDING && inGoalZoneHorizontally) {
        setScore((s) => s + 1);
        // Сброс шайбы
        return { ...INITIAL_PUCK, x: PADDING + Math.random() * FIELD_WIDTH };
      }

      // === ВРАТАРЬ (перед воротами) ===
      const goalieTop = PADDING + GOALIE_TOP_OFFSET;
      const goalieLeft = PADDING + (FIELD_WIDTH - GOALIE_WIDTH) / 2;
      const goalieRight = goalieLeft + GOALIE_WIDTH;
      const goalieBottom = goalieTop + GOALIE_HEIGHT;

      if (
        x + PUCK_RADIUS >= goalieLeft &&
        x - PUCK_RADIUS <= goalieRight &&
        y - PUCK_RADIUS <= goalieBottom &&
        y + PUCK_RADIUS >= goalieTop
      ) {
        // Упрощённый прямоугольный отскок
        if (y < goalieTop) {
          y = goalieTop - PUCK_RADIUS;
          vy = -Math.abs(vy) * 0.95;
        } else {
          // Сбоку
          if (x < goalieLeft) {
            x = goalieLeft - PUCK_RADIUS;
            vx = -Math.abs(vx) * 0.95;
          } else {
            x = goalieRight + PUCK_RADIUS;
            vx = Math.abs(vx) * 0.95;
          }
        }
        return { x, y, vx, vy };
      }

      // === ОСТРОВОК (ракетка) с ВЫПУКЛОЙ ГРАНЬЮ ===
      const paddleTopY = PADDING + FIELD_HEIGHT - PADDLE_HEIGHT;
      const paddleCenterX = paddleX + PADDLE_WIDTH / 2;

      // Проверяем, попала ли шайба в зону действия выпуклости
      const dxPaddle = x - paddleCenterX;
      const dyPaddle = y - (paddleTopY + PADDLE_CURVATURE_RADIUS);
      const distToPaddleArc = Math.sqrt(dxPaddle * dxPaddle + dyPaddle * dyPaddle);

      if (
        y > paddleTopY &&
        x >= paddleX &&
        x <= paddleX + PADDLE_WIDTH &&
        distToPaddleArc <= PUCK_RADIUS + PADDLE_CURVATURE_RADIUS
      ) {
        // Нормаль от центра дуги к шайбе
        const nx = dxPaddle / distToPaddleArc;
        const ny = dyPaddle / distToPaddleArc;

        // Отражение
        const dot = vx * nx + vy * ny;
        vx -= 2 * dot * nx;
        vy -= 2 * dot * ny;

        // Выталкиваем
        const overlap = PUCK_RADIUS + PADDLE_CURVATURE_RADIUS - distToPaddleArc;
        x += nx * overlap;
        y += ny * overlap;

        // Добавляем немного энергии
        return { x, y, vx: vx * 1.05, vy: vy * 1.05 };
      }

      return { x, y, vx, vy };
    });
  };

  useEffect(() => {
    const loop = (timestamp: number) => {
      if (lastTimeRef.current) {
        const delta = timestamp - lastTimeRef.current;
        updatePuck(delta);
      }
      lastTimeRef.current = timestamp;
      requestAnimationFrame(loop);
    };
    const id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, []);

  const onGestureEvent = (event: any) => {
    if (event.nativeEvent.state === State.ACTIVE) {
      const newX = event.nativeEvent.x - PADDLE_WIDTH / 2;
      const clampedX = Math.max(PADDING, Math.min(newX, PADDING + FIELD_WIDTH - PADDLE_WIDTH));
      setPaddleX(clampedX);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
          <Icon name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={commonStyles.title}>🏒 Хоккей</Text>
        <View style={styles.scoreContainer}>
          <Text style={styles.scoreText}>Голы: {score}</Text>
          <Text style={[styles.scoreText, { color: colors.error }]}>Штраф: {penalties}</Text>
        </View>
      </View>

      {/* Игровое поле */}
      <View style={styles.gameArea}>
        <PanGestureHandler onGestureEvent={onGestureEvent}>
          <View style={styles.field}>
            <Svg width={SCREEN_WIDTH} height={FIELD_HEIGHT + 2 * PADDING}>
              {/* АРЕНА с увеличенным скруглением */}
              <Rect
                x={PADDING}
                y={PADDING}
                width={FIELD_WIDTH}
                height={FIELD_HEIGHT}
                rx={FIELD_CORNER_RADIUS} // ← ← ← СКРУГЛЕНИЕ ЗДЕСЬ
                ry={FIELD_CORNER_RADIUS}
                fill="none"
                stroke={colors.text}
                strokeWidth="2"
              />

              {/* Ворота (свободная зона вверху) */}
              <Rect
                x={PADDING + (FIELD_WIDTH - GOAL_WIDTH) / 2}
                y={PADDING - GOAL_HEIGHT}
                width={GOAL_WIDTH}
                height={GOAL_HEIGHT}
                fill="lightgreen"
                opacity={0.4}
              />

              {/* Вратарь (перед воротами, ширина = 1/2 ворот) */}
              <Rect
                x={PADDING + (FIELD_WIDTH - GOALIE_WIDTH) / 2}
                y={PADDING + GOALIE_TOP_OFFSET}
                width={GOALIE_WIDTH}
                height={GOALIE_HEIGHT}
                fill="red"
                opacity={0.6}
              />

              {/* Островок (ракетка) */}
              {/* Для простоты отрисовки — прямоугольник, но логика отскока учитывает выпуклость */}
              <Rect
                x={paddleX}
                y={PADDING + FIELD_HEIGHT - PADDLE_HEIGHT}
                width={PADDLE_WIDTH}
                height={PADDLE_HEIGHT}
                fill="blue"
                opacity={0.8}
                rx={8} // небольшое скругление для внешнего вида
              />

              {/* Шайба */}
              <Circle cx={puck.x} cy={puck.y} r={PUCK_RADIUS} fill="black" />
            </Svg>
          </View>
        </PanGestureHandler>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  scoreContainer: {
    flexDirection: 'row',
    gap: 16,
  },
  scoreText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
  gameArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
  },
  field: {
    width: SCREEN_WIDTH,
    height: FIELD_HEIGHT + 2 * PADDING,
  },
});