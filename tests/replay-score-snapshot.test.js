// W20b: score snapshots of late-recorded scoring plays (source-findings §10).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildReplay } from "@/lib/replay/build";
import { normalizeGame } from "@/lib/replay/normalize";
import { buildStateIndex } from "@/lib/replay/state";
import { validateReplay } from "@/lib/replay/validate";
import { CAPABILITY_FAMILIES as F, CAPABILITY_LEVELS as L, REASON_CODES as R } from "@/lib/replay/types";

const load = (id) => JSON.parse(readFileSync(new URL(`./fixtures/replay/${id}.json`, import.meta.url), "utf8"));
const validate = (summary) => {
  const n = normalizeGame(summary);
  const index = buildStateIndex(n);
  return { n, index, v: validateReplay(n, index) };
};
const codes = (e) => e.issues.map((i) => i.code);
const gameCap = (v, family) => v.capabilities.find((c) => c.family === family && c.scope === "game");
const scores = (n) => n.events.map((e) => `${e.scoreAfter.away}-${e.scoreAfter.home}`);

// --- Synthetic summaries ----------------------------------------------------

const athlete = (id, name) => ({
  athlete: { id, displayName: name, shortName: name, jersey: id.slice(-1) },
  starter: true,
  stats: [],
});
function summary(plays) {
  return {
    header: {
      id: "1",
      competitions: [
        {
          status: { type: { name: "STATUS_FINAL", state: "post", completed: true } },
          competitors: [
            { id: "1", homeAway: "home", score: "4", team: { abbreviation: "HOM" } },
            { id: "2", homeAway: "away", score: "2", team: { abbreviation: "AWY" } },
          ],
        },
      ],
    },
    boxscore: { teams: [], players: [{ team: { id: "1" }, statistics: [{ labels: [], athletes: [athlete("11", "Ann Home")] }] }, { team: { id: "2" }, statistics: [{ labels: [], athletes: [athlete("21", "Cal Away")] }] }] },
    plays,
  };
}
const base = (seq, clock, away, home, over) => ({
  id: `9${seq}`,
  sequenceNumber: String(seq),
  period: { number: 1 },
  clock: { displayValue: clock },
  awayScore: String(away),
  homeScore: String(home),
  scoringPlay: false,
  shootingPlay: false,
  ...over,
});
const make = (seq, clock, away, home, who) =>
  base(seq, clock, away, home, {
    type: { id: "92", text: "Jump Shot" },
    text: `${who === "home" ? "Ann Home" : "Cal Away"} makes 10-foot jumper`,
    scoringPlay: true,
    scoreValue: 2,
    shootingPlay: true,
    pointsAttempted: 2,
    team: { id: who === "home" ? "1" : "2" },
    participants: [{ athlete: { id: who === "home" ? "11" : "21" } }],
  });
const miss = (seq, clock, away, home, who) =>
  base(seq, clock, away, home, {
    type: { id: "92", text: "Jump Shot" },
    text: `${who === "home" ? "Ann Home" : "Cal Away"} misses 10-foot jumper`,
    shootingPlay: true,
    pointsAttempted: 2,
    team: { id: who === "home" ? "1" : "2" },
    participants: [{ athlete: { id: who === "home" ? "11" : "21" } }],
  });

