import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeGame } from "@/lib/replay/normalize";
import { joinWinProbability } from "@/lib/replay/probability";
import { buildStateIndex } from "@/lib/replay/state";
import { EVENT_KINDS as K, REASON_CODES as R } from "@/lib/replay/types";

const FIXTURE_IDS = ["401810062", "401810791", "401810792", "401810798", "401810799"];
const load = (id) => JSON.parse(readFileSync(new URL(`./fixtures/replay/${id}.json`, import.meta.url), "utf8"));

// Synthetic events: ids p0..pN, all at one clock unless given.
const events = (kinds) => kinds.map((kind, index) => ({ index, sourcePlayId: `p${index}`, kind, period: 1, clockRemainingSec: 600, issues: [] }));
const wp = (playId, home, tie = 0) => ({ playId, homeWinPercentage: home, tiePercentage: tie });
const codes = (issues) => issues.map((i) => i.code);

describe("joinWinProbability", () => {
  it("joins by playId, not array position (same-clock FT pair, sub group)", () => {
    const ev = events([K.FOUL, K.FREE_THROW, K.FREE_THROW, K.SUBSTITUTION, K.SUBSTITUTION]);
    // Source array in a different order than plays (sequenceNumber order).
    const { samples, issues } = joinWinProbability([wp("p2", 0.6), wp("p1", 0.55), wp("p0", 0.5), wp("p4", 0.61), wp("p3", 0.6)], ev);
    expect(issues).toEqual([]);
    expect(samples.map((s) => [s.eventIndex, s.home])).toEqual([[0, 0.5], [1, 0.55], [2, 0.6], [3, 0.6], [4, 0.61]]);
    expect(samples.every((s) => s.derived === false && s.sourcePlayId === `p${s.eventIndex}`)).toBe(true);
  });

  it("discards unlinked, non-finite and out-of-range samples with issues", () => {
    const ev = events([K.JUMP_BALL, K.FIELD_GOAL, K.REBOUND, K.TURNOVER]);
    const { samples, issues } = joinWinProbability(
      [wp("p0", 0.5), wp("nope", 0.4), { playId: "p1", homeWinPercentage: NaN }, wp("p2", 1.2), wp("p3", 0.7, 0.5), { playId: "p3" }, { homeWinPercentage: 0.3 }, null],
      ev,
    );
    expect(samples.map((s) => s.eventIndex)).toEqual([0]);
    expect(codes(issues).sort()).toEqual(
      [R.PROBABILITY_UNLINKED, R.PROBABILITY_OUT_OF_RANGE, R.PROBABILITY_OUT_OF_RANGE, R.PROBABILITY_OUT_OF_RANGE, R.PROBABILITY_OUT_OF_RANGE, R.PROBABILITY_UNLINKED, R.PROBABILITY_UNLINKED].sort(),
    );
    expect(issues.every((i) => typeof i.sampleIndex === "number" && i.eventIndex === undefined)).toBe(true);
  });

  it("drops conflicting samples for one play, keeps identical repeats", () => {
    const ev = events([K.JUMP_BALL, K.FIELD_GOAL]);
    const { samples, issues } = joinWinProbability([wp("p0", 0.5), wp("p0", 0.5), wp("p1", 0.6), wp("p1", 0.4)], ev);
    expect(samples.map((s) => s.eventIndex)).toEqual([0]);
    expect(codes(issues)).toEqual([R.PROBABILITY_CONFLICT]);
  });

  it("refuses ambiguous links when two events share a play ID", () => {
    const ev = events([K.JUMP_BALL, K.FIELD_GOAL]);
    ev[1].sourcePlayId = "p0";
    const { samples, issues } = joinWinProbability([wp("p0", 0.5)], ev);
    expect(samples).toEqual([]);
    expect(codes(issues)).toEqual([R.PROBABILITY_CONFLICT, R.PROBABILITY_MISSING]);
  });

  it("reports missing probability without inventing values", () => {
    for (const input of [undefined, null, [], "x"]) {
      const { samples, issues } = joinWinProbability(input, events([K.JUMP_BALL]));
      expect(samples).toEqual([]);
      expect(codes(issues)).toEqual([R.PROBABILITY_MISSING]);
    }
  });

  it("synthesizes final certainty only on request, labeled derived", () => {
    const ev = events([K.JUMP_BALL, K.FIELD_GOAL, K.GAME_END]);
    const raw = [wp("p0", 0.5), wp("p1", 0.8)];
    expect(joinWinProbability(raw, ev, { final: true, finalScore: { home: 2, away: 0 } }).samples).toHaveLength(2);
    const { samples } = joinWinProbability(raw, ev, { synthesizeFinal: true, final: true, finalScore: { home: 2, away: 0 } });
    expect(samples.at(-1)).toEqual({ eventIndex: 2, sourcePlayId: "p2", home: 1, tie: 0, derived: true });
    // Not when the source already ends at certainty, or the game is not final.
    expect(joinWinProbability([...raw, wp("p2", 1)], ev, { synthesizeFinal: true, final: true, finalScore: { home: 2, away: 0 } }).samples.every((s) => !s.derived)).toBe(true);
    expect(joinWinProbability(raw, ev, { synthesizeFinal: true, final: false, finalScore: { home: 2, away: 0 } }).samples).toHaveLength(2);
  });

  it("does not mutate its inputs", () => {
    const ev = events([K.JUMP_BALL, K.FIELD_GOAL]);
    const raw = [wp("p1", 0.6), wp("p0", 0.5)];
    const before = JSON.stringify([ev, raw]);
    joinWinProbability(raw, ev);
    expect(JSON.stringify([ev, raw])).toBe(before);
  });
});

