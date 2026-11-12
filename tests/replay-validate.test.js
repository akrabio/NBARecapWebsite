import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeGame } from "@/lib/replay/normalize";
import { buildStateIndex } from "@/lib/replay/state";
import { capabilityFor, validateReplay } from "@/lib/replay/validate";
import { CAPABILITY_FAMILIES as F, CAPABILITY_LEVELS as L, REASON_CODES as R } from "@/lib/replay/types";

const FIXTURE_IDS = ["401810062", "401810791", "401810792", "401810798", "401810799"];
const raw = Object.fromEntries(FIXTURE_IDS.map((id) => [id, readFileSync(new URL(`./fixtures/replay/${id}.json`, import.meta.url), "utf8")]));
// Fresh deep copy every call: variants never touch fixture files or each other.
const load = (id) => JSON.parse(raw[id]);
const validate = (summary) => {
  const n = normalizeGame(summary);
  return { n, v: validateReplay(n, buildStateIndex(n)) };
};
const nonReliable = (v) => v.capabilities.filter((c) => c.level !== L.RELIABLE);
const gameCap = (v, family) => v.capabilities.find((c) => c.family === family && c.scope === "game");

const PORTER = "4278104"; // 401810062, BKN (17): block credited to Demin in participants
const HOLLAND = "4683771"; // 401810792, DET (8): 6 3PA in pbp vs 5 in box

