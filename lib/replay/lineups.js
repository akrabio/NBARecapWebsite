// Active lineups and substitutions (tasks R10–R11).
//
// Pure: consumes `normalizeGame(...)` output, never mutates inputs, and every
// state is plain JSON (safe for checkpoints). Evidence for the rules below:
// docs/replay-implementation/source-findings.md §4.
//
// Initial lineup (R10)
// - Five box-score starters per team, in box-score order (stable slots; never
//   re-sorted by stats). Bench = every other roster player in box order,
//   including DNP players, who can never become active.
// - Missing / duplicate / ≠5 / DNP starters → the team lineup is invalid with
//   `lineup_no_starters` (roster fallback). Nothing is guessed.
//
// Substitution groups (R11)
// - A group is `NormalizedEvent.substitutionGroup`: a maximal run of
//   *consecutive* substitution events with the same period and clock. Any
//   other event in between (FT, timeout, violation) ends the group, even at the
//   same clock. Source evidence: the 6 same-clock runs split by other events in
//   the corpus are each internally consistent (each part leaves a valid five),
//   and merging across the intervening event would move a sub across a play
//   the source ordered between them.
// - A group is applied atomically at its LAST event: earlier members leave the
//   visible lineup unchanged (`pendingSubs` holds them). Within a group each
//   team's subs are resolved order-independently: repeatedly apply any sub
//   whose leaving player is on court and whose entering player is not, until no
//   progress. The entering player takes the leaving player's slot.
// - After each group, each affected team must have five distinct players; every
//   sub must have both roles, the event team, both players on that team's
//   roster, a non-DNP entering player, the leaving player on court and the
//   entering player off court. Any failure → that team becomes invalid.
// - Period transitions are NOT special: lineups carry over and the
//   between-period changes are the substitutions logged at the new period's
//   start clock (source-verified, 42/42 period starts).
//
// Invalid lineups and recovery
// - While invalid, `onCourt` is empty (UI uses the roster fallback) and a
//   best-effort `candidates` set is tracked leniently (leaving removed if
//   present, entering added). `confirmed` lists candidates proven on court
//   since the lineup became invalid: they entered by substitution, or recorded
//   an on-court action (an off-candidate actor is added and confirmed).
//   DNP players are never candidates or confirmed; a sub with a DNP entering
//   player (or wrong-team/unknown IDs) is rejected and not applied at all.
// - Recovery: the lineup becomes valid again only when `candidates` has exactly
//   five distinct players and all five are confirmed. Players carried over from
//   before the failure never count as confirmed. This rule is online (no
//   lookahead), so a seek to any index gives the same answer as a full pass.
//
// On-court evidence
// - A player holding an on-court role (shooter, assister, blocker, rebounder,
//   turnoverBy, stealer, fouler, fouled, jumpers, possession, violator) while
//   not in their team's valid five → `lineup_actor_off_court` and the team
//   becomes invalid. Technicals are excluded (bench players can be charged).

import { EVENT_KINDS as K, REASON_CODES as R } from "./types.js";

export const LINEUP_SIZE = 5;

/** Roles that prove the player is on the court at that event. */
export const ON_COURT_ROLES = Object.freeze(["shooter", "assister", "blocker", "rebounder", "turnoverBy", "stealer", "fouler", "fouled", "jumpers", "possession", "violator"]);

/** Verified player IDs that an event places on the court (deduplicated). */
export function courtActors(event) {
  const ids = new Set();
  if (!event || event.kind === K.SUBSTITUTION) return [];
  for (const role of ON_COURT_ROLES) {
    const v = event.roles?.[role];
    if (Array.isArray(v)) v.forEach((id) => id && ids.add(id));
    else if (v) ids.add(v);
  }
  return [...ids];
}

/**
 * Context for stepping: roster lookup, team order and group boundaries.
 * @param {{ teams: { home: { id: string }, away: { id: string } } | null, players: object[], events?: object[] }} normalized
 */
