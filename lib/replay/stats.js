// Per-event stat deltas (tasks R07–R09).
//
// Pure: consumes `normalizeGame(...)` events (never raw ESPN plays), never
// mutates inputs. Counting rules and their evidence:
// docs/replay-implementation/source-findings.md §3, §5.
//
// - Made FG: shooter pts/fgm/fga (+tpm/tpa on threes); assister +ast.
// - Missed FG: shooter fga (+tpa). Blocked: same shooter FGA once, opponent
//   blocker +blk. Missed heave (type 282): no FGA/3PA (info issue).
// - FT (regular, and-one, technical, flagrant): ftm/fta/pts only, never FG,
//   never PF for the shooter.
// - Rebounds: player reb + oreb/dreb; team rebounds → team-only counters.
// - Turnovers: player `to`; `stl` only when a verified stealer exists; team
//   turnovers → team-only `teamTo`.
// - PF: kind `foul` only (personal, shooting, offensive, loose ball, take,
//   away-from-play, flagrant). An offensive foul is two source records — the
//   foul (PF) and the offensive-foul turnover (TO) — each counted once.
// - Technicals never increment PF; they count in team `technicalFouls`
//   (charged to each listed player's team; double technicals hit both teams).
// - Unknown attribution is explicit: the credit goes to `unattributed[teamId]`
//   (team totals stay correct, no player gets it) plus an
//   `attribution_unknown` issue. Never a fabricated player credit.
// - Nothing is dropped silently: team-only credit without a team →
//   `unknown_team` (family `teamOnly`); a technical charged to a player on
//   neither roster → `unknown_athlete`. validate.js limits `teamOnly` on these.

import { EVENT_KINDS as K, REASON_CODES as R } from "./types.js";

/** Player counters, in display order. */
export const PLAYER_COUNTERS = Object.freeze(["pts", "fgm", "fga", "tpm", "tpa", "ftm", "fta", "reb", "oreb", "dreb", "ast", "to", "stl", "blk", "pf"]);

/** Team-only counters (never added to player sums / box team totals, except as documented). */
export const TEAM_ONLY_COUNTERS = Object.freeze(["teamReb", "teamOreb", "teamDreb", "teamTo", "technicalFouls"]);

export const emptyPlayerCounters = () => Object.fromEntries(PLAYER_COUNTERS.map((k) => [k, 0]));
export const emptyTeamCounters = () => Object.fromEntries(TEAM_ONLY_COUNTERS.map((k) => [k, 0]));

// Normalization issue codes meaning "a role was implied but dropped".
const DROPPED_ROLE_CODES = new Set([R.ROLE_TEXT_CONFLICT, R.ROLE_UNRESOLVED, R.UNKNOWN_ATHLETE, R.ROLE_TEAM_CONFLICT]);
const roleDropped = (event, role) => event.issues.some((i) => i.role === role && DROPPED_ROLE_CODES.has(i.code));

const add = (bucket, id, delta) => {
  const cur = (bucket[id] ??= {});
  for (const [k, v] of Object.entries(delta)) cur[k] = (cur[k] ?? 0) + v;
};

/**
 * Build the context `eventStatDeltas` needs from `normalizeGame` output.
 * @param {{ teams: { home: { id: string }, away: { id: string } } | null, players: { id: string, teamId: string }[] }} normalized
 */
export function statContext({ teams, players }) {
  const playerTeam = {};
  for (const p of players ?? []) playerTeam[p.id] = p.teamId;
  return { teams, playerTeam };
}

function opponentOf(teamId, teams) {
  if (!teams || !teamId) return null;
  if (teamId === teams.home.id) return teams.away.id;
  if (teamId === teams.away.id) return teams.home.id;
  return null;
}

/**
 * Stat changes caused by one normalized event.
 *
 * @param {import("./types.js").NormalizedEvent} event
 * @param {{ teams: object | null, playerTeam: Record<string, string> }} ctx  from `statContext`
 * @returns {import("./types.js").EventStatDeltas}
 */
