import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeGame } from "@/lib/replay/normalize";
import { accumulate, eventStatDeltas, PLAYER_COUNTERS, statContext } from "@/lib/replay/stats";
import { EVENT_KINDS as K, REASON_CODES as R } from "@/lib/replay/types";

// --- Hand-built normalized events ----------------------------------------

const HOME = "1";
const AWAY = "2";
const teams = { home: { id: HOME, side: "home" }, away: { id: AWAY, side: "away" } };
const players = [
  { id: "h1", teamId: HOME },
  { id: "h2", teamId: HOME },
  { id: "a1", teamId: AWAY },
  { id: "a2", teamId: AWAY },
];
const ctx = statContext({ teams, players });

let idx = 0;
const ev = (kind, { teamId = HOME, roles = {}, detail = {}, issues = [], scoreAfter = { home: 0, away: 0 }, typeId = "0" } = {}) => ({
  index: idx++,
  sourcePlayId: `p${idx}`,
  source: { typeId, typeText: "" },
  kind,
  teamId,
  roles,
  detail,
  issues,
  scoreAfter,
  text: "",
});
const deltas = (e) => eventStatDeltas(e, ctx);
const codes = (d) => d.issues.map((i) => i.code);

describe("eventStatDeltas — scoring and shooting (R07)", () => {
  it("made three: PTS +3, FG +1/+1, 3PT +1/+1", () => {
    const d = deltas(ev(K.FIELD_GOAL, { roles: { shooter: "h1" }, detail: { made: true, points: 3, attemptValue: 3 } }));
    expect(d.players).toEqual({ h1: { pts: 3, fgm: 1, fga: 1, tpm: 1, tpa: 1 } });
    expect(d.points).toEqual({ [HOME]: 3 });
    expect(d.issues).toEqual([]);
  });

  it("missed three: FG and 3PT attempts only", () => {
    const d = deltas(ev(K.FIELD_GOAL, { roles: { shooter: "h1" }, detail: { made: false, points: 0, attemptValue: 3 } }));
    expect(d.players).toEqual({ h1: { fga: 1, tpa: 1 } });
    expect(d.points).toEqual({});
  });

  it("made two: no 3PT counters", () => {
    const d = deltas(ev(K.FIELD_GOAL, { roles: { shooter: "h1" }, detail: { made: true, points: 2, attemptValue: 2 } }));
    expect(d.players).toEqual({ h1: { pts: 2, fgm: 1, fga: 1 } });
  });

  it("free throw: FT/PTS only, never FG", () => {
    const made = deltas(ev(K.FREE_THROW, { roles: { shooter: "h1" }, detail: { made: true, points: 1, ftKind: "regular" } }));
    expect(made.players).toEqual({ h1: { pts: 1, ftm: 1, fta: 1 } });
    const missed = deltas(ev(K.FREE_THROW, { roles: { shooter: "h1" }, detail: { made: false, points: 0, ftKind: "regular" } }));
    expect(missed.players).toEqual({ h1: { fta: 1 } });
  });

  it("technical free throw: FT/PTS only, no personal foul for anyone", () => {
    const d = deltas(ev(K.FREE_THROW, { roles: { shooter: "h1" }, detail: { made: true, points: 1, ftKind: "technical" } }));
    expect(d.players).toEqual({ h1: { pts: 1, ftm: 1, fta: 1 } });
    expect(d.teams).toEqual({});
  });

  it("missed heave is excluded from FGA/3PA with an info issue", () => {
    const d = deltas(ev(K.FIELD_GOAL, { roles: { shooter: "h1" }, detail: { made: false, points: 0, attemptValue: 3, heave: true } }));
    expect(d.players).toEqual({});
    expect(codes(d)).toEqual([R.HEAVE_EXCLUDED]);
  });

  it("made shot without a verified shooter: team points kept, no player credit, issue", () => {
    const d = deltas(
      ev(K.FIELD_GOAL, {
        detail: { made: true, points: 2, attemptValue: 2 },
        issues: [{ code: R.ROLE_TEXT_CONFLICT, role: "shooter" }],
      }),
    );
    expect(d.players).toEqual({});
    expect(d.unattributed).toEqual({ [HOME]: { pts: 2, fgm: 1, fga: 1 } });
    expect(d.points).toEqual({ [HOME]: 2 });
    expect(d.issues).toMatchObject([{ code: R.ATTRIBUTION_UNKNOWN, role: "shooter", family: "fg" }]);
  });
});

