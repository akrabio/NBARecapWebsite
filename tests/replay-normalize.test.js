import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  countIssues,
  gameElapsedSec,
  normalizeGame,
  parseClock,
} from "@/lib/replay/normalize";
import { EVENT_KINDS, REASON_CODES } from "@/lib/replay/types";

const FIXTURE_IDS = ["401810062", "401810791", "401810792", "401810798", "401810799"];
const load = (id) => JSON.parse(readFileSync(new URL(`./fixtures/replay/${id}.json`, import.meta.url), "utf8"));
const fixtures = Object.fromEntries(FIXTURE_IDS.map((id) => [id, load(id)]));
const normalized = Object.fromEntries(FIXTURE_IDS.map((id) => [id, normalizeGame(fixtures[id])]));

const codes = (e) => e.issues.map((i) => i.code);
const byPlay = (n, playId) => n.events.find((e) => e.sourcePlayId === playId);

// --- Synthetic summary builder -------------------------------------------

const athlete = (id, name, extra = {}) => ({
  active: false,
  athlete: { id, displayName: name, shortName: name, jersey: id.slice(-1), position: { abbreviation: "G" } },
  starter: false,
  didNotPlay: false,
  ejected: false,
  stats: ["20", "10", "4-8", "1-3", "1-2", "5", "3", "2", "1", "0", "1", "4", "2", "+3"],
  ...extra,
});
const LABELS = ["MIN", "PTS", "FG", "3PT", "FT", "REB", "AST", "TO", "STL", "BLK", "OREB", "DREB", "PF", "+/-"];
const group = (teamId, athletes, labels = LABELS) => ({ team: { id: teamId }, statistics: [{ labels, athletes }] });

let seq = 0;
const play = (over = {}) => {
  seq += 1;
  return {
    id: `9${seq}`,
    sequenceNumber: String(seq),
    type: { id: "45", text: "Personal Foul" },
    text: "",
    homeScore: 0,
    awayScore: 0,
    period: { number: 1 },
    clock: { displayValue: "11:00" },
    scoringPlay: false,
    scoreValue: 0,
    shootingPlay: false,
    pointsAttempted: 0,
    ...over,
  };
};

function summary({ plays = [], competitors, players, teams } = {}) {
  return {
    header: {
      id: "1",
      competitions: [
        {
          status: { type: { completed: true } },
          competitors: competitors ?? [
            { id: "1", homeAway: "home", score: "100", team: { abbreviation: "HOM", displayName: "Home Team" } },
            { id: "2", homeAway: "away", score: "98", team: { abbreviation: "AWY", displayName: "Away Team" } },
          ],
        },
      ],
    },
    boxscore: {
      teams: teams ?? [],
      players: players ?? [
        group("1", [athlete("11", "Ann Home"), athlete("12", "Bea Home")]),
        group("2", [athlete("21", "Cal Away"), athlete("22", "Dee Away")]),
      ],
    },
    plays,
  };
}

// --- Clock parsing --------------------------------------------------------

describe("parseClock / gameElapsedSec", () => {
  it("parses M:SS and decimal seconds, keeping decimals", () => {
    expect(parseClock("12:00")).toBe(720);
    expect(parseClock("0:07")).toBe(7);
    expect(parseClock("56.5")).toBe(56.5);
    expect(parseClock("0.3")).toBe(0.3);
    expect(parseClock("0.0")).toBe(0);
  });

  it("returns null (never 0) for missing or invalid clocks", () => {
    for (const bad of [undefined, null, "", "--", "1:75", "abc", "75", "12:00:00", 42]) {
      expect(parseClock(bad)).toBeNull();
    }
  });

  it("uses 12-minute quarters and 5-minute overtimes", () => {
    expect(gameElapsedSec(1, 720)).toBe(0);
    expect(gameElapsedSec(2, 720)).toBe(720);
    expect(gameElapsedSec(4, 0)).toBe(2880);
    expect(gameElapsedSec(5, 300)).toBe(2880);
    expect(gameElapsedSec(5, 0)).toBe(3180);
    expect(gameElapsedSec(6, 150)).toBe(3330); // double overtime
    expect(gameElapsedSec(4, 0.3)).toBe(2879.7);
    expect(gameElapsedSec(1, null)).toBeNull();
  });
});