describe.each(FIXTURE_IDS)("fixture %s probability", (id) => {
  const summary = load(id);
  const n = normalizeGame(summary);

  it("links every source sample to its play by playId", () => {
    expect(n.probability).toHaveLength(summary.winprobability.length);
    expect(n.issues.filter((i) => i.code.startsWith("probability_"))).toEqual([]);
    for (const s of n.probability) expect(n.events[s.eventIndex].sourcePlayId).toBe(s.sourcePlayId);
    const last = n.probability.at(-1);
    expect(last.home).toBe(n.teams.home.finalScore > n.teams.away.finalScore ? 1 : 0);
  });

  it("sparse samples: unknown before the first, carried forward with provenance", () => {
    const sparse = { ...summary, winprobability: summary.winprobability.filter((_, i) => i >= 40 && i % 17 === 0) };
    const sn = normalizeGame(sparse);
    const idx = buildStateIndex(sn);
    const first = sn.probability[0].eventIndex;
    expect(first).toBeGreaterThan(0);
    for (let i = -1; i < first; i++) expect(idx.stateAt(i).probability).toBeNull();
    let current = null;
    for (let i = first; i < sn.events.length; i++) {
      const s = sn.probability.find((x) => x.eventIndex === i);
      if (s) current = s;
      expect(idx.stateAt(i).probability).toEqual({ home: current.home, tie: current.tie, sourceEventIndex: current.eventIndex, derived: false });
    }
  });

  it("missing probability keeps the replay usable with null probability", () => {
    const rest = { ...summary };
    delete rest.winprobability;
    const mn = normalizeGame(rest);
    expect(mn.probability).toEqual([]);
    expect(mn.issues.map((i) => i.code)).toContain(R.PROBABILITY_MISSING);
    const idx = buildStateIndex(mn);
    expect(idx.stateAt(mn.events.length - 1).probability).toBeNull();
    expect(idx.stateAt(mn.events.length - 1).score).toEqual({ home: mn.teams.home.finalScore, away: mn.teams.away.finalScore });
  });
});