describe("eventStatDeltas — assists and rebounds (R08)", () => {
  it("assisted basket credits the assister once", () => {
    const d = deltas(ev(K.FIELD_GOAL, { roles: { shooter: "h1", assister: "h2" }, detail: { made: true, points: 2, attemptValue: 2 } }));
    expect(d.players).toEqual({ h1: { pts: 2, fgm: 1, fga: 1 }, h2: { ast: 1 } });
  });

  it("unassisted basket credits no assist", () => {
    const d = deltas(ev(K.FIELD_GOAL, { roles: { shooter: "h1" }, detail: { made: true, points: 2, attemptValue: 2 } }));
    expect(Object.keys(d.players)).toEqual(["h1"]);
    expect(d.unattributed).toEqual({});
  });

  it("ambiguous assist (role dropped by normalization) stays unattributed with a warning", () => {
    const d = deltas(
      ev(K.FIELD_GOAL, {
        roles: { shooter: "h1" },
        detail: { made: true, points: 2, attemptValue: 2 },
        issues: [{ code: R.ROLE_TEXT_CONFLICT, role: "assister" }],
      }),
    );
    expect(d.players).toEqual({ h1: { pts: 2, fgm: 1, fga: 1 } });
    expect(d.unattributed).toEqual({ [HOME]: { ast: 1 } });
    expect(codes(d)).toEqual([R.ATTRIBUTION_UNKNOWN]);
  });

  it("offensive and defensive player rebounds", () => {
    expect(deltas(ev(K.REBOUND, { roles: { rebounder: "h1" }, detail: { offensive: true } })).players).toEqual({ h1: { reb: 1, oreb: 1 } });
    expect(deltas(ev(K.REBOUND, { roles: { rebounder: "h1" }, detail: { offensive: false } })).players).toEqual({ h1: { reb: 1, dreb: 1 } });
  });

  it("team rebound: team-only counters, no player credit", () => {
    const d = deltas(ev(K.REBOUND, { teamId: AWAY, detail: { offensive: true, teamOnly: true } }));
    expect(d.players).toEqual({});
    expect(d.unattributed).toEqual({});
    expect(d.teams).toEqual({ [AWAY]: { teamReb: 1, teamOreb: 1 } });
  });
});