// --- Real fixtures --------------------------------------------------------

describe("normalizeGame on real fixtures", () => {
  it("keeps every play, in array order, with provenance", () => {
    for (const id of FIXTURE_IDS) {
      const n = normalized[id];
      const plays = fixtures[id].plays;
      expect(n.events).toHaveLength(plays.length);
      n.events.forEach((e, i) => {
        expect(e.index).toBe(i);
        expect(e.sourcePlayId).toBe(plays[i].id);
        expect(e.sourceSequence).toBe(Number(plays[i].sequenceNumber));
      });
      expect(n.final).toBe(true);
      expect(n.espnGameId).toBe(id);
    }
  });

  it("does not mutate the input summary", () => {
    const fresh = load("401810062");
    normalizeGame(fresh);
    expect(fresh).toEqual(fixtures["401810062"]);
  });

  it("resolves teams by homeAway and matches the final score of the last event", () => {
    for (const id of FIXTURE_IDS) {
      const n = normalized[id];
      const comps = fixtures[id].header.competitions[0].competitors;
      const home = comps.find((c) => c.homeAway === "home");
      expect(n.teams.home.id).toBe(home.id);
      expect(n.teams.home.finalScore).toBe(Number(home.score));
      const lastEvent = n.events.at(-1);
      expect(lastEvent.kind).toBe(EVENT_KINDS.GAME_END);
      expect(lastEvent.scoreAfter).toEqual({ home: n.teams.home.finalScore, away: n.teams.away.finalScore });
      expect(n.expected.teams[n.teams.home.id].pts).toBe(n.teams.home.finalScore);
    }
  });

  it("builds full player metadata and five starters per team", () => {
    const n = normalized["401810062"];
    const ingram = n.players.find((p) => p.id === "3913176");
    expect(ingram).toMatchObject({ name: "Brandon Ingram", shortName: "B. Ingram", jersey: "3", position: "F", teamId: "28", starter: true, didNotPlay: false });
    for (const team of [n.teams.home, n.teams.away]) {
      expect(n.players.filter((p) => p.teamId === team.id && p.starter)).toHaveLength(5);
    }
  });

  it("parses expected counters from labels, null for DNP players", () => {
    const n = normalized["401810062"];
    expect(n.expected.players["3913176"]).toEqual({
      pts: 25, fgm: 8, fga: 17, tpm: 1, tpa: 6, ftm: 8, fta: 9, reb: 5, oreb: 0, dreb: 5, ast: 4, to: 0, stl: 1, blk: 1, pf: 1,
    });
    const temple = n.players.find((p) => p.id === "4023");
    expect(temple).toMatchObject({ didNotPlay: true, dnpReason: "COACH'S DECISION" });
    expect(Object.values(n.expected.players["4023"]).every((v) => v === null)).toBe(true);
    expect(n.expected.teams["28"]).toMatchObject({ fgm: 45, fga: 91, tpm: 9, tpa: 35, teamTo: 1, totalTo: 9, pf: 23 });
  });

  it("produces roles whose totals match the box score (ast, stl; blk except the bad record)", () => {
    for (const id of FIXTURE_IDS) {
      const n = normalized[id];
      const tally = (role) => {
        const t = {};
        n.events.forEach((e) => e.roles[role] && (t[e.roles[role]] = (t[e.roles[role]] ?? 0) + 1));
        return t;
      };
      const ast = tally("assister");
      const stl = tally("stealer");
      const blk = tally("blocker");
      for (const p of n.players.filter((x) => !x.didNotPlay)) {
        const exp = n.expected.players[p.id];
        expect(ast[p.id] ?? 0, `${id} ${p.name} ast`).toBe(exp.ast);
        expect(stl[p.id] ?? 0, `${id} ${p.name} stl`).toBe(exp.stl);
        const blkGap = id === "401810062" && p.name === "Michael Porter Jr." ? 1 : 0;
        expect((blk[p.id] ?? 0) + blkGap, `${id} ${p.name} blk`).toBe(exp.blk);
      }
    }
  });

  it("yields no confident blocker on the Demin/Porter source error (401810062656)", () => {
    const e = byPlay(normalized["401810062"], "401810062656");
    expect(e.kind).toBe(EVENT_KINDS.FIELD_GOAL);
    expect(e.detail).toMatchObject({ made: false, blocked: true, attemptValue: 2 });
    expect(e.roles.shooter).toBe("4395625"); // RJ Barrett
    expect(e.roles.blocker).toBeUndefined();
    const issue = e.issues.find((i) => i.code === REASON_CODES.ROLE_TEXT_CONFLICT);
    expect(issue).toMatchObject({ role: "blocker", candidate: "4278104" }); // diagnostic only
  });

  it("reports only the known conflict and sequence inversions on the corpus", () => {
    const total = {};
    for (const id of FIXTURE_IDS) {
      for (const [code, count] of Object.entries(countIssues(normalized[id]))) total[code] = (total[code] ?? 0) + count;
    }
    expect(total).toEqual({ [REASON_CODES.SEQUENCE_OUT_OF_ORDER]: 15, [REASON_CODES.ROLE_TEXT_CONFLICT]: 1 });
  });

  it("maps blocked shots: [0] shooter, [1] blocker, team = shooter's team", () => {
    const n = normalized["401810062"];
    const idOf = (name) => n.players.find((p) => p.name === name).id;
    const e = byPlay(n, "401810062306"); // "Scottie Barnes blocks Nic Claxton 's 6-foot…"
    expect(e.roles).toEqual({ shooter: idOf("Nic Claxton"), blocker: idOf("Scottie Barnes") });
    expect(e.teamId).toBe("17"); // Claxton's team (BKN), not the blocker's
  });

  it("keeps jump ball jumpers and possession; flags heaves and FT kinds", () => {
    const n = normalized["401810062"];
    const tip = n.events[0];
    expect(tip.kind).toBe(EVENT_KINDS.JUMP_BALL);
    const idOf = (name) => n.players.find((p) => p.name === name).id;
    expect([...tip.roles.jumpers].sort()).toEqual([idOf("Jakob Poeltl"), idOf("Nic Claxton")].sort());
    expect(tip.roles.possession).toBe(idOf("Noah Clowney"));
    const heaves = FIXTURE_IDS.flatMap((id) => normalized[id].events.filter((e) => e.detail.heave));
    expect(heaves).toHaveLength(5);
    expect(heaves.every((e) => e.kind === EVENT_KINDS.FIELD_GOAL && e.detail.made === false)).toBe(true);
    const techFt = n.events.find((e) => e.source.typeId === "103");
    expect(techFt.detail.ftKind).toBe("technical");
    expect(n.events.find((e) => e.source.typeId === "98").detail.ftKind).toBe("regular");
  });

  it("marks team rebounds/turnovers as team-only with no player role", () => {
    const e = byPlay(normalized["401810062"], "401810062115"); // shot clock turnover
    expect(e).toMatchObject({ kind: EVENT_KINDS.TURNOVER, roles: {}, detail: { teamOnly: true } });
    const teamReb = normalized["401810062"].events.find((e) => e.kind === EVENT_KINDS.REBOUND && e.detail.teamOnly);
    expect(teamReb.roles.rebounder).toBeUndefined();
  });

  it("parses fractional late clocks and OT elapsed time", () => {
    const n = normalized["401810798"]; // OT game
    const ot = n.events.filter((e) => e.period === 5);
    expect(ot[0].clockRemainingSec).toBe(300);
    expect(ot[0].gameElapsedSec).toBe(2880);
    expect(ot.at(-1).gameElapsedSec).toBe(3180);
    const frac = n.events.find((e) => e.clockRemainingSec != null && !Number.isInteger(e.clockRemainingSec));
    expect(frac.gameElapsedSec).toBeCloseTo(periodStart(frac.period) + (frac.period > 4 ? 300 : 720) - frac.clockRemainingSec, 6);
    for (const id of FIXTURE_IDS) {
      const ev = normalized[id].events;
      ev.slice(1).forEach((e, i) => expect(e.gameElapsedSec).toBeGreaterThanOrEqual(ev[i].gameElapsedSec));
    }
  });

  it("places period-end events at 0.0 after the period's last play", () => {
    const n = normalized["401810791"];
    const ends = n.events.filter((e) => e.kind === EVENT_KINDS.PERIOD_END);
    expect(ends.map((e) => e.period)).toEqual([1, 2, 3, 4]);
    for (const end of ends) {
      expect(end.clockRemainingSec).toBe(0);
      expect(end.gameElapsedSec).toBe(end.period * 720);
      const next = n.events[end.index + 1];
      expect(next.period === end.period + 1 || next.kind === EVENT_KINDS.GAME_END).toBe(true);
    }
  });

  it("groups same-clock substitutions in source order", () => {
    const n = normalized["401810792"];
    const groups = {};
    n.events.filter((e) => e.kind === EVENT_KINDS.SUBSTITUTION).forEach((e) => (groups[e.substitutionGroup] ??= []).push(e));
    const sizes = Object.values(groups).map((g) => g.length);
    expect(Math.max(...sizes)).toBeGreaterThanOrEqual(5);
    for (const g of Object.values(groups)) {
      expect(new Set(g.map((e) => `${e.period}/${e.clockRemainingSec}`)).size).toBe(1);
      g.forEach((e, i) => i && expect(e.index).toBe(g[i - 1].index + 1));
      g.forEach((e) => expect(e.roles.entering && e.roles.leaving).toBeTruthy());
    }
  });
});

