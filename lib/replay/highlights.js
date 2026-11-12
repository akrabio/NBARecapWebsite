// Evidence-based key-moment detection, grouping and selection (R15–R17).
//
// Pure and deterministic: consumes `normalizeGame(...)` output (plus an
// optional `buildStateIndex` result and `validateReplay` capabilities), never
// mutates them, reads no clock and uses no randomness. Ties are always broken
// by event order.
//
// Pipeline
// 1. Score walk: source-backed score after every event (an invalid side
//    carries the last valid value, like state.js), leader after every event,
//    last-lead tracking, runs and score-continuity breaks (a score change not
//    explained by the event's own points, or an invalid side).
// 2. Candidates (R15/R16), one per fact, each with structured evidence:
//    - scoring units (a made FG/FT plus same-team scores at the same clock:
//      and-one, both free throws of a trip) → `tie`, `go_ahead` (from a tie),
//      `lead_change` (from trailing), `first_lead_since` / `first_lead`
//      (long-awaited lead; ONLY with complete score history over the span),
//      `big_shot` (late basket with a large supported probability swing).
//    - `steal` (explicit stealer only), `turnover` (no steal), `block`
//      (explicit blocker, and only when the blocked shot could tie or take
//      the lead), `missed_final_attempt` (period ≥ last regulation period,
//      shooter trailing/tied, attempt value checked against the deficit, and
//      NOTHING but rebounds/timeouts/subs/reviews before the confirmed
//      PERIOD_END), `foul_out` (PF capability usable + 6th PF verified in
//      state).
//    - boundaries: `overtime` at a confirmed PERIOD_END that ends tied with a
//      following period; `game_end` at the final PERIOD_END only when the
//      game ended on a missed final attempt. Chronology: the miss moment's
//      caption params never mention the outcome; the boundary moment does.
//    - `lead_milestone`: first time a team's lead reaches 10 / 15 / … / 40
//      (highest threshold per unit; complete history required; not in garbage
//      time; ≤ `maxMilestones` per game).
//    W22 context types (user feedback: 10–20 moments per game), all facts at
//    the moment:
//    - `scoring_run`: ≥ `runMinPoints` unanswered points, one per run at its
//      last unit, caption "ריצת N–0" (run so far; garbage-time runs dropped).
//    - `player_milestone`: a player's points first reaching 20/30/40/50, first
//      double-/triple-double — from `stateAt`, every family involved usable.
//    - `closing_basket`: made FG with ≤ `closingBasketMaxClockSec` left in a
//      period before the last regulation period (the shot's own clock).
//    - `missed_late_attempt`: late tying/go-ahead miss that was not the final
//      attempt (stake from the score before the shot).
//    - `period_end`: state at the PERIOD_END marker of Q1..Q(reg−1).
//    Also widened: `big_shot` in a close finish (≤ bigShotCloseMargin, last
//    bigShotCloseLateSec) without a large swing; steal→basket within
//    stealScoreMaxMargin and blocks on could-tie/go-ahead shots at any time.
//    Look-ahead facts used only to admit a claim (period-end confirmation,
//    next period) live under `evidence.verification` (`lookAhead: true`) and
//    must never be surfaced by captions/holds. The decisive-lead hint
//    (last lead change, never relinquished) is a selection-only importance
//    boost (`candidate.selection`), absent from Highlight records.
// 3. Gating: routine/early/opening/could-not-tie/more-possessions etc. are
//    dropped with a reason code (kept in the candidate report).
// 4. Grouping: steal → transition basket, block → rebound, missed final
//    attempt → trailing rebound, and overlapping ranges merge into one moment
//    (highest importance is primary; others listed in `related`).
// 5. Verification against `stateAt`: score before/after, and the counter the
//    moment is about (stl/blk/pf). Mismatch → dropped.
// 6. Selection: boundary + missed-final moments always; then a finish
//    reserve (final `finishWindowSec` of the last regulation period and every
//    overtime; not player milestones / period ends); then round-robin
//    coverage until every regulation period has `minPerPeriod` (OT
//    `minPerOvertime`); then greedy by importance with a per-type repeat
//    penalty scoped per half (OT counts as second half), per-game type caps
//    (`maxPerType`), a per-early-period cap (+1 for the decisive lead change)
//    and context-moment spacing (`minEventGap`) up to `targetHighlights`
//    (beyond only ≥ `extraMinImportance`, capped at `maxHighlights`); finally a
//    period-balanced fill up to `minHighlights` from any verified candidate.
//    Selected moments are returned in event order.
//
// Importance (0–100): ctx = typeWeight × timeWeight × closeWeight. With a
// linked probability before and after the moment's range:
// 100 × ((1 − probWeight) × ctx + probWeight × min(1, |ΔP| / probFullSwing));
// without probability: 100 × ctx (missing probability never blocks a moment).
//
// Highlight record (`Highlight` in types.js):
// - `eventIndex`: the hold boundary = last event of the moment's range; the
//   hold shows `stateAt(eventIndex)`. Never at/after a PERIOD_END for an
//   in-period moment.
// - `keyEventIndex`: the primary action; `groupStartIndex`/`groupEndIndex`:
//   the event range (`groupEndIndex === eventIndex`).
// - `captionParams`: plain string/number values only (captions are W09).
// - `holdSec`: placeholder suggestion; the timeline (W10) finalizes it.
//
// Capabilities: a player is attributed only when the relevant family is not
// `unavailable` for them (PTS for scorers, STL/BLK/TO/PF); a three is only
// named (shotValue) when TPT is usable for the shooter. SCORE unavailable →
// no highlights at all.

import { periodLengthSec } from "./normalize.js";
import { buildStateIndex } from "./state.js";
import { eventStatDeltas, statContext } from "./stats.js";
import { CAPABILITY_FAMILIES as F, CAPABILITY_LEVELS as L, EVENT_KINDS as K } from "./types.js";
import { capabilityFor, validateReplay } from "./validate.js";

export const HIGHLIGHTS_VERSION = 2;

export const HIGHLIGHT_TYPES = Object.freeze({
  TIE: "tie",
  GO_AHEAD: "go_ahead",
  LEAD_CHANGE: "lead_change",
  FIRST_LEAD_SINCE: "first_lead_since",
  FIRST_LEAD: "first_lead",
  BIG_SHOT: "big_shot",
  STEAL: "steal",
  TURNOVER: "turnover",
  BLOCK: "block",
  MISSED_FINAL_ATTEMPT: "missed_final_attempt",
  FOUL_OUT: "foul_out",
  LEAD_MILESTONE: "lead_milestone",
  SCORING_RUN: "scoring_run",
  PLAYER_MILESTONE: "player_milestone",
  CLOSING_BASKET: "closing_basket",
  MISSED_LATE_ATTEMPT: "missed_late_attempt",
  PERIOD_END: "period_end",
  OVERTIME: "overtime",
  GAME_END: "game_end",
});
const T = HIGHLIGHT_TYPES;

/** Stable drop reasons in the candidate report. */
export const DROP_REASONS = Object.freeze({
  OPENING_SCORE: "opening_score", // first basket of the game (2–0 is not a moment)
  EARLY_ROUTINE: "early_routine", // tie/lead before minPointsForLeadMoments total points, not late
  ROUTINE: "routine", // defensive play / turnover neither late-and-close nor a big swing
  SHOT_COULD_NOT_TIE: "shot_could_not_tie", // blocked/missed shot that could not tie or take the lead
  SHOOTER_LEADING: "shooter_leading", // shooter's team was ahead: not a tying/winning attempt
  MORE_POSSESSIONS_FOLLOWED: "more_possessions_followed", // not the final attempt of the period
  PERIOD_END_UNCONFIRMED: "period_end_unconfirmed", // no PERIOD_END marker after the attempt
  UNKNOWN_SHOT_VALUE: "unknown_shot_value",
  SCORE_INCONSISTENT: "score_inconsistent", // score change not explained by the moment's events
  CAPABILITY_UNAVAILABLE: "capability_unavailable", // the claimed stat is unavailable for the player
  BELOW_SWING: "below_swing", // big_shot without enough supported probability swing
  EVIDENCE_MISMATCH: "evidence_mismatch", // evidence disagrees with stateAt
  MERGED: "merged", // grouped into another moment (see `mergedInto`)
  BELOW_THRESHOLD: "below_threshold", // importance (after variety penalty) < minImportance
  PERIOD_CAP: "period_cap", // early period already has maxPerEarlyPeriod moments
  CAP_REACHED: "cap_reached", // maxHighlights reached
  HISTORY_INCOMPLETE: "history_incomplete", // "first time" claim without complete score history
  GARBAGE_TIME: "garbage_time", // lead milestone too late to matter
  TOO_CLOSE: "too_close", // within `minEventGap` events of an already selected moment
  TYPE_CAP: "type_cap", // per-game cap for the type (`maxPerType`, lead milestones `maxMilestones`)
});
const D = DROP_REASONS;

