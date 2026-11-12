#!/usr/bin/env node
// Offline audit of ESPN summary fixtures for the game replay (task R03).
//
// Usage:
//   node scripts/audit-replay-source.mjs [--section=<name>] [--json] [fixtureId…]
//
// Sections: types, fields, order, duplicates, probability, roles, reconcile,
// subs, lineups, periods, samples. Default: all.
//
// Reads tests/fixtures/replay/*.json (see manifest.json). Never fetches.
// The role map used by `reconcile` is a *candidate* under test, not a
// contract: its purpose is to check each attribution hypothesis against the
// final box score and against the names in the play text.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_DIR = join(ROOT, "tests/fixtures/replay");

const args = process.argv.slice(2);
const sectionArg = args.find((a) => a.startsWith("--section="));
const sections = sectionArg ? new Set(sectionArg.slice(10).split(",")) : null;
const asJson = args.includes("--json");
const manifest = JSON.parse(readFileSync(join(FIXTURE_DIR, "manifest.json"), "utf8"));
const requestedIds = args.filter((a) => !a.startsWith("--"));
const fixtureIds = requestedIds.length ? requestedIds : Object.keys(manifest.fixtures);

const want = (name) => !sections || sections.has(name);
const report = {};
const out = (...lines) => {
  if (!asJson) console.log(...lines);
};

// ---------------------------------------------------------------------------
// Loading and identity
// ---------------------------------------------------------------------------

function loadGame(id) {
  const summary = JSON.parse(readFileSync(join(FIXTURE_DIR, `${id}.json`), "utf8"));
  const comp = summary.header.competitions[0];
  const home = comp.competitors.find((c) => c.homeAway === "home");
  const away = comp.competitors.find((c) => c.homeAway === "away");
  const players = new Map(); // athleteId -> { id, name, teamId, starter, dnp, active, ejected, box }
  for (const team of summary.boxscore.players) {
    const stat = team.statistics[0];
    for (const a of stat.athletes) {
      const box = {};
      stat.keys.forEach((k, i) => (box[k] = a.stats[i]));
      players.set(a.athlete.id, {
        id: a.athlete.id,
        name: a.athlete.displayName,
        shortName: a.athlete.shortName,
        teamId: team.team.id,
        starter: a.starter,
        dnp: a.didNotPlay,
        active: a.active,
        ejected: a.ejected,
        box,
      });
    }
  }
  const teamStats = new Map();
  for (const t of summary.boxscore.teams) {
    const s = {};
    for (const st of t.statistics) s[st.name] = st.displayValue;
    teamStats.set(t.team.id, { abbr: t.team.abbreviation, name: t.team.shortDisplayName, stats: s });
  }
  return {
    id,
    summary,
    plays: summary.plays,
    wp: summary.winprobability || [],
    homeId: home.id,
    awayId: away.id,
    abbr: { [home.id]: home.team.abbreviation, [away.id]: away.team.abbreviation },
    players,
    teamStats,
  };
}

function clockSec(display) {
  if (/^\d+:\d\d$/.test(display)) {
    const [m, s] = display.split(":").map(Number);
    return m * 60 + s;
  }
  if (/^\d+(\.\d+)?$/.test(display)) return Number(display);
  return null;
}
const periodLength = (n) => (n <= 4 ? 720 : 300);
function elapsed(p) {
  const n = p.period.number;
  const before = n <= 4 ? (n - 1) * 720 : 4 * 720 + (n - 5) * 300;
  const c = clockSec(p.clock.displayValue);
  return c == null ? null : before + periodLength(n) - c;
}
const pids = (p) => (p.participants || []).map((x) => x.athlete?.id);
const typeKey = (p) => `${p.type?.id} ${String(p.type?.text).replace(/\n/g, " ")}`;
const nameOf = (g, id) => g.players.get(id)?.name ?? `?${id}`;

// ---------------------------------------------------------------------------
// Candidate classification (under test)
// ---------------------------------------------------------------------------

const FT_RE = /^Free Throw/;
const isFreeThrow = (p) => FT_RE.test(p.type.text);
const isFieldGoalAttempt = (p) => p.shootingPlay === true && !isFreeThrow(p);
const isRebound = (p) => p.type.id === "155" || p.type.id === "156";
const isSub = (p) => p.type.id === "584";
// Turnover-type IDs (verified by box-score reconciliation below).
const TURNOVER_TYPES = new Set(["61", "62", "63", "64", "65", "70", "84", "86", "87", "90"]);
const isTurnover = (p) => TURNOVER_TYPES.has(p.type.id) || /turnover/i.test(p.type.text);
// Fouls counted in box-score PF (verified by reconciliation below).
const PERSONAL_FOUL_TYPES = new Set(["22", "24", "32", "40", "42", "43", "44", "45"]);
const TECHNICAL_TYPES = new Set(["29", "30", "35", "48"]);

