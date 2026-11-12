// Normalization of an ESPN summary into replay inputs (tasks R05–R06).
//
// Pure: no I/O, no clock reads, never mutates its input. Produces teams,
// roster metadata, final box-score expectations (validation only) and
// normalized events in ESPN plays-array order with verified roles. Stat
// deltas are NOT computed here (see stats module); events expose the facts
// the stats module needs (kind, made, attempt value, heave, FT kind, team-only).
//
// Evidence for every rule: docs/replay-implementation/source-findings.md.

import { joinWinProbability } from "./probability.js";
import { EVENT_KINDS as K, REASON_CODES as R } from "./types.js";

// ---------------------------------------------------------------------------
// Type-ID tables (source-findings §1, §3)
// ---------------------------------------------------------------------------

// 106 flagrant 1 of 1; 157/165/166 flagrant 1–3 of 3 (W20c; `shootingPlay` is true on them, so
// without these entries they were parsed as field goals).
const FREE_THROW_TYPES = new Set(["97", "98", "99", "100", "101", "102", "103", "104", "105", "106", "157", "165", "166"]);
const TECHNICAL_FT_TYPES = new Set(["103"]);
const FLAGRANT_FT_TYPES = new Set(["104", "105", "106", "157", "165", "166"]);
const HEAVE_TYPES = new Set(["282"]);
const REBOUND_TYPES = new Set(["155", "156"]);
const OFFENSIVE_REBOUND = "156";
// W20c: 66 discontinued dribble, 67 3-second, 69 8-second (team-only when no participant), 71 inbound,
// 72 back court, 73 offensive goaltending.
const TURNOVER_TYPES = new Set(["61", "62", "63", "64", "65", "66", "67", "69", "70", "71", "72", "73", "84", "86", "87", "90"]);
// W20c: 257 transition take foul (PF); 36 double personal foul charges BOTH participants a PF.
const PERSONAL_FOUL_TYPES = new Set(["22", "24", "32", "36", "40", "42", "43", "44", "45", "257"]);
const DOUBLE_PERSONAL_FOUL = "36";
// W20c: 28 delay technical ("delay techfoul", team-only, no participant).
const TECHNICAL_TYPES = new Set(["28", "29", "30", "35", "48"]);
// W20c: 10 lane violation (no counter; not a turnover in the box).
const VIOLATION_TYPES = new Set(["8", "9", "10", "12"]);
// W20c: 214 coach's challenge (supported).
const REVIEW_TYPES = new Set(["213", "214", "215", "216", "277", "278", "279", "280"]);
const SUBSTITUTION = "584";
const JUMP_BALL = "615";
const TIMEOUT_TYPES = new Set(["16"]);
const PERIOD_END = "412";
const GAME_END = "402";

const DEFAULT_FORMAT = Object.freeze({ regulationPeriods: 4, regulationSec: 720, overtimeSec: 300 });

// Player box-score labels → expected counter(s).
const PLAYER_LABELS = {
  PTS: ["pts"],
  FG: ["fgm", "fga"],
  "3PT": ["tpm", "tpa"],
  FT: ["ftm", "fta"],
  REB: ["reb"],
  OREB: ["oreb"],
  DREB: ["dreb"],
  AST: ["ast"],
  TO: ["to"],
  STL: ["stl"],
  BLK: ["blk"],
  PF: ["pf"],
};
const COUNTERS = ["pts", "fgm", "fga", "tpm", "tpa", "ftm", "fta", "reb", "oreb", "dreb", "ast", "to", "stl", "blk", "pf"];

// Team box-score statistic names → expected counter(s).
const TEAM_NAMES = {
  "fieldGoalsMade-fieldGoalsAttempted": ["fgm", "fga"],
  "threePointFieldGoalsMade-threePointFieldGoalsAttempted": ["tpm", "tpa"],
  "freeThrowsMade-freeThrowsAttempted": ["ftm", "fta"],
  totalRebounds: ["reb"],
  offensiveRebounds: ["oreb"],
  defensiveRebounds: ["dreb"],
  assists: ["ast"],
  turnovers: ["to"],
  steals: ["stl"],
  blocks: ["blk"],
  fouls: ["pf"],
  teamTurnovers: ["teamTo"],
  totalTurnovers: ["totalTo"],
  technicalFouls: ["technicalFouls"],
};
const TEAM_COUNTERS = [...COUNTERS, "teamTo", "totalTo", "technicalFouls"];

// ---------------------------------------------------------------------------
// Small parsers
// ---------------------------------------------------------------------------

const str = (v) => (v == null ? null : String(v));
const cleanText = (v) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");
const round3 = (x) => Math.round(x * 1000) / 1000;

