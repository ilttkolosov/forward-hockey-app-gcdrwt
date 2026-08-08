/**
 * Все настраиваемые числа игры «Заливка льда» собраны здесь.
 *
 * Координаты игрового мира не зависят от пикселей телефона: ширина площадки
 * всегда равна 320 условным единицам, а высота — 560. Благодаря этому физика
 * одинаково ощущается на маленьком iPhone и на большом экране.
 */
export const ICE_RESURFACING_CONFIG = {
  // Геометрия площадки и ворот.
  RINK_WIDTH: 320,
  RINK_HEIGHT: 560,
  RINK_CORNER_RADIUS: 84,
  GATE_WIDTH: 76,
  GATE_ANIMATION_SECONDS: 0.7,
  GATE_COLLISION_OPEN_PROGRESS: 0.78,
  STAGING_AREA_TOP: -72,

  // Геометрия машины. Спрайт направлен передней частью вверх.
  VEHICLE_WIDTH: 28,
  VEHICLE_LENGTH: 48,
  CONDITIONER_WIDTH: 40,
  CONDITIONER_DEPTH: 8,
  CONDITIONER_REAR_OFFSET: 22,
  FRONT_AXLE_OFFSET: 14,
  REAR_AXLE_OFFSET: 13,
  WHEELBASE: 32,

  // Круглая щётка автоматически выходит у левого переднего угла при подходе
  // к борту. Все расстояния заданы в единицах игрового мира, которые на
  // типичном iPhone почти совпадают с экранными точками.
  SIDE_BRUSH_FORWARD_OFFSET: 20,
  SIDE_BRUSH_RETRACTED_LATERAL_OFFSET: 15.5,
  SIDE_BRUSH_EXTENSION_DISTANCE: 7.5,
  SIDE_BRUSH_VISUAL_RADIUS: 5.7,
  SIDE_BRUSH_COVERAGE_RADIUS: 7.5,
  SIDE_BRUSH_DEPLOY_DISTANCE: 7,
  SIDE_BRUSH_RETRACT_DISTANCE: 8.5,
  SIDE_BRUSH_FULL_EXTENSION_DISTANCE: 3,
  SIDE_BRUSH_FULL_PRESS_DISTANCE: 1.1,
  SIDE_BRUSH_BOARD_ALIGNMENT: 0.2,
  SIDE_BRUSH_ANIMATION_PER_SECOND: 4.8,
  SIDE_BRUSH_ASSIST_SPEED_RATIO: 0.9,

  // Динамика движения (единицы игрового мира и секунды). Удержание кнопки
  // разгоняет машину, отпускание включает плавное торможение по инерции.
  MAX_FORWARD_SPEED: 98,
  DRIVE_ACCELERATION: 57,
  COAST_BRAKING: 45,
  DIRECTION_CHANGE_BRAKING: 78,

  // Вблизи борта максимальная скорость плавно уменьшается до 75%. Расстояние
  // считается от внешних точек корпуса и кондиционера, а не от центра машины.
  BOARD_SLOWDOWN_DISTANCE: 34,
  BOARD_MIN_SPEED_RATIO: 0.75,
  SIDE_BRUSH_COLLISION_RETENTION: 0.97,
  BOARD_COLLISION_SLIDE_RETENTION: 0.88,

  // Передние колёса поворачиваются независимо от газа. Угол и скорость их
  // перекладки вынесены отдельно, чтобы быстро настраивать управление.
  MAX_FRONT_WHEEL_ANGLE_DEGREES: 44,
  FRONT_WHEEL_TURN_DEGREES_PER_SECOND: 190,
  FRONT_WHEEL_RETURN_DEGREES_PER_SECOND: 220,
  MIN_STEERING_SPEED: 2,
  MAX_BODY_YAW_RATE: 2.08,
  HIGH_SPEED_STEERING_LOSS: 0.22,

  // В скруглённых углах повёрнутые передние колёса частично скользят, поэтому
  // корпус продолжает движение вдоль борта и не заклинивается на месте.
  CORNER_WHEEL_SLIP_DISTANCE: 10,
  CORNER_WHEEL_STEERING_LOSS: 0.78,

  // При полном вывороте занос начинается примерно с 60% скорости. Чем меньше
  // угол колёс, тем выше порог — по прямой машина остаётся устойчивой.
  SLIP_START_FULL_LOCK_SPEED_RATIO: 0.6,
  SLIP_START_STRAIGHT_BONUS: 0.36,
  SLIP_MIN_STEERING_RATIO: 0.18,
  SLIP_LATERAL_ACCELERATION: 88,
  MAX_LATERAL_SPEED: 32,
  NORMAL_LATERAL_GRIP: 4.2,
  TURNING_LATERAL_GRIP_MULTIPLIER: 0.42,

  // Столкновение на этой скорости или выше ломает машину.
  CRASH_SPEED: 75,
  LOW_SPEED_COLLISION_RETAINED_SPEED: 0.12,

  // Сетка используется и для расчёта площади, и для маски чистого льда.
  COVERAGE_COLUMNS: 40,
  COVERAGE_ROWS: 70,
  // Ворота начинают открываться на отметке 99%. Результат фиксируется после
  // её превышения: из-за дискретной сетки это следующая очищенная клетка.
  GATE_OPEN_REMAINING_PERCENT: 1,
  COMPLETION_REMAINING_PERCENT: 1,

  // Фиксированный шаг не даёт ProMotion-экрану считать физику 120 раз/с.
  // SVG-маска льда обновляется ещё реже, без заметной потери плавности машины.
  PHYSICS_STEP_MS: 1000 / 30,
  MAX_PHYSICS_STEPS_PER_FRAME: 3,
  UI_FRAME_INTERVAL_MS: 1000 / 30,
  COVERAGE_PATH_INTERVAL_MS: 120,
  DEBUG_PHYSICS_INTERVAL_MS: 3000,
  COLLISION_LOG_INTERVAL_MS: 1000,

  /**
   * Событийные логи доступны в development, но автоматически выключены в
   * preview/production. Непрерывная телеметрия физики отключена отдельно.
   */
  DEBUG_LOGS: __DEV__,
  DEBUG_PHYSICS_LOGS: false,
} as const;

export const RINK_GATE_LEFT =
  (ICE_RESURFACING_CONFIG.RINK_WIDTH - ICE_RESURFACING_CONFIG.GATE_WIDTH) / 2;

export const RINK_GATE_RIGHT =
  RINK_GATE_LEFT + ICE_RESURFACING_CONFIG.GATE_WIDTH;