/** Candidate role map. Returns { kind, roles, team } where roles are athlete IDs. */
function classify(p) {
  const ids = pids(p);
  const roles = {};
  let kind = "other";
  if (isSub(p)) {
    kind = "substitution";
    roles.entering = ids[0];
    roles.leaving = ids[1];
  } else if (isFreeThrow(p)) {
    kind = "free_throw";
    roles.shooter = ids[0];
  } else if (isFieldGoalAttempt(p)) {
    kind = "field_goal";
    roles.shooter = ids[0];
    if (/ blocks /.test(p.text)) roles.blocker = ids[1];
    else if (p.scoringPlay && / assists\)/.test(p.text)) roles.assister = ids[1];
    else if (ids[1]) roles.unknownSecond = ids[1];
  } else if (isRebound(p)) {
    kind = p.type.id === "156" ? "offensive_rebound" : "defensive_rebound";
    if (ids[0]) roles.rebounder = ids[0];
  } else if (isTurnover(p)) {
    kind = "turnover";
    if (ids[0]) roles.turnoverBy = ids[0];
    if (/ steals\)/.test(p.text)) roles.stealer = ids[1];
    else if (ids[1]) roles.unknownSecond = ids[1];
  } else if (PERSONAL_FOUL_TYPES.has(p.type.id)) {
    kind = "personal_foul";
    roles.fouler = ids[0];
  } else if (TECHNICAL_TYPES.has(p.type.id)) {
    kind = "technical_foul";
    ids.forEach((id, i) => (roles[`technical${i}`] = id));
  } else if (p.type.id === "615") {
    kind = "jump_ball";
  }
  return { kind, roles };
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

const games = fixtureIds.map(loadGame);

if (want("types") || want("fields")) {
  const types = new Map();
  for (const g of games) {
    for (const p of g.plays) {
      const k = typeKey(p);
      const t = types.get(k) || { count: 0, games: new Set(), fields: {}, participants: {}, scoreValues: {} };
      t.count++;
      t.games.add(g.id);
      for (const f of Object.keys(p)) t.fields[f] = (t.fields[f] || 0) + 1;
      const pc = (p.participants || []).length;
      t.participants[pc] = (t.participants[pc] || 0) + 1;
      const sv = `${p.scoringPlay ? "scoring" : "non"}/${p.scoreValue}/att${p.pointsAttempted}`;
      t.scoreValues[sv] = (t.scoreValues[sv] || 0) + 1;
      types.set(k, t);
    }
  }
  const allFields = new Set();
  for (const t of types.values()) Object.keys(t.fields).forEach((f) => allFields.add(f));
  const rows = [...types.entries()].sort((a, b) => b[1].count - a[1].count);
  report.types = rows.map(([k, t]) => ({
    type: k,
    count: t.count,
    games: t.games.size,
    participants: t.participants,
    scoreValues: t.scoreValues,
    missingFields: [...allFields].filter((f) => (t.fields[f] || 0) < t.count).map((f) => `${f}:${t.count - (t.fields[f] || 0)}`),
  }));
  if (want("types")) {
    out("\n## Event types (type.id type.text — count, games, participants histogram, scoring/value/attempted)");
    for (const r of report.types) {
      out(`${r.type.padEnd(42)} ${String(r.count).padStart(4)}  g=${r.games}  parts=${JSON.stringify(r.participants)}  ${Object.keys(r.scoreValues).join(" ")}`);
    }
  }
  if (want("fields")) {
    out("\n## Field presence (types where a field is sometimes/always missing)");
    for (const r of report.types) if (r.missingFields.length) out(`${r.type.padEnd(42)} missing ${r.missingFields.join(", ")}`);
  }
}

