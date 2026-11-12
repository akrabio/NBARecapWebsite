import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildHighlights } from "@/lib/replay/highlights";
import { normalizeGame } from "@/lib/replay/normalize";
import { buildStateIndex } from "@/lib/replay/state";
import { TIMELINE_CONFIG, buildTimeline, frameAt, holdSecFor, momentNav, revealTimes, scrubberMarkers, spotlightAt } from "@/lib/replay/timeline";
import { validateReplay } from "@/lib/replay/validate";
import { EVENT_KINDS as K } from "@/lib/replay/types";

const IDS = Object.keys(JSON.parse(readFileSync(new URL("./fixtures/replay/manifest.json", import.meta.url), "utf8")).fixtures).sort();
const fixtures = Object.fromEntries(
  IDS.map((id) => {
    const n = normalizeGame(JSON.parse(readFileSync(new URL(`./fixtures/replay/${id}.json`, import.meta.url), "utf8")));
    const idx = buildStateIndex(n);
    const v = validateReplay(n, idx);
    const { highlights } = buildHighlights(n, { stateIndex: idx, capabilities: v.capabilities });
    return [id, { n, idx, highlights, tl: buildTimeline(n, highlights) }];
  }),
);
const periodShare = (tl, period) => {
  const p = tl.periods.find((x) => x.period === period);
  return (p.endSec - p.startSec) / tl.durationSec;
};

describe("timeline — structure (all fixtures)", () => {
  it.each(IDS)("%s: contiguous, monotonic, finite, covers [0, duration], 60–120 s", (id) => {
    const { tl, n } = fixtures[id];
    expect(tl.durationSec).toBeGreaterThanOrEqual(60);
    expect(tl.durationSec).toBeLessThanOrEqual(120);
    expect(tl.segments[0].startSec).toBe(0);
    expect(tl.segments.at(-1).endSec).toBe(tl.durationSec);
    tl.segments.forEach((s, i) => {
      expect(Number.isFinite(s.startSec) && Number.isFinite(s.endSec)).toBe(true);
      expect(s.endSec).toBeGreaterThan(s.startSec);
      if (i > 0) expect(s.startSec).toBe(tl.segments[i - 1].endSec);
      if (s.kind === "fast") {
        expect(s.revealSec).toHaveLength(s.toEventIndex - s.fromEventIndex + 1);
        expect(s.revealSec.at(-1)).toBe(s.endSec);
        s.revealSec.forEach((r, k) => {
          expect(r).toBeGreaterThanOrEqual(k ? s.revealSec[k - 1] : s.startSec);
          expect(r).toBeLessThanOrEqual(s.endSec);
        });
      }
    });
    expect(tl.issues).toEqual([]);
    expect(JSON.parse(JSON.stringify(tl))).toEqual(tl);
    expect(tl.lastEventIndex).toBe(n.events.length - 1);
  });

  it.each(IDS)("%s: fast segments cover every event index exactly once, in order", (id) => {
    const { tl, n } = fixtures[id];
    let next = 0;
    for (const s of tl.segments.filter((x) => x.kind === "fast")) {
      expect(s.fromEventIndex).toBe(next);
      next = s.toEventIndex + 1;
    }
    expect(next).toBe(n.events.length);
  });

  it.each(IDS)("%s: every hold maps to one boundary + one highlight; state constant across it", (id) => {
    const { tl, highlights } = fixtures[id];
    const holds = tl.segments.filter((s) => s.kind === "hold");
    expect(holds.map((h) => h.highlightId).sort()).toEqual(highlights.map((h) => h.id).sort());
    for (const h of holds) {
      const hl = highlights.find((x) => x.id === h.highlightId);
      expect(h.eventIndex).toBe(hl.eventIndex);
      expect(h.fromEventIndex).toBe(h.toEventIndex);
      expect(h.endSec - h.startSec).toBeGreaterThanOrEqual(TIMELINE_CONFIG.hold.minSec - 1e-9);
      for (let k = 0; k <= 10; k++) {
        const f = frameAt(tl, h.startSec + ((h.endSec - h.startSec) * k) / 10 - (k === 10 ? 1e-6 : 0));
        expect(f.eventIndex).toBe(h.eventIndex);
        expect(f.hold?.highlightId).toBe(h.highlightId);
      }
      // Just before the hold, the held event has already been applied (fast span ended there).
      expect(frameAt(tl, h.startSec - 1e-6).eventIndex).toBeLessThanOrEqual(h.eventIndex);
    }
  });

  it.each(IDS)("%s: eventIndex is non-decreasing over replay time and reaches every non-mid-group event", (id) => {
    const { tl, n } = fixtures[id];
    const times = [...new Set([0, ...revealTimes(tl.segments, n.events.length), tl.durationSec])].sort((a, b) => a - b);
    let prev = -1;
    const seen = new Set();
    for (const t of times) {
      const f = frameAt(tl, t);
      expect(f.eventIndex).toBeGreaterThanOrEqual(prev);
      prev = f.eventIndex;
      seen.add(f.eventIndex);
    }
    for (let i = 0; i < n.events.length; i++) {
      const e = n.events[i];
      const nextE = n.events[i + 1];
      const midGroup = e.kind === K.SUBSTITUTION && e.substitutionGroup != null && nextE?.kind === K.SUBSTITUTION && nextE.substitutionGroup === e.substitutionGroup;
      expect(seen.has(i)).toBe(!midGroup);
    }
  });
});