describe("eventStatDeltas — turnovers, steals, blocks, fouls (R09)", () => {
  it("turnover without steal: turnover credit only", () => {
    const d = deltas(ev(K.TURNOVER, { roles: { turnoverBy: "h1" }, detail: { teamOnly: false } }));
    expect(d.players).toEqual({ h1: { to: 1 } });
  });

  it("turnover with steal credits the opponent stealer", () => {
    const d = deltas(ev(K.TURNOVER, { roles: { turnoverBy: "h1", stealer: "a1" }, detail: { teamOnly: false } }));
    expect(d.players).toEqual({ h1: { to: 1 }, a1: { stl: 1 } });
  });

  it("team turnover: team-only counter", () => {
    const d = deltas(ev(K.TURNOVER, { detail: { teamOnly: true } }));
    expect(d.players).toEqual({});
    expect(d.teams).toEqual({ [HOME]: { teamTo: 1 } });
  });

  it("blocked miss: shooter FGA once, opponent blocker +blk", () => {
    const d = deltas(ev(K.FIELD_GOAL, { roles: { shooter: "h1", blocker: "a1" }, detail: { made: false, points: 0, attemptValue: 3, blocked: true } }));
    expect(d.players).toEqual({ h1: { fga: 1, tpa: 1 }, a1: { blk: 1 } });
  });

  it("blocked miss with an unverified blocker: block kept at the opponent team level", () => {
    const d = deltas(
      ev(K.FIELD_GOAL, {
        roles: { shooter: "h1" },
        detail: { made: false, points: 0, attemptValue: 2, blocked: true },
        issues: [{ code: R.ROLE_TEXT_CONFLICT, role: "blocker" }],
      }),
    );
    expect(d.players).toEqual({ h1: { fga: 1 } });
    expect(d.unattributed).toEqual({ [AWAY]: { blk: 1 } });
    expect(d.issues).toMatchObject([{ code: R.ATTRIBUTION_UNKNOWN, role: "blocker", family: "blk" }]);
  });

  it("personal (incl. offensive) foul increments PF", () => {
    expect(deltas(ev(K.FOUL, { roles: { fouler: "h1" }, typeId: "45" })).players).toEqual({ h1: { pf: 1 } });
    expect(deltas(ev(K.FOUL, { roles: { fouler: "h1" }, typeId: "42" })).players).toEqual({ h1: { pf: 1 } });
  });

  it("offensive-foul turnover record counts TO, not PF", () => {
    expect(deltas(ev(K.TURNOVER, { roles: { turnoverBy: "h1" }, typeId: "84", detail: { teamOnly: false } })).players).toEqual({ h1: { to: 1 } });
  });

  it("technical foul never increments PF; counts team technicals per charged player's team", () => {
    const single = deltas(ev(K.TECHNICAL, { roles: { technical: ["h1"] } }));
    expect(single.players).toEqual({});
    expect(single.teams).toEqual({ [HOME]: { technicalFouls: 1 } });
    const double = deltas(ev(K.TECHNICAL, { roles: { technical: ["h1", "a2"] } }));
    expect(double.teams).toEqual({ [HOME]: { technicalFouls: 1 }, [AWAY]: { technicalFouls: 1 } });
  });

  it("events without counters produce empty deltas", () => {
    for (const kind of [K.VIOLATION, K.SUBSTITUTION, K.JUMP_BALL, K.TIMEOUT, K.REVIEW, K.PERIOD_END]) {
      const d = deltas(ev(kind, { roles: { violator: "h1" } }));
      expect(d).toMatchObject({ players: {}, teams: {}, unattributed: {}, points: {}, issues: [] });
    }
  });
});

describe("accumulate — score progression", () => {
  const game = (events) => ({ teams, players, events: events.map((e, i) => ({ ...e, index: i })) });

  it("sums deltas per player/team and agrees with source scores", () => {
    const acc = accumulate(
      game([
        ev(K.FIELD_GOAL, { roles: { shooter: "h1", assister: "h2" }, detail: { made: true, points: 3, attemptValue: 3 }, scoreAfter: { home: 3, away: 0 } }),
        ev(K.FREE_THROW, { teamId: AWAY, roles: { shooter: "a1" }, detail: { made: true, points: 1 }, scoreAfter: { home: 3, away: 1 } }),
        ev(K.FIELD_GOAL, { roles: { shooter: "h1" }, detail: { made: true, points: 2, attemptValue: 2 }, scoreAfter: { home: 5, away: 1 } }),
      ]),
    );
    expect(acc.players.h1).toMatchObject({ pts: 5, fgm: 2, fga: 2, tpm: 1, tpa: 1 });
    expect(acc.players.h2.ast).toBe(1);
    expect(acc.players.a2).toMatchObject({ pts: 0, reb: 0 }); // bench/unused players stay at zero
    expect(acc.score).toEqual({ home: 5, away: 1 });
    expect(acc.issues).toEqual([]);
  });

  it("flags a score change without a credited basket and a credit without a score change", () => {
    const acc = accumulate(
      game([
        ev(K.TIMEOUT, { scoreAfter: { home: 2, away: 0 } }), // source score jumps, nothing credited
        ev(K.FIELD_GOAL, { roles: { shooter: "h1" }, detail: { made: true, points: 2, attemptValue: 2 }, scoreAfter: { home: 2, away: 0 } }), // counted twice?
      ]),
    );
    expect(acc.issues.map((i) => [i.eventIndex, i.code])).toEqual([
      [0, R.SCORE_DELTA_MISMATCH],
      [1, R.SCORE_DELTA_MISMATCH],
    ]);
  });

  it("skips invalid source scores and carries the baseline forward", () => {
    const acc = accumulate(
      game([
        ev(K.FIELD_GOAL, { roles: { shooter: "h1" }, detail: { made: true, points: 2, attemptValue: 2 }, scoreAfter: { home: null, away: 0 } }),
        ev(K.FIELD_GOAL, { roles: { shooter: "h1" }, detail: { made: true, points: 2, attemptValue: 2 }, scoreAfter: { home: 4, away: 0 } }),
      ]),
    );
    expect(acc.issues.filter((i) => i.code === R.SCORE_DELTA_MISMATCH)).toHaveLength(1); // 0 → 4 while 2 credited
  });
});