if (want("order")) {
  out("\n## Ordering anomalies (array order is treated as authoritative)");
  report.order = {};
  for (const g of games) {
    const anomalies = { seqBackwards: [], seqGaps: 0, periodBackwards: [], clockForward: [], scoreDecrease: [], unparsedClock: [] };
    let prev = null;
    for (const [i, p] of g.plays.entries()) {
      if (clockSec(p.clock.displayValue) == null) anomalies.unparsedClock.push(p.id);
      if (prev) {
        const s0 = Number(prev.sequenceNumber);
        const s1 = Number(p.sequenceNumber);
        if (s1 <= s0) anomalies.seqBackwards.push({ index: i, id: p.id, prevSeq: s0, seq: s1, text: p.text, prevText: prev.text });
        else if (s1 - s0 > 1) anomalies.seqGaps++;
        if (p.period.number < prev.period.number) anomalies.periodBackwards.push(p.id);
        if (p.period.number === prev.period.number && clockSec(p.clock.displayValue) > clockSec(prev.clock.displayValue)) {
          anomalies.clockForward.push({ index: i, id: p.id, clock: p.clock.displayValue, prevClock: prev.clock.displayValue, text: p.text, prevText: prev.text });
        }
        if (p.homeScore < prev.homeScore || p.awayScore < prev.awayScore) {
          anomalies.scoreDecrease.push({ id: p.id, text: p.text, from: `${prev.awayScore}-${prev.homeScore}`, to: `${p.awayScore}-${p.homeScore}` });
        }
      }
      prev = p;
    }
    // Does the id encode the sequence number? (id = eventId + sequenceNumber)
    const idEncodesSeq = g.plays.every((p) => p.id === `${g.id}${p.sequenceNumber}`);
    // Counter-check: would sorting by sequenceNumber produce a clean order?
    const bySeq = [...g.plays].sort((a, b) => Number(a.sequenceNumber) - Number(b.sequenceNumber));
    let seqSortClockForward = 0;
    let seqSortScoreDecrease = 0;
    for (let i = 1; i < bySeq.length; i++) {
      const a = bySeq[i - 1];
      const b = bySeq[i];
      if (b.period.number < a.period.number || (a.period.number === b.period.number && clockSec(b.clock.displayValue) > clockSec(a.clock.displayValue))) seqSortClockForward++;
      if (b.homeScore < a.homeScore || b.awayScore < a.awayScore) seqSortScoreDecrease++;
    }
    report.order[g.id] = { ...anomalies, idEncodesSeq, seqSortClockForward, seqSortScoreDecrease };
    out(`${g.id}: seqBackwards=${anomalies.seqBackwards.length} seqGaps=${anomalies.seqGaps} periodBackwards=${anomalies.periodBackwards.length} clockForward=${anomalies.clockForward.length} scoreDecrease=${anomalies.scoreDecrease.length} unparsedClock=${anomalies.unparsedClock.length} idEncodesSeq=${idEncodesSeq} | if sorted by sequenceNumber: clockForward=${seqSortClockForward} scoreDecrease=${seqSortScoreDecrease}`);
    for (const a of anomalies.seqBackwards) out(`   seq ${a.prevSeq}→${a.seq} at #${a.index} ${a.id}: "${a.prevText}" then "${a.text}"`);
    for (const a of anomalies.clockForward) out(`   clock ${a.prevClock}→${a.clock} at #${a.index} ${a.id}: "${a.prevText}" then "${a.text}"`);
    for (const a of anomalies.scoreDecrease) out(`   score ${a.from}→${a.to} ${a.id}: "${a.text}"`);
  }
}

if (want("duplicates")) {
  out("\n## Duplicates");
  report.duplicates = {};
  for (const g of games) {
    const byId = new Map();
    const byContent = new Map();
    for (const p of g.plays) {
      byId.set(p.id, (byId.get(p.id) || 0) + 1);
      const key = [p.period.number, p.clock.displayValue, p.type.id, p.text, pids(p).join(","), p.awayScore, p.homeScore].join("|");
      if (!byContent.has(key)) byContent.set(key, []);
      byContent.get(key).push(p.id);
    }
    const dupIds = [...byId].filter(([, n]) => n > 1);
    const dupContent = [...byContent].filter(([, v]) => v.length > 1);
    report.duplicates[g.id] = { dupIds, dupContent };
    out(`${g.id}: duplicate ids=${dupIds.length} identical-content records=${dupContent.length}`);
    for (const [k, v] of dupContent) out(`   ${v.join(", ")}: ${k}`);
  }
}

if (want("probability")) {
  out("\n## Win probability linkage");
  report.probability = {};
  for (const g of games) {
    const playIds = new Set(g.plays.map((p) => p.id));
    const wpIds = g.wp.map((w) => w.playId);
    const unlinked = wpIds.filter((id) => !playIds.has(id));
    const wpSet = new Set(wpIds);
    const playsWithout = g.plays.filter((p) => !wpSet.has(p.id)).length;
    const outOfRange = g.wp.filter((w) => !(w.homeWinPercentage >= 0 && w.homeWinPercentage <= 1)).length;
    const orderMatches = g.wp.every((w, i) => w.playId === g.plays[i]?.id);
    const tieNonZero = g.wp.filter((w) => w.tiePercentage).length;
    const last = g.wp[g.wp.length - 1];
    const homeWon = Number(g.plays.at(-1).homeScore) > Number(g.plays.at(-1).awayScore);
    const r = { samples: g.wp.length, unlinked: unlinked.length, playsWithout, outOfRange, orderMatches, tieNonZero, first: g.wp[0]?.homeWinPercentage, last: last?.homeWinPercentage, homeWon };
    report.probability[g.id] = r;
    out(`${g.id}: ${JSON.stringify(r)}`);
  }
}

