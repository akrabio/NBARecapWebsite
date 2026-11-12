// Reconciliation and quality classification (task R14, Gate B).
//
// Pure: consumes `normalizeGame(...)` output and its `buildStateIndex(...)`,
// never mutates either and never patches a running or end-state value. The
// final box score / header are used ONLY here, as validation.
//
// What is checked
// - Score: final source score and credited (stat-delta) score vs the header
//   final; per-period points vs header linescores.
// - Players: every final counter vs the box score, grouped into
//   CAPABILITY_FAMILIES (fgm/fga → fg, tpm/tpa → tpt, oreb/dreb → orebDreb …).
// - Teams: player sums + `unattributed` vs box team totals. Definition
//   differences are explained, not forced: box team REB/OREB/DREB exclude
//   team rebounds (team-only `teamReb` has no box counterpart and is never
//   validated); box `turnovers` = player turnovers, `teamTurnovers` = team-only
//   `teamTo`, `totalTurnovers` = both; `technicalFouls` = team-only counter.
// - Lineups: structural invariants of every tracked lineup state across the
//   whole stream, roster-fallback intervals per team, and an evidence level.
//   Five distinct players is NOT proof of the right five; evidence is the
//   on-court actor checks, per-stint actions, and the final five vs box
//   `active` (on court at the horn).
// - Probability: linked-sample coverage and discarded samples.
//
// Classification (contracts.md "Quality policy" / API outcome table)
// - unavailable: not final (completed + post + STATUS_FINAL*), missing
//   teams/box/plays, score regression, final or credited score ≠ header,
//   period score ≠ linescore, no End of Game marker, no end marker for the
//   last period, or more than `maxUnplacedFraction` of events without a
//   period/clock.
// - Deliberate: missing/unparseable header linescores → per-period check
//   skipped with a `period_scores_missing` WARNING only (status can still be
//   ready; final score, end markers and per-event score deltas still apply).
//
// Tunable defaults (`options`, see DEFAULTS):
// - maxUnplacedFraction 0.02: >2% of events without period/clock → unavailable.
// - broadMismatchMinPlayers 3 + broadMismatchFraction 0.2: a stat family is
//   disabled game-wide when ≥3 players AND ≥20% of verified players mismatch;
//   fewer mismatches disable it only for those players.
// - Final-five rule (fixed): when box `active` is known and the tracked final
//   five differs from it, that team's lineup is limited from its last
//   substitution group to the end.
// - limited: any capability below reliable (stat family disabled for a
//   player/team, missing probability, lineup roster fallback …).
// - ready: everything reconciles.
//
// Capabilities (`Capability[]`, each with `scope`):
// - "game": exactly one per family. `reliable` | `limited` (some scoped
//   entries below exist; others are trustworthy) | `unavailable` (hide for all).
// - "player": `players: [id]`, the family's running value for that player is
//   `unavailable` (final mismatch or unverifiable).
// - "team": `teams: [id]` (+ optional `interval`): the family for that team's
//   players / lineup is limited, e.g. unattributed credit or roster fallback.
// - "teamTotal": `teams: [id]`: that team's total for the family does not
//   reconcile with the box score.
// Use `capabilityFor` to resolve a display decision.

import { courtActors } from "./lineups.js";
import { PLAYER_COUNTERS } from "./stats.js";
import { stateContext, stepState, buildStateIndex } from "./state.js";
import { CAPABILITY_FAMILIES as F, CAPABILITY_LEVELS as L, EVENT_KINDS as K, REASON_CODES as R } from "./types.js";

export const VALIDATOR_VERSION = 1;

/** Player counter → capability family. */
export const COUNTER_FAMILY = Object.freeze({
  pts: F.PTS,
  fgm: F.FG,
  fga: F.FG,
  tpm: F.TPT,
  tpa: F.TPT,
  ftm: F.FT,
  fta: F.FT,
  reb: F.REB,
  oreb: F.OREB_DREB,
  dreb: F.OREB_DREB,
  ast: F.AST,
  to: F.TO,
  stl: F.STL,
  blk: F.BLK,
  pf: F.PF,
});

const STAT_FAMILIES = [F.PTS, F.FG, F.TPT, F.FT, F.REB, F.OREB_DREB, F.AST, F.TO, F.STL, F.BLK, F.PF];
const FAMILY_ORDER = Object.values(F);
const LEVEL_RANK = { [L.RELIABLE]: 0, [L.LIMITED]: 1, [L.UNAVAILABLE]: 2 };
const worse = (a, b) => (LEVEL_RANK[b] > LEVEL_RANK[a] ? b : a);

