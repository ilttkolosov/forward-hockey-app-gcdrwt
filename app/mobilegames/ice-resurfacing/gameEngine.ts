import {
  ICE_RESURFACING_CONFIG as CONFIG,
  RINK_GATE_LEFT,
  RINK_GATE_RIGHT,
} from './gameConfig';

export type IceGamePhase =
  | 'intro'
  | 'playing'
  | 'returning'
  | 'parking'
  | 'won'
  | 'crashed';

export type IceDriveDirection = 'forward' | 'reverse';

export interface IceGameControls {
  /** Кнопка хода удерживается правой рукой. */
  drivePressed: boolean;
  /** Команда рулю: -1 — влево, 0 — прямо, 1 — вправо. */
  steering: number;
  direction: IceDriveDirection;
}

interface Point {
  x: number;
  y: number;
}

/** Изменяемое состояние физического движка. Оно хранится в useRef. */
export interface IceGameEngineState {
  phase: IceGamePhase;
  x: number;
  y: number;
  /** Угол в радианах: 0 — вверх, Math.PI — вниз. */
  angle: number;
  /** Фактический угол передних колёс в радианах. */
  steeringAngle: number;
  /** Скорость со знаком: отрицательное значение означает задний ход. */
  speed: number;
  lateralSpeed: number;
  gateProgress: number;
  elapsedMs: number;
  /** Таймер включается только после пересечения льда передней осью. */
  timerStarted: boolean;
  /** Служебное время физики, включая выезд из бокса; используется в логах. */
  runtimeMs: number;
  /** После первого полного выезда ворота больше не открываются до 99% заливки. */
  initialExitCompleted: boolean;
  /** Текущий адаптивный предел скорости рядом с бортом: 0.75–1. */
  boardSpeedLimitRatio: number;
  boardClearance: number;
  /** Положение автоматической левой щётки: 0 — убрана, 1 — выдвинута. */
  sideBrushExtension: number;
  sideBrushActive: boolean;
  sideBrushClearance: number;
  /** Доля проскальзывания передних колёс в скруглённом углу. */
  frontWheelBoardSlip: number;
  remainingPercent: number;
  crashImpactSpeed: number | null;
  coverage: Uint8Array;
  eligibleCoverage: Uint8Array;
  coveredEligibleCells: number;
  totalEligibleCells: number;
  coverageRevision: number;
  lastConditionerPosition: Point | null;
  lastDebugLogMs: number;
  lastCollisionLogMs: number;
  lastReportedRemainingBand: number;
}