describe("frameAt / boundaries", () => {
  it.each(IDS)("%s: 0 → -1 (0–0), end → last event, clamps out of range", (id) => {
    const { tl, idx, n } = fixtures[id];
    const f0 = frameAt(tl, 0);
    expect(f0.eventIndex).toBe(-1);
    expect(f0.periodLabel).toBe("Q1");
    expect(idx.stateAt(f0.eventIndex).score).toEqual({ home: 0, away: 0 });
    expect(frameAt(tl, -5).eventIndex).toBe(-1);
    expect(frameAt(tl, Number.NaN).eventIndex).toBe(-1);
    const end = frameAt(tl, tl.durationSec);
    expect(end.eventIndex).toBe(n.events.length - 1);
    expect(end.ended).toBe(true);
    expect(end.hold).toBeNull();
    expect(frameAt(tl, tl.durationSec + 100)).toEqual(end);
    expect(frameAt(tl, tl.durationSec - 1e-3).ended).toBe(false);
  });

  it("is deterministic (same input → same timeline and frames)", () => {
    const { n, highlights, tl } = fixtures["401810798"];
    expect(buildTimeline(n, highlights)).toEqual(tl);
    expect(buildTimeline(n, [...highlights].reverse())).toEqual(tl);
    for (let t = 0; t <= tl.durationSec; t += 0.37) expect(frameAt(tl, t)).toEqual(frameAt(tl, t));
  });

  it("seek during a hold lands on the held state", () => {
    const { tl, idx } = fixtures["401810799"];
    const h = tl.segments.find((s) => s.kind === "hold");
    const mid = (h.startSec + h.endSec) / 2;
    frameAt(tl, tl.durationSec); // unrelated earlier seek
    const f = frameAt(tl, mid);
    expect(f.eventIndex).toBe(h.eventIndex);
    expect(f.hold).toEqual({ highlightId: h.highlightId, momentIndex: h.momentIndex, remainingSec: expect.any(Number) });
    expect(f.hold.remainingSec).toBeCloseTo(h.endSec - mid, 3);
    expect(idx.stateAt(f.eventIndex)).toEqual(idx.stateAt(h.eventIndex));
  });

  it("never lands inside a substitution group; backward seek across it equals forward", () => {
    const { tl, n, idx } = fixtures["401810791"];
    const reveal = revealTimes(tl.segments, n.events.length);
    const groups = {};
    n.events.forEach((e) => {
      if (e.kind === K.SUBSTITUTION && e.substitutionGroup != null) (groups[e.substitutionGroup] ??= []).push(e.index);
    });
    const multi = Object.values(groups).filter((g) => g.length >= 2 && g.at(-1) - g[0] === g.length - 1);
    expect(multi.length).toBeGreaterThan(0);
    for (const g of multi) for (const i of g) expect(reveal[i]).toBe(reveal[g[0]]);
    const g = multi[Math.floor(multi.length / 2)];
    const before = (reveal[g[0] - 1] + reveal[g[0]]) / 2;
    const after = reveal[g[0]];
    // forward: 0 → before → after; backward: end → after → before
    const fwd = [frameAt(tl, 0), frameAt(tl, before), frameAt(tl, after)].map((f) => f.eventIndex);
    const bwd = [frameAt(tl, tl.durationSec), frameAt(tl, after), frameAt(tl, before)].map((f) => f.eventIndex);
    expect(bwd[1]).toBe(fwd[2]);
    expect(bwd[2]).toBe(fwd[1]);
    expect(fwd[1]).toBe(g[0] - 1);
    expect(fwd[2]).toBeGreaterThanOrEqual(g.at(-1));
    expect(idx.stateAt(bwd[1]).lineups).toEqual(idx.stateAt(fwd[2]).lineups);
  });
});