/** Tunable defaults. Override any top-level key via `options.config`. */
export const HIGHLIGHT_CONFIG = deepFreeze({
  // Selection size (W22 user feedback: roughly 10–20 key moments per completed game).
  maxHighlights: 20,
  minHighlights: 12, // below this, the fill pass admits any verified candidate (period-balanced)
  targetHighlights: 15, // the ranked pass stops here; beyond it only strong moments (≥ extraMinImportance)
  minImportance: 14, // ranked-pass floor
  extraMinImportance: 40, // floor for picks between targetHighlights and maxHighlights
  fillMinImportance: 0, // fill-pass floor (every candidate is already evidence-verified)
  coverageMinImportance: 5, // floor for per-period coverage picks
  minPerPeriod: 2, // coverage target for every regulation period
  minPerOvertime: 1, // and for every overtime period
  coverageMaxPicks: 12, // safety bound on coverage picks
  maxPerEarlyPeriod: 4, // periods before the last regulation period
  minEventGap: 2, // a context moment (run, milestone, closing basket, period end) is at least this many events from any other selected moment
  typeRepeatPenalty: 0.85, // importance × penalty^(already selected of this type in the same half; OT = second half)
  // Per-game cap by type (variety). Missing → maxPerTypeDefault. Lead milestones use maxMilestones.
  maxPerType: { tie: 4, go_ahead: 3, lead_change: 5, big_shot: 4, steal: 3, turnover: 2, block: 3, scoring_run: 4, player_milestone: 4, closing_basket: 3, missed_late_attempt: 3, period_end: 2, foul_out: 2 },
  maxPerTypeDefault: 4,
  decisiveLeadBoost: 12, // selection-only boost for the game's last lead change (never relinquished)
  leadMilestones: [10, 15, 20, 25, 30, 35, 40], // first time a team's lead reaches each value (evidence-backed)
  milestoneImportance: { 10: 14, 15: 20, 20: 30, 25: 31, 30: 33, 35: 34, 40: 35 },
  maxMilestones: 3, // per game
  milestoneGarbageClockSec: 360, // no milestone in the last regulation period/OT with ≤ this left

  // Scoring runs: unanswered points by one team (≥ runMinPoints), one candidate per run at its
  // last scoring unit; the caption states the run so far ("ריצת 10–0").
  runMinPoints: 8,
  // "Settled" (same rule as the timeline): |margin before| ≥ baseMargin + perMinute × regulation minutes left.
  // Runs, lead milestones and closing baskets in a settled game are garbage time.
  settled: { baseMargin: 10, perMinute: 1.5 },
  trailingMaxDeficit: 20, // a run / closing basket that leaves its team still ≥ this far behind is not a story
  clusterEventGap: 5, // at most clusterMax moments within this many events…
  clusterGameSec: 30, // …or this many game seconds (same period), unless grouped into one moment
  clusterMax: 2,
  runGarbageMargin: 15, // a run ending with ≥ this margin in garbage time (milestoneGarbageClockSec) is dropped
  runImportance: { base: 12, perPoint: 1.5, max: 30 },
  // Player milestones from running state: points 20/30/40/50, double-double, triple-double.
  playerPointMilestones: [20, 30, 40, 50],
  playerMilestoneImportance: { 20: 14, 30: 22, 40: 32, 50: 40, double_double: 15, triple_double: 32 },
  // A made field goal with ≤ this many seconds left in any period.
  closingBasketMaxClockSec: 3,
  closingBasketImportance: { 2: 20, 3: 24 },
  // A late tying/go-ahead miss that was not the period's final attempt (period ≥ last regulation period).
  lateAttemptMaxClockSec: 24,
  periodEndImportance: 10, // end-of-period state for periods before the last regulation period
  halftimeImportance: 12,
  secondaryPeriodBonus: 2, // fixed-importance secondary types gain this per period after the first

  finishWindowSec: 120, // last N seconds of the last regulation period and of every OT
  finishReserve: 5, // finish moments selected before the general pass
  lateClockSec: 300, // "late" = period ≥ last regulation period and clock ≤ this
  minPointsForLeadMoments: 10, // earlier ties/leads (not late) are routine
  firstLeadMinDroughtSec: 600, // game seconds without leading for "first lead since"
  firstLeadMinDeficit: 6, // and at least this deficit in between
  firstLeadMinWeight: 0.65, // time-weight floor for a long-awaited lead
  feedStartToleranceSec: 30, // "never led" needs the feed to start within this of tip-off
  defensiveLateSec: 420, // "late" for steals/blocks/turnovers (period ≥ last regulation period)
  defensiveCloseMargin: 5,
  defensiveMinSwing: 0.08, // |ΔP| that makes an early defensive play/turnover a candidate
  stealScoreMaxMargin: 8, // a steal converted into a basket is a candidate at any time within this margin
  turnoverMinSwing: 0.05, // with probability available, a (non-steal) turnover needs at least this |ΔP|
  blockLeadingMinSwing: 0.08, // ΔP for the blocking team that admits a block on a leading team's shot
  stealLinkSec: 8, // steal → basket grouping window (game clock)
  finalAttemptMaxClockSec: 8,
  bigShotMinSwing: 0.12,
  bigShotLateSec: 300,
  // Without a large swing, a late basket still counts when the game is within one/two possessions.
  bigShotCloseLateSec: 180,
  bigShotCloseMargin: 4,
  foulOutLimit: 6,
  probFullSwing: 0.3,
  probWeight: 0.4,
  groupBonus: 5,
  overtimeImportance: 90,
  gameEndImportance: 80,
  // [clockRemainingSec, weight] for periods ≥ the last regulation period (linear between points).
  finalPeriodTimeWeights: [
    [0, 1],
    [60, 0.95],
    [180, 0.8],
    [360, 0.6],
    [720, 0.45],
  ],
  earlyPeriodTimeWeights: { 1: 0.2, 2: 0.25, 3: 0.32 }, // by period; missing → 0.2
  unknownClockWeight: 0.2,
  // [|margin|, weight] (linear between points; beyond last → last weight).
  closeWeights: [
    [0, 1],
    [3, 1],
    [6, 0.6],
    [10, 0.25],
  ],
  typeWeights: {
    tie: 0.9,
    go_ahead: 0.85,
    lead_change: 1,
    first_lead_since: 1,
    first_lead: 1,
    big_shot: 0.8,
    steal: 0.8,
    turnover: 0.6,
    block: 0.8,
    missed_final_attempt: 1,
    missed_late_attempt: 0.75,
    foul_out: 0.5,
  },
  holdSec: { default: 1.5, major: 2, majorImportance: 70 }, // placeholder (W10 finalizes)
});

const ALWAYS_KEEP = new Set([T.OVERTIME, T.GAME_END, T.MISSED_FINAL_ATTEMPT]);
// Context moments (state facts rather than single swings): spaced from other moments by minEventGap.
const SECONDARY = new Set([T.SCORING_RUN, T.PLAYER_MILESTONE, T.LEAD_MILESTONE, T.CLOSING_BASKET, T.PERIOD_END]);
// Running-stat milestones never take a finish-reserve slot (they compete in the ranked pass).
const FINISH_EXCLUDED = new Set([T.PLAYER_MILESTONE, T.PERIOD_END]);
const LEAD_TYPES = new Set([T.TIE, T.GO_AHEAD, T.LEAD_CHANGE, T.FIRST_LEAD_SINCE, T.FIRST_LEAD]);
// Events allowed between a final attempt and the period end (no new possession/attempt/score).
const QUIET_KINDS = new Set([K.REBOUND, K.TIMEOUT, K.SUBSTITUTION, K.REVIEW]);

function deepFreeze(v) {
  if (v && typeof v === "object" && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v)) deepFreeze(v[k]);
  }
  return v;
}

const round3 = (x) => Math.round(x * 1000) / 1000;
const interp = (table, x) => {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    const [x1, y1] = table[i];
    const [x0, y0] = table[i - 1];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return table[table.length - 1][1];
};

// ---------------------------------------------------------------------------
// 1. Score walk
// ---------------------------------------------------------------------------

function scoringPoints(e) {
  if ((e.kind === K.FIELD_GOAL || e.kind === K.FREE_THROW) && e.detail?.made === true && e.teamId) return e.detail.points ?? (e.kind === K.FREE_THROW ? 1 : 0);
  return 0;
}

function walkScores(normalized) {
  const { teams, events } = normalized;
  const sideOf = (teamId) => (teamId === teams.home.id ? "home" : teamId === teams.away.id ? "away" : null);
  const cur = { home: 0, away: 0 };
  const after = [];
  const breaks = []; // event indices whose score change is unexplained / invalid
  const leader = []; // team ID leading after each event, null = tied
  for (const e of events) {
    const prev = { ...cur };
    let broken = false;
    for (const s of ["home", "away"]) {
      if (e.scoreAfter?.[s] == null) broken = true;
      else cur[s] = e.scoreAfter[s];
    }
    const pts = scoringPoints(e);
    const side = sideOf(e.teamId);
    for (const s of ["home", "away"]) {
      const expected = prev[s] + (s === side ? pts : 0);
      if (cur[s] !== expected) broken = true;
    }
    if (broken) breaks.push(e.index);
    after.push({ ...cur });
    leader.push(cur.home > cur.away ? teams.home.id : cur.away > cur.home ? teams.away.id : null);
  }
  const before = (i) => (i <= 0 ? { home: 0, away: 0 } : after[i - 1]);
  const hasBreak = (from, to) => breaks.some((b) => b >= from && b <= to);
  return { sideOf, after, before, leader, breaks, hasBreak };
}

function margin(score, teamId, teams) {
  return teamId === teams.home.id ? score.home - score.away : score.away - score.home;
}

// ---------------------------------------------------------------------------
// Context helpers
// ---------------------------------------------------------------------------

