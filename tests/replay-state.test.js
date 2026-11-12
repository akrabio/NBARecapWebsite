import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lineupTimeline } from "@/lib/replay/lineups";
import { normalizeGame } from "@/lib/replay/normalize";
import { buildStateIndex, DEFAULT_CHECKPOINT_EVERY, initialState, stateContext, stateFromCheckpoints, stepState } from "@/lib/replay/state";
import { accumulate } from "@/lib/replay/stats";
import { EVENT_KINDS as K } from "@/lib/replay/types";

const FIXTURE_IDS = ["401810062", "401810791", "401810792", "401810798", "401810799"];
const load = (id) => JSON.parse(readFileSync(new URL(`./fixtures/replay/${id}.json`, import.meta.url), "utf8"));

// Independent reference: each module's own reducer, run from scratch.
function referenceStates(n) {
  const timeline = lineupTimeline(n);
  const states = [];
  const score = { home: 0, away: 0 };
  let probability = null;
  for (let i = -1; i < n.events.length; i++) {
    if (i >= 0) {
      for (const side of ["home", "away"]) if (n.events[i].scoreAfter[side] != null) score[side] = n.events[i].scoreAfter[side];
      const s = n.probability.find((x) => x.eventIndex === i);
      if (s) probability = { home: s.home, tie: s.tie, sourceEventIndex: i, derived: s.derived };
    }
    const acc = accumulate(n, { uptoIndex: i });
    const lineup = i < 0 ? timeline.initial : timeline.states[i];
    states.push({
      eventIndex: i,
      score: { ...score },
      creditedScore: acc.score,
      players: acc.players,
      teams: acc.teams,
      unattributed: acc.unattributed,
      lineups: { teams: lineup.teams, pendingSubs: lineup.pendingSubs },
      probability,
    });
  }
  return { states, groups: timeline.groups };
}

const sumPts = (state) => Object.values(state.players).reduce((a, p) => a + p.pts, 0);

describe.each(FIXTURE_IDS)("fixture %s state index", (id) => {
  const summary = load(id);
  const snapshot = JSON.stringify(summary);
  const n = normalizeGame(summary);
  const normalizedSnapshot = JSON.stringify(n);
  const idx = buildStateIndex(n);
  const ref = referenceStates(n);
  const last = n.events.length - 1;

  it("stateAt(i) equals straight sequential reduction for every i", () => {
    for (let i = -1; i <= last; i++) expect(idx.stateAt(i)).toEqual(ref.states[i + 1]);
  });

  it("is independent of checkpoint spacing and seek order", () => {
    const dense = buildStateIndex(n, { checkpointEvery: 1 });
    const odd = buildStateIndex(n, { checkpointEvery: 7 });
    const order = [last, -1, 300 % (last + 1), 3, last - 1, 120, 119, 0];
    for (const i of order) {
      expect(odd.stateAt(i)).toEqual(idx.stateAt(i));
      expect(dense.stateAt(i)).toEqual(idx.stateAt(i));
    }
    expect(dense.checkpoints[last + 1]).toEqual(idx.stateAt(last));
  });

  it("two seeks to the same index are identical", () => {
    for (const i of [-1, 0, 57, last]) expect(idx.stateAt(i)).toEqual(idx.stateAt(i));
  });

  it("start state is 0–0 with starters and no future values", () => {
    const s = idx.stateAt(-1);
    expect(s.eventIndex).toBe(-1);
    expect(s.score).toEqual({ home: 0, away: 0 });
    expect(s.creditedScore).toEqual({ home: 0, away: 0 });
    expect(s.probability).toBeNull();
    expect(s.unattributed).toEqual({});
    for (const p of Object.values(s.players)) expect(Object.values(p).every((v) => v === 0)).toBe(true);
    for (const t of Object.values(s.teams)) expect(Object.values(t).every((v) => v === 0)).toBe(true);
    for (const [teamId, t] of Object.entries(s.lineups.teams)) {
      const starters = n.players.filter((p) => p.teamId === teamId && p.starter).map((p) => p.id);
      expect(t.valid).toBe(true);
      expect(t.onCourt).toEqual(starters);
    }
    expect(s.lineups.pendingSubs).toEqual([]);
    expect(stateFromCheckpoints(n, idx.checkpoints, -5)).toEqual(s); // clamped
  });

  it("final state matches the header score", () => {
    const s = idx.stateAt(last);
    expect(s.score).toEqual({ home: n.teams.home.finalScore, away: n.teams.away.finalScore });
    expect(s.creditedScore).toEqual(s.score);
    expect(idx.stateAt(last + 50)).toEqual(s); // clamped
  });

  it("probability is null before the first sample and carries the sample index", () => {
    const first = n.probability[0].eventIndex;
    expect(idx.stateAt(first - 1).probability).toBeNull();
    expect(idx.stateAt(first).probability.sourceEventIndex).toBe(first);
  });

  it("seeking backward across a substitution restores the previous five and earlier totals", () => {
    // Pick a multi-sub group well into the game, after some scoring.
    const group = ref.groups.find((g) => g.to > g.from && g.from > 100);
    expect(group).toBeDefined();
    const before = group.from - 1;
    const fresh = idx.stateAt(before);
    const mid = idx.stateAt(group.from); // inside the group: still the old five, change pending
    const afterGroup = idx.stateAt(group.to);
    const later = idx.stateAt(Math.min(last, group.to + 40));
    expect(mid.lineups.teams).toEqual(fresh.lineups.teams);
    expect(mid.lineups.pendingSubs).toEqual([group.from]);
    expect(afterGroup.lineups.teams).not.toEqual(fresh.lineups.teams);
    expect(afterGroup.lineups.pendingSubs).toEqual([]);
    expect(sumPts(later)).toBeGreaterThan(sumPts(fresh));
    const back = idx.stateAt(before);
    expect(back).toEqual(fresh);
    expect(back).toEqual(ref.states[before + 1]);
  });

  it("checkpoints are frozen plain JSON and returned states do not alias them", () => {
    expect(idx.checkpoints[0].eventIndex).toBe(-1);
    expect(idx.checkpoints.length).toBe(1 + Math.floor(n.events.length / DEFAULT_CHECKPOINT_EVERY));
    expect(JSON.parse(JSON.stringify(idx.checkpoints))).toEqual(idx.checkpoints);
    expect(Object.isFrozen(idx.checkpoints[1].players)).toBe(true);
    const at = idx.checkpoints[1].eventIndex;
    const s = idx.stateAt(at);
    const pid = Object.keys(s.players)[0];
    s.players[pid].pts = 999;
    s.score.home = -1;
    s.lineups.teams[n.teams.home.id].onCourt.push("x");
    s.probability = { home: 0.123 };
    expect(idx.stateAt(at)).toEqual(ref.states[at + 1]);
    expect(idx.stateAt(at + 3)).toEqual(ref.states[at + 4]);
  });

  it("serialized checkpoints rebuild identical states", () => {
    const wire = JSON.parse(JSON.stringify(idx.checkpoints));
    for (const i of [-1, 10, 200, last]) expect(stateFromCheckpoints(n, wire, i)).toEqual(idx.stateAt(i));
  });

  it("does not mutate the summary or normalized input", () => {
    for (let i = -1; i <= last; i += 13) idx.stateAt(i);
    buildStateIndex(n, { checkpointEvery: 3 });
    expect(JSON.stringify(summary)).toBe(snapshot);
    expect(JSON.stringify(n)).toBe(normalizedSnapshot);
  });

  it("reports no stat/lineup issues beyond the documented corpus ones", () => {
    const codes = new Set(idx.issues.map((i) => i.code));
    expect([...codes].every((c) => ["attribution_unknown", "heave_excluded"].includes(c))).toBe(true);
  });
});

