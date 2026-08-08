import React from 'react';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  G,
  Image as SvgImage,
  Line,
  LinearGradient,
  Path,
  Pattern,
  Rect,
  Stop,
} from 'react-native-svg';
import { IceGameSnapshot } from './gameEngine';
import {
  ICE_RESURFACING_CONFIG as CONFIG,
  RINK_GATE_LEFT,
  RINK_GATE_RIGHT,
} from './gameConfig';

const RESURFACER_IMAGE = require('../../../assets/games/ice-resurfacing/resurfacer.png');
const CENTER_ICE_LOGO = require('../../../assets/games/ice-resurfacing/forward-center-ice-logo.png');

const VIEWBOX_X = -34;
const VIEWBOX_Y = -76;
const VIEWBOX_WIDTH = CONFIG.RINK_WIDTH + 68;
const VIEWBOX_HEIGHT = CONFIG.RINK_HEIGHT + 106;

const gateCenter = CONFIG.RINK_WIDTH / 2;
const gateLeafWidth = CONFIG.GATE_WIDTH / 2;

/** Фиксированные зрители не «мигают» при каждом React-рендере. */
const SIDE_SPECTATORS = Array.from({ length: 58 }, (_, index) => ({
  key: `side-${index}`,
  side: index % 2 === 0 ? 'left' : 'right',
  x: index % 2 === 0 ? -22 + (index % 3) * 4 : CONFIG.RINK_WIDTH + 14 + (index % 3) * 4,
  y: 34 + ((index * 47) % 486),
  color: ['#1B365D', '#FF6B35', '#4A90E2', '#D8E0E7'][index % 4],
}));

const BOTTOM_SPECTATORS = Array.from({ length: 19 }, (_, index) => ({
  key: `bottom-${index}`,
  x: 14 + index * 16,
  y: CONFIG.RINK_HEIGHT + 19 + (index % 2) * 5,
  color: ['#1B365D', '#FF6B35', '#4A90E2', '#D8E0E7'][index % 4],
}));

interface IceRinkProps {
  snapshot: IceGameSnapshot;
}

/**
 * Вся арена нарисована в одной SVG-системе координат. Поэтому видимая кромка
 * борта, ворота и невидимая физическая граница всегда совпадают.
 */