function makeCtx(normalized, options) {
  const config = { ...HIGHLIGHT_CONFIG, ...(options.config ?? {}) };
  const { teams, events, format } = normalized;
  const reg = format?.regulationPeriods ?? 4;
  const stateIndex = options.stateIndex ?? buildStateIndex(normalized);
  const capabilities = options.capabilities ?? validateReplay(normalized, stateIndex).capabilities;
  const opp = (teamId) => (teamId === teams.home.id ? teams.away.id : teamId === teams.away.id ? teams.home.id : null);
  const capOk = (family, playerId, teamId, eventIndex) => {
    if (capabilityFor(capabilities, family).level === L.UNAVAILABLE) return false;
    if (!playerId) return true;
    return capabilityFor(capabilities, family, { playerId, teamId, eventIndex }).level !== L.UNAVAILABLE;
  };
  const probAvailable = capabilityFor(capabilities, F.PROBABILITY).level !== L.UNAVAILABLE;
  // Carried probability after each event (latest linked sample ≤ i).
  const probAt = [];
  const samples = new Map((normalized.probability ?? []).map((s) => [s.eventIndex, s]));
  let carried = null;
  for (const e of events) {
    if (samples.has(e.index)) carried = samples.get(e.index);
    probAt.push(carried);
  }
  const lastPeriod = Math.max(0, ...events.map((e) => e.period ?? 0));
  return { config, teams, events, format, reg, stateIndex, capabilities, opp, capOk, probAvailable, probAt, lastPeriod };
}

const playerTeam = (normalized) => Object.fromEntries((normalized.players ?? []).map((p) => [p.id, p.teamId]));

function probabilityOver(ctx, from, to, teamId) {
  if (!ctx.probAvailable) return null;
  const b = from > 0 ? ctx.probAt[from - 1] : null;
  const a = ctx.probAt[to];
  if (!b || !a || a.eventIndex < from) return null; // need a sample inside the range
  const sign = teamId === ctx.teams.home.id ? 1 : -1;
  return { homeBefore: b.home, homeAfter: a.home, beforeIndex: b.eventIndex, afterIndex: a.eventIndex, delta: round3(sign * (a.home - b.home)), derived: a.derived === true || b.derived === true };
}

function timeWeight(ctx, e) {
  if (e.period == null || e.clockRemainingSec == null) return ctx.config.unknownClockWeight;
  if (e.period >= ctx.reg) return interp(ctx.config.finalPeriodTimeWeights, e.clockRemainingSec);
  return ctx.config.earlyPeriodTimeWeights[e.period] ?? 0.2;
}

const isLate = (ctx, e, sec = ctx.config.lateClockSec) => e.period != null && e.period >= ctx.reg && e.clockRemainingSec != null && e.clockRemainingSec <= sec;
const isFinish = (ctx, e) => isLate(ctx, e, ctx.config.finishWindowSec);

function importanceOf(ctx, c) {
  if (c.fixedImportance != null) return c.fixedImportance;
  const cfg = ctx.config;
  const key = ctx.events[c.keyEventIndex];
  let tw = timeWeight(ctx, key);
  if (c.type === T.FIRST_LEAD_SINCE || c.type === T.FIRST_LEAD) tw = Math.max(tw, cfg.firstLeadMinWeight);
  const cw = interp(cfg.closeWeights, Math.abs(c.closeMargin ?? 0));
  const ctxScore = (cfg.typeWeights[c.type] ?? 0.5) * tw * cw;
  const p = c.evidence.probability;
  const raw = p ? (1 - cfg.probWeight) * ctxScore + cfg.probWeight * Math.min(1, Math.abs(p.delta) / cfg.probFullSwing) : ctxScore;
  return round3(100 * raw);
}

const clockOf = (e) => ({ period: e.period, clockSec: e.clockRemainingSec });

// ---------------------------------------------------------------------------
// 2. Candidates
// ---------------------------------------------------------------------------

/** Scoring units: a made score plus same-team scores at the same period/clock. */
function scoringUnits(events, ctx) {
  const units = [];
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (!scoringPoints(e)) continue;
    let end = i;
    for (let j = i + 1; j < events.length; j++) {
      const x = events[j];
      if (x.period !== e.period || x.clockRemainingSec !== e.clockRemainingSec || e.clockRemainingSec == null) break;
      if (x.kind === K.PERIOD_END || x.kind === K.GAME_END || x.kind === K.FIELD_GOAL) break;
      if (scoringPoints(x) && x.teamId !== e.teamId) break;
      if (x.kind === K.FREE_THROW && x.teamId !== e.teamId) break;
      if (scoringPoints(x)) end = j;
    }
    units.push({ from: i, to: end, teamId: e.teamId });
    i = end;
  }
  return units;
}

function leadHistory(ctx, walk, teamId, start) {
  // Last event before `start` after which `teamId` led, and the event that ended that lead.
  let lastLed = -1;
  for (let k = start - 1; k >= 0; k--) {
    if (walk.leader[k] === teamId) {
      lastLed = k;
      break;
    }
  }
  let maxDeficit = 0;
  for (let k = lastLed + 1; k < start; k++) maxDeficit = Math.max(maxDeficit, -margin(walk.after[k], teamId, ctx.teams));
  const leadEnd = lastLed >= 0 ? lastLed + 1 : null;
  return { lastLed, leadEnd, maxDeficit };
}

function feedStartsAtTip(ctx) {
  const e0 = ctx.events[0];
  return !!e0 && e0.period === 1 && e0.clockRemainingSec != null && e0.clockRemainingSec >= periodLengthSec(1, ctx.format ?? undefined) - ctx.config.feedStartToleranceSec;
}

function runBefore(walk, ctx, teamId, start) {
  // Unanswered points by `teamId` immediately before `start` (evidence only).
  let pts = 0;
  for (let k = start - 1; k >= 0; k--) {
    const p = scoringPoints(ctx.events[k]);
    if (!p) continue;
    if (ctx.events[k].teamId !== teamId) break;
    pts += p;
  }
  return pts;
}

function largestLeads(walk, ctx, upto) {
  let home = 0;
  let away = 0;
  for (let k = 0; k <= upto; k++) {
    const m = walk.after[k].home - walk.after[k].away;
    home = Math.max(home, m);
    away = Math.max(away, -m);
  }
  return { [ctx.teams.home.id]: home, [ctx.teams.away.id]: away };
}

function scorerParams(ctx, ev, teamId) {
  const shooter = ev.roles?.shooter;
  const params = {};
  const playerIds = [];
  if (shooter && ctx.capOk(F.PTS, shooter, teamId, ev.index)) {
    params.playerId = shooter;
    playerIds.push(shooter);
  }
  params.action = ev.kind === K.FREE_THROW ? "free_throw" : "field_goal";
  if (ev.kind === K.FIELD_GOAL && (ev.detail.attemptValue === 2 || (ev.detail.attemptValue === 3 && (!shooter || ctx.capOk(F.TPT, shooter, teamId, ev.index))))) params.shotValue = ev.detail.attemptValue;
  return { params, playerIds };
}

const scoreParams = (s) => ({ scoreHome: s.home, scoreAway: s.away });

function scoringCandidates(ctx, walk) {
  const out = [];
  const { teams, events, config } = ctx;
  const tipOk = feedStartsAtTip(ctx);
  for (const u of scoringUnits(events, ctx)) {
    const t = u.teamId;
    const sb = walk.before(u.from);
    const sa = walk.after[u.to];
    const mB = margin(sb, t, teams);
    const mA = margin(sa, t, teams);
    const key = events[u.to];
    // Event in the unit at which the margin reached its final sign.
    const sign = Math.sign(mA);
    let crossing = u.to;
    for (let k = u.from; k <= u.to; k++) {
      if (scoringPoints(events[k]) && Math.sign(margin(walk.after[k], t, teams)) === sign) {
        crossing = k;
        break;
      }
    }
    const intermediateTie = sign > 0 && mB < 0 && events.slice(u.from, u.to + 1).some((x) => x.index < u.to && margin(walk.after[x.index], t, teams) === 0);
    const prob = probabilityOver(ctx, u.from, u.to, t);
    // Lead history is only meaningful when the team was not already ahead.
    const lh = mB <= 0 ? leadHistory(ctx, walk, t, u.from) : { lastLed: -1, leadEnd: null, maxDeficit: 0 };
    const evidence = {
      scoreBefore: sb,
      scoreAfter: sa,
      marginBefore: mB,
      marginAfter: mA,
      ...clockOf(key),
      gameElapsedSec: key.gameElapsedSec,
      points: mA - mB,
      unit: { from: u.from, to: u.to },
      crossingEventIndex: crossing,
      intermediateTie,
      probability: prob,
      ledBefore: mB > 0,
      lastLed: lh.lastLed >= 0 ? { eventIndex: lh.lastLed, ...clockOf(events[lh.lastLed]) } : null,
      leadEnded: lh.leadEnd != null ? { eventIndex: lh.leadEnd, ...clockOf(events[lh.leadEnd]) } : null,
      maxDeficitSinceLead: lh.maxDeficit,
      runPoints: runBefore(walk, ctx, t, u.from) + (mA - mB),
      largestLeads: largestLeads(walk, ctx, u.to),
      scoreConsistent: !walk.hasBreak(u.from, u.to),
    };
    let type = null;
    if (mB < 0 && mA === 0) type = T.TIE;
    else if (mB < 0 && mA > 0) type = T.LEAD_CHANGE;
    else if (mB === 0 && mA > 0) type = T.GO_AHEAD;

    const { params, playerIds } = scorerParams(ctx, events[crossing], t);
    const base = { teamId: t, keyEventIndex: crossing, range: { from: u.from, to: u.to }, closeMargin: 0, evidence };
    const common = { teamId: t, ...params, ...scoreParams(sa), period: key.period, clockSec: key.clockRemainingSec };

    if (type) {
      let drop = null;
      if (!evidence.scoreConsistent) drop = D.SCORE_INCONSISTENT;
      else if (sb.home + sb.away === 0) drop = D.OPENING_SCORE;
      else if (sb.home + sb.away < config.minPointsForLeadMoments && !isLate(ctx, key)) drop = D.EARLY_ROUTINE;
      // Long-awaited lead: requires complete score history over the whole claimed span.
      if (type !== T.TIE && !drop) {
        const spanFrom = lh.leadEnd ?? 0;
        const historyComplete = !walk.hasBreak(spanFrom, u.to) && (lh.leadEnd != null || tipOk);
        const since = lh.leadEnd != null ? events[lh.leadEnd] : null;
        const droughtSec = key.gameElapsedSec == null ? null : since ? (since.gameElapsedSec == null ? null : key.gameElapsedSec - since.gameElapsedSec) : key.gameElapsedSec;
        evidence.historyComplete = historyComplete;
        evidence.droughtSec = droughtSec == null ? null : round3(droughtSec);
        evidence.neverLed = lh.lastLed < 0;
        if (droughtSec != null && droughtSec >= config.firstLeadMinDroughtSec && lh.maxDeficit >= config.firstLeadMinDeficit) {
          if (historyComplete) {
            type = since ? T.FIRST_LEAD_SINCE : T.FIRST_LEAD;
            if (since) Object.assign(common, { sincePeriod: since.period, sinceClockSec: since.clockRemainingSec });
          } else evidence.longLeadClaimOmitted = "history_incomplete";
        }
      }
      if (intermediateTie) common.viaTie = 1;
      out.push({ ...base, type, playerIds, captionParams: common, drop });
      continue;
    }
    // big_shot: late made field goal with a large supported probability swing.
    const hasFg = events.slice(u.from, u.to + 1).some((x) => x.kind === K.FIELD_GOAL && scoringPoints(x));
    if (!hasFg || !isLate(ctx, key, config.bigShotLateSec)) continue;
    const fg = events.slice(u.from, u.to + 1).find((x) => x.kind === K.FIELD_GOAL && scoringPoints(x));
    const fgParams = scorerParams(ctx, fg, t);
    let drop = null;
    // Close-finish basket: within `bigShotCloseMargin` before the shot, late (score known at that point).
    const closeOk = isLate(ctx, key, config.bigShotCloseLateSec) && Math.abs(mB) <= config.bigShotCloseMargin && (!prob || prob.delta > 0);
    const swingOk = prob ? prob.delta >= config.bigShotMinSwing : Math.abs(mB) <= 2 && mA >= 4 && isLate(ctx, key, 120);
    if (!evidence.scoreConsistent) drop = D.SCORE_INCONSISTENT;
    else if (!swingOk && !closeOk) drop = D.BELOW_SWING;
    out.push({
      ...base,
      keyEventIndex: fg.index,
      closeMargin: mB,
      type: T.BIG_SHOT,
      playerIds: fgParams.playerIds,
      captionParams: { ...common, ...fgParams.params },
      evidence: { ...evidence, basis: swingOk ? (prob ? "probability" : "context") : "close_finish" },
      drop,
    });
  }
  return out;
}