// Codes that make the whole replay unavailable, in reporting order.
const UNAVAILABLE_ORDER = [R.GAME_NOT_FINAL, R.MISSING_TEAMS, R.NO_BOXSCORE, R.NO_PLAYS, R.SCORE_REGRESSION, R.SCORE_COVERAGE_GAP, R.PERIOD_SCORE_MISMATCH, R.NO_GAME_END, R.NO_FINAL_PERIOD_END, R.CLOCK_COVERAGE_GAP];

// Issues that point at a dropped role whose `candidate` is a real player.
const ROLE_DROP_CODES = new Set([R.ROLE_TEXT_CONFLICT, R.ROLE_UNRESOLVED, R.UNKNOWN_ATHLETE, R.ROLE_TEAM_CONFLICT]);
// Role → stat family it credits (for linking dropped roles to mismatches).
const ROLE_FAMILY = { shooter: null, assister: F.AST, blocker: F.BLK, rebounder: F.REB, turnoverBy: F.TO, stealer: F.STL, fouler: F.PF };

const DEFAULTS = Object.freeze({
  /** Above this fraction of events without period/clock → unavailable. */
  maxUnplacedFraction: 0.02,
  /** A family is disabled game-wide when at least this many players mismatch … */
  broadMismatchMinPlayers: 3,
  /** … and they are at least this fraction of the players verified for it. */
  broadMismatchFraction: 0.2,
});

const uniq = (xs) => [...new Set(xs)];

/**
 * Reconcile a normalized game and classify replay quality.
 *
 * @param {object} normalized  `normalizeGame(...)` output
 * @param {ReturnType<typeof buildStateIndex>} [stateIndex]  built if omitted
 * @param {Partial<typeof DEFAULTS>} [options]
 * @returns {{
 *   validatorVersion: number,
 *   espnGameId: string | null,
 *   status: "ready" | "limited" | "unavailable",
 *   reasons: string[],
 *   capabilities: (import("./types.js").Capability & { scope: string })[],
 *   warnings: { code: string, count: number, detail?: string }[],
 *   reconciliation: { score: object, players: object, teams: object },
 *   lineups: Record<string, object>,
 *   probability: object,
 * }}
 */
