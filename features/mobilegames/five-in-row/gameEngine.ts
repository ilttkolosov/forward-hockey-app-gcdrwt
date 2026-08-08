import { FIVE_IN_ROW_CONFIG as CONFIG } from './gameConfig';

export type FiveInRowMark = 'x' | 'o';
export type FiveInRowMode = 'computer' | 'local' | 'online';

export interface GridPoint {
  x: number;
  y: number;
}

export interface FiveInRowMove extends GridPoint {
  mark: FiveInRowMark;
  moveNumber: number;
}

export interface WinningLine {
  mark: FiveInRowMark;
  cells: GridPoint[];
}

export type FiveInRowBoard = ReadonlyMap<string, FiveInRowMark>;

/**
 * Контракт будущего сетевого режима. Экран и движок уже оперируют теми же
 * координатами/ходами, поэтому сервер позже потребуется лишь как транспорт и
 * источник подтверждённой очередности ходов.
 */
export interface FiveInRowNetworkAdapter {
  connect(options: {
    roomId: string;
    playerName: string;
    onMove: (move: FiveInRowMove) => void;
    onDisconnected: (reason?: string) => void;
  }): Promise<{ localMark: FiveInRowMark; opponentName: string }>;
  sendMove(move: FiveInRowMove): Promise<void>;
  disconnect(): Promise<void>;
}

const DIRECTIONS: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

const WIN_SCORE = 1_000_000_000;

export const logFiveInRow = (
  message: string,
  details?: Record<string, unknown>
) => {
  if (!CONFIG.DEBUG_LOGS) return;
  if (details) {
    console.log(`[Крестики-нолики] ${message}`, details);
  } else {
    console.log(`[Крестики-нолики] ${message}`);
  }
};

export const getCellKey = (x: number, y: number) => `${x}:${y}`;

export const parseCellKey = (key: string): GridPoint => {
  const separator = key.indexOf(':');
  return {
    x: Number(key.slice(0, separator)),
    y: Number(key.slice(separator + 1)),
  };
};

export const getOppositeMark = (mark: FiveInRowMark): FiveInRowMark =>
  mark === 'x' ? 'o' : 'x';

const getVirtualMark = (
  board: FiveInRowBoard,
  point: GridPoint,
  assumedMark: FiveInRowMark,
  x: number,
  y: number
) =>
  x === point.x && y === point.y
    ? assumedMark
    : board.get(getCellKey(x, y));

const countFromPoint = (
  board: FiveInRowBoard,
  point: GridPoint,
  mark: FiveInRowMark,
  dx: number,
  dy: number
) => {
  let count = 0;
  let x = point.x + dx;
  let y = point.y + dy;
  while (getVirtualMark(board, point, mark, x, y) === mark) {
    count += 1;
    x += dx;
    y += dy;
  }
  return {
    count,
    end: { x, y },
  };
};

export const wouldMoveWin = (
  board: FiveInRowBoard,
  point: GridPoint,
  mark: FiveInRowMark
) =>
  DIRECTIONS.some(([dx, dy]) => {
    const negative = countFromPoint(board, point, mark, -dx, -dy).count;
    const positive = countFromPoint(board, point, mark, dx, dy).count;
    return negative + 1 + positive >= CONFIG.WIN_LENGTH;
  });

/** Возвращает весь непрерывный победный ряд, включая ряд длиннее пяти. */
export const findWinningLine = (
  board: FiveInRowBoard,
  lastMove: FiveInRowMove
): WinningLine | null => {
  for (const [dx, dy] of DIRECTIONS) {
    const before: GridPoint[] = [];
    const after: GridPoint[] = [];

    let x = lastMove.x - dx;
    let y = lastMove.y - dy;
    while (board.get(getCellKey(x, y)) === lastMove.mark) {
      before.push({ x, y });
      x -= dx;
      y -= dy;
    }

    x = lastMove.x + dx;
    y = lastMove.y + dy;
    while (board.get(getCellKey(x, y)) === lastMove.mark) {
      after.push({ x, y });
      x += dx;
      y += dy;
    }

    const cells = [
      ...before.reverse(),
      { x: lastMove.x, y: lastMove.y },
      ...after,
    ];
    if (cells.length >= CONFIG.WIN_LENGTH) {
      return { mark: lastMove.mark, cells };
    }
  }
  return null;
};