// --- Real fixtures: reconcile against final box score ----------------------

const FIXTURE_IDS = ["401810062", "401810791", "401810792", "401810798", "401810799"];
const load = (id) => JSON.parse(readFileSync(new URL(`./fixtures/replay/${id}.json`, import.meta.url), "utf8"));

// Documented source inconsistencies (source-findings §5, LEDGER W03). Asserted, never patched.
const KNOWN_MISMATCHES = {
  401810062: [{ player: "4278104", stat: "blk", replay: 0, box: 1 }], // Porter Jr.: bad block participant ID (play 401810062656)
  401810792: [{ player: "4683771", stat: "tpa", replay: 6, box: 5 }], // Holland II: box reclassified one three-point miss
};

describe.each(FIXTURE_IDS)("fixture %s reconciliation", (id) => {
  const n = normalizeGame(load(id));
  const acc = accumulate(n);

  it("player totals match the box score except documented mismatches", () => {
    const mismatches = [];
    for (const [player, expected] of Object.entries(n.expected.players)) {
      for (const stat of PLAYER_COUNTERS) {
        if (expected[stat] == null) continue;
        if (acc.players[player][stat] !== expected[stat]) mismatches.push({ player, stat, replay: acc.players[player][stat], box: expected[stat] });
      }
    }
    expect(mismatches).toEqual(KNOWN_MISMATCHES[id] ?? []);
  });

  it("scores follow source progression with no double-counted basket", () => {
    expect(acc.issues.filter((i) => i.code === R.SCORE_DELTA_MISMATCH)).toEqual([]);
    expect(acc.score).toEqual({ home: n.teams.home.finalScore, away: n.teams.away.finalScore });
  });

  it("team totals (players + unattributed) and team-only counters match the box", () => {
    for (const side of ["home", "away"]) {
      const teamId = n.teams[side].id;
      const expected = n.expected.teams[teamId];
      const roster = n.players.filter((p) => p.teamId === teamId);
      for (const stat of PLAYER_COUNTERS) {
        const sum = roster.reduce((s, p) => s + acc.players[p.id][stat], 0) + (acc.unattributed[teamId]?.[stat] ?? 0);
        // Holland's extra 3PA carries into the team sum (box team TPA agrees with his box line);
        // Porter's block is kept in `unattributed`, so the BKN team total is exact.
        const known = (KNOWN_MISMATCHES[id] ?? []).find((m) => m.stat === stat && stat !== "blk" && roster.some((p) => p.id === m.player));
        expect([stat, sum]).toEqual([stat, expected[stat] + (known ? known.replay - known.box : 0)]);
      }
      expect(acc.teams[teamId].teamTo).toBe(expected.teamTo);
      expect(acc.teams[teamId].technicalFouls).toBe(expected.technicalFouls);
    }
  });

  it("attribution issues are only the known ones", () => {
    const unknown = acc.issues.filter((i) => i.code === R.ATTRIBUTION_UNKNOWN);
    if (id === "401810062") {
      expect(unknown).toMatchObject([{ sourcePlayId: "401810062656", role: "blocker", family: "blk" }]);
      expect(acc.unattributed).toEqual({ [n.teams.home.id]: { blk: 1 } }); // BKN team block total still right
    } else {
      expect(unknown).toEqual([]);
      expect(acc.unattributed).toEqual({});
    }
  });
});