export function validateReplay(normalized, stateIndex, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  const unavailable = new Set();
  const warnings = new Map(); // code -> { code, count, detail? }
  const warn = (code, count = 1, detail) => {
    const w = warnings.get(code) ?? { code, count: 0 };
    w.count += count;
    if (detail && !w.detail) w.detail = detail;
    warnings.set(code, w);
  };

  const { teams, events = [], players = [] } = normalized;
  const gameIssues = normalized.issues ?? [];
  const hasGameIssue = (code) => gameIssues.some((i) => i.code === code);

  if (normalized.final !== true) unavailable.add(R.GAME_NOT_FINAL);
  if (!teams) unavailable.add(R.MISSING_TEAMS);
  if (hasGameIssue(R.NO_BOXSCORE) || players.length === 0) unavailable.add(R.NO_BOXSCORE);
  if (events.length === 0) unavailable.add(R.NO_PLAYS);
  if (hasGameIssue(R.SCORE_REGRESSION)) unavailable.add(R.SCORE_REGRESSION);

  // Without teams or events there is nothing to reconstruct.
  if (!teams || events.length === 0) {
    const capabilities = FAMILY_ORDER.map((family) => ({ family, level: L.UNAVAILABLE, reasons: [...unavailable], scope: "game" }));
    return finish({ normalized, unavailable, capabilities, warnings, reconciliation: null, lineups: {}, probability: probabilityReport(normalized, gameIssues).report });
  }

  const index = stateIndex ?? buildStateIndex(normalized);
  const last = events.length - 1;
  const finalState = index.stateAt(last);
  const allIssues = [...gameIssues, ...events.flatMap((e) => e.issues.map((i) => ({ ...i, eventIndex: e.index }))), ...(index.issues ?? [])];

  // Diagnostics: every issue code, counted once (game-level copies of
  // event-linked issues are skipped, as in `countIssues`).
  for (const i of gameIssues) if (i.eventIndex == null) warn(i.code);
  for (const e of events) for (const i of e.issues) warn(i.code);
  for (const i of index.issues ?? []) warn(i.code);

  // --- Clock coverage -------------------------------------------------------
  const unplaced = events.filter((e) => e.period == null || e.clockRemainingSec == null).length;
  if (unplaced / events.length > opts.maxUnplacedFraction) unavailable.add(R.CLOCK_COVERAGE_GAP);
  // End markers: a final game's feed must contain End of Game and the end of
  // its last period (header linescore count, else the last period seen).
  // Missing either means the play-by-play is truncated → unavailable.
  if (!events.some((e) => e.kind === K.GAME_END)) unavailable.add(R.NO_GAME_END);
  const lastPeriod = Math.max(0, teams.home.periodScores?.length ?? 0, teams.away.periodScores?.length ?? 0, ...events.map((e) => e.period ?? 0));
  if (!events.some((e) => e.kind === K.PERIOD_END && e.period === lastPeriod)) unavailable.add(R.NO_FINAL_PERIOD_END);

  // --- Walk every state (lineup invariants + period-end scores) -------------
  const walk = walkStates(normalized, index);

  // --- Score ----------------------------------------------------------------
  const score = scoreReport(normalized, finalState, walk, allIssues);
  for (const code of score.unavailable) unavailable.add(code);
  if (score.periodScoresMissing) warn(R.PERIOD_SCORES_MISSING, 1, "header linescores absent; per-period check skipped");

  // --- Stats ----------------------------------------------------------------
  const stats = statReport(normalized, finalState, allIssues, opts);
  const teamTotals = teamReport(normalized, finalState, allIssues);

  // --- Lineups / probability -------------------------------------------------
  const lineups = lineupReport(normalized, walk, allIssues);
  const prob = probabilityReport(normalized, gameIssues);

  // --- Capabilities ----------------------------------------------------------
  const capabilities = [];
  capabilities.push({ family: F.SCORE, level: score.level, reasons: score.reasons, scope: "game" });
  for (const family of STAT_FAMILIES) {
    const fam = stats.families[family];
    const teamEntries = [...stats.teamScoped.filter((c) => c.family === family), ...teamTotals.capabilities.filter((c) => c.family === family)];
    let level = fam.level;
    const reasons = [...fam.reasons];
    if (level === L.RELIABLE && teamEntries.length) {
      level = L.LIMITED;
      reasons.push(...teamEntries.flatMap((c) => c.reasons));
    }
    capabilities.push({ family, level, reasons: uniq(reasons), scope: "game" });
    if (level !== L.UNAVAILABLE) capabilities.push(...fam.playerEntries, ...teamEntries);
  }
  capabilities.push(teamTotals.teamOnly.game, ...teamTotals.teamOnly.scoped);
  capabilities.push(lineups.game, ...lineups.scoped);
  capabilities.push(prob.capability);

  const reconciliation = { score: score.report, players: stats.report, teams: teamTotals.report };
  return finish({ normalized, unavailable, capabilities, warnings, reconciliation, lineups: lineups.report, probability: prob.report });
}

function finish({ normalized, unavailable, capabilities, warnings, reconciliation, lineups, probability }) {
  let status = "ready";
  let reasons = [];
  if (unavailable.size) {
    status = "unavailable";
    reasons = UNAVAILABLE_ORDER.filter((c) => unavailable.has(c));
  } else {
    const limiting = capabilities.filter((c) => c.level !== L.RELIABLE);
    if (limiting.length) {
      status = "limited";
      reasons = uniq(limiting.flatMap((c) => c.reasons));
    }
  }
  return {
    validatorVersion: VALIDATOR_VERSION,
    espnGameId: normalized.espnGameId ?? null,
    status,
    reasons,
    capabilities,
    warnings: [...warnings.values()].sort((a, b) => a.code.localeCompare(b.code)),
    reconciliation,
    lineups,
    probability,
  };
}

// ---------------------------------------------------------------------------
// State walk
// ---------------------------------------------------------------------------

/**
 * Step every event once (the same reducer the state index uses), checking
 * lineup invariants on each state and recording the score at each period end.
 */