/**
 * На бесконечном поле нет смысла перебирать бесконечность: содержательные ходы
 * всегда находятся в радиусе одной-двух клеток от уже нарисованных знаков.
 */
export const collectCandidateMoves = (
  board: FiveInRowBoard,
  radius = 2
): GridPoint[] => {
  if (board.size === 0) return [{ x: 0, y: 0 }];

  const candidates = new Map<string, GridPoint>();
  board.forEach((_mark, key) => {
    const origin = parseCellKey(key);
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        if (dx === 0 && dy === 0) continue;
        const point = { x: origin.x + dx, y: origin.y + dy };
        const pointKey = getCellKey(point.x, point.y);
        if (!board.has(pointKey)) candidates.set(pointKey, point);
      }
    }
  });
  return [...candidates.values()];
};

const getContiguousPatternScore = (
  board: FiveInRowBoard,
  point: GridPoint,
  mark: FiveInRowMark,
  dx: number,
  dy: number
) => {
  const negative = countFromPoint(board, point, mark, -dx, -dy);
  const positive = countFromPoint(board, point, mark, dx, dy);
  const length = negative.count + 1 + positive.count;
  const openEnds =
    Number(!getVirtualMark(board, point, mark, negative.end.x, negative.end.y)) +
    Number(!getVirtualMark(board, point, mark, positive.end.x, positive.end.y));

  if (length >= CONFIG.WIN_LENGTH) return WIN_SCORE;
  if (length === 4 && openEnds === 2) return 24_000_000;
  if (length === 4 && openEnds === 1) return 4_000_000;
  if (length === 3 && openEnds === 2) return 420_000;
  if (length === 3 && openEnds === 1) return 55_000;
  if (length === 2 && openEnds === 2) return 12_000;
  if (length === 2 && openEnds === 1) return 1_500;
  return openEnds === 2 ? 180 : 30;
};

/** Оценивает также неплотные пятёрки вида XX.X, чтобы ИИ видел разрывы. */
const getWindowPatternScore = (
  board: FiveInRowBoard,
  point: GridPoint,
  mark: FiveInRowMark,
  dx: number,
  dy: number
) => {
  let score = 0;
  for (let start = -(CONFIG.WIN_LENGTH - 1); start <= 0; start += 1) {
    let own = 0;
    let blocked = false;
    for (let index = 0; index < CONFIG.WIN_LENGTH; index += 1) {
      const offset = start + index;
      const value = getVirtualMark(
        board,
        point,
        mark,
        point.x + offset * dx,
        point.y + offset * dy
      );
      if (value === mark) own += 1;
      else if (value) blocked = true;
    }
    if (blocked) continue;
    if (own === 4) score += 210_000;
    else if (own === 3) score += 12_000;
    else if (own === 2) score += 650;
  }
  return score;
};

const scorePlacement = (
  board: FiveInRowBoard,
  point: GridPoint,
  mark: FiveInRowMark
) => {
  let score = 0;
  for (const [dx, dy] of DIRECTIONS) {
    score += getContiguousPatternScore(board, point, mark, dx, dy);
    score += getWindowPatternScore(board, point, mark, dx, dy);
  }

  // Соседство делает игру визуально и тактически связной, не притягивая ходы
  // к условному нулю бесконечной координатной системы.
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      if (dx === 0 && dy === 0) continue;
      const neighbor = board.get(getCellKey(point.x + dx, point.y + dy));
      if (neighbor === mark) score += 260;
      else if (neighbor) score += 90;
    }
  }
  return score;
};

interface RankedMove extends GridPoint {
  score: number;
}