function defensiveGate(ctx, e, marginAbs, prob) {
  const c = ctx.config;
  const lateClose = isLate(ctx, e, c.defensiveLateSec) && marginAbs <= c.defensiveCloseMargin;
  const swing = prob != null && Math.abs(prob.delta) >= c.defensiveMinSwing;
  return lateClose || swing;
}

function nextRebound(events, i) {
  for (let j = i + 1; j < events.length; j++) {
    const x = events[j];
    if (x.kind === K.REBOUND) return j;
    if (!QUIET_KINDS.has(x.kind) || x.period !== events[i].period) return null;
  }
  return null;
}

function stealLink(ctx, units, i, stealTeam) {
  const { events, config } = ctx;
  const e = events[i];
  for (let j = i + 1; j < events.length; j++) {
    const x = events[j];
    if (x.period !== e.period || x.kind === K.PERIOD_END || x.kind === K.GAME_END) return null;
    if (e.clockRemainingSec == null || x.clockRemainingSec == null || e.clockRemainingSec - x.clockRemainingSec > config.stealLinkSec) return null;
    if (scoringPoints(x) && x.teamId === stealTeam) {
      const u = units.find((v) => v.from === j);
      return u ? { kind: "score", from: u.from, to: u.to } : null;
    }
    // Possession won and immediately lost again: one moment, not two.
    if (x.kind === K.TURNOVER && x.teamId === stealTeam) return { kind: "turnover", from: j, to: j };
    if (x.kind === K.FIELD_GOAL || x.kind === K.TURNOVER || x.kind === K.FREE_THROW || x.kind === K.JUMP_BALL) return null;
  }
  return null;
}

function defensiveCandidates(ctx, walk, units) {
  const out = [];
  const { events, teams } = ctx;
  for (const e of events) {
    const i = e.index;
    const sb = walk.before(i);
    if (e.kind === K.TURNOVER && e.teamId) {
      const stealer = e.roles?.stealer;
      if (stealer) {
        const t = ctx.opp(e.teamId);
        const link = stealLink(ctx, units, i, t);
        const to = link ? link.to : i;
        const prob = probabilityOver(ctx, i, to, t);
        const mB = margin(sb, t, teams);
        const sa = walk.after[to];
        let drop = null;
        if (!ctx.capOk(F.STL, stealer, t, i)) drop = D.CAPABILITY_UNAVAILABLE;
        else if (!defensiveGate(ctx, e, Math.abs(mB), prob) && !(link?.kind === "score" && Math.abs(mB) <= ctx.config.stealScoreMaxMargin)) drop = D.ROUTINE;
        else if (walk.hasBreak(i, to)) drop = D.SCORE_INCONSISTENT;
        const captionParams = { teamId: t, playerId: stealer, ...scoreParams(sa), marginBefore: mB, period: e.period, clockSec: e.clockRemainingSec };
        if (e.roles.turnoverBy) captionParams.turnoverPlayerId = e.roles.turnoverBy;
        if (link?.kind === "score") {
          const scorer = events[link.from].roles?.shooter;
          captionParams.followedBy = "score";
          if (scorer && ctx.capOk(F.PTS, scorer, t, link.from)) captionParams.scorerId = scorer;
        } else if (link?.kind === "turnover") captionParams.followedBy = "turnover";
        out.push({
          type: T.STEAL,
          teamId: t,
          keyEventIndex: i,
          range: { from: i, to },
          playerIds: [stealer, ...(captionParams.scorerId && captionParams.scorerId !== stealer ? [captionParams.scorerId] : [])],
          closeMargin: mB,
          captionParams,
          evidence: { scoreBefore: sb, scoreAfter: sa, marginBefore: mB, ...clockOf(e), stealerId: stealer, turnoverBy: e.roles.turnoverBy ?? null, linkedScore: link?.kind === "score" ? { from: link.from, to: link.to } : null, linkedTurnover: link?.kind === "turnover" ? link.from : null, probability: prob },
          drop,
        });
      } else {
        const t = e.teamId;
        const prob = probabilityOver(ctx, i, i, t);
        const mB = margin(sb, t, teams);
        const by = e.roles?.turnoverBy;
        const attributed = by && ctx.capOk(F.TO, by, t, i);
        let drop = null;
        if (!defensiveGate(ctx, e, Math.abs(mB), prob)) drop = D.ROUTINE;
        else if (prob && Math.abs(prob.delta) < ctx.config.turnoverMinSwing) drop = D.BELOW_SWING;
        const captionParams = { teamId: t, ...scoreParams(walk.after[i]), marginBefore: mB, period: e.period, clockSec: e.clockRemainingSec };
        if (attributed) captionParams.playerId = by;
        out.push({
          type: T.TURNOVER,
          teamId: t,
          keyEventIndex: i,
          range: { from: i, to: i },
          playerIds: attributed ? [by] : [],
          closeMargin: mB,
          captionParams,
          evidence: { scoreBefore: sb, scoreAfter: walk.after[i], marginBefore: mB, ...clockOf(e), turnoverBy: by ?? null, teamOnly: e.detail?.teamOnly === true, probability: prob },
          drop,
        });
      }
    }
    if (e.kind === K.FIELD_GOAL && e.detail?.blocked && e.roles?.blocker && e.teamId) {
      const shooterTeam = e.teamId;
      const t = ctx.opp(shooterTeam);
      const blocker = e.roles.blocker;
      const v = e.detail.attemptValue;
      const mS = margin(sb, shooterTeam, teams);
      const reb = nextRebound(events, i);
      const to = reb ?? i;
      const prob = probabilityOver(ctx, i, to, t);
      // A block on a leading team's shot ("extend") counts only late, close and with a
      // large supported probability swing for the blocking team.
      const leadingOk = mS > 0 && mS <= ctx.config.defensiveCloseMargin && isLate(ctx, e, ctx.config.defensiveLateSec) && prob != null && prob.delta >= ctx.config.blockLeadingMinSwing;
      const stake = v == null ? null : mS > 0 ? (leadingOk ? "extend" : null) : mS + v === 0 ? "tie" : mS + v > 0 ? "go_ahead" : null;
      let drop = null;
      if (!ctx.capOk(F.BLK, blocker, t, i)) drop = D.CAPABILITY_UNAVAILABLE;
      else if (v == null) drop = D.UNKNOWN_SHOT_VALUE;
      else if (mS > 0 && !leadingOk) drop = D.SHOOTER_LEADING;
      else if (!stake) drop = D.SHOT_COULD_NOT_TIE;
      else if (stake === "extend" && !defensiveGate(ctx, e, Math.abs(mS), prob)) drop = D.ROUTINE;
      const captionParams = { teamId: t, playerId: blocker, ...scoreParams(walk.after[to]), period: e.period, clockSec: e.clockRemainingSec };
      if (stake) captionParams.stake = stake;
      const shooter = e.roles.shooter;
      if (shooter) captionParams.shooterId = shooter;
      if (v === 2 || (v === 3 && (!shooter || ctx.capOk(F.TPT, shooter, shooterTeam, i)))) captionParams.shotValue = v;
      out.push({
        type: T.BLOCK,
        teamId: t,
        keyEventIndex: i,
        range: { from: i, to },
        playerIds: [blocker],
        closeMargin: mS,
        captionParams,
        evidence: { scoreBefore: sb, scoreAfter: walk.after[to], shooterMarginBefore: mS, attemptValue: v, stake, ...clockOf(e), blockerId: blocker, shooterId: shooter ?? null, reboundIndex: reb, probability: prob },
        drop,
      });
    }
  }
  return out;
}