describe("late-recorded scoring play (synthetic)", () => {
  // seq 5 (away basket) is recorded late but placed at its game position; plays
  // recorded before it (seq 2, 3) still carry the score without its 2 points.
  const plays = [
    make(1, "11:00", 0, 2, "home"),
    make(5, "10:40", 2, 2, "away"), // late-recorded, own score correct
    miss(2, "10:20", 0, 2, "home"), // stale: away 0 (would regress 2 → 0)
    make(3, "10:00", 0, 4, "home"), // stale scoring play: away 0, home delta still +2
    miss(6, "9:40", 2, 4, "away"), // recorded after seq 5: resynced
  ];

  it("carries the score over a stale non-scoring snapshot and a stale scoring snapshot", () => {
    const { n, index, v } = validate(summary(plays));
    expect(scores(n)).toEqual(["0-2", "2-2", "2-2", "2-4", "2-4"]);
    expect(n.events[2].sourceScoreAfter).toEqual({ home: 2, away: 0 });
    expect(n.events[3].sourceScoreAfter).toEqual({ home: 4, away: 0 });
    for (const i of [0, 1, 4]) expect(n.events[i].sourceScoreAfter).toBeUndefined();
    for (const i of [2, 3]) {
      expect(n.events[i].issues).toContainEqual(expect.objectContaining({ code: R.SCORE_SNAPSHOT_OUT_OF_ORDER, lateSourcePlayIds: ["95"] }));
    }
    expect(n.issues.map((i) => i.code)).not.toContain(R.SCORE_REGRESSION);
    expect(index.issues.map((i) => i.code)).not.toContain(R.SCORE_DELTA_MISMATCH);
    // Stats come from roles, not scores: Cal 2 pts, Ann 4 pts.
    const fin = index.stateAt(n.events.length - 1);
    expect(fin.players["21"].pts).toBe(2);
    expect(fin.players["11"].pts).toBe(4);
    expect(fin.score).toEqual(fin.creditedScore);
    expect(v.reasons).not.toContain(R.SCORE_REGRESSION);
    expect(gameCap(v, F.SCORE).level).toBe(L.RELIABLE);
    expect(v.warnings).toContainEqual(expect.objectContaining({ code: R.SCORE_SNAPSHOT_OUT_OF_ORDER, count: 2 }));
  });

  it("without the late play's sequence inversion the dip stays a score regression", () => {
    const inOrder = plays.map((p, i) => ({ ...p, id: `8${i}`, sequenceNumber: String(i + 1) }));
    const { n, v } = validate(summary(inOrder));
    expect(n.events.some((e) => e.sourceScoreAfter)).toBe(false);
    expect(codes(n.events[2])).toContain(R.SCORE_REGRESSION);
    expect(v.status).toBe("unavailable");
    expect(v.reasons).toContain(R.SCORE_REGRESSION);
  });

  it("a dip not equal to the late plays' points is unexplained → regression kept, nothing adjusted", () => {
    const bad = plays.map((p) => ({ ...p }));
    bad[2] = miss(2, "10:20", 0, 1, "home"); // home 2 → 1: not explained by the late AWAY basket
    const { n, v } = validate(summary(bad));
    expect(n.events[2].scoreAfter.home).toBe(1); // source kept
    expect(codes(n.events[2])).toContain(R.SCORE_REGRESSION);
    expect(v.status).toBe("unavailable");
  });

  it("each side is proven separately: an unexplained side is never adjusted", () => {
    const bad = plays.map((p) => ({ ...p }));
    bad[3] = make(3, "10:00", 0, 5, "home"); // home +3 on a 2-point make (unexplained); away still stale by the late 2
    const { n, v } = validate(summary(bad));
    expect(n.events[3].scoreAfter).toEqual({ home: 5, away: 2 }); // home kept from source, away carried
    expect(n.events[3].issues.find((i) => i.code === R.SCORE_SNAPSHOT_OUT_OF_ORDER).detail).toMatch(/^away /);
    expect(n.issues).toContainEqual(expect.objectContaining({ code: R.SCORE_REGRESSION, eventIndex: 4 })); // home 5 → 4
    expect(v.status).toBe("unavailable");
    expect(v.reasons).toContain(R.SCORE_REGRESSION);
  });

  it("already-correct snapshots after a late play are left untouched", () => {
    const fixed = plays.map((p) => ({ ...p, awayScore: p.sequenceNumber === "1" ? "0" : "2" }));
    const { n, v } = validate(summary(fixed));
    expect(n.events.some((e) => e.sourceScoreAfter || codes(e).includes(R.SCORE_SNAPSHOT_OUT_OF_ORDER))).toBe(false);
    expect(v.reasons).not.toContain(R.SCORE_REGRESSION);
    expect(gameCap(v, F.SCORE).level).toBe(L.RELIABLE);
  });
});

// --- Real games ---------------------------------------------------------------

const ORIGINAL = ["401810062", "401810791", "401810792", "401810798", "401810799"];
// id → [status, corrected events, late-recorded scoring play ids]
const LATE = {
  401909972: ["limited", 5, ["40190997275"]],
  401909971: ["limited", 38, ["401909971755"]],
  401909968: ["limited", 140, ["401909968680"]],
  401909962: ["limited", 21, ["401909962660", "401909962661"]],
  401909294: ["ready", 183, ["401909294412"]],
  401909290: ["limited", 5, ["401909290320", "401909290718"]],
  401909931: ["limited", 2, ["401909931411"]],
};