if (want("roles")) {
  out("\n## Participant ↔ text name order (does participants[i] appear in text, in order?)");
  // For each type: how often participants appear in text in array order, reversed, or missing.
  const stats = new Map();
  const mismatches = [];
  for (const g of games) {
    for (const p of g.plays) {
      const ids = pids(p);
      if (ids.length === 0) continue;
      const positions = ids.map((id) => {
        const pl = g.players.get(id);
        if (!pl) return -2;
        return p.text.indexOf(pl.name);
      });
      let verdict;
      if (positions.some((x) => x === -2)) verdict = "unknown-athlete";
      else if (positions.some((x) => x < 0)) verdict = "name-missing";
      else if (positions.every((x, i) => i === 0 || x > positions[i - 1])) verdict = "in-order";
      else verdict = "out-of-order";
      const k = typeKey(p);
      const s = stats.get(k) || {};
      s[verdict] = (s[verdict] || 0) + 1;
      stats.set(k, s);
      if (verdict === "name-missing" || verdict === "unknown-athlete") {
        mismatches.push({ game: g.id, id: p.id, type: k, text: p.text, participants: ids.map((id) => nameOf(g, id)) });
      }
    }
  }
  report.roles = { byType: Object.fromEntries(stats), mismatches };
  for (const [k, s] of [...stats].sort()) out(`${k.padEnd(42)} ${JSON.stringify(s)}`);
  out("Name-missing / unknown examples:");
  for (const m of mismatches.slice(0, 40)) out(`   ${m.id} [${m.type}] "${m.text}" participants=${m.participants.join(" ; ")}`);
  if (mismatches.length > 40) out(`   … ${mismatches.length - 40} more`);

  // Cross-team checks: steals / blocks must be by the opposing team.
  out("\nCross-team role checks:");
  const cross = { stealSameTeam: [], blockSameTeam: [], assistOtherTeam: [], blockTeamIsShooter: 0, blockTeamIsBlocker: 0, subCrossTeam: [], shooterNotActingTeam: [] };
  for (const g of games) {
    for (const p of g.plays) {
      const { kind, roles } = classify(p);
      const team = (id) => g.players.get(id)?.teamId;
      if (roles.stealer && team(roles.stealer) === team(roles.turnoverBy)) cross.stealSameTeam.push(p.id);
      if (roles.blocker) {
        if (team(roles.blocker) === team(roles.shooter)) cross.blockSameTeam.push(p.id);
        if (p.team?.id === team(roles.shooter)) cross.blockTeamIsShooter++;
        if (p.team?.id === team(roles.blocker)) cross.blockTeamIsBlocker++;
      }
      if (roles.assister && team(roles.assister) !== team(roles.shooter)) cross.assistOtherTeam.push(p.id);
      if (kind === "substitution" && team(roles.entering) !== team(roles.leaving)) cross.subCrossTeam.push(p.id);
      if (roles.shooter && p.team?.id && team(roles.shooter) !== p.team.id) cross.shooterNotActingTeam.push(p.id);
    }
  }
  report.cross = cross;
  out(JSON.stringify(Object.fromEntries(Object.entries(cross).map(([k, v]) => [k, Array.isArray(v) ? v : v]))));
}

// Text guard: a structured role is kept only if that athlete's display name
// appears in the play text. Otherwise the role is re-resolved by a unique
// roster-name match in the text (role-specific pattern), or dropped.
const EXCLUDE_HEAVES = true;
const textGuard = [];
function guardRoles(g, p, roles, log) {
  const patterns = {
    blocker: /^(.+?) blocks /,
    assister: /\((.+?) assists\)/,
    stealer: /\((.+?) steals\)/,
  };
  for (const [role, re] of Object.entries(patterns)) {
    const id = roles[role];
    if (!id) continue;
    const pl = g.players.get(id);
    if (pl && p.text.includes(pl.name)) continue;
    const m = re.exec(p.text);
    const candidates = m ? [...g.players.values()].filter((x) => x.name === m[1].trim()) : [];
    const resolved = candidates.length === 1 ? candidates[0].id : undefined;
    log.push({ game: g.id, id: p.id, role, text: p.text, participant: nameOf(g, id), resolvedTo: resolved ? nameOf(g, resolved) : null });
    if (resolved) roles[role] = resolved;
    else delete roles[role];
  }
}