/**
 * Дешёвый предварительный фильтр сохраняет клетки около скоплений знаков.
 * Без него эксперт повторно оценивал бы сотни заведомо слабых клеток на каждом
 * узле поиска, что давало заметную паузу в длинной партии.
 */
const shortlistCandidates = (
  board: FiveInRowBoard,
  candidates: GridPoint[],
  mark: FiveInRowMark,
  limit: number
) => {
  if (candidates.length <= limit) return candidates;
  return candidates
    .map(point => {
      let relevance = 0;
      for (let dx = -2; dx <= 2; dx += 1) {
        for (let dy = -2; dy <= 2; dy += 1) {
          if (dx === 0 && dy === 0) continue;
          const neighbor = board.get(getCellKey(point.x + dx, point.y + dy));
          if (!neighbor) continue;
          const distance = Math.max(Math.abs(dx), Math.abs(dy));
          const distanceWeight = distance === 1 ? 14 : 4;
          relevance += distanceWeight * (neighbor === mark ? 1.15 : 1);
          if (dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy)) {
            relevance += distance === 1 ? 5 : 2;
          }
        }
      }
      return { point, relevance };
    })
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, limit)
    .map(item => item.point);
};

const rankMoves = (
  board: FiveInRowBoard,
  mark: FiveInRowMark,
  radius = 2,
  candidateLimit: number = CONFIG.AI_RANK_CANDIDATE_LIMIT
): RankedMove[] => {
  const opponent = getOppositeMark(mark);
  const candidates = shortlistCandidates(
    board,
    collectCandidateMoves(board, radius),
    mark,
    candidateLimit
  );
  return candidates
    .map(point => {
      const attack = scorePlacement(board, point, mark);
      const defense = scorePlacement(board, point, opponent);
      return {
        ...point,
        score: attack + defense * 0.94,
      };
    })
    .sort((a, b) => b.score - a.score);
};

const boardWithMove = (
  board: FiveInRowBoard,
  point: GridPoint,
  mark: FiveInRowMark
) => {
  const next = new Map(board);
  next.set(getCellKey(point.x, point.y), mark);
  return next;
};

const evaluatePosition = (
  board: FiveInRowBoard,
  computerMark: FiveInRowMark
) => {
  const computerBest = rankMoves(
    board,
    computerMark,
    2,
    CONFIG.AI_LEAF_CANDIDATE_LIMIT
  )[0]?.score ?? 0;
  const humanBest = rankMoves(
    board,
    getOppositeMark(computerMark),
    2,
    CONFIG.AI_LEAF_CANDIDATE_LIMIT
  )[0]?.score ?? 0;
  return computerBest - humanBest * 1.04;
};

const minimax = (
  board: FiveInRowBoard,
  turn: FiveInRowMark,
  computerMark: FiveInRowMark,
  depth: number,
  branchLimit: number,
  alphaValue: number,
  betaValue: number,
  lastMove: FiveInRowMove
): number => {
  const winner = findWinningLine(board, lastMove);
  if (winner) {
    return winner.mark === computerMark
      ? WIN_SCORE + depth * 1000
      : -WIN_SCORE - depth * 1000;
  }
  if (depth <= 0) return evaluatePosition(board, computerMark);

  const candidates = rankMoves(board, turn).slice(0, branchLimit);
  const maximizing = turn === computerMark;
  let best = maximizing ? -Infinity : Infinity;
  let alpha = alphaValue;
  let beta = betaValue;

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const nextBoard = boardWithMove(board, candidate, turn);
    const move: FiveInRowMove = {
      x: candidate.x,
      y: candidate.y,
      mark: turn,
      moveNumber: board.size + 1,
    };
    const value = minimax(
      nextBoard,
      getOppositeMark(turn),
      computerMark,
      depth - 1,
      Math.max(5, branchLimit - 2),
      alpha,
      beta,
      move
    );

    if (maximizing) {
      best = Math.max(best, value);
      alpha = Math.max(alpha, best);
    } else {
      best = Math.min(best, value);
      beta = Math.min(beta, best);
    }
    if (beta <= alpha) break;
  }
  return best;
};

