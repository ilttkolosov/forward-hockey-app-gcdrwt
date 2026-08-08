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
  RINK_CORNER_RADIUS: 34,
  GATE_WIDTH: 76,
  GATE_ANIMATION_SECONDS: 0.7,
  GATE_COLLISION_OPEN_PROGRESS: 0.78,
  GATE_CLOSE_AFTER_Y: 52,
  STAGING_AREA_TOP: -72,

  // Геометрия машины. Спрайт направлен передней частью вверх.
  VEHICLE_WIDTH: 28,
  VEHICLE_LENGTH: 48,
  CONDITIONER_WIDTH: 36,
  CONDITIONER_DEPTH: 8,
  CONDITIONER_REAR_OFFSET: 22,
  FRONT_AXLE_OFFSET: 14,
  WHEELBASE: 32,

  // Динамика движения (единицы игрового мира и секунды). Ползунок задаёт
  // целевую скорость, а машина достигает её с инерцией — без мгновенных скачков.
  MAX_FORWARD_SPEED: 98,
  DRIVE_ACCELERATION: 57,
  SPEED_REDUCTION: 64,
  DIRECTION_CHANGE_BRAKING: 78,

  // Передние колёса поворачиваются независимо от газа. Угол и скорость их
  // перекладки вынесены отдельно, чтобы быстро настраивать управление.
  MAX_FRONT_WHEEL_ANGLE_DEGREES: 44,
  FRONT_WHEEL_TURN_DEGREES_PER_SECOND: 190,
  FRONT_WHEEL_RETURN_DEGREES_PER_SECOND: 220,
  MIN_STEERING_SPEED: 2,
  MAX_BODY_YAW_RATE: 2.08,
  HIGH_SPEED_STEERING_LOSS: 0.22,

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
  COMPLETION_REMAINING_PERCENT: 0.8,

  // Частота обновления React-интерфейса ниже частоты физики, чтобы SVG не
  // создавал лишнюю нагрузку. Физика всё равно считается через каждый кадр.
  UI_FRAME_INTERVAL_MS: 1000 / 30,
  COVERAGE_PATH_INTERVAL_MS: 90,
  DEBUG_PHYSICS_INTERVAL_MS: 1000,

  /**
   * Подробные отладочные логи. Перед production-релизом достаточно заменить
   * значение на false — вызовы останутся в коде, но ничего печатать не будут.
   */
  DEBUG_LOGS: true,
} as const;

export const RINK_GATE_LEFT =
  (ICE_RESURFACING_CONFIG.RINK_WIDTH - ICE_RESURFACING_CONFIG.GATE_WIDTH) / 2;

export const RINK_GATE_RIGHT =
  RINK_GATE_LEFT + ICE_RESURFACING_CONFIG.GATE_WIDTH;