export function lineupContext({ teams, players, events = [] }) {
  const teamIds = teams ? [teams.home.id, teams.away.id] : [];
  const roster = {};
  const order = Object.fromEntries(teamIds.map((t) => [t, []]));
  const duplicates = [];
  for (const p of players ?? []) {
    if (!p?.id) continue;
    if (roster[p.id]) {
      duplicates.push(p.id);
      continue;
    }
    roster[p.id] = p;
    if (order[p.teamId]) order[p.teamId].push(p.id);
  }
  const groupEnd = {};
  for (const e of events) if (e.substitutionGroup) groupEnd[e.substitutionGroup] = e.index;
  return { teamIds, roster, order, duplicates, events, groupEnd };
}

const benchOf = (ctx, teamId, onCourt) => ctx.order[teamId].filter((id) => !onCourt.includes(id));

function validTeam(ctx, teamId, onCourt) {
  return { onCourt, bench: benchOf(ctx, teamId, onCourt), valid: true, issue: null, invalidSince: null, candidates: [], confirmed: [] };
}

function invalidTeam(ctx, teamId, issue, since, candidates, confirmed) {
  const conf = confirmed.filter((id) => candidates.includes(id));
  return { onCourt: [], bench: [...ctx.order[teamId]], valid: false, issue, invalidSince: since, candidates, confirmed: conf };
}

// Becomes valid when five distinct, all-confirmed candidates exist.
function maybeRecover(ctx, teamId, team) {
  if (team.valid) return team;
  const c = team.candidates;
  if (c.length === LINEUP_SIZE && new Set(c).size === LINEUP_SIZE && c.every((id) => team.confirmed.includes(id))) {
    return validTeam(ctx, teamId, [...c]);
  }
  return team;
}

/**
 * R10: starting lineups from verified box-score starter flags.
 * @returns {{ eventIndex: -1, teams: Record<string, import("./types.js").TeamLineup>, pendingSubs: number[], issues: object[] }}
 */
export function initialLineups(normalized, ctx = lineupContext(normalized)) {
  const teams = {};
  const issues = [];
  for (const teamId of ctx.teamIds) {
    const starterRows = (normalized.players ?? []).filter((p) => p?.teamId === teamId && p.starter);
    const ids = starterRows.map((p) => p.id);
    const unique = [...new Set(ids)];
    let problem = null;
    if (unique.length !== ids.length) problem = `duplicate starter IDs (${ids.length - unique.length})`;
    else if (starterRows.some((p) => p.didNotPlay)) problem = "a starter is marked did-not-play";
    else if (unique.length !== LINEUP_SIZE) problem = `${unique.length} starters`;
    if (problem) {
      issues.push({ code: R.LINEUP_NO_STARTERS, eventIndex: -1, teamId, detail: problem });
      teams[teamId] = invalidTeam(ctx, teamId, R.LINEUP_NO_STARTERS, -1, unique.filter((id) => !ctx.roster[id]?.didNotPlay), []);
    } else teams[teamId] = validTeam(ctx, teamId, unique);
  }
  return { eventIndex: -1, teams, pendingSubs: [], issues };
}