export function eventStatDeltas(event, ctx) {
  const out = { eventIndex: event.index, players: {}, teams: {}, unattributed: {}, points: {}, issues: [] };
  const { roles, detail, teamId } = event;
  const teamOfPlayer = (id) => ctx.playerTeam?.[id] ?? null;

  /** Credit `delta` to `playerId`, or to the team as unattributed with an issue. */
  const credit = (role, playerId, fallbackTeam, delta, family) => {
    if (playerId) {
      add(out.players, playerId, delta);
      return;
    }
    out.issues.push({ code: R.ATTRIBUTION_UNKNOWN, role, family, detail: `${role} unknown; credit kept at team level` });
    if (fallbackTeam) add(out.unattributed, fallbackTeam, delta);
    else out.issues.push({ code: R.UNKNOWN_TEAM, role, detail: `no team for unattributed ${family}` });
  };
  // Team-only credit with no acting team cannot be counted anywhere: say so.
  const teamOnlyDropped = (what) => out.issues.push({ code: R.UNKNOWN_TEAM, role: "team", family: "teamOnly", detail: `${what} without a team; not counted` });
  const scoreTeam = (pts) => {
    if (pts && teamId) out.points[teamId] = (out.points[teamId] ?? 0) + pts;
  };

  switch (event.kind) {
    case K.FIELD_GOAL: {
      const made = detail.made === true;
      const pts = made ? (detail.points ?? 0) : 0;
      if (detail.heave && !made) {
        out.issues.push({ code: R.HEAVE_EXCLUDED, detail: "missed heave not counted in FGA/3PA" });
        break;
      }
      const d = { fga: 1 };
      if (made) Object.assign(d, { pts, fgm: 1 });
      if (detail.attemptValue === 3) Object.assign(d, made ? { tpm: 1, tpa: 1 } : { tpa: 1 });
      credit("shooter", roles.shooter, teamId, d, "fg");
      scoreTeam(pts);
      if (made && (roles.assister || roleDropped(event, "assister"))) credit("assister", roles.assister, teamId, { ast: 1 }, "ast");
      if (detail.blocked) credit("blocker", roles.blocker, opponentOf(teamId, ctx.teams), { blk: 1 }, "blk");
      break;
    }
    case K.FREE_THROW: {
      const made = detail.made === true;
      const pts = made ? (detail.points ?? 1) : 0;
      credit("shooter", roles.shooter, teamId, made ? { pts, ftm: 1, fta: 1 } : { fta: 1 }, "ft");
      scoreTeam(pts);
      break;
    }
    case K.REBOUND: {
      const side = detail.offensive ? "oreb" : "dreb";
      if (detail.teamOnly) {
        if (teamId) add(out.teams, teamId, { teamReb: 1, [detail.offensive ? "teamOreb" : "teamDreb"]: 1 });
        else teamOnlyDropped("team rebound");
      } else credit("rebounder", roles.rebounder, teamId, { reb: 1, [side]: 1 }, "reb");
      break;
    }
    case K.TURNOVER: {
      if (detail.teamOnly) {
        if (teamId) add(out.teams, teamId, { teamTo: 1 });
        else teamOnlyDropped("team turnover");
      } else credit("turnoverBy", roles.turnoverBy, teamId, { to: 1 }, "to");
      if (roles.stealer || roleDropped(event, "stealer")) credit("stealer", roles.stealer, opponentOf(teamId, ctx.teams), { stl: 1 }, "stl");
      break;
    }
    case K.FOUL:
      credit("fouler", roles.fouler, teamId, { pf: 1 }, "pf");
      // Double personal foul: the opponent participant is charged too.
      if (roles.doubleFouler || roleDropped(event, "doubleFouler")) credit("doubleFouler", roles.doubleFouler, opponentOf(teamId, ctx.teams), { pf: 1 }, "pf");
      break;
    case K.TECHNICAL: {
      const charged = roles.technical ?? [];
      for (const id of charged) {
        const t = teamOfPlayer(id);
        if (t) add(out.teams, t, { technicalFouls: 1 });
        else out.issues.push({ code: R.UNKNOWN_ATHLETE, role: "technical", family: "technical", playerId: id, detail: `technical charged to ${id}, not on either roster; not counted` });
      }
      if (!charged.length) {
        out.issues.push({ code: R.ATTRIBUTION_UNKNOWN, role: "technical", family: "technical", detail: "technical with no verified player" });
        if (teamId) add(out.teams, teamId, { technicalFouls: 1 });
        else teamOnlyDropped("technical");
      }
      break;
    }
    default:
      break; // violations, subs, jump balls, timeouts, reviews, period markers: no counters
  }
  return out;
}