/** Parse a non-negative integer stat string ("7"); null when absent/invalid. */
function parseCount(v) {
  if (typeof v === "number") return Number.isInteger(v) && v >= 0 ? v : null;
  if (typeof v !== "string" || !/^\s*\d+\s*$/.test(v)) return null;
  return Number(v);
}

/** Parse "7-12" → [7, 12]; [null, null] when absent/invalid. */
function parsePair(v) {
  const m = typeof v === "string" ? /^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(v) : null;
  if (!m) return [null, null];
  return [Number(m[1]), Number(m[2])];
}

/**
 * Parse an ESPN clock display ("11:42", "0:07", "56.5", "0.0") into decimal
 * seconds remaining. Returns null for anything else; never defaults to 0.
 * @param {unknown} display
 * @returns {number | null}
 */
export function parseClock(display) {
  if (typeof display !== "string") return null;
  const s = display.trim();
  let m = /^(\d{1,2}):([0-5]\d(?:\.\d+)?)$/.exec(s);
  if (m) return round3(Number(m[1]) * 60 + Number(m[2]));
  m = /^(\d{1,2}(?:\.\d+)?)$/.exec(s);
  if (m && Number(m[1]) < 60) return Number(m[1]);
  return null;
}

/** Normalize `summary.format` (periods/lengths), defaulting to NBA rules. */
export function normalizeFormat(format) {
  const reg = format?.regulation;
  const ot = format?.overtime;
  const posInt = (v, d) => (Number.isInteger(v) && v > 0 ? v : d);
  return {
    regulationPeriods: posInt(reg?.periods, DEFAULT_FORMAT.regulationPeriods),
    regulationSec: posInt(reg?.clock, DEFAULT_FORMAT.regulationSec),
    overtimeSec: posInt(ot?.clock, DEFAULT_FORMAT.overtimeSec),
  };
}

/** Length of a period in seconds (12-minute quarters, 5-minute overtimes by default). */
export function periodLengthSec(period, format = DEFAULT_FORMAT) {
  return period <= format.regulationPeriods ? format.regulationSec : format.overtimeSec;
}

/** Seconds of game time elapsed before `period` starts. */
export function periodStartSec(period, format = DEFAULT_FORMAT) {
  const reg = Math.min(period - 1, format.regulationPeriods);
  const ot = Math.max(0, period - 1 - format.regulationPeriods);
  return reg * format.regulationSec + ot * format.overtimeSec;
}

/**
 * Game elapsed seconds at a clock reading; null if either input is unknown.
 * @returns {number | null}
 */
export function gameElapsedSec(period, clockRemainingSec, format = DEFAULT_FORMAT) {
  if (!Number.isInteger(period) || period < 1 || clockRemainingSec == null) return null;
  return round3(periodStartSec(period, format) + periodLengthSec(period, format) - clockRemainingSec);
}

// ---------------------------------------------------------------------------
// Teams, roster, expectations (R05)
// ---------------------------------------------------------------------------

function parsePeriodScores(linescores) {
  if (!Array.isArray(linescores) || linescores.length === 0) return null;
  const out = linescores.map((l) => parseCount(l?.displayValue ?? l?.value));
  return out.every((v) => v != null) ? out : null;
}

/**
 * Teams by `homeAway` (never by array order).
 * @returns {{ teams: { home: object, away: object } | null, issues: object[] }}
 */
export function normalizeTeams(summary) {
  const competitors = summary?.header?.competitions?.[0]?.competitors;
  const issues = [];
  const list = Array.isArray(competitors) ? competitors : [];
  const pick = (side) => {
    const found = list.filter((c) => c?.homeAway === side);
    if (found.length !== 1) return null;
    const c = found[0];
    const id = str(c.id ?? c.team?.id);
    if (!id) return null;
    const score = parseCount(c.score);
    return {
      id,
      side,
      abbreviation: c.team?.abbreviation ?? null,
      name: c.team?.displayName ?? c.team?.name ?? null,
      shortName: c.team?.shortDisplayName ?? c.team?.name ?? null,
      finalScore: score,
      // Header linescores (validation only): points per period, or null when
      // absent/unparseable. Never a running value.
      periodScores: parsePeriodScores(c.linescores),
    };
  };
  const home = pick("home");
  const away = pick("away");
  if (!home || !away || home.id === away.id) {
    issues.push({ code: R.MISSING_TEAMS, detail: "header competitors lack one home and one away team" });
    return { teams: null, issues };
  }
  return { teams: { home, away }, issues };
}

