/**
 * Настраиваемые параметры игры «Х - О, 5 в ряд».
 *
 * Поле хранится в целых координатах и не имеет физических границ. Размер
 * клетки влияет только на отображение, поэтому масштабирование не меняет игру.
 */
export const FIVE_IN_ROW_CONFIG = {
  WIN_LENGTH: 5,

  DEFAULT_CELL_SIZE: 43,
  MIN_CELL_SIZE: 28,
  MAX_CELL_SIZE: 62,
  ZOOM_STEP: 5,

  MARK_DRAW_DURATION_MS: 360,
  WIN_LINE_DRAW_DURATION_MS: 520,
  COMPUTER_THINK_DELAY_MS: 420,

  DEFAULT_DIFFICULTY: 3,
  MIN_DIFFICULTY: 1,
  MAX_DIFFICULTY: 5,

  // Ограничения ветвления нужны только для уровней 4–5. Они удерживают время
  // ответа ИИ в комфортных пределах даже после сотни сделанных ходов.
  LEVEL_FOUR_ROOT_BRANCH: 12,
  LEVEL_FOUR_REPLY_BRANCH: 10,
  LEVEL_FIVE_ROOT_BRANCH: 10,
  LEVEL_FIVE_REPLY_BRANCH: 8,
  AI_RANK_CANDIDATE_LIMIT: 84,
  AI_LEAF_CANDIDATE_LIMIT: 36,

  DEBUG_LOGS: __DEV__,
} as const;

export const FIVE_IN_ROW_DIFFICULTY_NAMES: Record<number, string> = {
  1: 'Новичок',
  2: 'Легко',
  3: 'Средне',
  4: 'Сложно',
  5: 'Эксперт',
};