describe("late-recorded scoring plays in real games", () => {
  it("original fixtures are unaffected", () => {
    for (const id of ORIGINAL) {
      const n = normalizeGame(load(id));
      expect(n.events.some((e) => e.sourceScoreAfter || codes(e).includes(R.SCORE_SNAPSHOT_OUT_OF_ORDER))).toBe(false);
    }
  });

  for (const [id, [status, corrected, lateIds]] of Object.entries(LATE)) {
    it(`${id}: stale snapshots carried → ${status}, every score reconciles`, () => {
      const s = load(id);
      // The raw feed really does dip.
      let dips = 0;
      s.plays.reduce((prev, p) => {
        if (+p.homeScore < prev.h || +p.awayScore < prev.a) dips++;
        return { h: +p.homeScore, a: +p.awayScore };
      }, { h: 0, a: 0 });
      expect(dips).toBeGreaterThan(0);

      const { n, index, v } = validate(s);
      const fixedEvents = n.events.filter((e) => e.sourceScoreAfter);
      expect(fixedEvents).toHaveLength(corrected);
      const ids = new Set(fixedEvents.flatMap((e) => e.issues.filter((i) => i.code === R.SCORE_SNAPSHOT_OUT_OF_ORDER).flatMap((i) => i.lateSourcePlayIds)));
      expect([...ids].sort()).toEqual(lateIds);
      // Every carried score equals the role-credited running score.
      for (const e of fixedEvents) expect(index.stateAt(e.index).creditedScore).toEqual(e.scoreAfter);
      expect(n.issues.map((i) => i.code)).not.toContain(R.SCORE_REGRESSION);
      expect(index.issues.map((i) => i.code)).not.toContain(R.SCORE_DELTA_MISMATCH);

      expect(v.status).toBe(status);
      expect(gameCap(v, F.SCORE)).toMatchObject({ level: L.RELIABLE, reasons: [] });
      expect(gameCap(v, F.PTS).level).toBe(L.RELIABLE);
      for (const side of ["home", "away"]) {
        const f = v.reconciliation.score.final[side];
        expect(f.source).toBe(f.expected);
        expect(f.credited).toBe(f.expected);
      }
      expect(v.reconciliation.score.periods.every((p) => p.match)).toBe(true);
      expect(v.warnings).toContainEqual(expect.objectContaining({ code: R.SCORE_SNAPSHOT_OUT_OF_ORDER, count: corrected }));
      expect(buildReplay(s).status).toBe(status);
    });
  }

  it("401909294 (comeback from 14) is ready with only the warning", () => {
    const { v } = validate(load("401909294"));
    expect(v.reasons).toEqual([]);
  });

  it("401909293 stays unavailable: phantom +2 on a turnover is not a late-recording artefact", () => {
    const { n, index, v } = validate(load("401909293"));
    expect(n.events.some((e) => e.sourceScoreAfter)).toBe(false);
    expect(v.status).toBe("unavailable");
    expect(v.reasons).toEqual([R.SCORE_COVERAGE_GAP, R.PERIOD_SCORE_MISMATCH]);
    expect(v.reconciliation.score.final.home).toEqual({ source: 111, credited: 109, expected: 109 });
    const turnover = n.events.find((e) => e.sourcePlayId === "401909293681");
    expect(index.issues).toContainEqual(expect.objectContaining({ code: R.SCORE_DELTA_MISMATCH, eventIndex: turnover.index }));
  });

  it("a mutated stale snapshot (dip larger than the late play's points) stays unavailable", () => {
    const s = load("401909972");
    const p = s.plays.find((x) => x.id === "40190997268"); // source 14–10, late play added 2
    p.awayScore = "13";
    const { n, v } = validate(s);
    expect(n.events.find((e) => e.sourcePlayId === "40190997268").sourceScoreAfter).toBeUndefined();
    expect(v.status).toBe("unavailable");
    expect(v.reasons).toContain(R.SCORE_REGRESSION);
  });

  it("a truncated feed of a late-recording game is still unavailable", () => {
    const s = load("401909968");
    s.plays = s.plays.slice(0, 350); // ends inside the stale window
    const { v } = validate(s);
    expect(v.status).toBe("unavailable");
    expect(v.reasons).toEqual(expect.arrayContaining([R.SCORE_COVERAGE_GAP, R.NO_GAME_END]));
  });
});