function finalAttemptCandidates(ctx, walk) {
  const out = [];
  const { events, teams, config } = ctx;
  for (const e of events) {
    if (e.kind !== K.FIELD_GOAL || e.detail?.made === true || !e.teamId) continue;
    if (e.period == null || e.period < ctx.reg || e.clockRemainingSec == null || e.clockRemainingSec > config.finalAttemptMaxClockSec) continue;
    const i = e.index;
    const t = e.teamId;
    const sb = walk.before(i);
    const mB = margin(sb, t, teams);
    const v = e.detail.attemptValue;
    // Confirm that nothing but quiet events happen before this period's end marker.
    let periodEnd = null;
    let interrupting = null;
    for (let j = i + 1; j < events.length; j++) {
      const x = events[j];
      if (x.kind === K.PERIOD_END && x.period === e.period) {
        periodEnd = j;
        break;
      }
      if (x.period !== e.period) break;
      if (!QUIET_KINDS.has(x.kind) || scoringPoints(x)) {
        interrupting = j;
        break;
      }
    }
    const stake = v == null || mB > 0 ? null : mB + v === 0 ? "tie" : mB + v > 0 ? "win" : null;
    let drop = null;
    if (v == null) drop = D.UNKNOWN_SHOT_VALUE;
    else if (mB > 0) drop = D.SHOOTER_LEADING;
    else if (!stake) drop = D.SHOT_COULD_NOT_TIE;
    else if (interrupting != null) drop = D.MORE_POSSESSIONS_FOLLOWED;
    else if (periodEnd == null) drop = D.PERIOD_END_UNCONFIRMED;
    else if (walk.hasBreak(i, periodEnd)) drop = D.SCORE_INCONSISTENT;
    const to = periodEnd != null && interrupting == null ? periodEnd - 1 : i;
    const shooter = e.roles?.shooter;
    const captionParams = { teamId: t, ...scoreParams(sb), period: e.period, clockSec: e.clockRemainingSec };
    if (stake) captionParams.stake = stake;
    const playerIds = [];
    if (shooter && ctx.capOk(F.FG, shooter, t, i)) {
      captionParams.playerId = shooter;
      playerIds.push(shooter);
    }
    if (v === 2 || (v === 3 && (!shooter || ctx.capOk(F.TPT, shooter, t, i)))) captionParams.shotValue = v;
    if (e.detail.blocked && e.roles?.blocker) captionParams.blockerId = e.roles.blocker;
    out.push({
      type: T.MISSED_FINAL_ATTEMPT,
      teamId: t,
      keyEventIndex: i,
      range: { from: i, to },
      playerIds,
      closeMargin: mB,
      fixedImportance: null,
      captionParams,
      evidence: {
        scoreBefore: sb,
        scoreAfter: walk.after[to],
        marginBefore: mB,
        attemptValue: v,
        heave: e.detail.heave === true,
        blocked: e.detail.blocked === true,
        stake,
        ...clockOf(e),
        // Look-ahead checks used to admit the claim. Never surface in captions/holds (W09/W10).
        verification: {
          lookAhead: true,
          periodEndIndex: periodEnd,
          interruptingEventIndex: interrupting,
          eventsUntilPeriodEnd: periodEnd != null && interrupting == null ? events.slice(i + 1, periodEnd).map((x) => ({ eventIndex: x.index, kind: x.kind })) : null,
        },
        probability: probabilityOver(ctx, i, to, t),
      },
      drop,
    });
  }
  return out;
}

/**
 * Late tying/go-ahead misses that were NOT the period's final attempt (period ≥
 * the last regulation period, ≤ `lateAttemptMaxClockSec` left, shooter trailing
 * or tied, attempt value checked against the deficit). The range ends at the
 * next rebound. Captions state only the stake known at the shot.
 */
function lateAttemptCandidates(ctx, walk, finals) {
  const out = [];
  const { events, teams, config } = ctx;
  const finalOk = new Set(finals.filter((c) => !c.drop).map((c) => c.keyEventIndex));
  for (const e of events) {
    if (e.kind !== K.FIELD_GOAL || e.detail?.made === true || !e.teamId || finalOk.has(e.index)) continue;
    if (e.period == null || e.period < ctx.reg || e.clockRemainingSec == null || e.clockRemainingSec > config.lateAttemptMaxClockSec) continue;
    const i = e.index;
    const t = e.teamId;
    const sb = walk.before(i);
    const mB = margin(sb, t, teams);
    const v = e.detail.attemptValue;
    if (v == null || mB > 0 || mB + v < 0) continue; // only shots that could tie or take the lead
    const stake = mB + v === 0 ? "tie" : "go_ahead";
    const reb = nextRebound(events, i);
    const to = reb ?? i;
    const shooter = e.roles?.shooter;
    const captionParams = { teamId: t, ...scoreParams(sb), stake, period: e.period, clockSec: e.clockRemainingSec };
    const playerIds = [];
    if (shooter && ctx.capOk(F.FG, shooter, t, i)) {
      captionParams.playerId = shooter;
      playerIds.push(shooter);
    }
    if (v === 2 || (v === 3 && (!shooter || ctx.capOk(F.TPT, shooter, t, i)))) captionParams.shotValue = v;
    out.push({
      type: T.MISSED_LATE_ATTEMPT,
      teamId: t,
      keyEventIndex: i,
      range: { from: i, to },
      playerIds,
      closeMargin: mB,
      captionParams,
      evidence: { scoreBefore: sb, scoreAfter: walk.after[to], marginBefore: mB, attemptValue: v, stake, blocked: e.detail.blocked === true, reboundIndex: reb, ...clockOf(e), probability: probabilityOver(ctx, i, to, t) },
      drop: walk.hasBreak(i, to) ? D.SCORE_INCONSISTENT : null,
    });
  }
  return out;
}

/** Margin before event `i` is settled for the rest of regulation (score known at that point). */
function settledBefore(ctx, walk, i) {
  const e = ctx.events[i];
  if (e?.period == null || e.clockRemainingSec == null || e.period > ctx.reg) return false;
  const regSec = ctx.format?.regulationSec ?? 720;
  const minutesLeft = ((ctx.reg - e.period) * regSec + e.clockRemainingSec) / 60;
  const sb = walk.before(i);
  return Math.abs(sb.home - sb.away) >= ctx.config.settled.baseMargin + ctx.config.settled.perMinute * minutesLeft;
}

const secondaryImportance = (ctx, base, e) => round3(base + ctx.config.secondaryPeriodBonus * (Math.min(e?.period ?? 1, ctx.reg) - 1));

/**
 * Scoring runs: unanswered points by one team. One candidate per run of at
 * least `runMinPoints`, at the run's last scoring unit; `runPoints` is the run
 * so far at that unit (true at the hold). Choosing the last unit is a
 * selection detail only — nothing about the run's end is surfaced. Requires
 * score continuity over the whole run.
 */
function runCandidates(ctx, walk, units) {
  const out = [];
  const { events, teams, config } = ctx;
  let run = null; // { teamId, from, points, units: [] }
  const flush = () => {
    if (!run || run.points < config.runMinPoints) return;
    const u = run.units[run.units.length - 1];
    const key = events[u.to];
    const sa = walk.after[u.to];
    const imp = config.runImportance;
    out.push({
      type: T.SCORING_RUN,
      teamId: run.teamId,
      keyEventIndex: u.to,
      range: { from: u.from, to: u.to },
      playerIds: [], // a team moment
      fixedImportance: secondaryImportance(ctx, Math.min(imp.max, imp.base + imp.perPoint * (run.points - config.runMinPoints)), key),
      captionParams: { teamId: run.teamId, runPoints: run.points, ...scoreParams(sa), period: key.period, clockSec: key.clockRemainingSec },
      evidence: { scoreBefore: walk.before(u.from), scoreAfter: sa, runPoints: run.points, runStartIndex: run.from, runUnits: run.units.length, marginAfter: margin(sa, run.teamId, teams), ...clockOf(key), probability: probabilityOver(ctx, u.from, u.to, run.teamId) },
      drop: walk.hasBreak(run.from, u.to)
        ? D.SCORE_INCONSISTENT
        : (isLate(ctx, key, config.milestoneGarbageClockSec) && Math.abs(sa.home - sa.away) >= config.runGarbageMargin) || settledBefore(ctx, walk, u.from) || -margin(sa, run.teamId, teams) >= config.trailingMaxDeficit
          ? D.GARBAGE_TIME
          : null,
    });
  };
  let lastOppScore = -1; // index of the last score by any team (run starts after it)
  for (const u of units) {
    const pts = margin(walk.after[u.to], u.teamId, teams) - margin(walk.before(u.from), u.teamId, teams);
    if (!run || run.teamId !== u.teamId) {
      flush();
      run = { teamId: u.teamId, from: lastOppScore + 1, points: 0, units: [] };
    }
    run.points += pts;
    run.units.push(u);
    lastOppScore = u.to;
  }
  flush();
  return out;
}