export default function IceRink({ snapshot }: IceRinkProps) {
  const vehicleAngleDegrees = (snapshot.angle * 180) / Math.PI;
  const frontWheelAngleDegrees = (snapshot.steeringAngle * 180) / Math.PI;
  const gateAngle = snapshot.gateProgress * 84;
  const hasSkid = Math.abs(snapshot.lateralSpeed) > 5;
  const boardPath = [
    `M${RINK_GATE_LEFT} 0`,
    `H${CONFIG.RINK_CORNER_RADIUS}`,
    `Q0 0 0 ${CONFIG.RINK_CORNER_RADIUS}`,
    `V${CONFIG.RINK_HEIGHT - CONFIG.RINK_CORNER_RADIUS}`,
    `Q0 ${CONFIG.RINK_HEIGHT} ${CONFIG.RINK_CORNER_RADIUS} ${CONFIG.RINK_HEIGHT}`,
    `H${CONFIG.RINK_WIDTH - CONFIG.RINK_CORNER_RADIUS}`,
    `Q${CONFIG.RINK_WIDTH} ${CONFIG.RINK_HEIGHT} ${CONFIG.RINK_WIDTH} ${
      CONFIG.RINK_HEIGHT - CONFIG.RINK_CORNER_RADIUS
    }`,
    `V${CONFIG.RINK_CORNER_RADIUS}`,
    `Q${CONFIG.RINK_WIDTH} 0 ${CONFIG.RINK_WIDTH - CONFIG.RINK_CORNER_RADIUS} 0`,
    `H${RINK_GATE_RIGHT}`,
  ].join(' ');

  return (
    <Svg
      width="100%"
      height="100%"
      viewBox={`${VIEWBOX_X} ${VIEWBOX_Y} ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
      accessibilityLabel="Ледовая площадка игры Заливка льда"
    >
      <Defs>
        <LinearGradient id="arenaFloor" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#E9EEF2" />
          <Stop offset="1" stopColor="#C6D0D8" />
        </LinearGradient>
        <LinearGradient id="cleanIce" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#F8FEFF" />
          <Stop offset="0.35" stopColor="#DDF5FB" />
          <Stop offset="0.7" stopColor="#F5FDFF" />
          <Stop offset="1" stopColor="#CDEAF3" />
        </LinearGradient>
        <Pattern id="dirtyIce" patternUnits="userSpaceOnUse" width="42" height="38">
          <Rect width="42" height="38" fill="#CED9DC" />
          <Path
            d="M-4 8 C8 2 18 18 46 5 M3 30 C17 18 27 41 45 26"
            fill="none"
            stroke="#AAB8BC"
            strokeWidth="1.4"
            opacity="0.55"
          />
          <Path
            d="M4 17 L13 14 M25 8 L37 12 M17 34 L23 30"
            fill="none"
            stroke="#F5F7F7"
            strokeWidth="2.2"
            strokeLinecap="round"
            opacity="0.72"
          />
          <Circle cx="8" cy="25" r="1.4" fill="#B7C3C6" />
          <Circle cx="33" cy="22" r="1" fill="#F7F9F9" />
        </Pattern>
        <ClipPath id="rinkClip">
          <Rect
            x="0"
            y="0"
            width={CONFIG.RINK_WIDTH}
            height={CONFIG.RINK_HEIGHT}
            rx={CONFIG.RINK_CORNER_RADIUS}
          />
        </ClipPath>
        <ClipPath id="cleanCoverageClip">
          <Path d={snapshot.coveragePath || 'M0 0'} />
        </ClipPath>
      </Defs>

      {/* Серый пол арены, тоннель и компактные трибуны вокруг льда. */}
      <Rect
        x={VIEWBOX_X}
        y={VIEWBOX_Y}
        width={VIEWBOX_WIDTH}
        height={VIEWBOX_HEIGHT}
        rx="18"
        fill="url(#arenaFloor)"
      />
      <Rect x="-29" y="24" width="24" height="514" rx="8" fill="#8393A0" />
      <Rect x={CONFIG.RINK_WIDTH + 5} y="24" width="24" height="514" rx="8" fill="#8393A0" />
      <Rect x="8" y={CONFIG.RINK_HEIGHT + 7} width="304" height="27" rx="9" fill="#8393A0" />
      <Path
        d={`M${RINK_GATE_LEFT - 10} 0 V-67 H${RINK_GATE_RIGHT + 10} V0Z`}
        fill="#253746"
      />
      <Path
        d={`M${RINK_GATE_LEFT - 3} 0 V-66 H${RINK_GATE_RIGHT + 3} V0Z`}
        fill="#3F5363"
      />
      <Line
        x1={gateCenter}
        y1="-66"
        x2={gateCenter}
        y2="-7"
        stroke="#596D7C"
        strokeWidth="1"
        strokeDasharray="5 5"
      />

      {SIDE_SPECTATORS.map(spectator => (
        <Circle
          key={spectator.key}
          cx={spectator.x}
          cy={spectator.y}
          r="2.3"
          fill={spectator.color}
          opacity="0.9"
        />
      ))}
      {BOTTOM_SPECTATORS.map(spectator => (
        <Circle
          key={spectator.key}
          cx={spectator.x}
          cy={spectator.y}
          r="2.5"
          fill={spectator.color}
          opacity="0.9"
        />
      ))}

      {/* Тень отделяет белый борт от светлого пола арены. */}
      <Rect
        x="-3"
        y="-3"
        width={CONFIG.RINK_WIDTH + 6}
        height={CONFIG.RINK_HEIGHT + 7}
        rx={CONFIG.RINK_CORNER_RADIUS + 3}
        fill="#526572"
        opacity="0.24"
      />

      <G clipPath="url(#rinkClip)">
        {/* До прохода машины лёд матовый, снежный и неравномерный. */}
        <Rect
          x="0"
          y="0"
          width={CONFIG.RINK_WIDTH}
          height={CONFIG.RINK_HEIGHT}
          fill="url(#dirtyIce)"
        />

        {/* Одна динамическая маска показывает зеркальный лёд за кондиционером. */}
        <Path d={snapshot.coveragePath || 'M0 0'} fill="url(#cleanIce)" />
        <G clipPath="url(#cleanCoverageClip)" opacity="0.56">
          <Path
            d="M-40 105 L350 20 M-40 285 L350 200 M-40 465 L350 380 M50 590 L350 520"
            stroke="#FFFFFF"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <Path
            d="M-20 123 L360 40 M-20 303 L360 220 M-20 483 L360 400"
            stroke="#9CD8E9"
            strokeWidth="1.2"
            opacity="0.7"
          />
        </G>

        {/* Как на настоящей арене, клубный знак лежит под верхним слоем льда:
            по центру круга, горизонтально, а красная линия проходит поверх. */}
        <SvgImage
          href={CENTER_ICE_LOGO}
          x={105}
          y={259.7}
          width={110}
          height={40.6}
          opacity={0.5}
          preserveAspectRatio="xMidYMid meet"
        />

        {/* Разметка остаётся под тонким слоем льда и видна в обоих состояниях. */}
        <Line
          x1="0"
          y1={CONFIG.RINK_HEIGHT / 2}
          x2={CONFIG.RINK_WIDTH}
          y2={CONFIG.RINK_HEIGHT / 2}
          stroke="#B54C58"
          strokeWidth="3"
          opacity="0.28"
        />
        <Line x1="0" y1="150" x2={CONFIG.RINK_WIDTH} y2="150" stroke="#4A90E2" strokeWidth="3" opacity="0.22" />
        <Line x1="0" y1="410" x2={CONFIG.RINK_WIDTH} y2="410" stroke="#4A90E2" strokeWidth="3" opacity="0.22" />
        <Circle
          cx={CONFIG.RINK_WIDTH / 2}
          cy={CONFIG.RINK_HEIGHT / 2}
          r="48"
          fill="none"
          stroke="#B54C58"
          strokeWidth="2"
          opacity="0.22"
        />
        {[95, 225].map(x => (
          <React.Fragment key={`top-${x}`}>
            <Circle cx={x} cy="105" r="21" fill="none" stroke="#B54C58" strokeWidth="2" opacity="0.18" />
            <Circle cx={x} cy="455" r="21" fill="none" stroke="#B54C58" strokeWidth="2" opacity="0.18" />
          </React.Fragment>
        ))}
      </G>

      {/* Белая окантовка и синяя кромка борта намеренно не закрывают проём. */}
      <Path
        d={boardPath}
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="11"
        strokeLinecap="square"
        strokeLinejoin="round"
      />
      <Path
        d={boardPath}
        fill="none"
        stroke="#1B365D"
        strokeWidth="2.4"
        strokeLinecap="square"
        strokeLinejoin="round"
      />
      <Path
        d={boardPath}
        fill="none"
        stroke="#FF6B35"
        strokeWidth="1"
        strokeDasharray="1 12"
        opacity="0.8"
      />

      {/*
       * Две створки закреплены по краям проёма. Левая уходит вверх-вправо,
       * правая — вверх-влево: то есть наружу от ледовой площадки.
       */}
      <G transform={`rotate(${-gateAngle} ${RINK_GATE_LEFT} 0)`}>
        <Rect
          x={RINK_GATE_LEFT}
          y="-5"
          width={gateLeafWidth}
          height="10"
          rx="2"
          fill="#F8FAFC"
          stroke="#1B365D"
          strokeWidth="2"
        />
        <Line
          x1={RINK_GATE_LEFT + 5}
          y1="0"
          x2={gateCenter - 4}
          y2="0"
          stroke="#AAB7C0"
          strokeWidth="1"
        />
      </G>
      <G transform={`rotate(${gateAngle} ${RINK_GATE_RIGHT} 0)`}>
        <Rect
          x={gateCenter}
          y="-5"
          width={gateLeafWidth}
          height="10"
          rx="2"
          fill="#F8FAFC"
          stroke="#1B365D"
          strokeWidth="2"
        />
        <Line
          x1={gateCenter + 4}
          y1="0"
          x2={RINK_GATE_RIGHT - 5}
          y2="0"
          stroke="#AAB7C0"
          strokeWidth="1"
        />
      </G>

      {/* Машина и следы заноса вращаются вокруг общего центра. */}
      <G transform={`translate(${snapshot.x} ${snapshot.y}) rotate(${vehicleAngleDegrees})`}>
        {hasSkid && (
          <G opacity={Math.min(0.55, Math.abs(snapshot.lateralSpeed) / 42)}>
            <Path d="M-9 19 C-8 31 -13 37 -15 48" fill="none" stroke="#51656C" strokeWidth="1.6" />
            <Path d="M9 19 C10 31 5 37 3 48" fill="none" stroke="#51656C" strokeWidth="1.6" />
          </G>
        )}
        {/* Задний кондиционер нарисован по той же геометрии, которой движок
            рассчитывает полосу заливки. Он немного шире корпуса машины. */}
        <Rect
          x={-CONFIG.CONDITIONER_WIDTH / 2 - 1}
          y={CONFIG.CONDITIONER_REAR_OFFSET - CONFIG.CONDITIONER_DEPTH / 2 + 1.8}
          width={CONFIG.CONDITIONER_WIDTH + 2}
          height={CONFIG.CONDITIONER_DEPTH + 1}
          rx="2.5"
          fill="#102331"
          opacity="0.2"
        />
        <Rect
          x={-CONFIG.CONDITIONER_WIDTH / 2}
          y={CONFIG.CONDITIONER_REAR_OFFSET - CONFIG.CONDITIONER_DEPTH / 2}
          width={CONFIG.CONDITIONER_WIDTH}
          height={CONFIG.CONDITIONER_DEPTH}
          rx="2"
          fill="#AEBCC5"
          stroke="#334B5B"
          strokeWidth="1"
        />
        <Line
          x1={-CONFIG.CONDITIONER_WIDTH / 2 + 2}
          y1={CONFIG.CONDITIONER_REAR_OFFSET + CONFIG.CONDITIONER_DEPTH / 2 - 1.4}
          x2={CONFIG.CONDITIONER_WIDTH / 2 - 2}
          y2={CONFIG.CONDITIONER_REAR_OFFSET + CONFIG.CONDITIONER_DEPTH / 2 - 1.4}
          stroke="#E5F2F7"
          strokeWidth="1.2"
          opacity="0.9"
        />
        <Rect
          x={-CONFIG.VEHICLE_WIDTH / 2 - 1.5}
          y={-CONFIG.VEHICLE_LENGTH / 2 + 2}
          width={CONFIG.VEHICLE_WIDTH + 3}
          height={CONFIG.VEHICLE_LENGTH}
          rx="6"
          fill="#102331"
          opacity="0.2"
          transform="translate(1.8 2.4)"
        />
        <SvgImage
          href={RESURFACER_IMAGE}
          x={-CONFIG.VEHICLE_WIDTH / 2}
          y={-CONFIG.VEHICLE_LENGTH / 2}
          width={CONFIG.VEHICLE_WIDTH}
          height={CONFIG.VEHICLE_LENGTH}
          preserveAspectRatio="xMidYMid meet"
        />
        {/* Визуальные колёса совпадают с механикой: поворачивается передняя ось,
            расположенная ближе к носу машины (отрицательный local Y). */}
        <Rect
          x="-17"
          y={-CONFIG.FRONT_AXLE_OFFSET - 4.8}
          width="4.4"
          height="9.6"
          rx="2"
          fill="#17232C"
          stroke="#80909A"
          strokeWidth="0.7"
          transform={`rotate(${frontWheelAngleDegrees} -14.8 ${-CONFIG.FRONT_AXLE_OFFSET})`}
        />
        <Rect
          x="12.6"
          y={-CONFIG.FRONT_AXLE_OFFSET - 4.8}
          width="4.4"
          height="9.6"
          rx="2"
          fill="#17232C"
          stroke="#80909A"
          strokeWidth="0.7"
          transform={`rotate(${frontWheelAngleDegrees} 14.8 ${-CONFIG.FRONT_AXLE_OFFSET})`}
        />
        {snapshot.phase === 'crashed' && (
          <Circle cx="0" cy="0" r="24" fill="none" stroke="#E74C3C" strokeWidth="4" opacity="0.82" />
        )}
      </G>
    </Svg>
  );
}