if (want("reconcile")) {
  out("\n## Box-score reconciliation of the candidate role map (player and team level)");
  out(`(heave attempts excluded from FGA/3PA: ${EXCLUDE_HEAVES}; text guard on blocker/assister/stealer: on)`);
  report.reconcile = {};
  const STATS = ["pts", "fgm", "fga", "tpm", "tpa", "ftm", "fta", "reb", "oreb", "dreb", "ast", "to", "stl", "blk", "pf"];
  const totals = Object.fromEntries(STATS.map((s) => [s, { ok: 0, bad: 0 }]));
  for (const g of games) {
    const acc = new Map();
    const team = { [g.homeId]: { teamReb: 0, teamOreb: 0, teamDreb: 0, teamTo: 0 }, [g.awayId]: { teamReb: 0, teamOreb: 0, teamDreb: 0, teamTo: 0 } };
    const add = (id, stat, n = 1) => {
      if (!id) return;
      if (!acc.has(id)) acc.set(id, Object.fromEntries(STATS.map((s) => [s, 0])));
      acc.get(id)[stat] += n;
    };
    for (const p of g.plays) {
      const { kind, roles } = classify(p);
      if (kind === "field_goal") {
        guardRoles(g, p, roles, textGuard);
        // Hypothesis (verified below): ESPN box scores exclude "Heave Jump Shot"
        // (type 282) attempts from FGA/3PA.
        const countsAttempt = !(EXCLUDE_HEAVES && p.type.id === "282");
        if (countsAttempt) add(roles.shooter, "fga");
        if (countsAttempt && p.pointsAttempted === 3) add(roles.shooter, "tpa");
        if (p.scoringPlay) {
          add(roles.shooter, "fgm");
          add(roles.shooter, "pts", p.scoreValue);
          if (p.scoreValue === 3) add(roles.shooter, "tpm");
        }
        add(roles.assister, "ast");
        add(roles.blocker, "blk");
      } else if (kind === "free_throw") {
        add(roles.shooter, "fta");
        if (p.scoringPlay) {
          add(roles.shooter, "ftm");
          add(roles.shooter, "pts", p.scoreValue);
        }
      } else if (kind === "offensive_rebound" || kind === "defensive_rebound") {
        const o = kind === "offensive_rebound";
        if (roles.rebounder) {
          add(roles.rebounder, "reb");
          add(roles.rebounder, o ? "oreb" : "dreb");
        } else if (p.team?.id && team[p.team.id]) {
          team[p.team.id].teamReb++;
          team[p.team.id][o ? "teamOreb" : "teamDreb"]++;
        }
      } else if (kind === "turnover") {
        guardRoles(g, p, roles, textGuard);
        if (roles.turnoverBy) add(roles.turnoverBy, "to");
        else if (p.team?.id && team[p.team.id]) team[p.team.id].teamTo++;
        add(roles.stealer, "stl");
      } else if (kind === "personal_foul") {
        add(roles.fouler, "pf");
      }
    }
    const boxVal = (pl, stat) => {
      const b = pl.box;
      const pair = (k, i) => Number(String(b[k]).split("-")[i]);
      switch (stat) {
        case "pts": return Number(b.points);
        case "fgm": return pair("fieldGoalsMade-fieldGoalsAttempted", 0);
        case "fga": return pair("fieldGoalsMade-fieldGoalsAttempted", 1);
        case "tpm": return pair("threePointFieldGoalsMade-threePointFieldGoalsAttempted", 0);
        case "tpa": return pair("threePointFieldGoalsMade-threePointFieldGoalsAttempted", 1);
        case "ftm": return pair("freeThrowsMade-freeThrowsAttempted", 0);
        case "fta": return pair("freeThrowsMade-freeThrowsAttempted", 1);
        case "reb": return Number(b.rebounds);
        case "oreb": return Number(b.offensiveRebounds);
        case "dreb": return Number(b.defensiveRebounds);
        case "ast": return Number(b.assists);
        case "to": return Number(b.turnovers);
        case "stl": return Number(b.steals);
        case "blk": return Number(b.blocks);
        case "pf": return Number(b.fouls);
      }
      return NaN;
    };
    const mismatches = [];
    for (const pl of g.players.values()) {
      if (pl.dnp) {
        if (acc.has(pl.id)) mismatches.push({ player: pl.name, stat: "dnp-with-events" });
        continue;
      }
      const mine = acc.get(pl.id) || Object.fromEntries(STATS.map((s) => [s, 0]));
      for (const s of STATS) {
        const expected = boxVal(pl, s);
        if (expected === mine[s]) totals[s].ok++;
        else {
          totals[s].bad++;
          mismatches.push({ player: pl.name, id: pl.id, stat: s, replay: mine[s], box: expected });
        }
      }
    }
    for (const id of acc.keys()) if (!g.players.has(id)) mismatches.push({ player: id, stat: "unknown-athlete" });
    const teamChecks = {};
    for (const tid of [g.homeId, g.awayId]) {
      const ts = g.teamStats.get(tid).stats;
      const playerSum = (s) => [...acc].filter(([id]) => g.players.get(id)?.teamId === tid).reduce((n, [, v]) => n + v[s], 0);
      teamChecks[g.abbr[tid]] = {
        reb: `${playerSum("reb") + team[tid].teamReb}/${ts.totalRebounds}`,
        oreb: `${playerSum("oreb") + team[tid].teamOreb}/${ts.offensiveRebounds}`,
        dreb: `${playerSum("dreb") + team[tid].teamDreb}/${ts.defensiveRebounds}`,
        playerTo: `${playerSum("to")}/${ts.turnovers}`,
        teamTo: `${team[tid].teamTo}/${ts.teamTurnovers}`,
        pf: `${playerSum("pf")}/${ts.fouls}`,
        teamRebEvents: team[tid].teamReb,
      };
    }
    report.reconcile[g.id] = { mismatches, teamChecks };
    out(`${g.id}: player-stat mismatches=${mismatches.length}`);
    for (const m of mismatches) out(`   ${JSON.stringify(m)}`);
    out(`   team (replay/box): ${JSON.stringify(teamChecks)}`);
  }
  report.reconcileTotals = totals;
  report.textGuard = textGuard;
  out("Text-guard corrections (participant name absent from text):");
  for (const t of textGuard) out(`   ${t.id} ${t.role}: participant=${t.participant} → ${t.resolvedTo ?? "dropped"} "${t.text}"`);
  out(`Per-stat player-line agreement across corpus: ${Object.entries(totals).map(([s, t]) => `${s} ${t.ok}/${t.ok + t.bad}`).join(", ")}`);
}