const PLAYER_DD_STATS = [
  ["pts", F.PTS],
  ["reb", F.REB],
  ["ast", F.AST],
  ["stl", F.STL],
  ["blk", F.BLK],
];

/**
 * Player milestones from running state (`stateAt`): the event at which a
 * player's points first reach each `playerPointMilestones` value, and the
 * first double-double / triple-double (≥ 10 in two / three of PTS, REB, AST,
 * STL, BLK). Every family involved must be usable for the player at that event.
 */
function playerMilestoneCandidates(ctx, normalized, walk) {
  const out = [];
  const { events, config } = ctx;
  const teamOf = playerTeam(normalized);
  const imp = config.playerMilestoneImportance;
  // Running player counters, the same per-event deltas state.js applies (verified against stateAt later).
  const sctx = statContext(normalized);
  const rows = {};
  for (const e of events) {
    const deltas = eventStatDeltas(e, sctx);
    for (const [id, d] of Object.entries(deltas.players)) {
      const b = { ...(rows[id] ?? {}) };
      const a = { ...b };
      for (const [k, v] of Object.entries(d)) a[k] = (a[k] ?? 0) + v;
      rows[id] = a;
      for (const k of ["pts", ...PLAYER_DD_STATS.map(([x]) => x)]) {
        a[k] ??= 0;
        b[k] ??= 0;
      }
      const t = teamOf[id] ?? e.teamId;
      const base = { teamId: t, keyEventIndex: e.index, range: { from: e.index, to: e.index }, playerIds: [id], closeMargin: 0 };
      // In the last regulation period of a settled game, running stats are not a story.
      const garbage = e.period != null && e.period >= ctx.reg && settledBefore(ctx, walk, e.index);
      const common = { teamId: t, playerId: id, period: e.period, clockSec: e.clockRemainingSec };
      for (const th of config.playerPointMilestones) {
        if (!(b.pts < th && a.pts >= th)) continue;
        out.push({
          ...base,
          type: T.PLAYER_MILESTONE,
          fixedImportance: secondaryImportance(ctx, imp[th] ?? 14, e),
          captionParams: { ...common, milestone: "points", threshold: th, pts: a.pts },
          evidence: { milestone: "points", threshold: th, stat: "pts", before: b.pts, after: a.pts, ...clockOf(e), probability: null },
          drop: !ctx.capOk(F.PTS, id, t, e.index) ? D.CAPABILITY_UNAVAILABLE : garbage ? D.GARBAGE_TIME : null,
          milestoneKey: `points-${th}`,
        });
      }
      const tens = (row) => PLAYER_DD_STATS.filter(([k]) => (row[k] ?? 0) >= 10);
      const nA = tens(a);
      const nB = tens(b);
      for (const [kind, need] of [
        ["double_double", 2],
        ["triple_double", 3],
      ]) {
        if (!(nB.length < need && nA.length >= need)) continue;
        const stats = nA.slice(0, need);
        const usable = stats.every(([, fam]) => ctx.capOk(fam, id, t, e.index));
        const params = { ...common, milestone: kind };
        stats.forEach(([k], n) => {
          params[`stat${n + 1}`] = k;
          params[`value${n + 1}`] = a[k];
        });
        out.push({
          ...base,
          type: T.PLAYER_MILESTONE,
          fixedImportance: secondaryImportance(ctx, imp[kind] ?? 15, e),
          captionParams: params,
          evidence: { milestone: kind, stats: Object.fromEntries(stats.map(([k]) => [k, { before: b[k], after: a[k] }])), ...clockOf(e), probability: null },
          drop: !usable ? D.CAPABILITY_UNAVAILABLE : garbage ? D.GARBAGE_TIME : null,
          milestoneKey: kind,
        });
      }
    }
  }
  return out;
}

/**
 * A made field goal with ≤ `closingBasketMaxClockSec` left in a period before
 * the last regulation period (the clock is the event's own; no claim about the
 * buzzer). Range: its scoring unit.
 */
function closingBasketCandidates(ctx, walk, units) {
  const out = [];
  const { events, config } = ctx;
  for (const u of units) {
    const fg = events.slice(u.from, u.to + 1).find((x) => x.kind === K.FIELD_GOAL && scoringPoints(x));
    // Periods before the last regulation period only: in the finish, a basket matters through its score effect (lead types).
    if (!fg || fg.clockRemainingSec == null || fg.clockRemainingSec > config.closingBasketMaxClockSec || fg.period == null || fg.period >= ctx.reg) continue;
    const t = u.teamId;
    const { params, playerIds } = scorerParams(ctx, fg, t);
    const sa = walk.after[u.to];
    out.push({
      type: T.CLOSING_BASKET,
      teamId: t,
      keyEventIndex: fg.index,
      range: { from: u.from, to: u.to },
      playerIds,
      fixedImportance: secondaryImportance(ctx, config.closingBasketImportance[params.shotValue] ?? config.closingBasketImportance[2], fg),
      captionParams: { teamId: t, ...params, ...scoreParams(sa), period: fg.period, clockSec: fg.clockRemainingSec },
      evidence: { scoreBefore: walk.before(u.from), scoreAfter: sa, ...clockOf(fg), probability: probabilityOver(ctx, u.from, u.to, t) },
      drop: walk.hasBreak(u.from, u.to) ? D.SCORE_INCONSISTENT : settledBefore(ctx, walk, u.from) || -margin(sa, t, ctx.teams) >= config.trailingMaxDeficit ? D.GARBAGE_TIME : null,
    });
  }
  return out;
}

/**
 * End-of-period state at the PERIOD_END marker of every period before the last
 * regulation period (the boundary itself is the event, so stating it is safe).
 */
function periodEndCandidates(ctx, walk) {
  const out = [];
  const { events, config } = ctx;
  for (const e of events) {
    if (e.kind !== K.PERIOD_END || e.period == null || e.period >= ctx.reg) continue;
    const s = walk.after[e.index];
    const leader = walk.leader[e.index];
    const halftime = ctx.reg % 2 === 0 && e.period === ctx.reg / 2;
    out.push({
      type: T.PERIOD_END,
      teamId: leader,
      keyEventIndex: e.index,
      range: { from: e.index, to: e.index },
      playerIds: [],
      fixedImportance: secondaryImportance(ctx, halftime ? config.halftimeImportance : config.periodEndImportance, e),
      captionParams: { ...(leader ? { teamId: leader, lead: Math.abs(s.home - s.away) } : {}), ...scoreParams(s), endedPeriod: e.period, ...(halftime ? { halftime: 1 } : {}) },
      evidence: { scoreAfter: s, periodEndIndex: e.index, leader, tied: !leader, marginHome: s.home - s.away, ...clockOf(e) },
      drop: null,
    });
  }
  return out;
}

function boundaryCandidates(ctx, walk, finalAttempts) {
  const out = [];
  const { events, config, teams } = ctx;
  for (const e of events) {
    if (e.kind !== K.PERIOD_END || e.period == null || e.period < ctx.reg) continue;
    const s = walk.after[e.index];
    const next = events.find((x) => x.index > e.index && x.period === e.period + 1);
    if (s.home === s.away && next) {
      out.push({
        type: T.OVERTIME,
        teamId: null,
        keyEventIndex: e.index,
        range: { from: e.index, to: e.index },
        playerIds: [],
        fixedImportance: config.overtimeImportance,
        captionParams: { ...scoreParams(s), endedPeriod: e.period, nextPeriod: e.period + 1, overtimeNumber: e.period + 1 - ctx.reg },
        evidence: { scoreAfter: s, periodEndIndex: e.index, tied: true, ...clockOf(e), verification: { lookAhead: true, nextPeriodFirstIndex: next.index } },
        drop: walk.hasBreak(0, e.index) ? D.SCORE_INCONSISTENT : null,
      });
    } else if (!next && e.period === ctx.lastPeriod) {
      const decided = finalAttempts.find((c) => !c.drop && c.evidence.verification.periodEndIndex === e.index);
      const gameEnd = events.find((x) => x.index > e.index && x.kind === K.GAME_END);
      if (!decided || !gameEnd || s.home === s.away) continue;
      out.push({
        type: T.GAME_END,
        teamId: null,
        keyEventIndex: e.index,
        range: { from: e.index, to: e.index },
        playerIds: [],
        fixedImportance: config.gameEndImportance,
        captionParams: { ...scoreParams(s), winnerTeamId: s.home > s.away ? teams.home.id : teams.away.id, period: e.period },
        evidence: { scoreAfter: s, periodEndIndex: e.index, afterAttempt: decided.keyEventIndex, verification: { lookAhead: true, gameEndIndex: gameEnd.index } },
        drop: null,
      });
    }
  }
  return out;
}

/**
 * Lead milestones: the scoring unit at which a team's lead FIRST reaches each
 * `leadMilestones` value. Requires complete score history from tip-off ("first
 * time" claim) and is skipped in garbage time (last regulation period / OT with
 * ≤ `milestoneGarbageClockSec` left). Fixed importance per threshold.
 */