describe("state reducer (synthetic)", () => {
  const teams = { home: { id: "1", side: "home" }, away: { id: "2", side: "away" } };
  const players = [];
  for (const [t, pre] of [["1", "h"], ["2", "a"]]) for (let i = 1; i <= 6; i++) players.push({ id: `${pre}${i}`, teamId: t, starter: i <= 5, didNotPlay: false });
  const ev = (index, kind, extra = {}) => ({ index, sourcePlayId: `p${index}`, kind, period: 1, clockRemainingSec: 600, teamId: null, roles: {}, detail: {}, issues: [], substitutionGroup: null, scoreAfter: { home: 0, away: 0 }, ...extra });
  const n = {
    teams,
    players,
    events: [
      ev(0, K.JUMP_BALL),
      ev(1, K.FIELD_GOAL, { teamId: "1", roles: { shooter: "h1" }, detail: { made: true, points: 2, attemptValue: 2 }, scoreAfter: { home: 2, away: 0 } }),
      ev(2, K.SUBSTITUTION, { teamId: "1", roles: { entering: "h6", leaving: "h1" }, substitutionGroup: "sub-2", clockRemainingSec: 500, scoreAfter: { home: 2, away: null } }),
      ev(3, K.SUBSTITUTION, { teamId: "2", roles: { entering: "a6", leaving: "a2" }, substitutionGroup: "sub-2", clockRemainingSec: 500, scoreAfter: { home: 2, away: 0 } }),
      ev(4, K.FREE_THROW, { teamId: "2", roles: { shooter: "a6" }, detail: { made: true, points: 1 }, scoreAfter: { home: 2, away: 1 } }),
    ],
    probability: [{ eventIndex: 1, sourcePlayId: "p1", home: 0.6, tie: 0, derived: false }],
  };

  it("stepState is pure and matches the index", () => {
    const idx = buildStateIndex(n, { checkpointEvery: 2 });
    const ctx = stateContext(n);
    let s = initialState(n, ctx).state;
    expect(s).toEqual(idx.stateAt(-1));
    for (const e of n.events) {
      const before = JSON.stringify(s);
      const r = stepState(s, e, ctx);
      expect(JSON.stringify(s)).toBe(before);
      s = r.state;
      expect(s).toEqual(idx.stateAt(e.index));
    }
  });

  it("carries an invalid source score side and applies the sub group atomically", () => {
    const idx = buildStateIndex(n, { checkpointEvery: 2 });
    const mid = idx.stateAt(2);
    expect(mid.score).toEqual({ home: 2, away: 0 }); // away null → carried
    expect(mid.lineups.teams["1"].onCourt).toContain("h1"); // pending
    expect(mid.lineups.pendingSubs).toEqual([2]);
    const done = idx.stateAt(3);
    expect(done.lineups.teams["1"].onCourt[0]).toBe("h6");
    expect(done.lineups.teams["2"].onCourt[1]).toBe("a6");
    expect(idx.stateAt(4).players.a6.pts).toBe(1);
    expect(idx.stateAt(4).probability).toEqual({ home: 0.6, tie: 0, sourceEventIndex: 1, derived: false });
    expect(idx.stateAt(0).probability).toBeNull();
    expect(idx.stateAt(1).players.h1.pts).toBe(2);
  });

  it("rejects bad arguments", () => {
    expect(() => buildStateIndex(n, { checkpointEvery: 0 })).toThrow(RangeError);
    expect(() => buildStateIndex(n).stateAt(NaN)).toThrow(RangeError);
  });
});
