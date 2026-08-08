import React, { memo, useEffect, useMemo, useRef } from 'react';
import { Animated } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  Path,
  Pattern,
  Rect,
} from 'react-native-svg';
import { FIVE_IN_ROW_CONFIG as CONFIG } from './gameConfig';
import {
  FiveInRowMove,
  GridPoint,
  WinningLine,
} from './gameEngine';

const AnimatedPath = Animated.createAnimatedComponent(Path);

interface PaperBoardProps {
  width: number;
  height: number;
  center: GridPoint;
  cellSize: number;
  moves: FiveInRowMove[];
  lastMove: FiveInRowMove | null;
  winningLine: WinningLine | null;
}

const deterministicJitter = (x: number, y: number, salt: number) => {
  const value = Math.sin(x * 12.9898 + y * 78.233 + salt * 37.719) * 43758.5453;
  return (value - Math.floor(value) - 0.5) * 2;
};

interface InkMarkProps {
  move: FiveInRowMove;
  screenX: number;
  screenY: number;
  cellSize: number;
}

/** Один знак рисуется один раз, как два штриха или непрерывная окружность. */
const InkMark = memo(function InkMark({
  move,
  screenX,
  screenY,
  cellSize,
}: InkMarkProps) {
  const progress = useRef(new Animated.Value(0)).current;
  const radius = cellSize * 0.29;
  const jitterX = deterministicJitter(move.x, move.y, 1) * cellSize * 0.025;
  const jitterY = deterministicJitter(move.x, move.y, 2) * cellSize * 0.025;
  const strokeWidth = Math.max(2.2, cellSize * 0.075);
  const lineLength = cellSize * 0.86;
  const circleLength = Math.PI * radius * 2.12;

  useEffect(() => {
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: CONFIG.MARK_DRAW_DURATION_MS,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const firstStrokeOffset = progress.interpolate({
    inputRange: [0, 0.52, 1],
    outputRange: [lineLength, 0, 0],
    extrapolate: 'clamp',
  });
  const secondStrokeOffset = progress.interpolate({
    inputRange: [0, 0.42, 1],
    outputRange: [lineLength, lineLength, 0],
    extrapolate: 'clamp',
  });
  const circleOffset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [circleLength, 0],
  });

  if (move.mark === 'x') {
    const left = screenX - radius + jitterX;
    const right = screenX + radius + jitterX;
    const top = screenY - radius + jitterY;
    const bottom = screenY + radius + jitterY;
    const bend = cellSize * 0.045;
    return (
      <G>
        <AnimatedPath
          d={`M${left} ${top} Q${screenX + bend} ${screenY - bend} ${right} ${bottom}`}
          fill="none"
          stroke="#214C82"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={`${lineLength} ${lineLength}`}
          strokeDashoffset={firstStrokeOffset}
        />
        <AnimatedPath
          d={`M${right - bend * 0.25} ${top + bend * 0.15} Q${screenX - bend} ${screenY + bend} ${left + bend * 0.1} ${bottom - bend * 0.1}`}
          fill="none"
          stroke="#214C82"
          strokeWidth={strokeWidth * 0.93}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={`${lineLength} ${lineLength}`}
          strokeDashoffset={secondStrokeOffset}
        />
      </G>
    );
  }

  const cx = screenX + jitterX;
  const cy = screenY + jitterY;
  const uneven = deterministicJitter(move.x, move.y, 3) * cellSize * 0.025;
  return (
    <AnimatedPath
      d={[
        `M${cx + uneven} ${cy - radius}`,
        `C${cx + radius * 0.68} ${cy - radius * 1.03}, ${cx + radius * 1.05} ${cy - radius * 0.46}, ${cx + radius} ${cy + uneven}`,
        `C${cx + radius * 0.97} ${cy + radius * 0.7}, ${cx + radius * 0.44} ${cy + radius * 1.03}, ${cx - uneven} ${cy + radius}`,
        `C${cx - radius * 0.72} ${cy + radius * 0.98}, ${cx - radius * 1.04} ${cy + radius * 0.39}, ${cx - radius} ${cy - uneven}`,
        `C${cx - radius * 0.96} ${cy - radius * 0.72}, ${cx - radius * 0.42} ${cy - radius * 1.02}, ${cx + uneven} ${cy - radius}`,
      ].join(' ')}
      fill="none"
      stroke="#C4543D"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={`${circleLength} ${circleLength}`}
      strokeDashoffset={circleOffset}
    />
  );
});

interface WinStrokeProps {
  start: GridPoint;
  end: GridPoint;
  toScreen: (point: GridPoint) => GridPoint;
  cellSize: number;
}