// Resolve one team's subs from a group. Returns the new team lineup + issues.
function applyTeamSubs(ctx, teamId, team, subs, groupIndex) {
  const issues = [];
  const fail = (code, e, detail) => issues.push({ code, eventIndex: e.index, teamId, detail });

  // Structural checks (independent of court state).
  const usable = [];
  for (const e of subs) {
    const { entering, leaving } = e.roles ?? {};
    if (!entering || !leaving) {
      fail(R.LINEUP_SUB_INCONSISTENT, e, "substitution without both verified roles");
      if (entering || leaving) usable.push({ e, entering: entering ?? null, leaving: leaving ?? null, partial: true });
      continue;
    }
    const pe = ctx.roster[entering];
    const pl = ctx.roster[leaving];
    if (!pe || !pl || pe.teamId !== teamId || pl.teamId !== teamId) {
      fail(R.LINEUP_SUB_INCONSISTENT, e, `wrong-team or unknown player (${entering} for ${leaving}, team ${teamId})`);
      continue;
    }
    if (pe.didNotPlay) {
      // Rejected outright: not applied, even leniently (no candidate change).
      fail(R.LINEUP_SUB_INCONSISTENT, e, `entering player ${entering} is marked did-not-play`);
      continue;
    }
    usable.push({ e, entering, leaving, partial: false });
  }

  if (team.valid && issues.length === 0) {
    // Order-independent resolution on a copy of the slots.
    const slots = [...team.onCourt];
    let pending = [...usable];
    let progress = true;
    while (pending.length && progress) {
      progress = false;
      pending = pending.filter((s) => {
        const at = slots.indexOf(s.leaving);
        if (at === -1 || slots.includes(s.entering)) return true;
        slots[at] = s.entering;
        progress = true;
        return false;
      });
    }
    if (pending.length === 0 && new Set(slots).size === LINEUP_SIZE) return { team: validTeam(ctx, teamId, slots), issues };
    for (const s of pending) {
      const detail = !team.onCourt.includes(s.leaving) && !slots.includes(s.leaving)
        ? `leaving player ${s.leaving} not on court`
        : `entering player ${s.entering} already on court`;
      fail(R.LINEUP_SUB_INCONSISTENT, s.e, detail);
    }
    if (pending.length === 0) fail(R.LINEUP_INVALID, subs[subs.length - 1], `group produced ${new Set(slots).size} distinct players`);
  }

  // Lenient tracking (invalid before, or this group failed).
  const wasValid = team.valid;
  const candidates = wasValid ? [...team.onCourt] : [...team.candidates];
  const confirmed = wasValid ? [] : [...team.confirmed];
  for (const s of usable) {
    const at = s.leaving ? candidates.indexOf(s.leaving) : -1;
    if (at !== -1) candidates.splice(at, 1);
    const ci = s.leaving ? confirmed.indexOf(s.leaving) : -1;
    if (ci !== -1) confirmed.splice(ci, 1);
    if (s.entering && !ctx.roster[s.entering]?.didNotPlay) {
      if (!candidates.includes(s.entering)) {
        if (at !== -1) candidates.splice(at, 0, s.entering);
        else candidates.push(s.entering);
      }
      if (!confirmed.includes(s.entering)) confirmed.push(s.entering);
    }
  }
  const code = wasValid ? (issues.find((i) => i.code === R.LINEUP_INVALID) ? R.LINEUP_INVALID : R.LINEUP_SUB_INCONSISTENT) : team.issue;
  const since = wasValid ? groupIndex : team.invalidSince;
  return { team: maybeRecover(ctx, teamId, invalidTeam(ctx, teamId, code, since, candidates, confirmed)), issues };
}

function applyGroup(ctx, state, subs, groupIndex) {
  const issues = [];
  const byTeam = Object.fromEntries(ctx.teamIds.map((t) => [t, []]));
  for (const e of subs) {
    let teamId = e.teamId;
    if (!teamId || !byTeam[teamId]) teamId = ctx.roster[e.roles?.leaving]?.teamId ?? ctx.roster[e.roles?.entering]?.teamId ?? null;
    if (teamId && byTeam[teamId]) byTeam[teamId].push(e);
    else {
      // No team can be attributed: membership of both teams is now unknown.
      for (const t of ctx.teamIds) byTeam[t].push({ ...e, roles: {} });
    }
  }
  const teams = { ...state.teams };
  for (const teamId of ctx.teamIds) {
    if (!byTeam[teamId].length) continue;
    const r = applyTeamSubs(ctx, teamId, teams[teamId], byTeam[teamId], groupIndex);
    teams[teamId] = r.team;
    issues.push(...r.issues);
  }
  return { teams, issues };
}