function walkStates(normalized, index) {
  const ctx = stateContext(normalized);
  const teamIds = [normalized.teams.home.id, normalized.teams.away.id];
  const roster = {};
  for (const p of normalized.players) roster[p.id] = p;
  const order = Object.fromEntries(teamIds.map((t) => [t, normalized.players.filter((p) => p.teamId === t).map((p) => p.id)]));
  const groupEnd = {};
  for (const e of normalized.events) if (e.substitutionGroup) groupEnd[e.substitutionGroup] = e.index;

  const perTeam = Object.fromEntries(teamIds.map((t) => [t, { invalid: [], violations: [], codes: {}, actorChecks: 0, stints: { total: 0, withAction: 0 }, lastGroupIndex: -1 }]));
  const periodEnd = {}; // period -> { home, away } source score after its last event
  const open = Object.fromEntries(teamIds.map((t) => [t, new Map()])); // playerId -> hadAction

  const checkTeam = (teamId, lineup, i) => {
    const t = perTeam[teamId];
    const violation = (detail) => t.violations.push({ code: R.LINEUP_INVARIANT, eventIndex: i, detail });
    if (!lineup) {
      violation("team lineup missing");
      return false;
    }
    if (lineup.valid) {
      const on = lineup.onCourt;
      const ok =
        on.length === 5 &&
        new Set(on).size === 5 &&
        on.every((id) => roster[id]?.teamId === teamId && !roster[id]?.didNotPlay) &&
        lineup.issue == null &&
        lineup.bench.length + on.length === order[teamId].length &&
        order[teamId].every((id) => on.includes(id) !== lineup.bench.includes(id));
      if (!ok) violation(`valid lineup is not five distinct rostered players (${on.join(",")})`);
      return ok;
    }
    if (lineup.onCourt.length !== 0) violation("invalid lineup exposes on-court players");
    if (lineup.issue == null) violation("invalid lineup without a reason code");
    t.codes[lineup.issue ?? R.LINEUP_INVARIANT] = (t.codes[lineup.issue ?? R.LINEUP_INVARIANT] ?? 0) + 1;
    return false;
  };

  // Stints: a player's continuous run in a valid tracked five.
  const syncStints = (teamId, lineup) => {
    const cur = open[teamId];
    const on = lineup?.valid ? new Set(lineup.onCourt) : new Set();
    for (const [id, had] of cur) {
      if (!on.has(id)) {
        perTeam[teamId].stints.total += 1;
        if (had) perTeam[teamId].stints.withAction += 1;
        cur.delete(id);
      }
    }
    for (const id of on) if (!cur.has(id)) cur.set(id, false);
  };

  let state = index.stateAt(-1);
  const startValid = {};
  for (const teamId of teamIds) {
    startValid[teamId] = checkTeam(teamId, state.lineups.teams[teamId], -1);
    if (!startValid[teamId]) perTeam[teamId].invalid.push(-1);
    syncStints(teamId, state.lineups.teams[teamId]);
  }
  for (const event of normalized.events) {
    const before = state;
    state = stepState(before, event, ctx).state;
    const i = event.index;
    // pendingSubs only inside an unfinished substitution group.
    const midGroup = event.kind === K.SUBSTITUTION && event.substitutionGroup && groupEnd[event.substitutionGroup] !== i;
    if (!midGroup && state.lineups.pendingSubs.length) for (const t of teamIds) perTeam[t].violations.push({ code: R.LINEUP_INVARIANT, eventIndex: i, detail: "pending substitutions outside a group" });
    if (event.kind === K.SUBSTITUTION && !midGroup && event.teamId && perTeam[event.teamId]) perTeam[event.teamId].lastGroupIndex = i;
    const actors = courtActors(event);
    for (const teamId of teamIds) {
      const lineup = state.lineups.teams[teamId];
      const ok = checkTeam(teamId, lineup, i);
      if (!ok) perTeam[teamId].invalid.push(i);
      syncStints(teamId, lineup);
      if (ok) {
        for (const id of actors) {
          if (roster[id]?.teamId !== teamId) continue;
          if (lineup.onCourt.includes(id)) {
            perTeam[teamId].actorChecks += 1;
            open[teamId].set(id, true);
          }
        }
      }
    }
    if (event.period != null) periodEnd[event.period] = { ...state.score };
  }
  for (const teamId of teamIds) syncStints(teamId, null); // close stints at the horn

  // Contiguous invalid runs → intervals.
  for (const teamId of teamIds) {
    const t = perTeam[teamId];
    t.intervals = [];
    for (const i of t.invalid) {
      const cur = t.intervals[t.intervals.length - 1];
      if (cur && cur.to === i - 1) cur.to = i;
      else t.intervals.push({ from: i, to: i });
    }
  }
  return { teamIds, perTeam, periodEnd, finalLineups: state.lineups.teams, roster };
}

// ---------------------------------------------------------------------------
// Score
// ---------------------------------------------------------------------------