const WinStroke = memo(function WinStroke({
  start,
  end,
  toScreen,
  cellSize,
}: WinStrokeProps) {
  const progress = useRef(new Animated.Value(0)).current;
  const startScreen = toScreen(start);
  const endScreen = toScreen(end);
  const length = Math.max(
    cellSize,
    Math.hypot(endScreen.x - startScreen.x, endScreen.y - startScreen.y)
  );

  useEffect(() => {
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: CONFIG.WIN_LINE_DRAW_DURATION_MS,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const dashOffset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [length, 0],
  });

  return (
    <AnimatedPath
      d={`M${startScreen.x} ${startScreen.y} L${endScreen.x} ${endScreen.y}`}
      fill="none"
      stroke="#E7A51A"
      strokeWidth={Math.max(5, cellSize * 0.13)}
      strokeLinecap="round"
      strokeDasharray={`${length} ${length}`}
      strokeDashoffset={dashOffset}
      opacity={0.78}
    />
  );
});

/**
 * SVG рисует только видимые линии сетки. Знаки могут оставаться смонтированными
 * за экраном: это сохраняет их анимационное состояние при прокрутке назад.
 */
export default function PaperBoard({
  width,
  height,
  center,
  cellSize,
  moves,
  lastMove,
  winningLine,
}: PaperBoardProps) {
  const toScreen = (point: GridPoint): GridPoint => ({
    x: width / 2 + (point.x - center.x) * cellSize,
    y: height / 2 + (point.y - center.y) * cellSize,
  });

  const gridPaths = useMemo(() => {
    if (width <= 0 || height <= 0) return { minor: '', major: '' };
    const minWorldX = center.x - width / cellSize / 2;
    const maxWorldX = center.x + width / cellSize / 2;
    const minWorldY = center.y - height / cellSize / 2;
    const maxWorldY = center.y + height / cellSize / 2;
    const firstVertical = Math.floor(minWorldX - 0.5);
    const lastVertical = Math.ceil(maxWorldX - 0.5);
    const firstHorizontal = Math.floor(minWorldY - 0.5);
    const lastHorizontal = Math.ceil(maxWorldY - 0.5);
    const minor: string[] = [];
    const major: string[] = [];

    for (let index = firstVertical; index <= lastVertical; index += 1) {
      const x = width / 2 + (index + 0.5 - center.x) * cellSize;
      const target = (index + 1) % 5 === 0 ? major : minor;
      target.push(`M${x.toFixed(2)} 0V${height.toFixed(2)}`);
    }
    for (let index = firstHorizontal; index <= lastHorizontal; index += 1) {
      const y = height / 2 + (index + 0.5 - center.y) * cellSize;
      const target = (index + 1) % 5 === 0 ? major : minor;
      target.push(`M0 ${y.toFixed(2)}H${width.toFixed(2)}`);
    }
    return { minor: minor.join(' '), major: major.join(' ') };
  }, [cellSize, center.x, center.y, height, width]);

  const lastMoveScreen = lastMove ? toScreen(lastMove) : null;
  const firstWinningCell = winningLine?.cells[0];
  const lastWinningCell = winningLine?.cells[winningLine.cells.length - 1];

  return (
    <Svg width={width} height={height} accessibilityLabel="Бесконечное поле в клетку">
      <Defs>
        <Pattern id="paperFibers" patternUnits="userSpaceOnUse" width="58" height="46">
          <Rect width="58" height="46" fill="#F7F1E3" />
          <Path
            d="M2 8 C13 5 22 10 34 7 M19 31 C31 27 42 34 56 29 M4 42 L15 40"
            fill="none"
            stroke="#D6CDBB"
            strokeWidth="0.75"
            opacity="0.42"
          />
          <Circle cx="8" cy="22" r="0.8" fill="#C8BDA8" opacity="0.4" />
          <Circle cx="47" cy="15" r="0.65" fill="#FFFFFF" opacity="0.75" />
          <Circle cx="36" cy="41" r="0.7" fill="#BFB39E" opacity="0.32" />
        </Pattern>
      </Defs>

      <Rect width={width} height={height} fill="url(#paperFibers)" />
      <Path
        d={gridPaths.minor}
        fill="none"
        stroke="#A9C8D9"
        strokeWidth="0.85"
        opacity="0.78"
      />
      <Path
        d={gridPaths.major}
        fill="none"
        stroke="#85B2CC"
        strokeWidth="1.05"
        opacity="0.7"
      />

      {lastMoveScreen && !winningLine && (
        <Circle
          cx={lastMoveScreen.x}
          cy={lastMoveScreen.y}
          r={cellSize * 0.39}
          fill="none"
          stroke="#E3A21A"
          strokeWidth="1.4"
          strokeDasharray="3 4"
          opacity="0.68"
        />
      )}

      {moves.map(move => {
        const screen = toScreen(move);
        return (
          <InkMark
            key={move.moveNumber}
            move={move}
            screenX={screen.x}
            screenY={screen.y}
            cellSize={cellSize}
          />
        );
      })}

      {winningLine && firstWinningCell && lastWinningCell && (
        <WinStroke
          start={firstWinningCell}
          end={lastWinningCell}
          toScreen={toScreen}
          cellSize={cellSize}
        />
      )}
    </Svg>
  );
}
