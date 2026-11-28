export type MatchPhase = 'scheduled' | 'live' | 'finished';
type ScorePair = [number, number];

export type MatchState = {
  status: MatchPhase;
  revision: string;
  startsAt: number | null;
  score: ScorePair | null;
  periods: ScorePair[];
};

export type MatchSnapshot = {
  state: MatchState | null;
  live: { score: ScorePair; periods: ScorePair[]; protocolRevision: string | null } | null;
};

const isScore = (value: unknown): value is ScorePair =>
  Array.isArray(value) && value.length === 2
  && value.every(item => Number.isSafeInteger(item) && item >= 0);

const isRevision = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

const readPeriods = (value: unknown): ScorePair[] =>
  Array.isArray(value) && value.every(isScore) ? value : [];

export function readMatchSnapshot(payload: unknown): MatchSnapshot {
  const { data, match_state: raw } = (payload ?? {}) as {
    data?: { score?: unknown; periods?: unknown; protocol_revision?: unknown } | null;
    match_state?: { status?: unknown; revision?: unknown; starts_at?: unknown; score?: unknown; periods?: unknown } | null;
  };
  const live = isScore(data?.score) ? {
    score: data.score,
    periods: readPeriods(data.periods),
    protocolRevision: isRevision(data.protocol_revision) ? data.protocol_revision : null,
  } : null;
  const state: MatchState | null = raw && isRevision(raw.revision)
    && (raw.status === 'scheduled' || raw.status === 'live' || raw.status === 'finished') ? {
    status: raw.status,
    revision: raw.revision,
    startsAt: typeof raw.starts_at === 'number' && Number.isSafeInteger(raw.starts_at) && raw.starts_at > 0
      ? raw.starts_at * 1_000 : null,
    score: isScore(raw.score) ? raw.score : null,
    periods: readPeriods(raw.periods),
  } : null;
  return { state, live };
}

export function parseForwardKickoff(date: string): number | null {
  const local = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(:\d{2})?$/.exec(date);
  if (local?.[2] === '00:00' && (!local[3] || local[3] === ':00')) return null;
  const timestamp = Date.parse(local ? date.replace(' ', 'T') + '+03:00' : date);
  return Number.isFinite(timestamp) && date.length > 10 ? timestamp : null;
}

type CachedMatch = {
  event_date: string;
  team1_outcome?: string;
  team2_outcome?: string;
  protocol?: { events?: unknown } | null;
  matchState?: MatchState;
};

export const hasMatchProtocol = (protocol: CachedMatch['protocol']): boolean =>
  Array.isArray(protocol?.events) && protocol.events.length > 0;

export function hasMatchOutcome(game: CachedMatch, now = Date.now()): boolean {
  const kickoff = parseForwardKickoff(game.event_date);
  const moscowToday = new Date(now + 3 * 60 * 60_000).toISOString().slice(0, 10);
  if (kickoff !== null ? kickoff > now : game.event_date.slice(0, 10) > moscowToday) return false;
  return [game.team1_outcome, game.team2_outcome].every(outcome => Boolean(outcome) && outcome !== 'unknown');
}

export function matchPhaseForGame(game: CachedMatch, snapshot: MatchSnapshot | null): MatchPhase {
  if (snapshot?.state) return snapshot.state.status;
  if (snapshot?.live) return 'live';
  return game.matchState?.status ?? (hasMatchOutcome(game) ? 'finished' : 'scheduled');
}

export function needsMatchDetails(game: CachedMatch | null, snapshot: MatchSnapshot | null, requested: boolean): boolean {
  if (!game) return true;
  if (snapshot?.state) return snapshot.state.revision !== game.matchState?.revision;
  return !requested && !game.matchState && !hasMatchProtocol(game.protocol);
}