function milestoneCandidates(ctx, walk, units) {
  const out = [];
  const { events, teams, config } = ctx;
  const best = { [teams.home.id]: 0, [teams.away.id]: 0 };
  const tipOk = feedStartsAtTip(ctx);
  for (const u of units) {
    const t = u.teamId;
    const mA = margin(walk.after[u.to], t, teams);
    const prevBest = best[t];
    best[t] = Math.max(prevBest, mA);
    // One candidate per unit: the highest threshold first reached by it.
    const crossed = config.leadMilestones.filter((th) => prevBest < th && mA >= th);
    for (const threshold of crossed.slice(-1)) {
      const key = events[u.to];
      let drop = null;
      if (!tipOk || walk.hasBreak(0, u.to)) drop = D.HISTORY_INCOMPLETE;
      else if (isLate(ctx, key, config.milestoneGarbageClockSec) || settledBefore(ctx, walk, u.from)) drop = D.GARBAGE_TIME;
      const scorerEv = events.slice(u.from, u.to + 1).find((x) => scoringPoints(x)) ?? key;
      const { params, playerIds } = scorerParams(ctx, scorerEv, t);
      out.push({
        type: T.LEAD_MILESTONE,
        teamId: t,
        keyEventIndex: u.to,
        range: { from: u.from, to: u.to },
        playerIds,
        fixedImportance: config.milestoneImportance[threshold] ?? 30,
        captionParams: { teamId: t, ...params, threshold, lead: mA, ...scoreParams(walk.after[u.to]), period: key.period, clockSec: key.clockRemainingSec },
        evidence: { scoreBefore: walk.before(u.from), scoreAfter: walk.after[u.to], marginBefore: margin(walk.before(u.from), t, teams), marginAfter: mA, threshold, previousLargestLead: prevBest, historyComplete: drop !== D.HISTORY_INCOMPLETE, ...clockOf(key), probability: probabilityOver(ctx, u.from, u.to, t) },
        drop,
      });
    }
  }
  return out;
}

/**
 * Selection hint (never evidence/caption): the game's last lead change — the
 * moment the eventual winner took the lead for good. Uses future information,
 * so it only raises importance; captions must not claim "for good".
 */
function markDecisiveLead(ctx, walk, candidates) {
  const last = ctx.events.length - 1;
  const winner = walk.leader[last];
  if (!winner) return;
  let k = last;
  while (k >= 0 && walk.leader[k] === winner) k--;
  const crossing = k + 1;
  const c = candidates.find((x) => LEAD_TYPES.has(x.type) && x.type !== T.TIE && x.teamId === winner && x.keyEventIndex === crossing && !x.drop);
  if (!c) return;
  c.selection = { decisiveLead: true };
  c.importance = round3(Math.min(100, c.importance + ctx.config.decisiveLeadBoost));
}