/** Небольшой неизменяемый снимок, который безопасно передавать в React. */
export interface IceGameSnapshot {
  phase: IceGamePhase;
  x: number;
  y: number;
  angle: number;
  steeringAngle: number;
  speed: number;
  lateralSpeed: number;
  gateProgress: number;
  elapsedMs: number;
  timerStarted: boolean;
  boardSpeedLimitRatio: number;
  boardClearance: number;
  sideBrushExtension: number;
  sideBrushActive: boolean;
  frontWheelBoardSlip: number;
  remainingPercent: number;
  crashImpactSpeed: number | null;
  coverageRevision: number;
  coveragePath: string;
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

const moveTowards = (value: number, target: number, maximumDelta: number) => {
  if (Math.abs(target - value) <= maximumDelta) return target;
  return value + Math.sign(target - value) * maximumDelta;
};

const normalizeAngle = (angle: number) => {
  const fullTurn = Math.PI * 2;
  let normalized = angle % fullTurn;
  if (normalized > Math.PI) normalized -= fullTurn;
  if (normalized < -Math.PI) normalized += fullTurn;
  return normalized;
};

export const logIceGame = (message: string, details?: Record<string, unknown>) => {
  if (!CONFIG.DEBUG_LOGS) return;
  if (details) {
    console.log(`[Заливка льда] ${message}`, details);
  } else {
    console.log(`[Заливка льда] ${message}`);
  }
};

/** Проверка точки с учётом круглых углов хоккейной площадки. */
const isPointInsideRoundedRink = (x: number, y: number) => {
  if (x < 0 || x > CONFIG.RINK_WIDTH || y < 0 || y > CONFIG.RINK_HEIGHT) {
    return false;
  }

  const radius = CONFIG.RINK_CORNER_RADIUS;
  const nearestX = clamp(x, radius, CONFIG.RINK_WIDTH - radius);
  const nearestY = clamp(y, radius, CONFIG.RINK_HEIGHT - radius);
  const dx = x - nearestX;
  const dy = y - nearestY;
  return dx * dx + dy * dy <= radius * radius;
};

/**
 * Точное расстояние от внутренней точки до контура скруглённой площадки.
 * Формула одинаково работает на прямом участке борта и в круглом углу.
 */
const getRoundedRinkSignedClearance = (point: Point) => {
  const radius = CONFIG.RINK_CORNER_RADIUS;
  const halfWidth = CONFIG.RINK_WIDTH / 2;
  const halfHeight = CONFIG.RINK_HEIGHT / 2;
  const qx = Math.abs(point.x - halfWidth) - (halfWidth - radius);
  const qy = Math.abs(point.y - halfHeight) - (halfHeight - radius);
  const outsideDistance = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const insideDistance = Math.min(Math.max(qx, qy), 0);
  const signedDistance = outsideDistance + insideDistance - radius;
  return -signedDistance;
};

const getRoundedRinkClearance = (point: Point) =>
  Math.max(0, getRoundedRinkSignedClearance(point));

/** Единичная нормаль, направленная от ближайшего борта внутрь площадки. */
const getRoundedRinkInwardNormal = (point: Point): Point => {
  const epsilon = 0.25;
  const dx =
    getRoundedRinkSignedClearance({ x: point.x + epsilon, y: point.y }) -
    getRoundedRinkSignedClearance({ x: point.x - epsilon, y: point.y });
  const dy =
    getRoundedRinkSignedClearance({ x: point.x, y: point.y + epsilon }) -
    getRoundedRinkSignedClearance({ x: point.x, y: point.y - epsilon });
  const length = Math.hypot(dx, dy);
  if (length < 0.0001) return { x: 0, y: 1 };
  return { x: dx / length, y: dy / length };
};

const createCoverageGrid = () => {
  const size = CONFIG.COVERAGE_COLUMNS * CONFIG.COVERAGE_ROWS;
  const eligibleCoverage = new Uint8Array(size);
  const cellWidth = CONFIG.RINK_WIDTH / CONFIG.COVERAGE_COLUMNS;
  const cellHeight = CONFIG.RINK_HEIGHT / CONFIG.COVERAGE_ROWS;
  let totalEligibleCells = 0;

  for (let row = 0; row < CONFIG.COVERAGE_ROWS; row += 1) {
    for (let column = 0; column < CONFIG.COVERAGE_COLUMNS; column += 1) {
      const x = (column + 0.5) * cellWidth;
      const y = (row + 0.5) * cellHeight;
      const index = row * CONFIG.COVERAGE_COLUMNS + column;
      if (isPointInsideRoundedRink(x, y)) {
        eligibleCoverage[index] = 1;
        totalEligibleCells += 1;
      }
    }
  }

  return {
    coverage: new Uint8Array(size),
    eligibleCoverage,
    totalEligibleCells,
  };
};

export const createInitialIceGameState = (): IceGameEngineState => {
  const coverageGrid = createCoverageGrid();
  const state: IceGameEngineState = {
    phase: 'intro',
    x: CONFIG.RINK_WIDTH / 2,
    y: -40,
    // Машина начинает в тоннеле и смотрит передней частью вниз, на лёд.
    angle: Math.PI,
    steeringAngle: 0,
    speed: 0,
    lateralSpeed: 0,
    gateProgress: 0,
    elapsedMs: 0,
    timerStarted: false,
    runtimeMs: 0,
    initialExitCompleted: false,
    boardSpeedLimitRatio: 1,
    boardClearance: CONFIG.BOARD_SLOWDOWN_DISTANCE,
    sideBrushExtension: 0,
    sideBrushActive: false,
    sideBrushClearance: CONFIG.SIDE_BRUSH_DEPLOY_DISTANCE,
    frontWheelBoardSlip: 0,
    remainingPercent: 100,
    crashImpactSpeed: null,
    ...coverageGrid,
    coveredEligibleCells: 0,
    coverageRevision: 0,
    lastConditionerPosition: null,
    lastDebugLogMs: 0,
    lastCollisionLogMs: -Infinity,
    lastReportedRemainingBand: 100,
  };

  logIceGame('Новая игра создана', {
    startX: state.x,
    startY: state.y,
    maximumSpeed: CONFIG.MAX_FORWARD_SPEED,
    maximumWheelAngle: CONFIG.MAX_FRONT_WHEEL_ANGLE_DEGREES,
    fullLockSlipFromPercent: Math.round(
      CONFIG.SLIP_START_FULL_LOCK_SPEED_RATIO * 100
    ),
    crashSpeed: CONFIG.CRASH_SPEED,
    boardMinimumSpeedPercent: Math.round(CONFIG.BOARD_MIN_SPEED_RATIO * 100),
    completionPercent: 100 - CONFIG.COMPLETION_REMAINING_PERCENT,
    coverageCells: state.totalEligibleCells,
  });
  return state;
};

const setPhase = (state: IceGameEngineState, phase: IceGamePhase) => {
  if (state.phase === phase) return;
  const previousPhase = state.phase;
  state.phase = phase;
  logIceGame(`Состояние: ${previousPhase} → ${phase}`, {
    elapsedMs: Math.round(state.elapsedMs),
    remainingPercent: Number(state.remainingPercent.toFixed(2)),
    x: Number(state.x.toFixed(1)),
    y: Number(state.y.toFixed(1)),
  });
};

const getBasis = (angle: number) => ({
  // Направление вперёд; нулевой угол смотрит вверх экрана.
  forwardX: Math.sin(angle),
  forwardY: -Math.cos(angle),
  // Правая сторона машины относительно направления движения.
  rightX: Math.cos(angle),
  rightY: Math.sin(angle),
});

const localPointToWorld = (
  x: number,
  y: number,
  angle: number,
  lateralOffset: number,
  forwardOffset: number
): Point => {
  const basis = getBasis(angle);
  return {
    x: x + basis.rightX * lateralOffset + basis.forwardX * forwardOffset,
    y: y + basis.rightY * lateralOffset + basis.forwardY * forwardOffset,
  };
};

/** Передняя ось первой пересекает верхнюю границу льда при старте. */
const hasFrontAxleReachedIce = (state: IceGameEngineState) => {
  const frontAxle = localPointToWorld(
    state.x,
    state.y,
    state.angle,
    0,
    CONFIG.FRONT_AXLE_OFFSET
  );
  return frontAxle.y >= 0 && isPointInsideRoundedRink(frontAxle.x, frontAxle.y);
};

/**
 * Корпус и задний кондиционер проверяются отдельно: рабочая кромка шире
 * корпуса, поэтому именно она чаще первой касается борта в тесном повороте.
 */
const getVehicleHullPoints = (x: number, y: number, angle: number): Point[] => {
  const halfBodyWidth = CONFIG.VEHICLE_WIDTH / 2;
  const halfBodyLength = CONFIG.VEHICLE_LENGTH / 2;
  const halfConditionerWidth = CONFIG.CONDITIONER_WIDTH / 2;
  const halfConditionerDepth = CONFIG.CONDITIONER_DEPTH / 2;
  const conditionerForwardOffset = -CONFIG.CONDITIONER_REAR_OFFSET;

  return [
    localPointToWorld(x, y, angle, -halfBodyWidth, halfBodyLength),
    localPointToWorld(x, y, angle, halfBodyWidth, halfBodyLength),
    localPointToWorld(x, y, angle, -halfBodyWidth, -halfBodyLength),
    localPointToWorld(x, y, angle, halfBodyWidth, -halfBodyLength),
    localPointToWorld(
      x,
      y,
      angle,
      -halfConditionerWidth,
      conditionerForwardOffset - halfConditionerDepth
    ),
    localPointToWorld(
      x,
      y,
      angle,
      halfConditionerWidth,
      conditionerForwardOffset - halfConditionerDepth
    ),
    localPointToWorld(
      x,
      y,
      angle,
      -halfConditionerWidth,
      conditionerForwardOffset + halfConditionerDepth
    ),
    localPointToWorld(
      x,
      y,
      angle,
      halfConditionerWidth,
      conditionerForwardOffset + halfConditionerDepth
    ),
  ];
};

/** Минимальный зазор от корпуса/кондиционера до ближайшего закрытого борта. */
const getVehicleBoardClearance = (state: IceGameEngineState) => {
  const hull = getVehicleHullPoints(state.x, state.y, state.angle);
  let minimumClearance = Infinity;

  hull.forEach(point => {
    // Открытый верхний проём не является бортом: на старте и при возвращении
    // машина должна свободно проходить через него без искусственного лимита.
    const isInsideOpenGate =
      state.gateProgress >= CONFIG.GATE_COLLISION_OPEN_PROGRESS &&
      point.y <= CONFIG.BOARD_SLOWDOWN_DISTANCE &&
      point.x >= RINK_GATE_LEFT &&
      point.x <= RINK_GATE_RIGHT;
    if (point.y < 0 || isInsideOpenGate) return;

    minimumClearance = Math.min(
      minimumClearance,
      getRoundedRinkClearance(point)
    );
  });

  return Number.isFinite(minimumClearance)
    ? minimumClearance
    : CONFIG.BOARD_SLOWDOWN_DISTANCE;
};

interface BoardSurfaceInfo {
  point: Point;
  clearance: number;
  inwardNormal: Point;
}

/**
 * Проверяет именно левую переднюю рабочую зону машины. Щётка не появляется,
 * когда Zamboni смотрит в борт: она предназначена только для прохода вдоль него.
 */
const getSideBrushBoardInfo = (
  state: IceGameEngineState
): (BoardSurfaceInfo & { alignedAlongLeftBoard: boolean }) | null => {
  const point = localPointToWorld(
    state.x,
    state.y,
    state.angle,
    -CONFIG.CONDITIONER_WIDTH / 2,
    CONFIG.SIDE_BRUSH_FORWARD_OFFSET
  );
  if (point.y < 0) return null;

  const inwardNormal = getRoundedRinkInwardNormal(point);
  const basis = getBasis(state.angle);
  const boardIsOnLeft =
    inwardNormal.x * basis.rightX + inwardNormal.y * basis.rightY >=
    CONFIG.SIDE_BRUSH_BOARD_ALIGNMENT;
  const forwardIntoBoard = Math.abs(
    inwardNormal.x * basis.forwardX + inwardNormal.y * basis.forwardY
  );

  return {
    point,
    clearance: getRoundedRinkClearance(point),
    inwardNormal,
    alignedAlongLeftBoard:
      boardIsOnLeft &&
      forwardIntoBoard <= 1 - CONFIG.SIDE_BRUSH_BOARD_ALIGNMENT,
  };
};

const isPointInRoundedCorner = (point: Point) => {
  const radius = CONFIG.RINK_CORNER_RADIUS;
  const inHorizontalCorner =
    point.x < radius || point.x > CONFIG.RINK_WIDTH - radius;
  const inVerticalCorner =
    point.y < radius || point.y > CONFIG.RINK_HEIGHT - radius;
  return inHorizontalCorner && inVerticalCorner;
};

/** Определяет, насколько передние колёса должны проскальзывать у круглого борта. */
const getFrontWheelBoardSlip = (
  state: IceGameEngineState,
  steeringLockRatio: number
) => {
  if (steeringLockRatio <= 0.01) return 0;

  const halfBodyWidth = CONFIG.VEHICLE_WIDTH / 2;
  const frontPoints = [
    localPointToWorld(
      state.x,
      state.y,
      state.angle,
      -halfBodyWidth,
      CONFIG.FRONT_AXLE_OFFSET
    ),
    localPointToWorld(
      state.x,
      state.y,
      state.angle,
      halfBodyWidth,
      CONFIG.FRONT_AXLE_OFFSET
    ),
  ];
  const closestPoint = frontPoints.reduce((closest, point) =>
    getRoundedRinkClearance(point) < getRoundedRinkClearance(closest)
      ? point
      : closest
  );
  if (!isPointInRoundedCorner(closestPoint)) return 0;

  const clearance = getRoundedRinkClearance(closestPoint);
  if (clearance >= CONFIG.CORNER_WHEEL_SLIP_DISTANCE) return 0;
  const inwardNormal = getRoundedRinkInwardNormal(closestPoint);
  const basis = getBasis(state.angle);
  const boardSide =
    inwardNormal.x * basis.rightX + inwardNormal.y * basis.rightY;
  const steeringIntoBoard = state.steeringAngle * boardSide < 0;
  if (!steeringIntoBoard) return 0;

  return (
    clamp(
      1 - clearance / CONFIG.CORNER_WHEEL_SLIP_DISTANCE,
      0,
      1
    ) * steeringLockRatio
  );
};

const isPointAllowed = (point: Point, gateProgress: number) => {
  if (point.y >= 0) return isPointInsideRoundedRink(point.x, point.y);

  // За верхним бортом разрешён только тоннель перед полностью открытыми воротами.
  return (
    gateProgress >= CONFIG.GATE_COLLISION_OPEN_PROGRESS &&
    point.y >= CONFIG.STAGING_AREA_TOP &&
    point.x >= RINK_GATE_LEFT + 2 &&
    point.x <= RINK_GATE_RIGHT - 2
  );
};

const isVehiclePlacementAllowed = (
  x: number,
  y: number,
  angle: number,
  gateProgress: number
) => getVehicleHullPoints(x, y, angle).every(point => isPointAllowed(point, gateProgress));

/** Нормаль берётся по самой глубоко вышедшей за контур точке корпуса. */
const getVehicleCollisionSurface = (
  x: number,
  y: number,
  angle: number,
  gateProgress: number
): BoardSurfaceInfo | null => {
  let collision: BoardSurfaceInfo | null = null;

  getVehicleHullPoints(x, y, angle).forEach(point => {
    if (isPointAllowed(point, gateProgress)) return;
    const signedClearance =
      point.y >= 0 ? getRoundedRinkSignedClearance(point) : point.y;
    if (collision && signedClearance >= collision.clearance) return;

    collision = {
      point,
      clearance: signedClearance,
      // Над верхним бортом нормаль направлена вниз, внутрь площадки.
      inwardNormal:
        point.y >= 0 ? getRoundedRinkInwardNormal(point) : { x: 0, y: 1 },
    };
  });

  return collision;
};

const interpolateAngle = (from: number, to: number, ratio: number) =>
  normalizeAngle(from + normalizeAngle(to - from) * ratio);

const getConditionerCenter = (x: number, y: number, angle: number) =>
  localPointToWorld(x, y, angle, 0, -CONFIG.CONDITIONER_REAR_OFFSET);

const markConditionerFootprint = (
  state: IceGameEngineState,
  center: Point,
  angle: number
) => {
  const cellWidth = CONFIG.RINK_WIDTH / CONFIG.COVERAGE_COLUMNS;
  const cellHeight = CONFIG.RINK_HEIGHT / CONFIG.COVERAGE_ROWS;
  const radius = Math.hypot(CONFIG.CONDITIONER_WIDTH / 2, CONFIG.CONDITIONER_DEPTH / 2);
  const minColumn = clamp(
    Math.floor((center.x - radius) / cellWidth),
    0,
    CONFIG.COVERAGE_COLUMNS - 1
  );
  const maxColumn = clamp(
    Math.floor((center.x + radius) / cellWidth),
    0,
    CONFIG.COVERAGE_COLUMNS - 1
  );
  const minRow = clamp(
    Math.floor((center.y - radius) / cellHeight),
    0,
    CONFIG.COVERAGE_ROWS - 1
  );
  const maxRow = clamp(
    Math.floor((center.y + radius) / cellHeight),
    0,
    CONFIG.COVERAGE_ROWS - 1
  );
  const basis = getBasis(angle);
  let changed = false;

  for (let row = minRow; row <= maxRow; row += 1) {
    for (let column = minColumn; column <= maxColumn; column += 1) {
      const index = row * CONFIG.COVERAGE_COLUMNS + column;
      if (!state.eligibleCoverage[index] || state.coverage[index]) continue;

      const cellX = (column + 0.5) * cellWidth;
      const cellY = (row + 0.5) * cellHeight;
      const dx = cellX - center.x;
      const dy = cellY - center.y;
      const lateralDistance = dx * basis.rightX + dy * basis.rightY;
      const forwardDistance = dx * basis.forwardX + dy * basis.forwardY;

      if (
        Math.abs(lateralDistance) <= CONFIG.CONDITIONER_WIDTH / 2 &&
        Math.abs(forwardDistance) <= CONFIG.CONDITIONER_DEPTH / 2
      ) {
        state.coverage[index] = 1;
        state.coveredEligibleCells += 1;
        changed = true;
      }
    }
  }

  return changed;
};

/**
 * Заливаем не только текущий прямоугольник кондиционера, но и промежуток от
 * предыдущего кадра. Это исключает дырки в полосе даже при редком кадре.
 */
const markSweptCoverage = (state: IceGameEngineState) => {
  const current = getConditionerCenter(state.x, state.y, state.angle);
  const previous = state.lastConditionerPosition ?? current;
  const distance = Math.hypot(current.x - previous.x, current.y - previous.y);
  const cellSize = Math.min(
    CONFIG.RINK_WIDTH / CONFIG.COVERAGE_COLUMNS,
    CONFIG.RINK_HEIGHT / CONFIG.COVERAGE_ROWS
  );
  const samples = Math.max(1, Math.ceil(distance / (cellSize * 0.45)));
  let changed = false;

  for (let sample = 0; sample <= samples; sample += 1) {
    const ratio = sample / samples;
    const center = {
      x: previous.x + (current.x - previous.x) * ratio,
      y: previous.y + (current.y - previous.y) * ratio,
    };
    changed = markConditionerFootprint(state, center, state.angle) || changed;
  }

  state.lastConditionerPosition = current;
  if (!changed) return;

  state.coverageRevision += 1;
  state.remainingPercent =
    ((state.totalEligibleCells - state.coveredEligibleCells) / state.totalEligibleCells) * 100;

  const currentBand = Math.floor(state.remainingPercent / 10) * 10;
  if (currentBand < state.lastReportedRemainingBand) {
    state.lastReportedRemainingBand = currentBand;
    logIceGame('Пройден рубеж заливки', {
      remainingPercent: Number(state.remainingPercent.toFixed(2)),
      coveredCells: state.coveredEligibleCells,
      totalCells: state.totalEligibleCells,
    });
  }
};

const updateGate = (state: IceGameEngineState, deltaSeconds: number) => {
  let target = 0;
  if (state.phase === 'intro' || state.phase === 'returning') {
    target = 1;
  } else if (state.phase === 'playing' && !state.initialExitCompleted) {
    // После стартового выезда этот флаг уже не сбрасывается. Приближение к
    // воротам во время заливки поэтому не сможет открыть их раньше 99%.
    target = 1;
  }

  state.gateProgress = moveTowards(
    state.gateProgress,
    target,
    deltaSeconds / CONFIG.GATE_ANIMATION_SECONDS
  );
};

const hasCompletelyExitedThroughGate = (state: IceGameEngineState) => {
  const hull = getVehicleHullPoints(state.x, state.y, state.angle);
  return (
    hull.every(point => point.y < -1) &&
    hull.every(point => point.x > RINK_GATE_LEFT && point.x < RINK_GATE_RIGHT)
  );
};

/**
 * Один шаг физики. Функция намеренно изменяет объект state: это позволяет
 * считать движение 60 раз в секунду без создания мусора и пауз сборщика памяти.
 */
export const stepIceGame = (
  state: IceGameEngineState,
  controls: IceGameControls,
  rawDeltaSeconds: number
) => {
  const deltaSeconds = clamp(rawDeltaSeconds, 0, 0.05);
  updateGate(state, deltaSeconds);

  if (state.phase === 'intro') {
    if (state.gateProgress >= 1) {
      state.gateProgress = 1;
      setPhase(state, 'playing');
      logIceGame('Ворота открыты, управление включено');
    }
    return;
  }

  if (state.phase === 'parking') {
    if (state.gateProgress <= 0) {
      state.gateProgress = 0;
      setPhase(state, 'won');
    }
    return;
  }

  if (state.phase === 'won' || state.phase === 'crashed') return;

  state.runtimeMs += deltaSeconds * 1000;
  if (state.timerStarted) state.elapsedMs += deltaSeconds * 1000;

  // Удерживаемая кнопка задаёт максимальную скорость в направлении рычага.
  // Возле борта эта цель плавно уменьшается с 100% до безопасных 75%.
  state.boardClearance = getVehicleBoardClearance(state);
  const boardProximityRatio = clamp(
    state.boardClearance / CONFIG.BOARD_SLOWDOWN_DISTANCE,
    0,
    1
  );
  state.boardSpeedLimitRatio =
    CONFIG.BOARD_MIN_SPEED_RATIO +
    (1 - CONFIG.BOARD_MIN_SPEED_RATIO) * boardProximityRatio;

  const sideBrushInfo = getSideBrushBoardInfo(state);
  const brushDistanceLimit = state.sideBrushActive
    ? CONFIG.SIDE_BRUSH_RETRACT_DISTANCE
    : CONFIG.SIDE_BRUSH_DEPLOY_DISTANCE;
  const brushMinimumSpeed = state.sideBrushActive
    ? CONFIG.SIDE_BRUSH_MIN_FORWARD_SPEED * 0.5
    : CONFIG.SIDE_BRUSH_MIN_FORWARD_SPEED;
  const shouldDeploySideBrush = Boolean(
    sideBrushInfo?.alignedAlongLeftBoard &&
      sideBrushInfo.clearance <= brushDistanceLimit &&
      state.speed >= brushMinimumSpeed
  );
  state.sideBrushClearance =
    sideBrushInfo?.clearance ?? CONFIG.SIDE_BRUSH_DEPLOY_DISTANCE;
  state.sideBrushExtension = moveTowards(
    state.sideBrushExtension,
    shouldDeploySideBrush ? 1 : 0,
    CONFIG.SIDE_BRUSH_ANIMATION_PER_SECOND * deltaSeconds
  );
  if (state.sideBrushActive !== shouldDeploySideBrush) {
    state.sideBrushActive = shouldDeploySideBrush;
    logIceGame(`Бортовая щётка: ${shouldDeploySideBrush ? 'выдвигается' : 'убирается'}`, {
      clearance: Number(state.sideBrushClearance.toFixed(1)),
      speed: Number(state.speed.toFixed(1)),
    });
  }

  if (shouldDeploySideBrush) {
    // В рабочем зазоре 3–7 единиц щётка помогает держать ход вдоль борта.
    // При полном прижатии помощь плавно исчезает и остаётся прежний лимит 75%.
    const fullPressRelease = clamp(
      (state.boardClearance - CONFIG.SIDE_BRUSH_FULL_PRESS_DISTANCE) /
        (CONFIG.SIDE_BRUSH_FULL_EXTENSION_DISTANCE -
          CONFIG.SIDE_BRUSH_FULL_PRESS_DISTANCE),
      0,
      1
    );
    const brushAssistStrength = state.sideBrushExtension * fullPressRelease;
    state.boardSpeedLimitRatio = Math.max(
      state.boardSpeedLimitRatio,
      state.boardSpeedLimitRatio +
        (CONFIG.SIDE_BRUSH_ASSIST_SPEED_RATIO - state.boardSpeedLimitRatio) *
          brushAssistStrength
    );
  }

  const requestedSpeedRatio = controls.drivePressed
    ? state.boardSpeedLimitRatio
    : 0;
  const directionSign = controls.direction === 'forward' ? 1 : -1;
  const targetSpeed = requestedSpeedRatio * CONFIG.MAX_FORWARD_SPEED * directionSign;
  const isDirectionChange =
    Math.abs(state.speed) > 0.05 &&
    Math.abs(targetSpeed) > 0.05 &&
    Math.sign(state.speed) !== Math.sign(targetSpeed);

  if (isDirectionChange) {
    state.speed = moveTowards(
      state.speed,
      0,
      CONFIG.DIRECTION_CHANGE_BRAKING * deltaSeconds
    );
  } else {
    const speedChangeRate =
      Math.abs(targetSpeed) > Math.abs(state.speed)
        ? CONFIG.DRIVE_ACCELERATION
        : CONFIG.COAST_BRAKING;
    state.speed = moveTowards(state.speed, targetSpeed, speedChangeRate * deltaSeconds);
  }
  if (Math.abs(state.speed) < 0.01 && !controls.drivePressed) state.speed = 0;

  // Руль управляет фактическим углом передних колёс. Газ и направление здесь
  // намеренно не участвуют: при изменении скорости зажатые колёса не прямятся.
  const maximumSteeringAngle =
    (CONFIG.MAX_FRONT_WHEEL_ANGLE_DEGREES * Math.PI) / 180;
  const steeringInput = clamp(controls.steering, -1, 1);
  const targetSteeringAngle = steeringInput * maximumSteeringAngle;
  const wheelTurnRateDegrees =
    steeringInput === 0
      ? CONFIG.FRONT_WHEEL_RETURN_DEGREES_PER_SECOND
      : CONFIG.FRONT_WHEEL_TURN_DEGREES_PER_SECOND;
  state.steeringAngle = moveTowards(
    state.steeringAngle,
    targetSteeringAngle,
    (wheelTurnRateDegrees * Math.PI * deltaSeconds) / 180
  );

  const absoluteSpeed = Math.abs(state.speed);
  const speedRatio = clamp(absoluteSpeed / CONFIG.MAX_FORWARD_SPEED, 0, 1);
  const steeringLockRatio = clamp(
    Math.abs(state.steeringAngle) / maximumSteeringAngle,
    0,
    1
  );
  state.frontWheelBoardSlip = getFrontWheelBoardSlip(
    state,
    steeringLockRatio
  );
  const slipStartSpeedRatio = clamp(
    CONFIG.SLIP_START_FULL_LOCK_SPEED_RATIO +
      (1 - steeringLockRatio) * CONFIG.SLIP_START_STRAIGHT_BONUS,
    CONFIG.SLIP_START_FULL_LOCK_SPEED_RATIO,
    0.98
  );
  const steeringSlipStrength = clamp(
    (steeringLockRatio - CONFIG.SLIP_MIN_STEERING_RATIO) /
      (1 - CONFIG.SLIP_MIN_STEERING_RATIO),
    0,
    1
  );
  const highSpeedSlip =
    clamp(
      (speedRatio - slipStartSpeedRatio) / Math.max(0.02, 1 - slipStartSpeedRatio),
      0,
      1
    ) * steeringSlipStrength;

  // Модель «велосипеда»: передняя ось задаёт радиус поворота, а знак скорости
  // автоматически разворачивает механику руля при движении задним ходом.
  const previousAngle = state.angle;
  if (absoluteSpeed >= CONFIG.MIN_STEERING_SPEED) {
    const rawYawRate =
      (state.speed / CONFIG.WHEELBASE) * Math.tan(state.steeringAngle);
    const steeringAuthority =
      (1 - highSpeedSlip * CONFIG.HIGH_SPEED_STEERING_LOSS) *
      (1 -
        state.frontWheelBoardSlip * CONFIG.CORNER_WHEEL_STEERING_LOSS);
    const yawRate =
      clamp(rawYawRate, -CONFIG.MAX_BODY_YAW_RATE, CONFIG.MAX_BODY_YAW_RATE) *
      steeringAuthority;
    state.angle = normalizeAngle(state.angle + yawRate * deltaSeconds);
  }

  // На большой скорости корпус начинает менять направление, а масса продолжает
  // скользить по прежней траектории. На полном вывороте порог равен 60%.
  if (steeringLockRatio > 0 && highSpeedSlip > 0) {
    state.lateralSpeed -=
      Math.sign(state.steeringAngle) *
      CONFIG.SLIP_LATERAL_ACCELERATION *
      highSpeedSlip *
      deltaSeconds;
  }
  const grip =
    CONFIG.NORMAL_LATERAL_GRIP *
    (steeringLockRatio > 0 && highSpeedSlip > 0
      ? CONFIG.TURNING_LATERAL_GRIP_MULTIPLIER
      : 1);
  state.lateralSpeed *= Math.exp(-grip * deltaSeconds);
  state.lateralSpeed = clamp(
    state.lateralSpeed,
    -CONFIG.MAX_LATERAL_SPEED,
    CONFIG.MAX_LATERAL_SPEED
  );

  const basis = getBasis(state.angle);
  const velocityX = basis.forwardX * state.speed + basis.rightX * state.lateralSpeed;
  const velocityY = basis.forwardY * state.speed + basis.rightY * state.lateralSpeed;
  let proposedX = state.x + velocityX * deltaSeconds;
  let proposedY = state.y + velocityY * deltaSeconds;

  if (!isVehiclePlacementAllowed(proposedX, proposedY, state.angle, state.gateProgress)) {
    const collisionAngle = state.angle;
    const collisionSurface = getVehicleCollisionSurface(
      proposedX,
      proposedY,
      collisionAngle,
      state.gateProgress
    );
    const inwardNormal = collisionSurface?.inwardNormal ?? { x: 0, y: 1 };
    const velocityIntoRink =
      velocityX * inwardNormal.x + velocityY * inwardNormal.y;
    const normalImpactSpeed = Math.max(0, -velocityIntoRink);
    const totalSpeed = Math.hypot(velocityX, velocityY);

    if (
      state.runtimeMs - state.lastCollisionLogMs >
      CONFIG.COLLISION_LOG_INTERVAL_MS
    ) {
      state.lastCollisionLogMs = state.runtimeMs;
      logIceGame('Контакт с бортом', {
        normalImpactSpeed: Number(normalImpactSpeed.toFixed(1)),
        totalSpeed: Number(totalSpeed.toFixed(1)),
        crashThreshold: CONFIG.CRASH_SPEED,
        x: Number(proposedX.toFixed(1)),
        y: Number(proposedY.toFixed(1)),
        angleDegrees: Number(((collisionAngle * 180) / Math.PI).toFixed(1)),
        gateProgress: Number(state.gateProgress.toFixed(2)),
      });
    }

    // Ломает машину только скорость, направленная поперёк борта. Быстрый ход
    // вдоль борта теперь считается скольжением, а не лобовым ударом.
    if (normalImpactSpeed >= CONFIG.CRASH_SPEED) {
      state.crashImpactSpeed = normalImpactSpeed;
      state.speed = 0;
      state.lateralSpeed = 0;
      setPhase(state, 'crashed');
      logIceGame('Авария: превышен порог безопасного удара', {
        normalImpactSpeed: Number(normalImpactSpeed.toFixed(1)),
        totalSpeed: Number(totalSpeed.toFixed(1)),
      });
      return;
    }

    // Удаляем только составляющую скорости, направленную наружу. Оставшаяся
    // касательная позволяет передним колёсам проскользнуть вдоль круглого угла.
    const projectedVelocityX =
      velocityX - inwardNormal.x * Math.min(0, velocityIntoRink);
    const projectedVelocityY =
      velocityY - inwardNormal.y * Math.min(0, velocityIntoRink);
    const slideRetention = shouldDeploySideBrush
      ? CONFIG.SIDE_BRUSH_COLLISION_RETENTION
      : CONFIG.BOARD_COLLISION_SLIDE_RETENTION;
    const slideVelocityX = projectedVelocityX * slideRetention;
    const slideVelocityY = projectedVelocityY * slideRetention;
    const angleCandidates = [
      collisionAngle,
      interpolateAngle(previousAngle, collisionAngle, 0.35),
      previousAngle,
    ];
    const movementScales = [1, 0.6, 0.25, 0];
    let placementResolved = false;
    let resolvedMovementScale = 0;

    for (const candidateAngle of angleCandidates) {
      for (const movementScale of movementScales) {
        const candidateX =
          state.x + slideVelocityX * deltaSeconds * movementScale;
        const candidateY =
          state.y + slideVelocityY * deltaSeconds * movementScale;
        if (
          !isVehiclePlacementAllowed(
            candidateX,
            candidateY,
            candidateAngle,
            state.gateProgress
          )
        ) {
          continue;
        }

        state.angle = candidateAngle;
        proposedX = candidateX;
        proposedY = candidateY;
        resolvedMovementScale = movementScale;
        placementResolved = true;
        break;
      }
      if (placementResolved) break;
    }

    if (!placementResolved) {
      // Защитный сценарий для численной погрешности: сохраняем последнюю
      // корректную позицию и гасим скорость, не проталкивая корпус сквозь борт.
      state.angle = previousAngle;
      state.speed *= CONFIG.LOW_SPEED_COLLISION_RETAINED_SPEED;
      state.lateralSpeed = 0;
      return;
    }

    const resolvedBasis = getBasis(state.angle);
    const resolvedVelocityX = slideVelocityX * resolvedMovementScale;
    const resolvedVelocityY = slideVelocityY * resolvedMovementScale;
    state.speed =
      resolvedVelocityX * resolvedBasis.forwardX +
      resolvedVelocityY * resolvedBasis.forwardY;
    state.lateralSpeed =
      resolvedVelocityX * resolvedBasis.rightX +
      resolvedVelocityY * resolvedBasis.rightY;
  }

  state.x = proposedX;
  state.y = proposedY;

  if (
    state.phase === 'playing' &&
    !state.initialExitCompleted &&
    getVehicleHullPoints(state.x, state.y, state.angle).every(point => point.y > 1)
  ) {
    state.initialExitCompleted = true;
    logIceGame('Стартовый выезд завершён — ворота закрываются до 99% заливки', {
      y: Number(state.y.toFixed(1)),
      cleanPercent: Number((100 - state.remainingPercent).toFixed(2)),
    });
  }

  if (!state.timerStarted && state.phase === 'playing' && hasFrontAxleReachedIce(state)) {
    state.timerStarted = true;
    state.elapsedMs += deltaSeconds * 1000;
    logIceGame('Таймер запущен: передняя ось выехала на лёд', {
      x: Number(state.x.toFixed(1)),
      y: Number(state.y.toFixed(1)),
      runtimeSeconds: Number((state.runtimeMs / 1000).toFixed(2)),
    });
  }

  // Полоса чистого льда строится строго за задним кондиционером.
  if (state.speed > 0.3) {
    markSweptCoverage(state);
  } else {
    // Задним ходом кондиционер не заливает лёд. Сбрасываем начало полосы,
    // чтобы после нового движения вперёд не соединить две точки насквозь.
    state.lastConditionerPosition = null;
  }

  if (
    state.phase === 'playing' &&
    state.remainingPercent <= CONFIG.COMPLETION_REMAINING_PERCENT
  ) {
    setPhase(state, 'returning');
    logIceGame('Площадка залита — открываем ворота для возвращения', {
      remainingPercent: Number(state.remainingPercent.toFixed(2)),
    });
  }

  if (state.phase === 'returning' && hasCompletelyExitedThroughGate(state)) {
    state.speed = 0;
    state.lateralSpeed = 0;
    setPhase(state, 'parking');
    logIceGame('Машина полностью покинула лёд — закрываем ворота');
  }

  if (
    CONFIG.DEBUG_PHYSICS_LOGS &&
    state.runtimeMs - state.lastDebugLogMs >= CONFIG.DEBUG_PHYSICS_INTERVAL_MS
  ) {
    state.lastDebugLogMs = state.runtimeMs;
    logIceGame('Физика', {
      phase: state.phase,
      timeSeconds: Number((state.elapsedMs / 1000).toFixed(1)),
      timerStarted: state.timerStarted,
      drivePressed: controls.drivePressed,
      targetSpeedPercent: Math.round(requestedSpeedRatio * 100),
      direction: controls.direction,
      speed: Number(state.speed.toFixed(1)),
      speedPercent: Math.round((Math.abs(state.speed) / CONFIG.MAX_FORWARD_SPEED) * 100),
      lateralSlip: Number(state.lateralSpeed.toFixed(1)),
      angleDegrees: Number(((state.angle * 180) / Math.PI).toFixed(1)),
      frontWheelDegrees: Number(((state.steeringAngle * 180) / Math.PI).toFixed(1)),
      boardClearance: Number(state.boardClearance.toFixed(1)),
      boardSpeedLimitPercent: Math.round(state.boardSpeedLimitRatio * 100),
      sideBrushExtension: Number(state.sideBrushExtension.toFixed(2)),
      sideBrushClearance: Number(state.sideBrushClearance.toFixed(1)),
      frontWheelBoardSlip: Number(state.frontWheelBoardSlip.toFixed(2)),
      remainingPercent: Number(state.remainingPercent.toFixed(2)),
    });
  }
};

/**
 * Собирает горизонтальные серии клеток в один SVG Path. На экране получается
 * одна маска чистого льда вместо нескольких тысяч React-компонентов Rect.
 */
export const buildCoveragePath = (state: IceGameEngineState) => {
  const cellWidth = CONFIG.RINK_WIDTH / CONFIG.COVERAGE_COLUMNS;
  const cellHeight = CONFIG.RINK_HEIGHT / CONFIG.COVERAGE_ROWS;
  const segments: string[] = [];

  for (let row = 0; row < CONFIG.COVERAGE_ROWS; row += 1) {
    let column = 0;
    while (column < CONFIG.COVERAGE_COLUMNS) {
      const index = row * CONFIG.COVERAGE_COLUMNS + column;
      if (!state.eligibleCoverage[index] || !state.coverage[index]) {
        column += 1;
        continue;
      }

      const runStart = column;
      column += 1;
      while (column < CONFIG.COVERAGE_COLUMNS) {
        const nextIndex = row * CONFIG.COVERAGE_COLUMNS + column;
        if (!state.eligibleCoverage[nextIndex] || !state.coverage[nextIndex]) break;
        column += 1;
      }

      const x = runStart * cellWidth;
      const y = row * cellHeight;
      const width = (column - runStart) * cellWidth;
      // Небольшое перекрытие скрывает микрозазоры от сглаживания SVG.
      segments.push(
        `M${x.toFixed(2)} ${y.toFixed(2)}h${(width + 0.18).toFixed(2)}` +
          `v${(cellHeight + 0.18).toFixed(2)}h-${(width + 0.18).toFixed(2)}Z`
      );
    }
  }

  return segments.join('');
};

export const createIceGameSnapshot = (
  state: IceGameEngineState,
  coveragePath: string
): IceGameSnapshot => ({
  phase: state.phase,
  x: state.x,
  y: state.y,
  angle: state.angle,
  steeringAngle: state.steeringAngle,
  speed: state.speed,
  lateralSpeed: state.lateralSpeed,
  gateProgress: state.gateProgress,
  elapsedMs: state.elapsedMs,
  timerStarted: state.timerStarted,
  boardSpeedLimitRatio: state.boardSpeedLimitRatio,
  boardClearance: state.boardClearance,
  sideBrushExtension: state.sideBrushExtension,
  sideBrushActive: state.sideBrushActive,
  frontWheelBoardSlip: state.frontWheelBoardSlip,
  remainingPercent: state.remainingPercent,
  crashImpactSpeed: state.crashImpactSpeed,
  coverageRevision: state.coverageRevision,
  coveragePath,
});

export const formatIceGameTime = (elapsedMs: number) => {
  const totalTenths = Math.floor(elapsedMs / 100);
  const minutes = Math.floor(totalTenths / 600);
  const seconds = Math.floor((totalTenths % 600) / 10);
  const tenths = totalTenths % 10;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths}`;
};