function expectedFromLabels(labels, stats) {
  const out = Object.fromEntries(COUNTERS.map((k) => [k, null]));
  if (!Array.isArray(labels) || !Array.isArray(stats)) return out;
  labels.forEach((label, i) => {
    const target = PLAYER_LABELS[label];
    if (!target) return;
    if (target.length === 2) [out[target[0]], out[target[1]]] = parsePair(stats[i]);
    else out[target[0]] = parseCount(stats[i]);
  });
  return out;
}

function expectedFromTeamStats(statistics) {
  const out = Object.fromEntries(TEAM_COUNTERS.map((k) => [k, null]));
  for (const s of Array.isArray(statistics) ? statistics : []) {
    const target = TEAM_NAMES[s?.name];
    if (!target) continue;
    if (target.length === 2) [out[target[0]], out[target[1]]] = parsePair(s.displayValue);
    else out[target[0]] = parseCount(s.displayValue);
  }
  return out;
}

/**
 * Roster metadata and final box-score expectations, keyed by IDs.
 * @param {object} summary
 * @param {{ home: object, away: object } | null} teams
 */
export function normalizeRoster(summary, teams) {
  const issues = [];
  const players = [];
  const expectedPlayers = {};
  const expectedTeams = {};
  const teamIds = teams ? new Set([teams.home.id, teams.away.id]) : null;
  const box = summary?.boxscore;

  if (!box || !Array.isArray(box.players)) {
    issues.push({ code: R.NO_BOXSCORE, detail: "boxscore.players missing" });
  }
  for (const group of Array.isArray(box?.players) ? box.players : []) {
    const teamId = str(group?.team?.id);
    if (!teamId || (teamIds && !teamIds.has(teamId))) {
      issues.push({ code: R.UNKNOWN_TEAM, detail: `box player group team ${teamId}` });
      continue;
    }
    const stat = group.statistics?.[0];
    for (const a of Array.isArray(stat?.athletes) ? stat.athletes : []) {
      const id = str(a?.athlete?.id);
      if (!id) continue;
      if (expectedPlayers[id]) {
        issues.push({ code: R.DUPLICATE_ID_CONFLICT, detail: `athlete ${id} listed twice in box score` });
        continue;
      }
      const didNotPlay = a.didNotPlay === true;
      players.push({
        id,
        teamId,
        name: a.athlete.displayName ?? null,
        shortName: a.athlete.shortName ?? null,
        jersey: a.athlete.jersey != null ? String(a.athlete.jersey) : null,
        position: a.athlete.position?.abbreviation ?? null,
        starter: a.starter === true,
        didNotPlay,
        dnpReason: didNotPlay ? (a.reason ?? null) : null,
        active: typeof a.active === "boolean" ? a.active : null,
        ejected: typeof a.ejected === "boolean" ? a.ejected : null,
      });
      expectedPlayers[id] = expectedFromLabels(stat.labels, a.stats);
    }
  }
  for (const t of Array.isArray(box?.teams) ? box.teams : []) {
    const teamId = str(t?.team?.id);
    if (!teamId || (teamIds && !teamIds.has(teamId))) {
      issues.push({ code: R.UNKNOWN_TEAM, detail: `box team ${teamId}` });
      continue;
    }
    expectedTeams[teamId] = expectedFromTeamStats(t.statistics);
  }
  if (teams) {
    for (const side of ["home", "away"]) {
      const { id, finalScore } = teams[side];
      expectedTeams[id] = { ...(expectedTeams[id] ?? expectedFromTeamStats([])), pts: finalScore };
    }
  }
  return { players, expected: { players: expectedPlayers, teams: expectedTeams }, issues };
}

