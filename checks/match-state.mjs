import assert from 'node:assert/strict';
import { hasMatchOutcome, matchPhaseForGame, needsMatchDetails, parseForwardKickoff, readMatchSnapshot } from '../services/matchState.ts';

const kickoff = Date.parse('2026-11-28T13:30:00Z');
const game = { event_date: '2026-11-28 16:30:00', protocol: { maintime: '60', events: [] } };
assert.equal(parseForwardKickoff(game.event_date), kickoff);
assert.equal(parseForwardKickoff('2026-11-28 00:00:00'), null);
assert.equal(hasMatchOutcome(game, kickoff + 60_000), false);
assert.equal(matchPhaseForGame(game, null), 'scheduled');

const outcome = { ...game, team1_outcome: 'bullitlose', team2_outcome: 'bullitwin' };
assert.equal(hasMatchOutcome(outcome, kickoff - 1), false);
assert.equal(hasMatchOutcome(outcome, kickoff + 1), true);

const snapshot = (status, revision, score = null, periods = []) => readMatchSnapshot({
  data: null,
  match_state: { status, revision: revision.repeat(64), starts_at: kickoff / 1000, score, periods },
});
const scheduled = snapshot('scheduled', 'a');
const live = snapshot('live', 'b', [1, 2], [[1, 2], [0, 0], [0, 0]]);
const protocolChanged = snapshot('live', 'c', [1, 2], [[1, 2], [0, 0], [0, 0]]);
const final = snapshot('finished', 'd', [2, 3]);

assert.equal(needsMatchDetails(game, scheduled, false), true);
assert.equal(needsMatchDetails({ ...game, matchState: scheduled.state }, scheduled, false), false);
assert.equal(needsMatchDetails({ ...game, matchState: scheduled.state }, live, true), true);
assert.equal(needsMatchDetails({ ...game, matchState: live.state }, protocolChanged, true), true);
assert.equal(needsMatchDetails({ ...game, matchState: live.state }, final, true), true);
assert.equal(needsMatchDetails(game, null, true), false);
assert.equal(matchPhaseForGame(game, live), 'live');
assert.equal(matchPhaseForGame(game, final), 'finished');
assert.equal(matchPhaseForGame(outcome, scheduled), 'scheduled');
assert.deepEqual(live.state.periods[0], [1, 2]);

const legacy = readMatchSnapshot({ data: { score: [0, 0], periods: [] } });
assert.equal(matchPhaseForGame(game, legacy), 'live');
assert.equal(readMatchSnapshot({ match_state: { status: 'finished', revision: 'invalid' } }).state, null);
console.log('Match status and protocol refresh checks passed.');