describe("moment navigation and spotlight", () => {
  it.each(IDS)("%s: next/prev round trips through every moment", (id) => {
    const { tl } = fixtures[id];
    const ms = tl.moments;
    expect(momentNav(tl, 0).prev).toBeNull();
    let sec = 0;
    const visited = [];
    for (;;) {
      const { next } = momentNav(tl, sec);
      if (!next) break;
      visited.push(next.momentIndex);
      sec = next.sec;
      expect(frameAt(tl, sec).hold?.highlightId).toBe(next.highlightId);
    }
    expect(visited).toEqual(ms.map((m) => m.index));
    for (let k = ms.length - 1; k > 0; k--) {
      // inside the hold (start and middle), prev is the previous moment, never the current one
      expect(momentNav(tl, ms[k].startSec).prev.momentIndex).toBe(k - 1);
      expect(momentNav(tl, (ms[k].startSec + ms[k].endSec) / 2).prev.momentIndex).toBe(k - 1);
      expect(momentNav(tl, ms[k].startSec).next?.momentIndex ?? null).toBe(k + 1 < ms.length ? k + 1 : null);
      // just within tolerance after the start: still not re-selected
      expect(momentNav(tl, ms[k].startSec + 0.2).next?.momentIndex ?? null).toBe(k + 1 < ms.length ? k + 1 : null);
    }
    if (ms.length) {
      expect(momentNav(tl, tl.durationSec).next).toBeNull();
      expect(momentNav(tl, tl.durationSec).prev.momentIndex).toBe(ms.at(-1).index);
    }
  });

  it("spotlight keeps the last reached moment after its hold while the running frame advances", () => {
    const { tl } = fixtures["401810799"];
    const m = tl.moments[0];
    expect(spotlightAt(tl, 0)).toBeNull();
    expect(spotlightAt(tl, m.startSec - 0.01)).toBeNull();
    expect(spotlightAt(tl, m.startSec)).toMatchObject({ highlightId: m.highlightId, eventIndex: m.eventIndex, active: true });
    const later = Math.min(m.endSec + 1, tl.moments[1].startSec - 0.01);
    const s = spotlightAt(tl, later);
    expect(s).toMatchObject({ highlightId: m.highlightId, eventIndex: m.eventIndex, active: false });
    expect(s.sinceEndSec).toBeCloseTo(later - m.endSec, 3);
    expect(frameAt(tl, later).eventIndex).toBeGreaterThan(m.eventIndex);
    expect(spotlightAt(tl, tl.moments[1].startSec).highlightId).toBe(tl.moments[1].highlightId);
  });

  it("scrubber markers: period starts and moment positions in replay seconds", () => {
    const { tl } = fixtures["401810798"];
    const mk = scrubberMarkers(tl);
    expect(mk.periods.map((p) => p.label)).toEqual(["Q1", "Q2", "Q3", "Q4", "OT1"]);
    expect(mk.periods[0].sec).toBe(0);
    for (let i = 1; i < mk.periods.length; i++) {
      expect(mk.periods[i].sec).toBeGreaterThan(mk.periods[i - 1].sec);
      expect(frameAt(tl, mk.periods[i].sec).periodLabel).toBe(mk.periods[i].label);
      expect(frameAt(tl, mk.periods[i].sec - 1e-3).periodLabel).toBe(mk.periods[i - 1].label);
    }
    expect(mk.moments.map((m) => m.sec)).toEqual(tl.moments.map((m) => m.startSec));
  });
});