const chooseRandom = <T,>(items: T[], random: () => number): T =>
  items[Math.min(items.length - 1, Math.floor(random() * items.length))];

/**
 * Пять уровней действительно меняют стратегию:
 * 1 — случайный соседний ход;
 * 2 — победа/блок и выбор среди нескольких хороших ходов;
 * 3 — лучший эвристический ход;
 * 4 — проверка ответа соперника;
 * 5 — поиск на три полухода с alpha-beta отсечением.
 */
export const chooseComputerMove = (
  board: FiveInRowBoard,
  difficulty: number,
  computerMark: FiveInRowMark = 'o',
  random: () => number = Math.random
): GridPoint => {
  const startedAt = Date.now();
  const level = Math.max(
    CONFIG.MIN_DIFFICULTY,
    Math.min(CONFIG.MAX_DIFFICULTY, Math.round(difficulty))
  );

  if (board.size === 0) return { x: 0, y: 0 };

  if (level === 1) {
    const candidates = collectCandidateMoves(board, 1);
    const selected = chooseRandom(candidates, random);
    logFiveInRow('ИИ выбрал случайный соседний ход', {
      level,
      x: selected.x,
      y: selected.y,
      durationMs: Date.now() - startedAt,
    });
    return selected;
  }

  const candidates = rankMoves(board, computerMark);
  const opponent = getOppositeMark(computerMark);
  const winningMove = candidates.find(point =>
    wouldMoveWin(board, point, computerMark)
  );
  if (winningMove) return { x: winningMove.x, y: winningMove.y };

  const blockingMove = candidates.find(point =>
    wouldMoveWin(board, point, opponent)
  );
  if (blockingMove) return { x: blockingMove.x, y: blockingMove.y };

  if (level === 2) {
    const selected = chooseRandom(candidates.slice(0, Math.min(4, candidates.length)), random);
    return { x: selected.x, y: selected.y };
  }

  if (level === 3) {
    return { x: candidates[0].x, y: candidates[0].y };
  }

  const isExpert = level === 5;
  const rootLimit = isExpert
    ? CONFIG.LEVEL_FIVE_ROOT_BRANCH
    : CONFIG.LEVEL_FOUR_ROOT_BRANCH;
  const replyLimit = isExpert
    ? CONFIG.LEVEL_FIVE_REPLY_BRANCH
    : CONFIG.LEVEL_FOUR_REPLY_BRANCH;
  const searchDepth = isExpert ? 2 : 1;
  let bestValue = -Infinity;
  let bestMoves: RankedMove[] = [];

  for (const candidate of candidates.slice(0, rootLimit)) {
    const nextBoard = boardWithMove(board, candidate, computerMark);
    const move: FiveInRowMove = {
      x: candidate.x,
      y: candidate.y,
      mark: computerMark,
      moveNumber: board.size + 1,
    };
    const replyValue = minimax(
      nextBoard,
      opponent,
      computerMark,
      searchDepth,
      replyLimit,
      -Infinity,
      Infinity,
      move
    );
    // Небольшая доля исходной эвристики помогает выбирать естественный ход
    // между позициями с одинаковым результатом поиска.
    const value = replyValue + candidate.score * 0.002;
    if (value > bestValue + 0.001) {
      bestValue = value;
      bestMoves = [candidate];
    } else if (Math.abs(value - bestValue) <= 0.001) {
      bestMoves.push(candidate);
    }
  }

  const selected = chooseRandom(bestMoves.length > 0 ? bestMoves : candidates, random);
  logFiveInRow('ИИ завершил расчёт', {
    level,
    x: selected.x,
    y: selected.y,
    boardMoves: board.size,
    evaluatedRootMoves: Math.min(rootLimit, candidates.length),
    searchDepth,
    durationMs: Date.now() - startedAt,
  });
  return { x: selected.x, y: selected.y };
};