function foulOutCandidates(ctx, normalized) {
  const out = [];
  const { events, config } = ctx;
  const teamOf = playerTeam(normalized);
  const counts = {};
  for (const e of events) {
    if (e.kind !== K.FOUL) continue;
    // A double personal foul (W20c) charges both players: `fouler` and `doubleFouler`.
    for (const id of [e.roles?.fouler, e.roles?.doubleFouler]) {
      if (!id) continue;
      counts[id] = (counts[id] ?? 0) + 1;
      if (counts[id] !== config.foulOutLimit) continue;
      const t = teamOf[id] ?? e.teamId;
      const drop = ctx.capOk(F.PF, id, t, e.index) ? null : D.CAPABILITY_UNAVAILABLE;
      out.push({
        type: T.FOUL_OUT,
        teamId: t,
        keyEventIndex: e.index,
        range: { from: e.index, to: e.index },
        playerIds: [id],
        closeMargin: 0,
        captionParams: { teamId: t, playerId: id, fouls: config.foulOutLimit, period: e.period, clockSec: e.clockRemainingSec },
        evidence: { fouls: config.foulOutLimit, ...clockOf(e), probability: null },
        drop,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 3–5. Grouping and verification
// ---------------------------------------------------------------------------

const candidateId = (c) => (c.type === T.PLAYER_MILESTONE ? `${c.type}-${c.keyEventIndex}-${c.milestoneKey}-${c.playerIds[0]}` : `${c.type}-${c.keyEventIndex}`);
const byImportanceThenOrder = (a, b) => b.importance - a.importance || a.keyEventIndex - b.keyEventIndex || a.id.localeCompare(b.id);

function mergeGroups(eligible, config) {
  // Overlapping ranges (steal→basket with the basket's own moment, block on a
  // final attempt, …) become one moment. Boundary moments never merge.
  const sorted = [...eligible].sort((a, b) => a.range.from - b.range.from || a.keyEventIndex - b.keyEventIndex);
  const groups = [];
  for (const c of sorted) {
    const g = groups[groups.length - 1];
    const boundary = (x) => x.type === T.OVERTIME || x.type === T.GAME_END || x.type === T.PERIOD_END;
    if (g && !boundary(c) && !boundary(g.members[0]) && c.range.from <= g.range.to) {
      g.members.push(c);
      g.range = { from: Math.min(g.range.from, c.range.from), to: Math.max(g.range.to, c.range.to) };
    } else groups.push({ members: [c], range: { ...c.range } });
  }
  return groups.map((g) => {
    const [primary, ...rest] = [...g.members].sort(byImportanceThenOrder);
    for (const r of rest) {
      r.drop = D.MERGED;
      r.mergedInto = primary.id;
    }
    primary.range = g.range;
    if (rest.length) {
      primary.related = rest.map((r) => ({ id: r.id, type: r.type, keyEventIndex: r.keyEventIndex, playerIds: r.playerIds }));
      primary.importance = round3(Math.min(100, primary.importance + config.groupBonus));
    }
    return primary;
  });
}

function verify(ctx, c) {
  const { stateIndex } = ctx;
  const own = c.ownRange ?? c.range;
  const after = stateIndex.stateAt(own.to);
  const eq = (a, b) => a && b && a.home === b.home && a.away === b.away;
  if (c.evidence.scoreAfter && !eq(after.score, c.evidence.scoreAfter)) return false;
  if (c.evidence.scoreBefore && !eq(stateIndex.stateAt(own.from - 1).score, c.evidence.scoreBefore)) return false;
  const counter = { [T.STEAL]: ["stl", c.evidence.stealerId], [T.BLOCK]: ["blk", c.evidence.blockerId], [T.FOUL_OUT]: ["pf", c.playerIds[0]] }[c.type];
  if (counter) {
    const [k, id] = counter;
    const at = stateIndex.stateAt(c.keyEventIndex).players[id]?.[k];
    const prev = stateIndex.stateAt(c.keyEventIndex - 1).players[id]?.[k];
    if (at == null || prev == null || at !== prev + 1) return false;
    if (c.type === T.FOUL_OUT && at !== ctx.config.foulOutLimit) return false;
  }
  if (c.type === T.PLAYER_MILESTONE) {
    const id = c.playerIds[0];
    const at = stateIndex.stateAt(c.keyEventIndex).players[id];
    const prev = stateIndex.stateAt(c.keyEventIndex - 1).players[id];
    if (!at || !prev) return false;
    const p = c.captionParams;
    if (p.milestone === "points") return prev.pts < p.threshold && at.pts >= p.threshold && at.pts === p.pts;
    const need = p.milestone === "triple_double" ? 3 : 2;
    const tens = (row) => PLAYER_DD_STATS.filter(([k]) => (row[k] ?? 0) >= 10).length;
    if (!(tens(prev) < need && tens(at) >= need)) return false;
    for (let n = 1; n <= need; n++) if (at[p[`stat${n}`]] !== p[`value${n}`] || p[`value${n}`] < 10) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// 6. Selection
// ---------------------------------------------------------------------------

function select(ctx, moments) {
  const cfg = ctx.config;
  const selected = [];
  const taken = new Set();
  const typeCount = {}; // by type + half (variety penalty)
  const gameTypeCount = {};
  const periodCount = {}; // every period
  const half = (c) => ((ctx.events[c.keyEventIndex].period ?? 1) <= Math.floor(ctx.reg / 2) ? 1 : 2);
  const typeKey = (c) => `${c.type}:${half(c)}`;
  const periodOf = (c) => ctx.events[c.keyEventIndex].period ?? null;
  const earlyPeriod = (c) => {
    const p = periodOf(c);
    return p != null && p < ctx.reg ? p : null;
  };
  const periodCap = (c) => cfg.maxPerEarlyPeriod + (c.selection?.decisiveLead ? 1 : 0);
  const earlyCapped = (c) => {
    const p = earlyPeriod(c);
    return p != null && (periodCount[p] ?? 0) >= periodCap(c);
  };
  const typeLimit = (type) => (type === T.LEAD_MILESTONE ? cfg.maxMilestones : (cfg.maxPerType?.[type] ?? cfg.maxPerTypeDefault));
  const typeCapped = (c) => !ALWAYS_KEEP.has(c.type) && (gameTypeCount[c.type] ?? 0) >= typeLimit(c.type);
  // Event-distance between two moments' ranges (0 = overlapping/adjacent indices count as 1).
  const gap = (a, b) => Math.max(a.range.from - b.range.to, b.range.from - a.range.to);
  // Only pairs involving a secondary (context) type are spaced; adjacent lead swings stay (the timeline keeps a fast gap).
  const sameState = (a, b) => {
    // A period-end hold right after another moment of that period showing the same score repeats it.
    const [pe, other] = a.type === T.PERIOD_END ? [a, b] : b.type === T.PERIOD_END ? [b, a] : [null, null];
    if (!pe || periodOf(other) !== pe.captionParams.endedPeriod) return false;
    const s = other.evidence.scoreAfter;
    return !!s && s.home === pe.captionParams.scoreHome && s.away === pe.captionParams.scoreAway;
  };
  const near = (a, b) => {
    if (gap(a, b) <= cfg.clusterEventGap) return true;
    const ea = ctx.events[a.keyEventIndex];
    const eb = ctx.events[b.keyEventIndex];
    return ea.period === eb.period && ea.gameElapsedSec != null && eb.gameElapsedSec != null && Math.abs(ea.gameElapsedSec - eb.gameElapsedSec) <= cfg.clusterGameSec;
  };
  let relaxCluster = false; // the fill pass (below minHighlights) keeps spacing but not the cluster limit
  const tooClose = (c) => {
    if (ALWAYS_KEEP.has(c.type)) return false;
    if (selected.some((x) => sameState(c, x))) return true;
    if (selected.some((x) => !ALWAYS_KEEP.has(x.type) && (SECONDARY.has(c.type) || SECONDARY.has(x.type)) && gap(c, x) < cfg.minEventGap)) return true;
    // The finish window keeps its possession-by-possession density (the timeline spaces the holds);
    // boundary / final-miss moments never count toward a cluster.
    if (relaxCluster || isFinish(ctx, ctx.events[c.keyEventIndex])) return false;
    return selected.filter((x) => !ALWAYS_KEEP.has(x.type) && near(c, x)).length >= cfg.clusterMax;
  };
  const open = (c) => !taken.has(c.id) && !typeCapped(c) && !earlyCapped(c) && !tooClose(c);
  const take = (c, phase) => {
    selected.push(c);
    taken.add(c.id);
    c.selectedIn = phase;
    typeCount[typeKey(c)] = (typeCount[typeKey(c)] ?? 0) + 1;
    gameTypeCount[c.type] = (gameTypeCount[c.type] ?? 0) + 1;
    const p = periodOf(c);
    if (p != null) periodCount[p] = (periodCount[p] ?? 0) + 1;
  };
  const full = () => selected.length >= cfg.maxHighlights;
  const scoreOf = (c) => c.importance * cfg.typeRepeatPenalty ** (typeCount[typeKey(c)] ?? 0);
  const sorted = [...moments].sort(byImportanceThenOrder);
  // Best open moment by variety-penalized importance (ties → earlier event), optionally preferring sparse periods.
  const best = (accept, { balance = false } = {}) => {
    let pick = null;
    let pickScore = -1;
    let pickCount = Infinity;
    for (const c of sorted) {
      if (!open(c) || !accept(c)) continue;
      const s = scoreOf(c);
      const n = balance ? (periodCount[periodOf(c)] ?? 0) : 0;
      if (n < pickCount || (n === pickCount && (s > pickScore || (s === pickScore && c.keyEventIndex < pick.keyEventIndex)))) {
        pick = c;
        pickScore = s;
        pickCount = n;
      }
    }
    return pick ? { c: pick, score: pickScore } : null;
  };

  // 1. Boundaries and missed final attempts.
  for (const c of sorted) if (ALWAYS_KEEP.has(c.type) && !full()) take(c, "always");
  // 2. Finish reserve.
  let finish = 0;
  for (const c of sorted) {
    if (full() || finish >= cfg.finishReserve) break;
    if (!open(c)) continue;
    if (isFinish(ctx, ctx.events[c.keyEventIndex]) && c.importance >= cfg.minImportance && !FINISH_EXCLUDED.has(c.type)) {
      take(c, "finish");
      finish++;
    }
  }
  // 3. Coverage: round-robin over periods until each has minPerPeriod (minPerOvertime for OT).
  let coveragePicks = 0;
  const rounds = Math.max(cfg.minPerPeriod, cfg.minPerOvertime);
  for (let round = 1; round <= rounds; round++) {
    for (let p = 1; p <= ctx.lastPeriod; p++) {
      if (full() || coveragePicks >= cfg.coverageMaxPicks) break;
      const need = Math.min(round, p <= ctx.reg ? cfg.minPerPeriod : cfg.minPerOvertime);
      if ((periodCount[p] ?? 0) >= need) continue;
      // From the last regulation period on, coverage must be a game-flow moment (not a player milestone).
      const b = best((x) => periodOf(x) === p && x.importance >= cfg.coverageMinImportance && (p < ctx.reg || !FINISH_EXCLUDED.has(x.type)));
      if (!b) continue;
      take(b.c, "coverage");
      coveragePicks++;
    }
  }
  // 4. Ranked pass up to the target, then strong moments only up to the cap.
  while (!full() && selected.length < cfg.targetHighlights) {
    const b = best(() => true);
    if (!b || b.score < cfg.minImportance) break;
    take(b.c, "ranked");
  }
  while (!full()) {
    const b = best(() => true);
    if (!b || b.score < cfg.extraMinImportance) break;
    take(b.c, "ranked");
  }
  // 5. Fill to the minimum, preferring the periods with the fewest moments.
  relaxCluster = true;
  while (!full() && selected.length < cfg.minHighlights) {
    const b = best((x) => x.importance >= cfg.fillMinImportance, { balance: true });
    if (!b) break;
    take(b.c, "fill");
  }
  relaxCluster = false;
  for (const c of sorted) {
    if (taken.has(c.id)) continue;
    if (full()) c.drop = D.CAP_REACHED;
    else if (typeCapped(c)) c.drop = D.TYPE_CAP;
    else if (earlyCapped(c)) c.drop = D.PERIOD_CAP;
    else if (tooClose(c)) c.drop = D.TOO_CLOSE;
    else c.drop = D.BELOW_THRESHOLD;
  }
  return selected.sort((a, b) => a.range.to - b.range.to || a.keyEventIndex - b.keyEventIndex);
}

function toHighlight(ctx, c) {
  const h = ctx.config.holdSec;
  const captionParams = Object.fromEntries(Object.entries(c.captionParams).filter(([, v]) => typeof v === "string" || (typeof v === "number" && Number.isFinite(v))));
  const playerIds = [...new Set([...c.playerIds, ...(c.related ?? []).flatMap((r) => r.playerIds)])];
  const teamIds = c.teamId ? [c.teamId] : [ctx.teams.away.id, ctx.teams.home.id];
  return {
    id: c.id,
    eventIndex: c.range.to,
    keyEventIndex: c.keyEventIndex,
    groupStartIndex: c.range.from,
    ...(c.range.from !== c.range.to ? { groupEndIndex: c.range.to } : {}),
    type: c.type,
    playerIds,
    teamIds,
    captionParams,
    evidence: { ...c.evidence, ...(c.related ? { related: c.related } : {}) },
    importance: c.importance,
    holdSec: c.importance >= h.majorImportance ? h.major : h.default,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect, group, verify and select key moments.
 *
 * @param {object} normalized  `normalizeGame(...)` output
 * @param {{ stateIndex?: object, capabilities?: import("./types.js").Capability[], config?: Partial<typeof HIGHLIGHT_CONFIG> }} [options]
 *   `stateIndex` defaults to `buildStateIndex(normalized)`; `capabilities` to `validateReplay(...).capabilities`.
 * @returns {{
 *   version: number,
 *   highlights: import("./types.js").Highlight[],
 *   candidates: { id: string, type: string, keyEventIndex: number, range: { from: number, to: number }, importance: number,
 *     status: "selected" | "dropped", reason: string | null, mergedInto?: string, selectedIn?: string,
 *     teamId: string | null, playerIds: string[], captionParams: object, evidence: object }[],
 * }}
 */
export function buildHighlights(normalized, options = {}) {
  const ctx = makeCtx(normalized, options);
  if (!ctx.teams || ctx.events.length === 0 || capabilityFor(ctx.capabilities, F.SCORE).level === L.UNAVAILABLE) {
    return { version: HIGHLIGHTS_VERSION, highlights: [], candidates: [] };
  }
  const walk = walkScores(normalized);
  const units = scoringUnits(ctx.events, ctx);
  const finals = finalAttemptCandidates(ctx, walk);
  const all = [
    ...scoringCandidates(ctx, walk),
    ...milestoneCandidates(ctx, walk, units),
    ...runCandidates(ctx, walk, units),
    ...closingBasketCandidates(ctx, walk, units),
    ...defensiveCandidates(ctx, walk, units),
    ...finals,
    ...lateAttemptCandidates(ctx, walk, finals),
    ...boundaryCandidates(ctx, walk, finals),
    ...periodEndCandidates(ctx, walk),
    ...foulOutCandidates(ctx, normalized),
    ...playerMilestoneCandidates(ctx, normalized, walk),
  ];
  for (const c of all) {
    c.id = candidateId(c);
    c.ownRange = { ...c.range };
    c.importance = importanceOf(ctx, c);
  }
  markDecisiveLead(ctx, walk, all);
  const eligible = all.filter((c) => !c.drop);
  const moments = mergeGroups(eligible, ctx.config);
  for (const m of moments) if (!verify(ctx, m)) m.drop = D.EVIDENCE_MISMATCH;
  const selected = select(
    ctx,
    moments.filter((m) => !m.drop),
  );
  const chosen = new Set(selected.map((c) => c.id));
  const candidates = all
    .map((c) => ({
      id: c.id,
      type: c.type,
      keyEventIndex: c.keyEventIndex,
      range: c.range,
      importance: c.importance,
      status: chosen.has(c.id) ? "selected" : "dropped",
      reason: chosen.has(c.id) ? null : c.drop,
      ...(c.mergedInto ? { mergedInto: c.mergedInto } : {}),
      ...(c.selectedIn ? { selectedIn: c.selectedIn } : {}),
      ...(c.selection ? { selection: c.selection } : {}),
      teamId: c.teamId,
      playerIds: c.playerIds,
      captionParams: c.captionParams,
      evidence: c.evidence,
    }))
    .sort((a, b) => a.keyEventIndex - b.keyEventIndex || a.id.localeCompare(b.id));
  return { version: HIGHLIGHTS_VERSION, highlights: selected.map((c) => toHighlight(ctx, c)), candidates };
}

/** Selected `Highlight[]` only (event order). */
export function selectHighlights(normalized, options) {
  return buildHighlights(normalized, options).highlights;
}

/** Every candidate with `status` and drop `reason` (inspection/report). */
export function highlightCandidates(normalized, options) {
  return buildHighlights(normalized, options).candidates;
}