// ---------------------------------------------------------------------------
// Roles (text-guarded; source-findings §3 "Implementation rule")
// ---------------------------------------------------------------------------

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function nameInText(text, name) {
  if (!name) return false;
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(name)}(?![\\p{L}\\p{N}])`, "u").test(text);
}

function makeRoleContext(text, teamId, roster, issues) {
  const byName = new Map();
  for (const p of roster.values()) {
    if (!p.name) continue;
    byName.set(p.name, byName.has(p.name) ? null : p.id); // null = ambiguous name
  }
  const uniqueByName = (name) => (typeof name === "string" ? (byName.get(name.trim()) ?? null) : null);
  // Text starts with the player's name followed by a non-name character.
  const leadsWith = (name) => Boolean(name) && text.startsWith(name) && !/^[\p{L}\p{N}]/u.test(text.slice(name.length));
  const leadingCandidate = () => {
    const hits = [...byName.entries()].filter(([name, id]) => id && leadsWith(name));
    hits.sort((a, b) => b[0].length - a[0].length);
    return hits.length && (hits.length === 1 || hits[0][0].length > hits[1][0].length) ? hits[0][1] : null;
  };

  /**
   * Accept participant `id` for `role` if it is on the roster, its name matches
   * the text and the team relation holds. Otherwise return null and record an
   * issue. Name check, strictest first: `captured` (a name, or a list of names
   * for roles like jumpers) captured from the text by a role pattern; `leading`
   * (text must start with the name — the actor of "X makes…", "X traveling");
   * else the name must appear somewhere in the text.
   * @param {string} role
   * @param {string | undefined} id
   * @param {{ captured?: string | string[] | null, leading?: boolean, team?: "same" | "opponent" | null }} [opts]
   */
  return function accept(role, id, { captured = null, leading = false, team = null } = {}) {
    if (!id) {
      issues.push({ code: R.ROLE_UNRESOLVED, role, detail: "role implied by text but no participant" });
      return null;
    }
    const player = roster.get(id);
    if (!player) {
      issues.push({ code: R.UNKNOWN_ATHLETE, role, detail: `athlete ${id} not on box roster` });
      return null;
    }
    const nameOk = Array.isArray(captured)
      ? captured.some((c) => player.name === c.trim())
      : captured != null
        ? player.name === captured.trim()
        : leading
          ? leadsWith(player.name)
          : nameInText(text, player.name);
    if (!nameOk) {
      const candidate = leading && captured == null ? leadingCandidate() : uniqueByName(captured);
      const issue = { code: R.ROLE_TEXT_CONFLICT, role, detail: `participant ${id} (${player.name}) not named in text for ${role}` };
      if (candidate && candidate !== id) issue.candidate = candidate;
      issues.push(issue);
      return null;
    }
    if (team && teamId) {
      const same = player.teamId === teamId;
      if ((team === "same" && !same) || (team === "opponent" && same)) {
        issues.push({ code: R.ROLE_TEAM_CONFLICT, role, detail: `${role} ${id} expected ${team} team as ${teamId}` });
        return null;
      }
    }
    return id;
  };
}

function unexplained(issues, ids, from, kind) {
  for (let i = from; i < ids.length; i++) {
    issues.push({ code: R.ROLE_UNRESOLVED, detail: `unexplained participant ${ids[i]} at position ${i} on ${kind}` });
  }
}

const set = (roles, role, id) => {
  if (id) roles[role] = id;
};

/** FG/FT shooter: participants[0] must be the name before "makes"/"misses". */
function setShooter(roles, accept, id, text, issues) {
  const m = /^(.+?) (?:makes|misses) /.exec(text);
  if (!m) {
    issues.push({ code: R.ROLE_UNRESOLVED, role: "shooter", detail: "shot text has no 'X makes/misses' actor" });
    return;
  }
  set(roles, "shooter", accept("shooter", id, { captured: m[1], team: "same" }));
}

/** Kind, detail and verified roles for one play. */
function classify(play, ids, text, teamId, roster, issues) {
  const typeId = str(play.type?.id) ?? "";
  const accept = makeRoleContext(text, teamId, roster, issues);
  const roles = {};
  const detail = {};
  let kind;

  // Safety net: a shooting play of an unknown type whose text says "free
  // throw" is a free throw, never a field goal (flagged for the type table).
  const ftByText = !FREE_THROW_TYPES.has(typeId) && play.shootingPlay === true && /\bfree throw\b/i.test(text);
  if (ftByText) issues.push({ code: R.UNKNOWN_EVENT_TYPE, detail: `type ${typeId} ${cleanText(play.type?.text)}: free-throw text, classified as free throw` });
  if (FREE_THROW_TYPES.has(typeId) || ftByText) {
    kind = K.FREE_THROW;
    detail.made = play.scoringPlay === true;
    detail.points = detail.made ? (parseCount(play.scoreValue) ?? 1) : 0;
    detail.ftKind = ftByText
      ? /technical/i.test(text) ? "technical" : /flagrant/i.test(text) ? "flagrant" : "regular"
      : TECHNICAL_FT_TYPES.has(typeId) ? "technical" : FLAGRANT_FT_TYPES.has(typeId) ? "flagrant" : "regular";
    setShooter(roles, accept, ids[0], text, issues);
    unexplained(issues, ids, 1, kind);
  } else if (play.shootingPlay === true || HEAVE_TYPES.has(typeId)) {
    kind = K.FIELD_GOAL;
    detail.made = play.scoringPlay === true;
    const attempted = Number(play.pointsAttempted);
    const scored = Number(play.scoreValue);
    detail.attemptValue = attempted === 2 || attempted === 3 ? attempted : detail.made && (scored === 2 || scored === 3) ? scored : null;
    if (detail.attemptValue == null) issues.push({ code: R.UNKNOWN_SHOT_VALUE, detail: `pointsAttempted=${play.pointsAttempted}` });
    detail.points = detail.made ? (detail.attemptValue ?? (Number.isFinite(scored) ? scored : 0)) : 0;
    detail.heave = HEAVE_TYPES.has(typeId);
    const block = /^(.+?) blocks (.+?)\s?'s? /.exec(text);
    detail.blocked = Boolean(block);
    if (block) {
      // participants: [0] shooter, [1] blocker; team = shooter's team.
      set(roles, "shooter", accept("shooter", ids[0], { captured: block[2], team: "same" }));
      set(roles, "blocker", accept("blocker", ids[1], { captured: block[1], team: "opponent" }));
      unexplained(issues, ids, 2, kind);
    } else {
      setShooter(roles, accept, ids[0], text, issues);
      const assist = detail.made ? /\((.+?) assists\)/.exec(text) : null;
      if (assist) {
        set(roles, "assister", accept("assister", ids[1], { captured: assist[1], team: "same" }));
        unexplained(issues, ids, 2, kind);
      } else unexplained(issues, ids, 1, kind);
    }
  } else if (REBOUND_TYPES.has(typeId)) {
    kind = K.REBOUND;
    detail.offensive = typeId === OFFENSIVE_REBOUND;
    detail.teamOnly = ids.length === 0;
    if (ids.length) set(roles, "rebounder", accept("rebounder", ids[0], { leading: true, team: "same" }));
    unexplained(issues, ids, 1, kind);
  } else if (TURNOVER_TYPES.has(typeId)) {
    kind = K.TURNOVER;
    detail.teamOnly = ids.length === 0;
    if (ids.length) set(roles, "turnoverBy", accept("turnoverBy", ids[0], { leading: true, team: "same" }));
    const steal = /\((.+?) steals\)/.exec(text);
    if (steal) {
      set(roles, "stealer", accept("stealer", ids[1], { captured: steal[1], team: "opponent" }));
      unexplained(issues, ids, 2, kind);
    } else unexplained(issues, ids, 1, kind);
  } else if (PERSONAL_FOUL_TYPES.has(typeId) || TECHNICAL_TYPES.has(typeId)) {
    const technical = TECHNICAL_TYPES.has(typeId);
    kind = technical ? K.TECHNICAL : K.FOUL;
    const drawn = /\((.+?) draws the foul\)/.exec(text);
    let charged = ids;
    if (typeId === DOUBLE_PERSONAL_FOUL) {
      // "X double personal foul (Y draws the foul)": participants [X, Y], both
      // charged a PF (box-verified, 401909972618). Y is the opponent.
      set(roles, "fouler", accept("fouler", ids[0], { leading: true, team: "same" }));
      set(roles, "doubleFouler", accept("doubleFouler", ids[1], { captured: drawn ? drawn[1] : null, team: "opponent" }));
      unexplained(issues, ids, 2, K.FOUL);
      return { kind: K.FOUL, roles, detail };
    }
    if (drawn && ids.length >= 2) {
      set(roles, "fouled", accept("fouled", ids[ids.length - 1], { captured: drawn[1], team: "opponent" }));
      charged = ids.slice(0, -1);
    }
    if (technical) {
      // Technicals may be charged to bench players or both teams (double technical).
      const double = /^Double technical foul: (.+?) and (.+)$/i.exec(text);
      const list = double
        ? charged.map((id) => accept("technical", id, { captured: [double[1], double[2]] })).filter(Boolean)
        : charged.slice(0, 1).map((id) => accept("technical", id, { leading: true })).filter(Boolean);
      if (!double) unexplained(issues, charged, 1, kind);
      if (list.length) roles.technical = list;
    } else {
      set(roles, "fouler", accept("fouler", charged[0], { leading: true, team: "same" }));
      unexplained(issues, charged, 1, kind);
    }
  } else if (VIOLATION_TYPES.has(typeId)) {
    kind = K.VIOLATION;
    detail.teamOnly = ids.length === 0;
    if (ids.length) set(roles, "violator", accept("violator", ids[0], { leading: true, team: "same" }));
    unexplained(issues, ids, 1, kind);
  } else if (typeId === SUBSTITUTION) {
    kind = K.SUBSTITUTION;
    const sub = /^(.+?) enters the game for (.+?)$/.exec(text);
    if (sub) {
      set(roles, "entering", accept("entering", ids[0], { captured: sub[1], team: "same" }));
      set(roles, "leaving", accept("leaving", ids[1], { captured: sub[2], team: "same" }));
    } else {
      issues.push({ code: R.ROLE_UNRESOLVED, role: "entering", detail: "substitution text not recognized" });
    }
    unexplained(issues, ids, 2, kind);
  } else if (typeId === JUMP_BALL) {
    kind = K.JUMP_BALL;
    const vs = /^(.+?) vs\. (.+?)(?: \(.*\))?$/.exec(text);
    const captured = vs ? [vs[1], vs[2]] : [];
    const jumpers = ids.slice(0, 2).map((id) => accept("jumpers", id, { captured })).filter(Boolean);
    if (jumpers.length) roles.jumpers = jumpers;
    const gain = /\((.+?) gains possession\)/.exec(text);
    if (gain) {
      set(roles, "possession", accept("possession", ids[2], { captured: gain[1] }));
      unexplained(issues, ids, 3, kind);
    } else unexplained(issues, ids, 2, kind);
  } else if (TIMEOUT_TYPES.has(typeId)) {
    kind = K.TIMEOUT;
  } else if (REVIEW_TYPES.has(typeId)) {
    kind = K.REVIEW;
  } else if (typeId === PERIOD_END) {
    kind = K.PERIOD_END;
  } else if (typeId === GAME_END) {
    kind = K.GAME_END;
  } else {
    kind = K.OTHER;
    issues.push({ code: R.UNKNOWN_EVENT_TYPE, detail: `type ${typeId} ${cleanText(play.type?.text)}` });
  }
  return { kind, roles, detail };
}

// ---------------------------------------------------------------------------
// Events (R06)
// ---------------------------------------------------------------------------

const contentKey = (p) =>
  JSON.stringify([
    p.sequenceNumber,
    p.type?.id,
    p.text,
    p.period?.number,
    p.clock?.displayValue,
    p.homeScore,
    p.awayScore,
    p.team?.id,
    (p.participants ?? []).map((x) => x?.athlete?.id),
  ]);

function parseScore(v) {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\s*\d+\s*$/.test(v) ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/**
 * Points an event credits to each side — the same rule as the stats module
 * (`eventStatDeltas`): made field goals and free throws, to the acting team.
 */
function creditedPoints(kind, detail, teamId, teams) {
  const out = { home: 0, away: 0 };
  if (!teams || !teamId || detail.made !== true) return out;
  const pts = kind === K.FIELD_GOAL ? (detail.points ?? 0) : kind === K.FREE_THROW ? (detail.points ?? 1) : 0;
  if (teamId === teams.home.id) out.home = pts;
  else if (teamId === teams.away.id) out.away = pts;
  return out;
}

/**
 * Adapter rule for late-recorded scoring plays (source-findings §10).
 *
 * ESPN sometimes records a scoring play late (higher `sequenceNumber`) and
 * places it at its correct game position. Its own score is right, but the
 * plays after it that were recorded EARLIER (lower `sequenceNumber`) keep the
 * score from their own recording time, i.e. without the late play's points —
 * the running score dips and then resyncs.
 *
 * A side's source score is replaced only when it is PROVEN stale:
 * - it differs from the expected score (previous normalized score + the
 *   points this event credits), AND
 * - it plus the points of the earlier-placed scoring plays with a HIGHER
 *   sequence number than this play equals that expected score exactly.
 * Otherwise the source value is kept untouched (and any regression or delta
 * mismatch is reported as before). Nothing is invented: the added points are
 * scoring records present in the feed, and totals are still reconciled with
 * the header final and linescores by the validator.
 *
 * @returns {{ corrected: { home: number, away: number }, detail: string, lateIds: string[] } | null}
 */
function staleSnapshot(scoreAfter, last, ownPoints, lateScoring, sequence) {
  if (sequence == null || lateScoring.length === 0) return null;
  const late = lateScoring.filter((s) => s.sequence > sequence);
  if (late.length === 0) return null;
  const corrected = { ...scoreAfter };
  const parts = [];
  const lateIds = new Set();
  for (const side of ["home", "away"]) {
    const raw = scoreAfter[side];
    if (raw == null) continue;
    const expected = (last[side] ?? 0) + ownPoints[side];
    const contributing = late.filter((s) => s.points[side]);
    const offset = contributing.reduce((sum, s) => sum + s.points[side], 0);
    if (raw === expected || offset === 0 || raw + offset !== expected) continue;
    corrected[side] = expected;
    contributing.forEach((s) => lateIds.add(s.sourcePlayId));
    parts.push(`${side} source ${raw} omits ${offset} from later-recorded ${contributing.map((s) => s.sourcePlayId).join(", ")}; carried ${expected}`);
  }
  return parts.length ? { corrected, detail: parts.join("; "), lateIds: [...lateIds] } : null;
}

/**
 * Normalize plays in source array order.
 * @param {object[]} plays
 * @param {{ teams: object | null, players: object[], format?: object }} ctx
 * @returns {{ events: import("./types.js").NormalizedEvent[], issues: object[] }}
 */
export function normalizeEvents(plays, { teams, players, format = DEFAULT_FORMAT }) {
  const issues = [];
  const events = [];
  const roster = new Map(players.map((p) => [p.id, p]));
  const teamIds = teams ? new Set([teams.home.id, teams.away.id]) : null;
  const seen = new Map(); // play id -> content key
  const last = { home: null, away: null };
  let lastSequence = null;
  let group = null; // { id, period, clock }
  const lateScoring = []; // scoring events so far: { sequence, sourcePlayId, points } (see staleSnapshot)

  (Array.isArray(plays) ? plays : []).forEach((play, sourceIndex) => {
    if (!play || typeof play !== "object") {
      issues.push({ code: R.INVALID_PERIOD, detail: `play at source index ${sourceIndex} is not an object` });
      return;
    }
    const sourcePlayId = str(play.id);
    const key = contentKey(play);
    const eventIssues = [];
    if (sourcePlayId && seen.has(sourcePlayId)) {
      if (seen.get(sourcePlayId) === key) {
        issues.push({ code: R.DUPLICATE_RECORD, sourcePlayId, detail: `source index ${sourceIndex} dropped` });
        return;
      }
      eventIssues.push({ code: R.DUPLICATE_ID_CONFLICT, detail: `play id ${sourcePlayId} reused with different content` });
    } else if (sourcePlayId) seen.set(sourcePlayId, key);

    const index = events.length;
    const text = cleanText(play.text);

    // Sequence (diagnostics only).
    const seqNum = Number(play.sequenceNumber);
    const sourceSequence = play.sequenceNumber != null && Number.isFinite(seqNum) ? seqNum : null;
    if (sourceSequence != null && lastSequence != null && sourceSequence < lastSequence) {
      eventIssues.push({ code: R.SEQUENCE_OUT_OF_ORDER, detail: `${sourceSequence} after ${lastSequence}` });
    }
    if (sourceSequence != null) lastSequence = sourceSequence;

    // Clock.
    const periodRaw = play.period?.number;
    const period = Number.isInteger(periodRaw) && periodRaw >= 1 ? periodRaw : null;
    if (period == null) eventIssues.push({ code: R.INVALID_PERIOD, detail: `period ${JSON.stringify(periodRaw ?? null)}` });
    let clockRemainingSec = parseClock(play.clock?.displayValue);
    if (clockRemainingSec == null && typeof play.clock?.value === "number" && Number.isFinite(play.clock.value)) {
      clockRemainingSec = play.clock.value;
      eventIssues.push({ code: R.CLOCK_FALLBACK, detail: `displayValue ${JSON.stringify(play.clock?.displayValue ?? null)}; used clock.value ${play.clock.value}` });
    }
    if (clockRemainingSec != null && period != null && (clockRemainingSec < 0 || clockRemainingSec > periodLengthSec(period, format))) {
      clockRemainingSec = null;
    }
    if (clockRemainingSec == null) {
      eventIssues.push({ code: R.UNPARSEABLE_CLOCK, detail: `clock ${JSON.stringify(play.clock?.displayValue ?? null)}` });
    }
    const elapsed = period == null ? null : gameElapsedSec(period, clockRemainingSec, format);

    // Team.
    let teamId = str(play.team?.id);
    if (teamId && teamIds && !teamIds.has(teamId)) {
      eventIssues.push({ code: R.UNKNOWN_TEAM, detail: `team ${teamId}` });
      teamId = null;
    }

    // Kind and roles.
    const ids = (Array.isArray(play.participants) ? play.participants : []).map((x) => str(x?.athlete?.id));
    const { kind, roles, detail } = classify(play, ids, text, teamId, roster, eventIssues);

    // Score.
    const scoreAfter = { home: parseScore(play.homeScore), away: parseScore(play.awayScore) };
    const ownPoints = creditedPoints(kind, detail, teamId, teams);
    const snapshot = staleSnapshot(scoreAfter, last, ownPoints, lateScoring, sourceSequence);
    let sourceScoreAfter = null;
    if (snapshot) {
      sourceScoreAfter = { ...scoreAfter };
      Object.assign(scoreAfter, snapshot.corrected);
      eventIssues.push({ code: R.SCORE_SNAPSHOT_OUT_OF_ORDER, detail: snapshot.detail, lateSourcePlayIds: snapshot.lateIds });
    }
    for (const side of ["home", "away"]) {
      if (scoreAfter[side] == null) {
        eventIssues.push({ code: R.INVALID_SCORE, detail: `${side}Score ${JSON.stringify(play[`${side}Score`] ?? null)}` });
        continue;
      }
      if (last[side] != null && scoreAfter[side] < last[side]) {
        const detail = `${side} ${last[side]} → ${scoreAfter[side]}`;
        eventIssues.push({ code: R.SCORE_REGRESSION, detail });
        issues.push({ code: R.SCORE_REGRESSION, eventIndex: index, sourcePlayId, detail });
      }
      last[side] = scoreAfter[side];
    }
    if (sourceSequence != null && (ownPoints.home || ownPoints.away)) {
      lateScoring.push({ sequence: sourceSequence, sourcePlayId, points: ownPoints });
    }

    // Substitution groups: consecutive subs sharing one period/clock.
    let substitutionGroup = null;
    if (kind === K.SUBSTITUTION) {
      const continues = group && period != null && clockRemainingSec != null && group.period === period && group.clock === clockRemainingSec;
      if (!continues) group = { id: `sub-${index}`, period, clock: clockRemainingSec };
      substitutionGroup = group.id;
      if (clockRemainingSec == null || period == null) group = null; // unknown time: never merge
    } else group = null;

    events.push({
      index,
      sourcePlayId,
      sourceSequence,
      source: { typeId: str(play.type?.id) ?? "", typeText: cleanText(play.type?.text) },
      period,
      clockRemainingSec,
      gameElapsedSec: elapsed,
      kind,
      teamId,
      roles,
      detail,
      scoreAfter,
      ...(sourceScoreAfter ? { sourceScoreAfter } : {}),
      text,
      substitutionGroup,
      issues: eventIssues,
    });
  });
  return { events, issues };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Normalize one ESPN summary. Pure; does not mutate `summary`.
 *
 * @param {object} summary ESPN summary (header, boxscore, plays, format…)
 * @returns {{
 *   espnGameId: string | null,
 *   final: boolean,
 *   format: { regulationPeriods: number, regulationSec: number, overtimeSec: number },
 *   teams: { home: object, away: object } | null,
 *   players: import("./types.js").ReplayPlayer[],
 *   expected: { players: Record<string, import("./types.js").ExpectedCounters>, teams: Record<string, import("./types.js").ExpectedTeamCounters> },
 *   events: import("./types.js").NormalizedEvent[],
 *   probability: import("./types.js").ProbabilitySample[],  linked win-probability samples (R12)
 *   issues: { code: string, eventIndex?: number, sourcePlayId?: string | null, detail?: string }[],
 * }}
 */
export function normalizeGame(summary) {
  const format = normalizeFormat(summary?.format);
  const { teams, issues: teamIssues } = normalizeTeams(summary);
  const { players, expected, issues: rosterIssues } = normalizeRoster(summary, teams);
  const plays = summary?.plays;
  const playIssues = [];
  if (!Array.isArray(plays) || plays.length === 0) playIssues.push({ code: R.NO_PLAYS, detail: "summary.plays empty or missing" });
  const { events, issues: eventIssues } = normalizeEvents(plays, { teams, players, format });
  const comp = summary?.header?.competitions?.[0];
  const { samples: probability, issues: probabilityIssues } = joinWinProbability(summary?.winprobability, events);
  return {
    espnGameId: str(summary?.header?.id ?? comp?.id),
    final: isFinalStatus(comp?.status?.type),
    format,
    teams,
    players,
    expected,
    events,
    probability,
    issues: [...teamIssues, ...rosterIssues, ...playIssues, ...eventIssues, ...probabilityIssues],
  };
}

/**
 * Final only when ESPN says completed AND post-game AND a final status name
 * (STATUS_FINAL; tolerant of variants such as STATUS_FINAL_OT). Fixtures:
 * `{ name: "STATUS_FINAL", state: "post", completed: true }`. A completed flag
 * alongside an in-progress state/name is not final.
 */
export function isFinalStatus(type) {
  return type?.completed === true && type?.state === "post" && typeof type?.name === "string" && /^STATUS_FINAL/.test(type.name);
}

/** Count issue codes across game-level and event-level issues (diagnostics). */
export function countIssues(normalized) {
  const counts = {};
  const add = (code) => (counts[code] = (counts[code] ?? 0) + 1);
  normalized.issues.forEach((i) => i.eventIndex == null && add(i.code)); // event-linked ones are counted below
  normalized.events.forEach((e) => e.issues.forEach((i) => add(i.code)));
  return counts;
}