function scoreReport(normalized, finalState, walk, allIssues) {
  const { teams } = normalized;
  const unavailable = [];
  const final = {};
  for (const side of ["home", "away"]) {
    const expected = teams[side].finalScore;
    final[side] = { source: finalState.score[side], credited: finalState.creditedScore[side], expected };
    if (expected == null || final[side].source !== expected || final[side].credited !== expected) unavailable.push(R.SCORE_COVERAGE_GAP);
  }

  const periodsSeen = Object.keys(walk.periodEnd).map(Number).sort((a, b) => a - b);
  const hs = teams.home.periodScores;
  const as = teams.away.periodScores;
  const periods = [];
  let periodScoresMissing = false;
  if (!hs || !as) periodScoresMissing = true;
  else {
    const n = Math.max(hs.length, as.length, periodsSeen.at(-1) ?? 0);
    const prev = { home: 0, away: 0 };
    for (let p = 1; p <= n; p++) {
      const end = walk.periodEnd[p] ?? null;
      const row = { period: p };
      for (const [side, list] of [["home", hs], ["away", as]]) {
        const actual = end ? end[side] - prev[side] : null;
        row[side] = { actual, expected: list[p - 1] ?? null };
      }
      row.match = row.home.actual != null && row.home.actual === row.home.expected && row.away.actual === row.away.expected;
      if (!row.match) unavailable.push(R.PERIOD_SCORE_MISMATCH);
      if (end) Object.assign(prev, end);
      periods.push(row);
    }
  }

  const deltaMismatches = allIssues.filter((i) => i.code === R.SCORE_DELTA_MISMATCH);
  let level = L.RELIABLE;
  const reasons = [];
  if (unavailable.length) {
    level = L.UNAVAILABLE;
    reasons.push(...uniq(unavailable));
  } else if (deltaMismatches.length) {
    // Totals reconcile but some events credit points the source score does
    // not show at that moment: the running score is source-backed, so it
    // stays usable, labeled.
    level = L.LIMITED;
    reasons.push(R.SCORE_DELTA_MISMATCH);
  }
  return {
    unavailable: uniq(unavailable),
    level,
    reasons,
    periodScoresMissing,
    report: { final, periods, periodScoresMissing, scoreDeltaMismatches: deltaMismatches.map((i) => i.eventIndex) },
  };
}

// ---------------------------------------------------------------------------
// Player stats
// ---------------------------------------------------------------------------

function statReport(normalized, finalState, allIssues, opts) {
  const { players, expected } = normalized;
  const playerName = Object.fromEntries(players.map((p) => [p.id, p.name]));
  const mismatches = [];
  const unverified = []; // non-zero running value with no box expectation
  const verified = Object.fromEntries(STAT_FAMILIES.map((f) => [f, new Set()]));
  const bad = Object.fromEntries(STAT_FAMILIES.map((f) => [f, new Map()])); // family -> playerId -> Set(reasons)
  let checked = 0;
  let matched = 0;

  // Dropped roles naming a player as text candidate (e.g. the Porter Jr. block).
  const candidateCodes = {}; // playerId -> family -> Set(codes)
  for (const i of allIssues) {
    if (!ROLE_DROP_CODES.has(i.code) || !i.candidate) continue;
    const fam = ROLE_FAMILY[i.role];
    if (!fam) continue;
    ((candidateCodes[i.candidate] ??= {})[fam] ??= new Set()).add(i.code);
  }

  for (const p of players) {
    const exp = expected.players?.[p.id];
    const rec = finalState.players[p.id];
    if (!rec) continue;
    for (const k of PLAYER_COUNTERS) {
      const family = COUNTER_FAMILY[k];
      const e = exp?.[k];
      const r = rec[k] ?? 0;
      if (e == null) {
        if (r !== 0) {
          unverified.push({ playerId: p.id, name: p.name, counter: k, family, reconstructed: r });
          const reasons = bad[family].get(p.id) ?? new Set();
          reasons.add(R.STAT_UNVERIFIABLE);
          bad[family].set(p.id, reasons);
        }
        continue;
      }
      verified[family].add(p.id);
      checked += 1;
      if (e === r) {
        matched += 1;
        continue;
      }
      mismatches.push({ playerId: p.id, teamId: p.teamId, name: p.name, counter: k, family, reconstructed: r, expected: e });
      const reasons = bad[family].get(p.id) ?? new Set();
      reasons.add(R.STAT_MISMATCH);
      for (const c of candidateCodes[p.id]?.[family] ?? []) reasons.add(c);
      bad[family].set(p.id, reasons);
    }
  }

  // Unattributed credit: explained when mismatched players of that team
  // account for exactly the unattributed amount; otherwise the whole team's
  // players are limited for the family.
  const teamScoped = [];
  const unattributed = [];
  for (const [teamId, bucket] of Object.entries(finalState.unattributed ?? {})) {
    const byFamily = {};
    for (const [k, v] of Object.entries(bucket)) {
      if (!v) continue;
      const family = COUNTER_FAMILY[k];
      const deficit = mismatches.filter((m) => m.teamId === teamId && m.counter === k).reduce((a, m) => a + (m.expected - m.reconstructed), 0);
      const explained = deficit === v;
      unattributed.push({ teamId, counter: k, family, amount: v, explainedBy: explained ? mismatches.filter((m) => m.teamId === teamId && m.counter === k).map((m) => m.playerId) : [] });
      if (explained) {
        for (const m of mismatches.filter((x) => x.teamId === teamId && x.counter === k)) bad[family].get(m.playerId)?.add(R.ATTRIBUTION_UNKNOWN);
      } else byFamily[family] = true;
    }
    for (const family of Object.keys(byFamily)) teamScoped.push({ family, level: L.LIMITED, reasons: [R.ATTRIBUTION_UNKNOWN], teams: [teamId], scope: "team" });
  }

  const families = {};
  for (const family of STAT_FAMILIES) {
    const affected = bad[family];
    const playerEntries = [...affected].map(([id, reasons]) => ({ family, level: L.UNAVAILABLE, reasons: [...reasons], players: [id], scope: "player" }));
    const nVerified = verified[family].size;
    const nBad = [...affected.values()].filter((r) => r.has(R.STAT_MISMATCH)).length;
    let level = L.RELIABLE;
    let reasons = [];
    if (nVerified === 0) {
      level = L.UNAVAILABLE;
      reasons = [R.STAT_UNVERIFIABLE];
    } else if (nBad >= opts.broadMismatchMinPlayers && nBad / nVerified >= opts.broadMismatchFraction) {
      level = L.UNAVAILABLE;
      reasons = [R.STAT_MISMATCH];
    } else if (playerEntries.length) {
      level = L.LIMITED;
      reasons = uniq(playerEntries.flatMap((e) => e.reasons));
    }
    families[family] = { level, reasons, playerEntries, verifiedPlayers: nVerified, mismatchedPlayers: nBad };
  }

  return {
    families,
    teamScoped,
    report: {
      checked,
      matched,
      mismatches: mismatches.map((m) => ({ ...m, name: playerName[m.playerId] ?? m.name })),
      unverified,
      unattributed,
      families: Object.fromEntries(STAT_FAMILIES.map((f) => [f, { level: families[f].level, verifiedPlayers: families[f].verifiedPlayers, mismatchedPlayers: families[f].mismatchedPlayers }])),
    },
  };
}