if (want("subs")) {
  out("\n## Substitutions: participants vs text \"X enters the game for Y\"");
  const r = { total: 0, matchesText: 0, reversed: 0, unparsed: [], sameClockBatches: 0, batchSizes: {}, atPeriodStart: 0, crossTeam: 0 };
  const SUB_RE = /^(.+) enters the game for (.+)$/;
  for (const g of games) {
    let batch = [];
    const flush = () => {
      if (batch.length) r.batchSizes[batch.length] = (r.batchSizes[batch.length] || 0) + 1;
      if (batch.length > 1) r.sameClockBatches++;
      batch = [];
    };
    let prev = null;
    for (const p of g.plays) {
      if (!isSub(p)) {
        flush();
        prev = p;
        continue;
      }
      if (batch.length && (batch[0].period.number !== p.period.number || batch[0].clock.displayValue !== p.clock.displayValue)) flush();
      batch.push(p);
      r.total++;
      if (p.clock.displayValue === `${periodLength(p.period.number) / 60}:00`) r.atPeriodStart++;
      const m = SUB_RE.exec(p.text.trim());
      const [a, b] = pids(p);
      if (!m) {
        r.unparsed.push(`${p.id}: ${p.text}`);
        continue;
      }
      const na = nameOf(g, a);
      const nb = nameOf(g, b);
      if (m[1] === na && m[2] === nb) r.matchesText++;
      else if (m[1] === nb && m[2] === na) r.reversed++;
      else r.unparsed.push(`${p.id}: "${p.text}" participants=${na};${nb}`);
      prev = p;
    }
    flush();
    void prev;
  }
  report.subs = r;
  out(JSON.stringify(r, null, 1));
}

// Lineup experiment: starters + substitutions; several period-start rules.
function runLineups(g, rule) {
  const onCourt = { [g.homeId]: new Set(), [g.awayId]: new Set() };
  for (const pl of g.players.values()) if (pl.starter) onCourt[pl.teamId].add(pl.id);
  const res = { notFive: 0, notFiveEvents: [], actorOffCourt: [], enterAlreadyOn: [], leaveNotOn: [], periodStartFixes: [] };
  const endOfPeriod = new Map();
  let curPeriod = 1;
  const plays = g.plays;
  for (let i = 0; i < plays.length; i++) {
    const p = plays[i];
    if (p.period.number !== curPeriod) {
      endOfPeriod.set(curPeriod, { [g.homeId]: [...onCourt[g.homeId]], [g.awayId]: [...onCourt[g.awayId]] });
      curPeriod = p.period.number;
      if (rule === "infer") {
        // Period-start inference: players who act in the new period before
        // being subbed in (or out) were on court at its start; players
        // subbed out before acting were also on court.
        for (const tid of [g.homeId, g.awayId]) {
          const seen = new Set();
          const starters = new Set();
          for (let j = i; j < plays.length && plays[j].period.number === curPeriod; j++) {
            const q = plays[j];
            const { kind, roles } = classify(q);
            if (kind === "substitution") {
              if (g.players.get(roles.leaving)?.teamId === tid && !seen.has(roles.leaving)) starters.add(roles.leaving);
              if (roles.entering) seen.add(roles.entering);
              if (roles.leaving) seen.add(roles.leaving);
              continue;
            }
            for (const [role, id] of Object.entries(roles)) {
              if (!id || role.startsWith("technical") || role === "unknownSecond") continue;
              if (g.players.get(id)?.teamId === tid && !seen.has(id)) starters.add(id);
              seen.add(id);
            }
            if (q.type.id === "615") {
              for (const id of pids(q)) if (g.players.get(id)?.teamId === tid && !seen.has(id)) { starters.add(id); seen.add(id); }
            }
            if (starters.size >= 5) break;
          }
          const before = [...onCourt[tid]].sort().join();
          if (starters.size === 5) onCourt[tid] = starters;
          else {
            // Keep carried-over players that are not contradicted, fill with evidence.
            const merged = new Set(starters);
            for (const id of onCourt[tid]) if (merged.size < 5 && !seen.has(id)) merged.add(id);
            onCourt[tid] = merged;
          }
          if (before !== [...onCourt[tid]].sort().join()) res.periodStartFixes.push({ period: curPeriod, team: g.abbr[tid], evidence: starters.size });
        }
      }
    }
    const { kind, roles } = classify(p);
    if (kind === "substitution") {
      const tid = g.players.get(roles.entering)?.teamId;
      if (onCourt[tid].has(roles.entering)) res.enterAlreadyOn.push(`${p.id} ${p.text}`);
      if (!onCourt[tid].has(roles.leaving)) res.leaveNotOn.push(`${p.id} ${p.text}`);
      onCourt[tid].delete(roles.leaving);
      onCourt[tid].add(roles.entering);
    } else {
      for (const [role, id] of Object.entries(roles)) {
        // Technicals can be assessed to bench players; unknown roles are not evidence.
        if (!id || role.startsWith("technical") || role === "unknownSecond") continue;
        const pl = g.players.get(id);
        if (pl && !onCourt[pl.teamId].has(id)) res.actorOffCourt.push({ id: p.id, role, player: pl.name, period: p.period.number, clock: p.clock.displayValue, text: p.text });
      }
    }
    // Check five-ness only at non-substitution events (mid-batch states are transient).
    if (kind !== "substitution") {
      for (const tid of [g.homeId, g.awayId]) {
        if (onCourt[tid].size !== 5) {
          res.notFive++;
          if (res.notFiveEvents.length < 3) res.notFiveEvents.push(`${p.id} ${g.abbr[tid]} size=${onCourt[tid].size}`);
        }
      }
    }
  }
  // End-of-game check against boxscore `active` flags (hypothesis: active = on court at final horn).
  const finalOn = new Set([...onCourt[g.homeId], ...onCourt[g.awayId]]);
  const activeSet = new Set([...g.players.values()].filter((pl) => pl.active).map((pl) => pl.id));
  res.finalMatchesActive = finalOn.size === activeSet.size && [...finalOn].every((id) => activeSet.has(id));
  res.activeCount = activeSet.size;
  res.endOfPeriod = endOfPeriod;
  return res;
}