const periodStart = (p) => (p <= 4 ? (p - 1) * 720 : 2880 + (p - 5) * 300);

// --- Synthetic edge cases -------------------------------------------------

describe("normalizeGame synthetic edge cases", () => {
  it("does not depend on competitor or box array order", () => {
    const base = summary();
    const reversed = summary({
      competitors: [...base.header.competitions[0].competitors].reverse(),
      players: [...base.boxscore.players].reverse(),
    });
    const a = normalizeGame(base);
    const b = normalizeGame(reversed);
    expect(b.teams).toEqual(a.teams);
    expect(b.teams.home).toMatchObject({ id: "1", side: "home", abbreviation: "HOM", finalScore: 100 });
    expect(b.players.find((p) => p.id === "21").teamId).toBe("2");
  });

  it("reports missing teams when homeAway is absent", () => {
    const n = normalizeGame(summary({ competitors: [{ id: "1", team: {} }, { id: "2", team: {} }] }));
    expect(n.teams).toBeNull();
    expect(n.issues.map((i) => i.code)).toContain(REASON_CODES.MISSING_TEAMS);
  });

  it("keeps missing labels and blank stats as null, never 0", () => {
    const labels = ["MIN", "PTS", "FG", "REB"]; // no 3PT/FT/AST/…
    const n = normalizeGame(
      summary({
        players: [
          group("1", [athlete("11", "Ann Home", { stats: ["10", "", "3-x", "4"] })], labels),
          group("2", [athlete("21", "Cal Away", { didNotPlay: true, reason: "INJURY", stats: [] })]),
        ],
      }),
    );
    expect(n.expected.players["11"]).toMatchObject({ pts: null, fgm: null, fga: null, reb: 4, tpm: null, ast: null, pf: null });
    expect(Object.values(n.expected.players["21"]).every((v) => v === null)).toBe(true);
    expect(n.players.find((p) => p.id === "21")).toMatchObject({ didNotPlay: true, dnpReason: "INJURY" });
    expect(n.expected.teams["1"]).toMatchObject({ pts: 100, fgm: null, teamTo: null });
  });

  it("records unknown athlete IDs as structured issues without a role", () => {
    const n = normalizeGame(
      summary({
        plays: [
          play({ type: { id: "155", text: "Defensive Rebound" }, text: "Ghost Player defensive rebound", team: { id: "1" }, participants: [{ athlete: { id: "999" } }] }),
        ],
      }),
    );
    const [e] = n.events;
    expect(e.roles.rebounder).toBeUndefined();
    expect(e.issues).toContainEqual(expect.objectContaining({ code: REASON_CODES.UNKNOWN_ATHLETE, role: "rebounder" }));
  });

  it("guards assister/stealer by text and team", () => {
    const n = normalizeGame(
      summary({
        plays: [
          // second participant but no "assists" text → no assister
          play({ type: { id: "92", text: "Jump Shot" }, text: "Ann Home makes 10-foot jumper", scoringPlay: true, scoreValue: 2, shootingPlay: true, pointsAttempted: 2, homeScore: 2, team: { id: "1" }, participants: [{ athlete: { id: "11" } }, { athlete: { id: "12" } }] }),
          // assister on the other team → dropped
          play({ type: { id: "92", text: "Jump Shot" }, text: "Ann Home makes 24-foot three point jumper (Cal Away assists)", scoringPlay: true, scoreValue: 3, shootingPlay: true, pointsAttempted: 3, homeScore: 5, team: { id: "1" }, participants: [{ athlete: { id: "11" } }, { athlete: { id: "21" } }] }),
          // valid steal
          play({ type: { id: "62", text: "Bad Pass\nTurnover" }, text: "Ann Home bad pass (Cal Away steals)", homeScore: 5, team: { id: "1" }, participants: [{ athlete: { id: "11" } }, { athlete: { id: "21" } }] }),
          // second participant without "steals" → not a stealer
          play({ type: { id: "63", text: "Lost Ball Turnover" }, text: "Ann Home lost ball turnover", homeScore: 5, team: { id: "1" }, participants: [{ athlete: { id: "11" } }, { athlete: { id: "21" } }] }),
        ],
      }),
    );
    const [a, b, c, d] = n.events;
    expect(a.roles).toEqual({ shooter: "11" });
    expect(codes(a)).toContain(REASON_CODES.ROLE_UNRESOLVED);
    expect(b.roles).toEqual({ shooter: "11" });
    expect(b.detail).toMatchObject({ made: true, attemptValue: 3, points: 3, heave: false });
    expect(codes(b)).toContain(REASON_CODES.ROLE_TEAM_CONFLICT);
    expect(c.roles).toEqual({ turnoverBy: "11", stealer: "21" });
    expect(c.source.typeText).toBe("Bad Pass Turnover");
    expect(d.roles).toEqual({ turnoverBy: "11" });
  });

  it("keeps same-clock free throws and substitutions in source order", () => {
    const at = { period: { number: 4 }, clock: { displayValue: "1:05" } };
    const ft = (n, made, score) =>
      play({ ...at, type: { id: n === 1 ? "98" : "99", text: `Free Throw - ${n} of 2` }, text: `Cal Away ${made ? "makes" : "misses"} free throw ${n} of 2`, scoringPlay: made, scoreValue: made ? 1 : 0, shootingPlay: true, awayScore: score, team: { id: "2" }, participants: [{ athlete: { id: "21" } }] });
    const sub = (inId, inName, outId, outName) =>
      play({ ...at, type: { id: "584", text: "Substitution" }, text: `${inName} enters the game for ${outName}`, awayScore: 1, team: { id: "1" }, participants: [{ athlete: { id: inId } }, { athlete: { id: outId } }] });
    const plays = [ft(1, true, 1), sub("12", "Bea Home", "11", "Ann Home"), sub("11", "Ann Home", "12", "Bea Home"), ft(2, false, 1)];
    const n = normalizeGame(summary({ plays }));
    expect(n.events.map((e) => e.sourcePlayId)).toEqual(plays.map((p) => p.id));
    expect(n.events.map((e) => e.kind)).toEqual(["free_throw", "substitution", "substitution", "free_throw"]);
    expect(n.events[1].substitutionGroup).toBe(n.events[2].substitutionGroup);
    expect(n.events[1].roles).toEqual({ entering: "12", leaving: "11" });
    expect(n.events.every((e) => e.clockRemainingSec === 65 && e.gameElapsedSec === 3 * 720 + 655)).toBe(true);
    expect(n.events[3].detail).toMatchObject({ made: false, points: 0, ftKind: "regular" });
  });

  it("does not merge substitutions separated by another event into one group", () => {
    const at = { clock: { displayValue: "5:00" } };
    const sub = () => play({ ...at, type: { id: "584", text: "Substitution" }, text: "Bea Home enters the game for Ann Home", team: { id: "1" }, participants: [{ athlete: { id: "12" } }, { athlete: { id: "11" } }] });
    const n = normalizeGame(summary({ plays: [sub(), play({ ...at, type: { id: "16", text: "Full Timeout" } }), sub()] }));
    expect(n.events[0].substitutionGroup).not.toBe(n.events[2].substitutionGroup);
    expect(n.events[1].kind).toBe(EVENT_KINDS.TIMEOUT);
  });

  it("leaves missing/invalid clocks unknown with an issue (not 0:00)", () => {
    const n = normalizeGame(
      summary({
        plays: [
          play({ clock: {} }),
          play({ clock: { displayValue: "garbage" } }),
          play({ clock: { displayValue: "13:00" } }), // longer than a quarter
          play({ period: { number: 5 }, clock: { displayValue: "6:00" } }), // longer than an OT
          play({ period: {}, clock: { displayValue: "1:00" } }),
        ],
      }),
    );
    const [a, b, c, d, e] = n.events;
    for (const x of [a, b, c, d]) {
      expect(x.clockRemainingSec).toBeNull();
      expect(x.gameElapsedSec).toBeNull();
      expect(codes(x)).toContain(REASON_CODES.UNPARSEABLE_CLOCK);
    }
    expect(e.period).toBeNull();
    expect(e.clockRemainingSec).toBe(60);
    expect(e.gameElapsedSec).toBeNull();
    expect(codes(e)).toContain(REASON_CODES.INVALID_PERIOD);
  });

  it("dedupes only proven duplicates (same ID and content)", () => {
    const p = play({ type: { id: "16", text: "Full Timeout" }, text: "Home Full timeout", team: { id: "1" } });
    const sameContentNewId = { ...p, id: "777" };
    const reusedId = { ...p, text: "Away Full timeout", team: { id: "2" } };
    const n = normalizeGame(summary({ plays: [p, { ...p }, sameContentNewId, reusedId] }));
    expect(n.events.map((e) => e.sourcePlayId)).toEqual([p.id, "777", p.id]);
    expect(n.events.map((e) => e.index)).toEqual([0, 1, 2]);
    expect(n.issues.map((i) => i.code)).toContain(REASON_CODES.DUPLICATE_RECORD);
    expect(codes(n.events[2])).toContain(REASON_CODES.DUPLICATE_ID_CONFLICT);
  });

  it("records score regressions and invalid scores as anomalies without fixing them", () => {
    const n = normalizeGame(
      summary({
        plays: [play({ homeScore: 5, awayScore: 2 }), play({ homeScore: 3, awayScore: 2 }), play({ homeScore: undefined, awayScore: 2 })],
      }),
    );
    expect(n.events[1].scoreAfter).toEqual({ home: 3, away: 2 });
    expect(codes(n.events[1])).toContain(REASON_CODES.SCORE_REGRESSION);
    expect(n.issues).toContainEqual(expect.objectContaining({ code: REASON_CODES.SCORE_REGRESSION, eventIndex: 1 }));
    expect(n.events[2].scoreAfter.home).toBeNull();
    expect(codes(n.events[2])).toContain(REASON_CODES.INVALID_SCORE);
  });

  it("preserves unknown event types with source type for diagnostics", () => {
    const n = normalizeGame(summary({ plays: [play({ type: { id: "9999", text: "Mystery\nThing" }, text: "Something odd" })] }));
    expect(n.events[0]).toMatchObject({ kind: EVENT_KINDS.OTHER, source: { typeId: "9999", typeText: "Mystery Thing" }, text: "Something odd" });
    expect(codes(n.events[0])).toContain(REASON_CODES.UNKNOWN_EVENT_TYPE);
  });

  it("separates technical charge from the player who drew it", () => {
    const n = normalizeGame(
      summary({
        plays: [
          play({ type: { id: "35", text: "Technical Foul" }, text: "Cal Away technical foul (Ann Home draws the foul)", team: { id: "2" }, participants: [{ athlete: { id: "21" } }, { athlete: { id: "11" } }] }),
          play({ type: { id: "30", text: "Double Technical Foul" }, text: "Double technical foul: Ann Home and Cal Away", team: { id: "1" }, participants: [{ athlete: { id: "11" } }, { athlete: { id: "21" } }] }),
        ],
      }),
    );
    expect(n.events[0]).toMatchObject({ kind: EVENT_KINDS.TECHNICAL, roles: { technical: ["21"], fouled: "11" } });
    expect(n.events[1].roles).toEqual({ technical: ["11", "21"] });
  });

  it("does not make the assister the shooter when participants are swapped (4018100627)", () => {
    const fx = structuredClone(fixtures["401810062"]);
    const p = fx.plays.find((x) => x.id === "4018100627"); // "Egor Demin makes … (Terance Mann assists)"
    p.participants.reverse();
    const e = byPlay(normalizeGame(fx), "4018100627");
    expect(e.roles.shooter).toBeUndefined();
    expect(e.roles.assister).toBeUndefined();
    expect(e.issues.filter((i) => i.code === REASON_CODES.ROLE_TEXT_CONFLICT).map((i) => i.role).sort()).toEqual(["assister", "shooter"]);
  });

  it("requires the leading actor name for rebounds, turnovers, fouls and subs", () => {
    const two = [{ athlete: { id: "12" } }, { athlete: { id: "11" } }]; // swapped vs text
    const n = normalizeGame(
      summary({
        plays: [
          // Bea is named in the text but is not the rebounder
          play({ type: { id: "155", text: "Defensive Rebound" }, text: "Ann Home defensive rebound after Bea Home miss", team: { id: "1" }, participants: [{ athlete: { id: "12" } }] }),
          play({ type: { id: "64", text: "Traveling" }, text: "Ann Home traveling (Bea Home)", team: { id: "1" }, participants: [{ athlete: { id: "12" } }] }),
          play({ type: { id: "45", text: "Personal Foul" }, text: "Ann Home personal foul on Bea Home", team: { id: "1" }, participants: [{ athlete: { id: "12" } }] }),
          play({ type: { id: "584", text: "Substitution" }, text: "Ann Home enters the game for Bea Home", team: { id: "1" }, participants: two }),
          play({ type: { id: "99", text: "Free Throw - 2 of 2" }, text: "Ann Home makes free throw 2 of 2 (Bea Home)", scoringPlay: true, scoreValue: 1, homeScore: 1, team: { id: "1" }, participants: [{ athlete: { id: "12" } }] }),
        ],
      }),
    );
    for (const e of n.events) {
      expect(e.roles, e.text).toEqual({});
      const issue = e.issues.find((i) => i.code === REASON_CODES.ROLE_TEXT_CONFLICT);
      expect(issue, e.text).toBeTruthy();
    }
    expect(n.events[0].issues[0].candidate).toBe("11"); // diagnostic only
  });

  it("flags the numeric clock.value fallback instead of using it silently", () => {
    const n = normalizeGame(summary({ plays: [play({ period: { number: 2 }, clock: { displayValue: "bad", value: 42.5 } }), play({ clock: { value: 42.5 } })] }));
    for (const e of n.events) {
      expect(e.clockRemainingSec).toBe(42.5);
      expect(codes(e)).toContain(REASON_CODES.CLOCK_FALLBACK);
      expect(codes(e)).not.toContain(REASON_CODES.UNPARSEABLE_CLOCK);
    }
    expect(n.events[0].gameElapsedSec).toBe(720 + 677.5);
    // A parseable displayValue wins and raises nothing.
    const ok = normalizeGame(summary({ plays: [play({ type: { id: "16", text: "Full Timeout" }, clock: { displayValue: "1:00", value: 42.5 } })] }));
    expect(ok.events[0].clockRemainingSec).toBe(60);
    expect(ok.events[0].issues).toEqual([]);
  });

  it("reports an empty play list", () => {
    const n = normalizeGame(summary({ plays: [] }));
    expect(n.events).toEqual([]);
    expect(n.issues.map((i) => i.code)).toContain(REASON_CODES.NO_PLAYS);
  });
});