// ---------------------------------------------------------------------------
// Team totals and team-only counters
// ---------------------------------------------------------------------------

const TEAM_NOTES = Object.freeze({
  reb: "box team REB excludes team rebounds; compared with player sum + unattributed",
  oreb: "box team OREB excludes team rebounds",
  dreb: "box team DREB excludes team rebounds",
  to: "box `turnovers` = player turnovers; team turnovers are `teamTo`",
  teamReb: "team rebounds have no box counterpart; never validated or added to box totals",
  teamTo: "box `teamTurnovers`",
  totalTo: "box `totalTurnovers` = player TO + unattributed + teamTo",
  technicalFouls: "box `technicalFouls` (never part of PF)",
});

function teamReport(normalized, finalState, allIssues) {
  const { teams, players, expected } = normalized;
  const report = {};
  const capabilities = [];
  const teamOnlyScoped = [];
  for (const side of ["home", "away"]) {
    const teamId = teams[side].id;
    const exp = expected.teams?.[teamId] ?? {};
    const un = finalState.unattributed?.[teamId] ?? {};
    const sums = Object.fromEntries(PLAYER_COUNTERS.map((k) => [k, 0]));
    for (const p of players) if (p.teamId === teamId) for (const k of PLAYER_COUNTERS) sums[k] += finalState.players[p.id]?.[k] ?? 0;
    const counters = {};
    const badFamilies = new Set();
    for (const k of PLAYER_COUNTERS) {
      const total = sums[k] + (un[k] ?? 0);
      const e = exp[k] ?? null;
      const match = e == null ? null : total === e;
      counters[k] = { players: sums[k], unattributed: un[k] ?? 0, total, expected: e, match };
      if (TEAM_NOTES[k]) counters[k].note = TEAM_NOTES[k];
      if (match === false) badFamilies.add(COUNTER_FAMILY[k]);
    }
    // pts also vs the header final.
    if (teams[side].finalScore != null && counters.pts.total !== teams[side].finalScore) badFamilies.add(F.PTS);
    for (const family of badFamilies) capabilities.push({ family, level: L.LIMITED, reasons: [R.STAT_MISMATCH], teams: [teamId], scope: "teamTotal" });

    const t = finalState.teams?.[teamId] ?? {};
    const teamOnly = {
      teamReb: { value: t.teamReb ?? 0, oreb: t.teamOreb ?? 0, dreb: t.teamDreb ?? 0, expected: null, match: null, note: TEAM_NOTES.teamReb },
      teamTo: { value: t.teamTo ?? 0, expected: exp.teamTo ?? null, match: exp.teamTo == null ? null : (t.teamTo ?? 0) === exp.teamTo, note: TEAM_NOTES.teamTo },
      totalTo: {
        value: counters.to.total + (t.teamTo ?? 0),
        expected: exp.totalTo ?? null,
        match: exp.totalTo == null ? null : counters.to.total + (t.teamTo ?? 0) === exp.totalTo,
        note: TEAM_NOTES.totalTo,
      },
      technicalFouls: {
        value: t.technicalFouls ?? 0,
        expected: exp.technicalFouls ?? null,
        match: exp.technicalFouls == null ? null : (t.technicalFouls ?? 0) === exp.technicalFouls,
        note: TEAM_NOTES.technicalFouls,
      },
    };
    const teamOnlyBad = ["teamTo", "totalTo", "technicalFouls"].filter((k) => teamOnly[k].match === false);
    if (teamOnlyBad.length) teamOnlyScoped.push({ family: F.TEAM_ONLY, level: L.LIMITED, reasons: [R.STAT_MISMATCH], teams: [teamId], scope: "teamTotal" });
    report[teamId] = { side, abbreviation: teams[side].abbreviation ?? null, counters, teamOnly, mismatchedFamilies: [...badFamilies], teamOnlyMismatches: teamOnlyBad };
  }
  // Team-only credit that could not be counted at all (stats.js issues).
  const dropped = allIssues.filter((i) => i.family === F.TEAM_ONLY || (i.family === "technical" && i.code !== R.ATTRIBUTION_UNKNOWN));
  const teamOnlyReasons = uniq([...teamOnlyScoped.flatMap((c) => c.reasons), ...dropped.map((i) => i.code)]);
  const level = dropped.length || teamOnlyScoped.length ? L.LIMITED : L.RELIABLE;
  return {
    report,
    capabilities,
    teamOnly: { game: { family: F.TEAM_ONLY, level, reasons: teamOnlyReasons, scope: "game" }, scoped: teamOnlyScoped },
  };
}