if (want("lineups")) {
  out("\n## Lineup-tracking experiment");
  report.lineups = {};
  for (const rule of ["carry", "infer"]) {
    out(`Rule "${rule}" (${rule === "carry" ? "on-court set carries over period boundaries" : "period-start five inferred from in-period evidence"}):`);
    for (const g of games) {
      const r = runLineups(g, rule);
      const nonSubEvents = g.plays.filter((p) => !isSub(p)).length;
      report.lineups[`${rule}:${g.id}`] = { ...r, endOfPeriod: undefined, nonSubEvents };
      out(`  ${g.id}: actorOffCourt=${r.actorOffCourt.length} notFive(team-events)=${r.notFive}/${nonSubEvents * 2} enterAlreadyOn=${r.enterAlreadyOn.length} leaveNotOn=${r.leaveNotOn.length} periodStartFixes=${r.periodStartFixes.length} finalMatchesActive=${r.finalMatchesActive} (active=${r.activeCount})`);
      for (const a of r.actorOffCourt.slice(0, 6)) out(`     off-court: Q${a.period} ${a.clock} ${a.id} ${a.role}=${a.player}: "${a.text}"`);
      if (r.actorOffCourt.length > 6) out(`     … ${r.actorOffCourt.length - 6} more`);
      for (const a of r.leaveNotOn.slice(0, 3)) out(`     leave-not-on: ${a}`);
      for (const a of r.notFiveEvents) out(`     not-five: ${a}`);
    }
  }
}