describe("validateReplay — real fixtures", () => {
  const results = Object.fromEntries(FIXTURE_IDS.map((id) => [id, validate(load(id)).v]));

  it("classifies every fixture with exactly the known limitations", () => {
    expect(results["401810791"].status).toBe("ready");
    expect(results["401810798"].status).toBe("ready");
    expect(results["401810799"].status).toBe("ready");
    for (const id of ["401810791", "401810798", "401810799"]) {
      expect(results[id].reasons).toEqual([]);
      expect(nonReliable(results[id])).toEqual([]);
    }

    const tor = results["401810062"];
    expect(tor.status).toBe("limited");
    expect(nonReliable(tor)).toEqual([
      { family: F.BLK, level: L.LIMITED, reasons: [R.STAT_MISMATCH, R.ROLE_TEXT_CONFLICT, R.ATTRIBUTION_UNKNOWN], scope: "game" },
      { family: F.BLK, level: L.UNAVAILABLE, reasons: [R.STAT_MISMATCH, R.ROLE_TEXT_CONFLICT, R.ATTRIBUTION_UNKNOWN], players: [PORTER], scope: "player" },
    ]);

    const det = results["401810792"];
    expect(det.status).toBe("limited");
    expect(det.reasons).toEqual([R.STAT_MISMATCH]);
    expect(nonReliable(det)).toEqual([
      { family: F.TPT, level: L.LIMITED, reasons: [R.STAT_MISMATCH], scope: "game" },
      { family: F.TPT, level: L.UNAVAILABLE, reasons: [R.STAT_MISMATCH], players: [HOLLAND], scope: "player" },
      { family: F.TPT, level: L.LIMITED, reasons: [R.STAT_MISMATCH], teams: ["8"], scope: "teamTotal" },
    ]);
  });

  it("emits one game-level capability per family", () => {
    for (const v of Object.values(results)) {
      const game = v.capabilities.filter((c) => c.scope === "game").map((c) => c.family);
      expect(game.sort()).toEqual(Object.values(F).sort());
    }
  });

  it("reconciles score, periods and all but the two known player values", () => {
    for (const [id, v] of Object.entries(results)) {
      const { score, players } = v.reconciliation;
      for (const side of ["home", "away"]) {
        expect(score.final[side].source).toBe(score.final[side].expected);
        expect(score.final[side].credited).toBe(score.final[side].expected);
      }
      expect(score.periods.length).toBeGreaterThanOrEqual(4);
      expect(score.periods.every((p) => p.match)).toBe(true);
      expect(players.unverified).toEqual([]);
      const expectedMismatches = { "401810062": [[PORTER, "blk", 0, 1]], "401810792": [[HOLLAND, "tpa", 6, 5]] }[id] ?? [];
      expect(players.mismatches.map((m) => [m.playerId, m.counter, m.reconstructed, m.expected])).toEqual(expectedMismatches);
    }
    expect(results["401810798"].reconciliation.score.periods).toHaveLength(5); // OT
  });

  it("explains team totals: unattributed block, team rebounds unvalidated, turnovers split", () => {
    const bkn = results["401810062"].reconciliation.teams["17"];
    expect(bkn.counters.blk).toMatchObject({ players: 4, unattributed: 1, total: 5, expected: 5, match: true });
    expect(bkn.teamOnly.teamReb.expected).toBeNull();
    expect(bkn.teamOnly.teamReb.match).toBeNull();
    expect(bkn.teamOnly.teamTo.match).toBe(true);
    expect(bkn.teamOnly.totalTo.match).toBe(true);
    expect(bkn.teamOnly.technicalFouls.match).toBe(true);
    expect(results["401810062"].reconciliation.players.unattributed).toEqual([{ teamId: "17", counter: "blk", family: F.BLK, amount: 1, explainedBy: [PORTER] }]);
    const det = results["401810792"].reconciliation.teams["8"];
    expect(det.counters.tpa).toMatchObject({ total: 32, expected: 31, match: false });
    expect(det.counters.fga.match).toBe(true);
  });

  it("Holland II: FG stays reliable (FGA reconciles), only 3PT is disabled for him", () => {
    const v = results["401810792"];
    expect(capabilityFor(v.capabilities, F.TPT, { playerId: HOLLAND, teamId: "8" }).level).toBe(L.UNAVAILABLE);
    expect(capabilityFor(v.capabilities, F.FG, { playerId: HOLLAND, teamId: "8" }).level).toBe(L.RELIABLE);
    expect(capabilityFor(v.capabilities, F.PTS, { playerId: HOLLAND, teamId: "8" }).level).toBe(L.RELIABLE);
    expect(capabilityFor(v.capabilities, F.TPT, { playerId: "4278562", teamId: "8" }).level).toBe(L.RELIABLE);
    expect(capabilityFor(v.capabilities, F.TPT, { teamId: "8", teamTotal: true }).level).toBe(L.LIMITED);
    expect(capabilityFor(v.capabilities, F.TPT, { teamId: "17", teamTotal: true }).level).toBe(L.RELIABLE);
  });

  it("Porter Jr.: block unavailable for him only; team block total stays reliable", () => {
    const v = results["401810062"];
    expect(capabilityFor(v.capabilities, F.BLK, { playerId: PORTER, teamId: "17" })).toEqual({ level: L.UNAVAILABLE, reasons: [R.STAT_MISMATCH, R.ROLE_TEXT_CONFLICT, R.ATTRIBUTION_UNKNOWN] });
    const other = "5107173"; // BKN teammate with a reconciled block total
    expect(capabilityFor(v.capabilities, F.BLK, { playerId: other, teamId: "17" }).level).toBe(L.RELIABLE);
    expect(capabilityFor(v.capabilities, F.BLK, { teamId: "17", teamTotal: true }).level).toBe(L.RELIABLE);
    expect(capabilityFor(v.capabilities, F.BLK).level).toBe(L.LIMITED);
    expect(() => capabilityFor(v.capabilities, F.BLK, { playerId: PORTER })).toThrow(TypeError);
  });

  it("lineups: no fallback, final five = box active, actors always on the tracked court", () => {
    for (const v of Object.values(results)) {
      for (const team of Object.values(v.lineups)) {
        expect(team.fallbackIntervals).toEqual([]);
        expect(team.invariantViolations).toEqual([]);
        expect(team.validStates).toBe(team.totalStates);
        expect(team.evidence).toMatchObject({ level: "corroborated", actorViolations: 0, finalMatchesActive: true });
        expect(team.evidence.actorChecks).toBeGreaterThan(150);
        expect(team.evidence.stints.withAction).toBeLessThanOrEqual(team.evidence.stints.total);
      }
    }
  });

  it("probability fully linked in every fixture", () => {
    for (const v of Object.values(results)) {
      expect(gameCap(v, F.PROBABILITY).level).toBe(L.RELIABLE);
      expect(v.probability.samples).toBe(v.probability.events);
      expect(v.probability.derived).toBe(0);
    }
  });

  it("is pure: never mutates the normalized game or the state index", () => {
    const n = normalizeGame(load("401810062"));
    const index = buildStateIndex(n);
    const before = JSON.stringify(n);
    const finalBefore = JSON.stringify(index.stateAt(n.events.length - 1));
    const a = validateReplay(n, index);
    const b = validateReplay(n, index);
    expect(JSON.stringify(n)).toBe(before);
    expect(JSON.stringify(index.stateAt(n.events.length - 1))).toBe(finalBefore);
    expect(b).toEqual(a);
    expect(validateReplay(n)).toEqual(a); // builds its own index when omitted
    // End state is never patched: Porter's running block total stays 0.
    expect(index.stateAt(n.events.length - 1).players[PORTER].blk).toBe(0);
  });
});