function applyEvidence(ctx, state, event) {
  const issues = [];
  let teams = state.teams;
  for (const id of courtActors(event)) {
    const p = ctx.roster[id];
    if (!p || !teams[p.teamId]) continue;
    const team = teams[p.teamId];
    if (p.didNotPlay) {
      // Source contradiction: never a candidate or confirmed; a valid five
      // becomes unverified (carried members stay unconfirmed).
      issues.push({ code: R.LINEUP_ACTOR_OFF_COURT, eventIndex: event.index, teamId: p.teamId, playerId: id, detail: `did-not-play player ${id} acted` });
      if (team.valid) teams = { ...teams, [p.teamId]: invalidTeam(ctx, p.teamId, R.LINEUP_ACTOR_OFF_COURT, event.index, [...team.onCourt], []) };
      continue;
    }
    if (team.valid) {
      if (team.onCourt.includes(id)) continue;
      issues.push({ code: R.LINEUP_ACTOR_OFF_COURT, eventIndex: event.index, teamId: p.teamId, playerId: id, detail: `${id} acted while not in the tracked five` });
      teams = { ...teams, [p.teamId]: invalidTeam(ctx, p.teamId, R.LINEUP_ACTOR_OFF_COURT, event.index, [...team.onCourt, id], [id]) };
    } else {
      const candidates = team.candidates.includes(id) ? team.candidates : [...team.candidates, id];
      const confirmed = team.confirmed.includes(id) ? team.confirmed : [...team.confirmed, id];
      if (candidates === team.candidates && confirmed === team.confirmed) continue;
      teams = { ...teams, [p.teamId]: maybeRecover(ctx, p.teamId, { ...team, candidates, confirmed }) };
    }
  }
  return { teams, issues };
}

/**
 * Step one normalized event. Pure: returns a new state (unchanged team
 * objects are shared). A substitution that is not the last of its group is
 * held in `pendingSubs`; the whole group is applied at its last event.
 *
 * @returns {{ state: object, issues: object[], appliedGroup: string | null }}
 */
export function applyLineupEvent(state, event, ctx) {
  if (event.kind === K.SUBSTITUTION) {
    const pendingSubs = [...state.pendingSubs, event.index];
    const groupId = event.substitutionGroup;
    const isLast = !groupId || ctx.groupEnd[groupId] === event.index;
    if (!isLast) return { state: { ...state, eventIndex: event.index, pendingSubs }, issues: [], appliedGroup: null };
    const subs = pendingSubs.map((i) => ctx.events[i] ?? (i === event.index ? event : null)).filter(Boolean);
    const { teams, issues } = applyGroup(ctx, state, subs, subs[0].index);
    return { state: { eventIndex: event.index, teams, pendingSubs: [] }, issues, appliedGroup: groupId ?? `sub-${event.index}` };
  }
  // A non-sub event always closes any pending group (normalize never splits a
  // group around another event, so this is only a defensive flush).
  let base = state;
  const issues = [];
  if (state.pendingSubs.length) {
    const subs = state.pendingSubs.map((i) => ctx.events[i]).filter(Boolean);
    const r = applyGroup(ctx, state, subs, subs[0]?.index ?? event.index);
    base = { ...state, teams: r.teams, pendingSubs: [] };
    issues.push(...r.issues);
  }
  const r = applyEvidence(ctx, base, event);
  issues.push(...r.issues);
  return { state: { eventIndex: event.index, teams: r.teams, pendingSubs: [] }, issues, appliedGroup: null };
}

/**
 * Full pass. `states[i]` is the lineup state after event `i` (mid-group
 * events show the pre-group lineup with `pendingSubs`).
 *
 * @returns {{
 *   initial: object,
 *   states: object[],
 *   groups: { id: string, from: number, to: number, teams: string[] }[],
 *   issues: object[],
 * }}
 */
export function lineupTimeline(normalized, { uptoIndex = Infinity } = {}) {
  const ctx = lineupContext(normalized);
  const init = initialLineups(normalized, ctx);
  const initial = { eventIndex: -1, teams: init.teams, pendingSubs: [] };
  const issues = [...init.issues];
  const states = [];
  const groups = [];
  let state = initial;
  for (const event of normalized.events) {
    if (event.index > uptoIndex) break;
    const r = applyLineupEvent(state, event, ctx);
    if (r.appliedGroup) {
      const members = [...state.pendingSubs, event.index];
      const teamSet = new Set(members.map((i) => ctx.events[i]?.teamId).filter(Boolean));
      groups.push({ id: r.appliedGroup, from: members[0], to: event.index, teams: [...teamSet] });
    }
    state = r.state;
    issues.push(...r.issues);
    states.push(state);
  }
  return { initial, states, groups, issues };
}

/** Lineup state after event `index` (-1 = before the first event), from scratch. */
export function lineupAt(normalized, index) {
  if (index < 0) return lineupTimeline(normalized, { uptoIndex: -1 }).initial;
  const { states, initial } = lineupTimeline(normalized, { uptoIndex: index });
  return states[states.length - 1] ?? initial;
}
