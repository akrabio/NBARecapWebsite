// Running replay state and seek checkpoints (task R13).
//
// Pure and deterministic: consumes `normalizeGame(...)` output and never
// mutates it. One reducer combines, per event:
// - score: source-backed `scoreAfter` (an invalid side carries the last valid
//   value). Stat-credited points are kept separately as `creditedScore`.
// - player / team-only / unattributed counters via `stats.js`
//   (`eventStatDeltas` + `applyDeltas`, the same step `accumulate` uses);
// - lineups via `lineups.js` `applyLineupEvent` (substitution groups atomic at
//   their last event; mid-group states keep the pre-group five + pendingSubs);
// - probability: the latest linked sample at or before the event, with the
//   sample's `sourceEventIndex`; null before the first sample (never 0.5).
//
// State shape: `ReplayState` in types.js. Index -1 is the 0–0 start: all
// counters zero, box-score starters, probability null, no future values.
//
// Seeking: deep-frozen plain-JSON checkpoints at -1 and after every
// `checkpointEvery`-th event; `stateAt(i)` binary-searches the nearest
// checkpoint ≤ i, clones it and reduces the bounded suffix. Returned states are
// fresh copies, so callers may mutate them without affecting later lookups.
//
// Spacing benchmark (largest fixture 401810798: 568 events, 26 players; Node
// on a laptop; size = JSON.stringify(checkpoints).length; worst = slowest
// stateAt(i) over every i in -1..567, median of 5 passes):
//   every   1: 569 cps, 2.44 MB, worst 0.06 ms, build 18.7 ms
//   every  10:  57 cps, 245 KB,  worst 0.09 ms, build 2.4 ms
//   every  25:  23 cps,  99 KB,  worst 0.08 ms, build 1.3 ms
//   every  50:  12 cps,  51 KB,  worst 0.09 ms, build 0.9 ms
//   every 100:   6 cps,  26 KB,  worst 0.13 ms, build 0.8 ms
// Lookup is dominated by the state clone, so every spacing is far inside a
// frame budget. Default 25: ~100 KB raw for the largest game, worst seek
// < 0.1 ms (≤ 24 suffix steps). Per-event snapshots (2.4 MB) are rejected.

import { applyLineupEvent, initialLineups, lineupContext } from "./lineups.js";
import { applyDeltas, eventStatDeltas, initialStatState, statContext } from "./stats.js";

export const DEFAULT_CHECKPOINT_EVERY = 25;

const clone = (v) => structuredClone(v);

function deepFreeze(v) {
  if (v && typeof v === "object" && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v)) deepFreeze(v[k]);
  }
  return v;
}

/** Contexts shared by every step; build once per game. */
export function stateContext(normalized) {
  const samples = new Map();
  for (const s of normalized.probability ?? []) samples.set(s.eventIndex, s); // sorted; one per event
  return { teams: normalized.teams, events: normalized.events, stat: statContext(normalized), lineup: lineupContext(normalized), samples };
}

/**
 * 0–0 start state (event index -1). Issues from the starting lineup are
 * returned separately so the state stays a pure value.
 * @returns {{ state: import("./types.js").ReplayState, issues: object[] }}
 */
export function initialState(normalized, ctx = stateContext(normalized)) {
  const stat = initialStatState(normalized);
  const lineups = initialLineups(normalized, ctx.lineup);
  return {
    state: {
      eventIndex: -1,
      score: stat.sourceScore,
      creditedScore: stat.score,
      players: stat.players,
      teams: stat.teams,
      unattributed: stat.unattributed,
      lineups: { teams: lineups.teams, pendingSubs: lineups.pendingSubs },
      probability: null,
    },
    issues: lineups.issues,
  };
}

/**
 * Advance `state` by one event IN PLACE (internal working copy only).
 * @returns {object[]} issues raised by the step
 */
function stepInPlace(state, event, ctx) {
  const deltas = eventStatDeltas(event, ctx.stat);
  // applyDeltas mutates; map its field names onto the state's.
  const view = { players: state.players, teams: state.teams, unattributed: state.unattributed, score: state.creditedScore, sourceScore: state.score };
  const scoreIssues = applyDeltas(view, event, deltas, ctx.teams);
  const lineup = applyLineupEvent({ eventIndex: state.eventIndex, ...state.lineups }, event, ctx.lineup);
  state.lineups = { teams: lineup.state.teams, pendingSubs: lineup.state.pendingSubs };
  const sample = ctx.samples.get(event.index);
  if (sample) state.probability = { home: sample.home, tie: sample.tie ?? null, sourceEventIndex: sample.eventIndex, derived: sample.derived === true };
  state.eventIndex = event.index;
  const tag = (i) => ({ ...i, eventIndex: i.eventIndex ?? event.index, sourcePlayId: event.sourcePlayId });
  return [...deltas.issues, ...scoreIssues].map(tag).concat(lineup.issues.map(tag));
}

/**
 * Pure single step: returns the state after `event` without touching `state`.
 * @returns {{ state: import("./types.js").ReplayState, issues: object[] }}
 */
export function stepState(state, event, ctx) {
  const next = clone(state);
  const issues = stepInPlace(next, event, ctx);
  return { state: next, issues };
}

/**
 * Build checkpoints and a seek function.
 *
 * @param {object} normalized  `normalizeGame(...)` output
 * @param {{ checkpointEvery?: number }} [opts]
 * @returns {{
 *   checkpointEvery: number,
 *   checkpoints: import("./types.js").Checkpoint[],
 *   issues: object[],
 *   stateAt: (eventIndex: number) => import("./types.js").ReplayState,
 * }}
 */
export function buildStateIndex(normalized, { checkpointEvery = DEFAULT_CHECKPOINT_EVERY } = {}) {
  if (!Number.isInteger(checkpointEvery) || checkpointEvery < 1) throw new RangeError("checkpointEvery must be a positive integer");
  const ctx = stateContext(normalized);
  const init = initialState(normalized, ctx);
  const issues = [...init.issues];
  const working = clone(init.state);
  const checkpoints = [deepFreeze(clone(working))];
  for (const event of normalized.events) {
    issues.push(...stepInPlace(working, event, ctx));
    if ((event.index + 1) % checkpointEvery === 0) checkpoints.push(deepFreeze(clone(working)));
  }
  return { checkpointEvery, checkpoints, issues, stateAt: (i) => stateFromCheckpoints(normalized, checkpoints, i, ctx) };
}

/**
 * State after event `eventIndex` (clamped to [-1, last]) from checkpoints:
 * nearest checkpoint ≤ index + reduced suffix. Usable on the client with
 * serialized checkpoints. Returns a fresh, mutable copy.
 */
export function stateFromCheckpoints(normalized, checkpoints, eventIndex, ctx = stateContext(normalized)) {
  const last = normalized.events.length - 1;
  if (!Number.isFinite(eventIndex)) throw new RangeError("eventIndex must be a finite number");
  const target = Math.max(-1, Math.min(last, Math.floor(eventIndex)));
  let lo = 0;
  let hi = checkpoints.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (checkpoints[mid].eventIndex <= target) lo = mid;
    else hi = mid - 1;
  }
  const state = clone(checkpoints[lo]);
  for (let i = state.eventIndex + 1; i <= target; i++) stepInPlace(state, normalized.events[i], ctx);
  return state;
}