describe("validateReplay — synthetic variants of real fixtures", () => {
  it("missing win probability → limited, probability unavailable, stats untouched", () => {
    const s = load("401810791");
    delete s.winprobability;
    const { v } = validate(s);
    expect(v.status).toBe("limited");
    expect(v.reasons).toEqual([R.PROBABILITY_MISSING]);
    expect(nonReliable(v)).toEqual([{ family: F.PROBABILITY, level: L.UNAVAILABLE, reasons: [R.PROBABILITY_MISSING], scope: "game" }]);
  });

  it("discarded probability samples → probability limited", () => {
    const s = load("401810791");
    s.winprobability[10] = { ...s.winprobability[10], playId: "999" };
    const { v } = validate(s);
    expect(v.status).toBe("limited");
    expect(gameCap(v, F.PROBABILITY)).toMatchObject({ level: L.LIMITED, reasons: [R.PROBABILITY_UNLINKED] });
  });

  it("truncated plays → unavailable (score coverage gap)", () => {
    const s = load("401810798");
    s.plays = s.plays.slice(0, 300);
    const { v } = validate(s);
    expect(v.status).toBe("unavailable");
    expect(v.reasons).toContain(R.SCORE_COVERAGE_GAP);
    expect(v.reasons).toContain(R.PERIOD_SCORE_MISMATCH);
    expect(gameCap(v, F.SCORE).level).toBe(L.UNAVAILABLE);
    expect(v.reasons).toContain(R.NO_GAME_END);
  });

  for (const drop of [1, 2, 3]) {
    for (const keepSamples of [false, true]) {
      it(`dropping the last ${drop} play(s) of 401810798 (${keepSamples ? "WP samples kept" : "WP samples removed"}) → unavailable`, () => {
        const s = load("401810798");
        const removed = new Set(s.plays.slice(-drop).map((p) => p.id));
        s.plays = s.plays.slice(0, -drop);
        if (!keepSamples) s.winprobability = s.winprobability.filter((w) => !removed.has(w.playId));
        const { v } = validate(s);
        expect(v.status).toBe("unavailable");
        expect(v.reasons).toContain(R.NO_GAME_END);
        if (drop >= 2) expect(v.reasons).toContain(R.NO_FINAL_PERIOD_END);
        else expect(v.reasons).not.toContain(R.NO_FINAL_PERIOD_END);
        // Score still reconciles: only the end markers (and a team rebound) are gone.
        expect(v.reasons).not.toContain(R.SCORE_COVERAGE_GAP);
      });
    }
  }

  it("missing End of last period only → unavailable", () => {
    const s = load("401810791");
    s.plays = s.plays.filter((p, i) => !(i === s.plays.length - 2 && p.type.id === "412"));
    const { v } = validate(s);
    expect(v.status).toBe("unavailable");
    expect(v.reasons).toEqual([R.NO_FINAL_PERIOD_END]);
  });

  it("missing middle scoring play → unavailable (credited score ≠ final)", () => {
    const s = load("401810799");
    const i = s.plays.findIndex((p, k) => k > 100 && p.scoringPlay && p.type.id !== "98");
    s.plays.splice(i, 1);
    const { v } = validate(s);
    expect(v.status).toBe("unavailable");
    expect(v.reasons).toEqual([R.SCORE_COVERAGE_GAP]);
    expect(v.reconciliation.score.scoreDeltaMismatches.length).toBeGreaterThan(0);
  });

  it("header final score mismatch → unavailable", () => {
    const s = load("401810792");
    const home = s.header.competitions[0].competitors.find((c) => c.homeAway === "home");
    home.score = String(Number(home.score) + 2);
    const { v } = validate(s);
    expect(v.status).toBe("unavailable");
    expect(v.reasons).toEqual([R.SCORE_COVERAGE_GAP]);
  });

  it("linescore mismatch → unavailable (period score)", () => {
    const s = load("401810062");
    const away = s.header.competitions[0].competitors.find((c) => c.homeAway === "away");
    away.linescores[0].displayValue = String(Number(away.linescores[0].displayValue) + 1);
    away.linescores[1].displayValue = String(Number(away.linescores[1].displayValue) - 1);
    const { v } = validate(s);
    expect(v.status).toBe("unavailable");
    expect(v.reasons).toEqual([R.PERIOD_SCORE_MISMATCH]);
    expect(v.reconciliation.score.periods.map((p) => p.match)).toEqual([false, false, true, true]);
  });

  it("missing linescores → per-period check skipped with a warning only", () => {
    const s = load("401810791");
    for (const c of s.header.competitions[0].competitors) delete c.linescores;
    const { v } = validate(s);
    expect(v.status).toBe("ready");
    expect(v.warnings.find((w) => w.code === R.PERIOD_SCORES_MISSING)).toBeTruthy();
  });

  it("non-final game → unavailable", () => {
    const s = load("401810791");
    s.header.competitions[0].status.type.completed = false;
    const { v } = validate(s);
    expect(v.status).toBe("unavailable");
    expect(v.reasons).toEqual([R.GAME_NOT_FINAL]);
  });

  it("completed=true but in-progress state/name → not final → unavailable", () => {
    const s = load("401810791");
    Object.assign(s.header.competitions[0].status.type, { name: "STATUS_IN_PROGRESS", state: "in", completed: true });
    const { n, v } = validate(s);
    expect(n.final).toBe(false);
    expect(v.reasons).toEqual([R.GAME_NOT_FINAL]);
  });

  it("no plays → unavailable with every family unavailable", () => {
    const s = load("401810791");
    s.plays = [];
    const { v } = validate(s);
    expect(v.status).toBe("unavailable");
    expect(v.reasons).toEqual([R.NO_PLAYS]);
    expect(v.capabilities.every((c) => c.level === L.UNAVAILABLE)).toBe(true);
    expect(v.reconciliation).toBeNull();
  });

  it("corrupted box stat → that player's family disabled, status limited", () => {
    const s = load("401810798");
    const group = s.boxscore.players[0];
    const stat = group.statistics[0];
    const ai = stat.labels.indexOf("AST");
    const athlete = stat.athletes.find((a) => !a.didNotPlay);
    athlete.stats[ai] = String(Number(athlete.stats[ai]) + 1);
    const { v } = validate(s);
    expect(v.status).toBe("limited");
    expect(v.reasons).toEqual([R.STAT_MISMATCH]);
    expect(nonReliable(v)).toEqual([
      { family: F.AST, level: L.LIMITED, reasons: [R.STAT_MISMATCH], scope: "game" },
      { family: F.AST, level: L.UNAVAILABLE, reasons: [R.STAT_MISMATCH], players: [athlete.athlete.id], scope: "player" },
    ]);
  });

  it("broad mismatch in one family → family unavailable game-wide", () => {
    const s = load("401810798");
    for (const group of s.boxscore.players) {
      const stat = group.statistics[0];
      const pi = stat.labels.indexOf("PF");
      for (const a of stat.athletes) if (!a.didNotPlay) a.stats[pi] = String(Number(a.stats[pi]) + 1);
    }
    const { v } = validate(s);
    expect(v.status).toBe("limited");
    expect(gameCap(v, F.PF)).toMatchObject({ level: L.UNAVAILABLE, reasons: [R.STAT_MISMATCH] });
    expect(v.capabilities.filter((c) => c.family === F.PF && c.scope !== "game")).toEqual([]);
    expect(capabilityFor(v.capabilities, F.PF, { playerId: s.boxscore.players[0].statistics[0].athletes[0].athlete.id, teamId: "9" }).level).toBe(L.UNAVAILABLE);
  });

  it("box score without a family's label → family unverifiable (unavailable)", () => {
    const s = load("401810791");
    for (const group of s.boxscore.players) {
      const stat = group.statistics[0];
      stat.labels[stat.labels.indexOf("BLK")] = "XBLK";
    }
    const { v } = validate(s);
    expect(v.status).toBe("limited");
    expect(gameCap(v, F.BLK)).toMatchObject({ level: L.UNAVAILABLE });
    expect(gameCap(v, F.BLK).reasons).toContain(R.STAT_UNVERIFIABLE);
  });

  it("broken substitution → roster fallback for that team's interval, status limited", () => {
    const s = load("401810062");
    const i = s.plays.findIndex((p, k) => k > 100 && p.type.id === "584" && p.team.id === "28");
    const removed = s.plays.splice(i, 1)[0];
    s.winprobability = s.winprobability.filter((w) => w.playId !== removed.id);
    const { v } = validate(s);
    expect(v.status).toBe("limited");
    expect(gameCap(v, F.LINEUPS).level).toBe(L.LIMITED);
    const scoped = v.capabilities.filter((c) => c.family === F.LINEUPS && c.scope === "team");
    expect(scoped.length).toBeGreaterThan(0);
    expect(scoped.every((c) => c.teams[0] === "28" && c.level === L.LIMITED && c.interval.from >= i - 1)).toBe(true);
    const tor = v.lineups["28"];
    expect(tor.fallbackIntervals.length).toBeGreaterThan(0);
    expect(tor.evidence.level).toBe("partial");
    expect(v.lineups["17"].fallbackIntervals).toEqual([]);
    const iv = scoped[0].interval;
    expect(capabilityFor(v.capabilities, F.LINEUPS, { teamId: "28", eventIndex: iv.from }).level).toBe(L.LIMITED);
    expect(capabilityFor(v.capabilities, F.LINEUPS, { teamId: "28", eventIndex: iv.from - 1 }).level).toBe(L.RELIABLE);
    expect(capabilityFor(v.capabilities, F.LINEUPS, { teamId: "17", eventIndex: iv.from }).level).toBe(L.RELIABLE);
    // Score and stats are unaffected by a membership error.
    expect(gameCap(v, F.SCORE).level).toBe(L.RELIABLE);
    expect(v.reasons.every((r) => r.startsWith("lineup_") || r === R.STAT_MISMATCH || r === R.ROLE_TEXT_CONFLICT || r === R.ATTRIBUTION_UNKNOWN)).toBe(true);
  });

  it("final five ≠ box active → lineup limited from the team's last substitution", () => {
    const s = load("401810791");
    const group = s.boxscore.players.find((g) => g.team.id === "20");
    const athletes = group.statistics[0].athletes;
    const on = athletes.find((a) => a.active === true);
    const off = athletes.find((a) => a.active === false && !a.didNotPlay);
    on.active = false;
    off.active = true;
    const { v } = validate(s);
    expect(v.status).toBe("limited");
    const t = v.lineups["20"];
    expect(t.evidence.finalMatchesActive).toBe(false);
    expect(t.fallbackIntervals).toHaveLength(1);
    expect(t.fallbackIntervals[0]).toMatchObject({ to: v.probability.events - 1, reasons: [R.LINEUP_INVALID] });
  });

  it("starters missing → lineup fallback from tip-off", () => {
    const s = load("401810799");
    const group = s.boxscore.players.find((g) => g.team.id === "22");
    group.statistics[0].athletes.find((a) => a.starter).starter = false;
    const { v } = validate(s);
    expect(v.status).toBe("limited");
    const scoped = v.capabilities.filter((c) => c.family === F.LINEUPS && c.scope !== "game");
    expect(scoped[0]).toMatchObject({ teams: ["22"], interval: { from: -1 } });
    expect(scoped[0].reasons).toContain(R.LINEUP_NO_STARTERS);
  });
});