/**
 * Apply one event's deltas to a running state in place (reducer building
 * block; callers own the state object). Returns score-consistency issues.
 *
 * Score check: the points credited by the event (player + unattributed) must
 * equal the change in the source `scoreAfter` for each side; any difference
 * (a basket without a scoring record, or a credit with no score change) is a
 * `score_delta_mismatch`. Sides with an invalid source score are skipped and
 * the baseline carries forward to the next valid score.
 */
export function applyDeltas(state, event, deltas, teams) {
  for (const [id, d] of Object.entries(deltas.players)) add(state.players, id, d);
  for (const [id, d] of Object.entries(deltas.teams)) add(state.teams, id, d);
  for (const [id, d] of Object.entries(deltas.unattributed)) add(state.unattributed, id, d);
  const issues = [];
  if (teams) {
    for (const side of ["home", "away"]) {
      const tid = teams[side].id;
      const credited = deltas.points[tid] ?? 0;
      state.score[side] += credited;
      const after = event.scoreAfter?.[side];
      if (after == null) continue;
      const sourceDelta = after - state.sourceScore[side];
      if (sourceDelta !== credited) {
        issues.push({ code: R.SCORE_DELTA_MISMATCH, side, detail: `credited ${credited}, source score changed ${sourceDelta}` });
      }
      state.sourceScore[side] = after;
    }
  }
  return issues;
}

/** Fresh running state: every rostered player and both teams at zero. */
export function initialStatState({ teams, players }) {
  const state = { players: {}, teams: {}, unattributed: {}, score: { home: 0, away: 0 }, sourceScore: { home: 0, away: 0 } };
  for (const p of players ?? []) state.players[p.id] = emptyPlayerCounters();
  if (teams) for (const side of ["home", "away"]) state.teams[teams[side].id] = emptyTeamCounters();
  return state;
}

/**
 * Sum deltas over events in order (minimal reference reducer; W06 builds
 * checkpoints on top of `eventStatDeltas` + `applyDeltas`).
 *
 * @param {{ teams: object | null, players: object[], events: import("./types.js").NormalizedEvent[] }} normalized
 * @param {{ uptoIndex?: number }} [opts]  inclusive last event index
 * @returns {{ players: Record<string, object>, teams: Record<string, object>, unattributed: Record<string, object>, score: { home: number, away: number }, issues: object[] }}
 */
export function accumulate(normalized, { uptoIndex = Infinity } = {}) {
  const ctx = statContext(normalized);
  const state = initialStatState(normalized);
  const issues = [];
  for (const event of normalized.events) {
    if (event.index > uptoIndex) break;
    const deltas = eventStatDeltas(event, ctx);
    const scoreIssues = applyDeltas(state, event, deltas, normalized.teams);
    for (const i of [...deltas.issues, ...scoreIssues]) issues.push({ ...i, eventIndex: event.index, sourcePlayId: event.sourcePlayId });
  }
  const { players, teams, unattributed, score } = state;
  return { players, teams, unattributed, score, issues };
}