describe("pacing", () => {
  it("overtime is included and gets replay time; OT game may use more of the budget", () => {
    const { tl, n } = fixtures["401810798"];
    const ot = tl.periods.find((p) => p.period === 5);
    expect(ot).toBeTruthy();
    expect(ot.endSec - ot.startSec).toBeGreaterThan(10);
    expect(ot.toEventIndex).toBe(n.events.length - 1);
    expect(tl.durationSec).toBeGreaterThan(fixtures["401810791"].tl.durationSec);
  });

  it("a blowout finish gets less replay share than a close finish's final period", () => {
    const blow = periodShare(fixtures["401810792"].tl, 4);
    const close = periodShare(fixtures["401810799"].tl, 4);
    expect(blow).toBeLessThan(close / 2);
    expect(fixtures["401810792"].tl.durationSec).toBeLessThan(fixtures["401810799"].tl.durationSec);
  });

  it("close finish: the last two minutes get more replay time per game second than the opening", () => {
    const { tl, n } = fixtures["401810799"];
    const reveal = revealTimes(tl.segments, n.events.length);
    const span = (pred) => {
      const idx = n.events.filter(pred).map((e) => e.index);
      return (reveal[idx.at(-1)] - reveal[idx[0] - 1 >= 0 ? idx[0] - 1 : idx[0]]) / idx.length;
    };
    const late = span((e) => e.period === 4 && e.clockRemainingSec != null && e.clockRemainingSec <= 120);
    const early = span((e) => e.period === 1);
    expect(late).toBeGreaterThan(2 * early);
  });

  it("hold rule: by type, late bonus, clamped, independent of importance", () => {
    const ev = (period, clock) => ({ period, clockRemainingSec: clock });
    expect(holdSecFor({ type: "steal", importance: 99 }, ev(1, 300))).toBe(1.5);
    expect(holdSecFor({ type: "steal", importance: 1 }, ev(1, 300))).toBe(1.5);
    expect(holdSecFor({ type: "steal" }, ev(4, 60))).toBe(1.8);
    expect(holdSecFor({ type: "turnover" }, ev(5, 200))).toBe(1.6);
    expect(holdSecFor({ type: "unknown" }, ev(2, 10))).toBe(TIMELINE_CONFIG.hold.defaultSec);
    expect(holdSecFor({ type: "game_end" }, ev(4, 0))).toBe(TIMELINE_CONFIG.hold.maxSec);
  });

  it("too many holds: fast spans shrink and budget grows first; holds never below the readable minimum", () => {
    const { n } = fixtures["401810791"];
    const many = Array.from({ length: 50 }, (_, k) => ({ id: `h${k}`, type: "lead_change", eventIndex: 10 * k + 5, keyEventIndex: 10 * k + 5 }));
    const tl = buildTimeline(n, many);
    const holds = tl.segments.filter((s) => s.kind === "hold");
    expect(holds).toHaveLength(50);
    for (const h of holds) expect(h.endSec - h.startSec).toBeGreaterThanOrEqual(TIMELINE_CONFIG.hold.minSec - 1e-9);
    const fast = tl.segments.filter((s) => s.kind === "fast").reduce((a, s) => a + s.endSec - s.startSec, 0);
    expect(fast).toBeGreaterThanOrEqual(TIMELINE_CONFIG.minFastSec - 0.01);
    expect(tl.durationSec).toBeLessThanOrEqual(TIMELINE_CONFIG.maxSec + 0.01);
    const lots = Array.from({ length: 80 }, (_, k) => ({ id: `h${k}`, type: "tie", eventIndex: 6 * k + 1 }));
    const over = buildTimeline(n, lots);
    expect(over.issues.map((i) => i.code)).toContain("timeline_over_budget");
    for (const h of over.segments.filter((s) => s.kind === "hold")) expect(h.endSec - h.startSec).toBeGreaterThanOrEqual(TIMELINE_CONFIG.hold.minSec - 1e-9);
  });

  it("a highlight on a non-final substitution-group member is snapped to the group end", () => {
    const { n } = fixtures["401810791"];
    const groups = {};
    n.events.forEach((e) => {
      if (e.kind === K.SUBSTITUTION && e.substitutionGroup != null) (groups[e.substitutionGroup] ??= []).push(e.index);
    });
    const g = Object.values(groups).find((x) => x.length >= 3 && x.at(-1) - x[0] === x.length - 1);
    const tl = buildTimeline(n, [{ id: "mid", type: "steal", eventIndex: g[0], keyEventIndex: g[0] }]);
    const hold = tl.segments.find((s) => s.kind === "hold");
    expect(hold.eventIndex).toBe(g.at(-1));
    expect(hold.snappedFromEventIndex).toBe(g[0]);
    expect(tl.issues.map((i) => i.code)).toContain("timeline_hold_snapped_to_group_end");
    const reveal = revealTimes(tl.segments, n.events.length);
    for (const i of g) expect(reveal[i]).toBe(reveal[g[0]]);
    expect(frameAt(tl, (hold.startSec + hold.endSec) / 2).eventIndex).toBe(g.at(-1));
  });

  it.each(IDS)("%s: consecutive holds are at least minGapSec apart and readable (W22: up to 20 moments)", (id) => {
    const { tl } = fixtures[id];
    const holds = tl.segments.filter((s) => s.kind === "hold");
    for (const h of holds) expect(h.endSec - h.startSec).toBeGreaterThanOrEqual(TIMELINE_CONFIG.hold.minSec - 1e-9);
    for (let k = 1; k < holds.length; k++) expect(holds[k].startSec - holds[k - 1].endSec).toBeGreaterThanOrEqual(TIMELINE_CONFIG.minGapSec - 0.002);
  });

  it("min gap: adjacent highlights get a stretched fast span; total duration unchanged; more moments grow the target", () => {
    const { n } = fixtures["401810791"];
    const pair = [
      { id: "a", type: "tie", eventIndex: 200, keyEventIndex: 200 },
      { id: "b", type: "lead_change", eventIndex: 201, keyEventIndex: 201 },
    ];
    const tl = buildTimeline(n, pair);
    const [h1, h2] = tl.segments.filter((s) => s.kind === "hold");
    expect(h2.startSec - h1.endSec).toBeCloseTo(TIMELINE_CONFIG.minGapSec, 2);
    expect(tl.durationSec).toBe(tl.targetSec);
    const noGap = buildTimeline(n, pair, { config: { minGapSec: 0 } });
    const [g1, g2] = noGap.segments.filter((s) => s.kind === "hold");
    expect(g2.startSec - g1.endSec).toBeLessThan(TIMELINE_CONFIG.minGapSec);
    const ten = Array.from({ length: 10 }, (_, k) => ({ id: `t${k}`, type: "tie", eventIndex: 40 * k + 20 }));
    const twenty = Array.from({ length: 20 }, (_, k) => ({ id: `w${k}`, type: "tie", eventIndex: 20 * k + 20 }));
    expect(buildTimeline(n, twenty).targetSec - buildTimeline(n, ten).targetSec).toBeCloseTo(10 * TIMELINE_CONFIG.perMomentSec, 3);
  });

  it("durationSec equals the planned fast + hold budget (no rounding drift)", () => {
    for (const id of IDS) {
      const { tl } = fixtures[id];
      expect(tl.durationSec).toBe(tl.targetSec);
    }
  });

  it("invalid highlights are reported, not scheduled; empty games are safe", () => {
    const { n } = fixtures["401810062"];
    const tl = buildTimeline(n, [{ id: "x", eventIndex: 99999 }, { id: "y", eventIndex: -1 }]);
    expect(tl.moments).toEqual([]);
    expect(tl.issues.filter((i) => i.code === "timeline_invalid_highlight")).toHaveLength(2);
    const empty = buildTimeline({ events: [], format: n.format }, []);
    expect(empty.durationSec).toBe(0);
    expect(frameAt(empty, 5).eventIndex).toBe(-1);
    expect(momentNav(empty, 0)).toEqual({ prev: null, next: null });
  });
});