if (want("periods")) {
  out("\n## Period boundaries: what happens between End Period and the first non-sub event");
  report.periods = [];
  for (const g of games) {
    const carry = runLineups(g, "carry");
    for (let i = 0; i < g.plays.length; i++) {
      const p = g.plays[i];
      if (p.type.id !== "412") continue;
      const next = [];
      let j = i + 1;
      while (j < g.plays.length && next.length < 12) {
        const q = g.plays[j];
        next.push(`${q.clock.displayValue} [${q.type.text}] ${q.text}`);
        if (!isSub(q) && q.type.id !== "412") break;
        j++;
      }
      const subsAtStart = next.filter((t) => t.includes("[Substitution]")).length;
      const entry = { game: g.id, endedPeriod: p.period.number, subsBeforeFirstAction: subsAtStart, first: next.at(-1) };
      report.periods.push(entry);
      out(`${g.id} after Q${p.period.number}: ${subsAtStart} subs before "${next.at(-1)}"`);
    }
    void carry;
  }
  // Evidence for each tracked period-start five: a carried player is
  // "confirmed" if, within the period, they record a role-bearing event or
  // are substituted out before any substitution brings them in.
  out("\nPeriod-start five confirmation (carry rule + start-of-period subs, per team-period):");
  const hist = {};
  const unconfirmed = [];
  for (const g of games) {
    const onCourt = { [g.homeId]: new Set(), [g.awayId]: new Set() };
    for (const pl of g.players.values()) if (pl.starter) onCourt[pl.teamId].add(pl.id);
    let i = 0;
    while (i < g.plays.length) {
      const period = g.plays[i].period.number;
      // Apply substitutions logged at the period's starting clock first.
      const startClock = `${periodLength(period) / 60}:00`;
      let k = i;
      while (k < g.plays.length && g.plays[k].period.number === period && g.plays[k].clock.displayValue === startClock && (isSub(g.plays[k]) || g.plays[k].type.id === "412" || g.plays[k].type.id === "615" || g.plays[k].type.id === "0")) {
        const { kind, roles } = classify(g.plays[k]);
        if (kind === "substitution") {
          const tid = g.players.get(roles.entering).teamId;
          onCourt[tid].delete(roles.leaving);
          onCourt[tid].add(roles.entering);
        }
        k++;
      }
      const five = { [g.homeId]: new Set(onCourt[g.homeId]), [g.awayId]: new Set(onCourt[g.awayId]) };
      const confirmed = new Set();
      const enteredFirst = new Set();
      let j = i;
      for (; j < g.plays.length && g.plays[j].period.number === period; j++) {
        const q = g.plays[j];
        const { kind, roles } = classify(q);
        if (kind === "substitution" && j >= k) {
          if (!enteredFirst.has(roles.leaving)) confirmed.add(roles.leaving);
          enteredFirst.add(roles.entering);
        } else if (kind !== "substitution") {
          const ids = q.type.id === "615" ? pids(q) : Object.entries(roles).filter(([r]) => !r.startsWith("technical") && r !== "unknownSecond").map(([, id]) => id);
          for (const id of ids) if (id && !enteredFirst.has(id)) confirmed.add(id);
        }
        // Keep the running lineup in sync for the next period.
        if (kind === "substitution" && j >= k) {
          const tid = g.players.get(roles.entering).teamId;
          onCourt[tid].delete(roles.leaving);
          onCourt[tid].add(roles.entering);
        }
      }
      for (const tid of [g.homeId, g.awayId]) {
        const n = [...five[tid]].filter((id) => confirmed.has(id)).length;
        hist[n] = (hist[n] || 0) + 1;
        if (n < 5) unconfirmed.push(`${g.id} Q${period} ${g.abbr[tid]}: ${[...five[tid]].filter((id) => !confirmed.has(id)).map((id) => nameOf(g, id)).join(", ")}`);
      }
      i = j;
    }
  }
  report.periodConfirmation = { histogram: hist, unconfirmed };
  out(`confirmed-of-5 histogram: ${JSON.stringify(hist)}`);
  for (const u of unconfirmed) out(`   unconfirmed: ${u}`);
}

if (want("samples")) {
  out("\n## Representative samples");
  const picks = [
    ["assisted 3", (p) => p.scoringPlay && p.scoreValue === 3 && / assists\)/.test(p.text)],
    ["unassisted 2", (p) => p.scoringPlay && p.scoreValue === 2 && !/assists/.test(p.text)],
    ["missed 3", (p) => isFieldGoalAttempt(p) && !p.scoringPlay && p.pointsAttempted === 3 && !/blocks/.test(p.text)],
    ["blocked shot", (p) => / blocks /.test(p.text)],
    ["turnover with steal", (p) => / steals\)/.test(p.text)],
    ["turnover, no steal", (p) => isTurnover(p) && (p.participants || []).length === 1],
    ["team turnover", (p) => isTurnover(p) && !(p.participants || []).length],
    ["team rebound", (p) => isRebound(p) && !(p.participants || []).length],
    ["technical FT", (p) => p.type.id === "103"],
    ["technical foul", (p) => TECHNICAL_TYPES.has(p.type.id)],
    ["goaltending", (p) => /goaltending/i.test(p.text)],
    ["review/challenge", (p) => /REVIEW|CHALLENGE/i.test(p.text)],
    ["jump ball", (p) => p.type.id === "615"],
    ["ejection", (p) => /eject/i.test(p.text) || /eject/i.test(p.type.text)],
    ["flagrant", (p) => /flagrant/i.test(p.type.text)],
    ["and-one", (p) => p.type.id === "97"],
  ];
  report.samples = {};
  for (const [label, pred] of picks) {
    const hits = [];
    for (const g of games) for (const p of g.plays) if (pred(p)) hits.push({ game: g.id, id: p.id, type: typeKey(p), text: p.text, team: g.abbr[p.team?.id], participants: pids(p).map((id) => nameOf(g, id)) });
    report.samples[label] = { count: hits.length, examples: hits.slice(0, 3) };
    out(`${label}: ${hits.length}`);
    for (const h of hits.slice(0, 3)) out(`   ${h.id} [${h.type}] team=${h.team} "${h.text}" participants=${h.participants.join(" ; ")}`);
  }
}

if (asJson) console.log(JSON.stringify(report, null, 1));