// ---------------------------------------------------------------------------
// Lineups
// ---------------------------------------------------------------------------

function lineupReport(normalized, walk, allIssues) {
  const { teams, events, players } = normalized;
  const report = {};
  const scoped = [];
  const totalStates = events.length + 1; // including the -1 start
  for (const side of ["home", "away"]) {
    const teamId = teams[side].id;
    const t = walk.perTeam[teamId];
    const teamIssues = allIssues.filter((i) => i.teamId === teamId && typeof i.code === "string" && i.code.startsWith("lineup_"));
    const actorViolations = teamIssues.filter((i) => i.code === R.LINEUP_ACTOR_OFF_COURT).length;
    const finalLineup = walk.finalLineups[teamId];
    const boxActive = players.filter((p) => p.teamId === teamId && p.active === true).map((p) => p.id);
    const activeKnown = players.some((p) => p.teamId === teamId && p.active != null);
    const finalFive = finalLineup?.valid ? finalLineup.onCourt : null;
    let finalMatchesActive = null;
    if (finalFive && activeKnown) finalMatchesActive = boxActive.length === 5 && finalFive.every((id) => boxActive.includes(id));

    const intervals = t.intervals.map((iv) => {
      const reasons = uniq(teamIssues.filter((i) => i.eventIndex >= iv.from && i.eventIndex <= iv.to).map((i) => i.code));
      for (const v of t.violations) if (v.eventIndex >= iv.from && v.eventIndex <= iv.to) reasons.push(R.LINEUP_INVARIANT);
      return { ...iv, reasons: uniq(reasons.length ? reasons : [R.LINEUP_INVALID]) };
    });
    // A tracked final five that disagrees with box `active` is evidence the
    // five is wrong since the team's last substitution group.
    if (finalMatchesActive === false) {
      const from = Math.max(t.lastGroupIndex, -1);
      intervals.push({ from, to: events.length - 1, reasons: [R.LINEUP_INVALID], evidence: "final five ≠ box active" });
    }
    const invalidStates = t.invalid.length;
    const wholeGame = invalidStates === totalStates;
    let level = "corroborated";
    if (wholeGame) level = "none";
    else if (intervals.length || t.violations.length) level = "partial";
    else if (finalMatchesActive !== true || t.actorChecks === 0) level = "consistent";

    if (wholeGame) scoped.push({ family: F.LINEUPS, level: L.UNAVAILABLE, reasons: uniq(intervals.flatMap((i) => i.reasons)), teams: [teamId], scope: "team" });
    else for (const iv of intervals) scoped.push({ family: F.LINEUPS, level: L.LIMITED, reasons: iv.reasons, teams: [teamId], interval: { from: iv.from, to: iv.to }, scope: "team" });

    report[teamId] = {
      side,
      abbreviation: teams[side].abbreviation ?? null,
      validStates: totalStates - invalidStates,
      totalStates,
      fallbackIntervals: intervals,
      invariantViolations: t.violations,
      evidence: {
        level,
        actorChecks: t.actorChecks,
        actorViolations,
        stints: t.stints,
        finalFive,
        boxActive: activeKnown ? boxActive : null,
        finalMatchesActive,
        note: "five distinct players is structural only; evidence = actors on the tracked court, actions per stint, final five vs box active",
      },
    };
  }
  const levels = scoped.map((c) => c.level);
  let level = L.RELIABLE;
  if (levels.length) level = levels.filter((l) => l === L.UNAVAILABLE).length === 2 ? L.UNAVAILABLE : L.LIMITED;
  return { report, scoped, game: { family: F.LINEUPS, level, reasons: uniq(scoped.flatMap((c) => c.reasons)), scope: "game" } };
}

// ---------------------------------------------------------------------------
// Probability
// ---------------------------------------------------------------------------

function probabilityReport(normalized, gameIssues) {
  const samples = normalized.probability ?? [];
  const probIssues = gameIssues.filter((i) => typeof i.code === "string" && i.code.startsWith("probability_"));
  const discarded = probIssues.filter((i) => i.code !== R.PROBABILITY_MISSING);
  let level = L.RELIABLE;
  let reasons = [];
  if (!samples.length) {
    level = L.UNAVAILABLE;
    reasons = [R.PROBABILITY_MISSING];
  } else if (discarded.length) {
    level = L.LIMITED;
    reasons = uniq(discarded.map((i) => i.code));
  }
  return {
    capability: { family: F.PROBABILITY, level, reasons, scope: "game" },
    report: {
      level,
      samples: samples.length,
      events: (normalized.events ?? []).length,
      derived: samples.filter((s) => s.derived).length,
      firstEventIndex: samples[0]?.eventIndex ?? null,
      discarded: Object.fromEntries(uniq(discarded.map((i) => i.code)).map((c) => [c, discarded.filter((i) => i.code === c).length])),
    },
  };
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

/**
 * Resolve the display level of one family for a player, a team (its
 * players' running values / lineup), a team total, or the game.
 *
 * - No target: the game-level entry.
 * - `playerId` (+ its `teamId`): worst of the player's overrides and the
 *   team-scoped entries covering `eventIndex`; game-level only when it is
 *   `unavailable` (a game-level `limited` summarizes scoped entries).
 * - `teamId` alone: team-scoped entries covering `eventIndex` (e.g. lineup
 *   fallback interval), likewise.
 * - `teamTotal: true` with `teamId`: the team total for the family.
 *
 * @param {(import("./types.js").Capability & { scope?: string })[]} capabilities
 * @param {string} family
 * @param {{ playerId?: string, teamId?: string, eventIndex?: number, teamTotal?: boolean }} [target]
 * @returns {{ level: string, reasons: string[] }}
 */
export function capabilityFor(capabilities, family, { playerId, teamId, eventIndex, teamTotal = false } = {}) {
  const of = capabilities.filter((c) => c.family === family);
  const game = of.find((c) => (c.scope ?? "game") === "game");
  if (!playerId && !teamId) return { level: game?.level ?? L.UNAVAILABLE, reasons: game?.reasons ?? [] };
  if (playerId && !teamId && !teamTotal) throw new TypeError("capabilityFor: teamId is required with playerId (team-scoped entries apply to the player's team)");
  let level = game?.level === L.UNAVAILABLE ? L.UNAVAILABLE : L.RELIABLE;
  const reasons = game?.level === L.UNAVAILABLE ? [...game.reasons] : [];
  const covers = (c) => !c.interval || eventIndex == null || (eventIndex >= c.interval.from && eventIndex <= c.interval.to);
  for (const c of of) {
    let applies = false;
    if (c.scope === "player") applies = !teamTotal && playerId != null && c.players?.includes(playerId);
    else if (c.scope === "team") applies = !teamTotal && teamId != null && c.teams?.includes(teamId) && covers(c);
    else if (c.scope === "teamTotal") applies = teamTotal && teamId != null && c.teams?.includes(teamId);
    if (applies) {
      level = worse(level, c.level);
      reasons.push(...c.reasons);
    }
  }
  return { level, reasons: uniq(reasons) };
}
