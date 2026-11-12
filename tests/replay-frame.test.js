import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildReplay } from "@/lib/replay/build";
import { replayChangesAt, replayStateAt } from "@/lib/replay/client-state";
import { composeFrame, createFrameDeriver, defaultTeamId, deriveFrame, eventFields, spotlightFields, timeFields } from "@/lib/replay/frame";
import { frameAt } from "@/lib/replay/timeline";

const FIXTURE_IDS = ["401810062", "401810791", "401810792", "401810798", "401810799"];
const replays = Object.fromEntries(
  FIXTURE_IDS.map((id) => [id, buildReplay(JSON.parse(readFileSync(new URL(`./fixtures/replay/${id}.json`, import.meta.url), "utf8"))).replay]),
);
const replay = replays["401810791"];
const { timeline } = replay;
const holds = timeline.segments.filter((s) => s.kind === "hold");

describe("deriveFrame", () => {
  it("starts at 0–0 with no probability, no spotlight, no event", () => {
    for (const id of FIXTURE_IDS) {
      const f = deriveFrame(replays[id], 0);
      expect(f.sec).toBe(0);
      expect(f.frame.eventIndex).toBe(-1);
      expect(f.state.score).toEqual({ home: 0, away: 0 });
      expect(f.probability.samples).toEqual([]);
      expect(f.probability.current).toBeNull();
      expect(f.spotlight).toBeNull();
      expect(f.event).toBeNull();
      expect(f.changes).toBeNull();
      expect(f.nav.prev).toBeNull();
      expect(f.nav.next?.sec).toBe(replays[id].timeline.moments[0]?.startSec);
    }
  });

  it("holds the event index fixed during a hold", () => {
    expect(holds.length).toBeGreaterThan(0);
    for (const seg of holds) {
      const span = seg.endSec - seg.startSec;
      const indices = [0.01, 0.25, 0.5, 0.75, 0.99].map((t) => deriveFrame(replay, seg.startSec + span * t).frame.eventIndex);
      expect(new Set(indices)).toEqual(new Set([seg.eventIndex]));
      const mid = deriveFrame(replay, seg.startSec + span / 2);
      expect(mid.frame.hold?.highlightId).toBe(seg.highlightId);
      expect(mid.spotlight?.active).toBe(true);
      expect(mid.spotlight?.highlightId).toBe(seg.highlightId);
    }
  });

  it("matches the core lookups at every sampled second (one index for all fields)", () => {
    for (let sec = 0; sec <= timeline.durationSec; sec += 1.7) {
      const f = deriveFrame(replay, sec);
      const i = frameAt(timeline, sec).eventIndex;
      expect(f.frame.eventIndex).toBe(i);
      expect(f.state).toEqual(replayStateAt(replay, i));
      expect(f.state.eventIndex).toBe(i);
      expect(f.changes).toEqual(i >= 0 ? replayChangesAt(replay, i) : null);
      expect(f.probability.samples.every((s) => s.eventIndex <= i)).toBe(true);
      const reached = replay.probability.filter((s) => s.eventIndex <= i).length;
      expect(f.probability.samples).toHaveLength(reached);
      if (f.probability.current) expect(f.probability.current.sourceEventIndex).toBe(f.probability.samples.at(-1).eventIndex);
    }
  });

  it("keeps the spotlight snapshot at the moment's index while the running state advances", () => {
    // A moment followed by a fast span that reveals several events before the next hold.
    const nextFast = (m) => timeline.segments.find((s) => s.kind === "fast" && s.startSec >= m.endSec);
    const moment = timeline.moments.find((m) => nextFast(m) && nextFast(m).toEventIndex > nextFast(m).fromEventIndex + 1);
    const after = nextFast(moment);
    // A point inside the next fast span, after several more events were revealed.
    const sec = after.startSec + (after.endSec - after.startSec) * 0.8;
    const f = deriveFrame(replay, sec);
    expect(f.spotlight.highlightId).toBe(moment.highlightId);
    expect(f.spotlight.active).toBe(false);
    expect(f.spotlight.eventIndex).toBe(moment.eventIndex);
    expect(f.frame.eventIndex).toBeGreaterThan(moment.eventIndex);
    expect(f.spotlight.state).toEqual(replayStateAt(replay, moment.eventIndex));
    expect(f.spotlight.state).not.toEqual(f.state);
    expect(f.spotlight.highlight.id).toBe(moment.highlightId);
    expect(f.nav.prev?.momentIndex).toBe(moment.index);
  });

  it("ends on the final state", () => {
    for (const id of FIXTURE_IDS) {
      const r = replays[id];
      const f = deriveFrame(r, r.timeline.durationSec + 5);
      expect(f.frame.ended).toBe(true);
      expect(f.frame.eventIndex).toBe(r.timeline.lastEventIndex);
      expect(f.state.score).toEqual(r.events.at(-1).score);
      expect(f.nav.next).toBeNull();
    }
  });

  it("composes the same frame from memoizable parts", () => {
    const sec = timeline.durationSec * 0.6;
    const time = timeFields(replay, sec);
    const composed = composeFrame(time, eventFields(replay, time.frame.eventIndex), spotlightFields(replay, time.spotlight));
    expect(composed).toEqual(deriveFrame(replay, sec));
  });

  it("returns fresh state copies (mutation never leaks into later lookups)", () => {
    const a = deriveFrame(replay, 30);
    a.state.score.home = 999;
    expect(deriveFrame(replay, 30).state.score.home).not.toBe(999);
  });
});

describe("createFrameDeriver", () => {
  it("equals deriveFrame and reuses state while the event index is unchanged", () => {
    const derive = createFrameDeriver(replay);
    const seg = holds[0];
    const a = derive(seg.startSec + 0.1);
    const b = derive(seg.startSec + 0.2); // same hold → same event index
    expect(b).toEqual(deriveFrame(replay, seg.startSec + 0.2));
    expect(b.state).toBe(a.state);
    expect(b.spotlight.state).toBe(a.spotlight.state);
    expect(b.sec).not.toBe(a.sec);
    const c = derive(seg.endSec + 4); // later events revealed (holds are ≥ minGapSec apart)
    expect(c.frame.eventIndex).toBeGreaterThan(a.frame.eventIndex);
    expect(c.state).not.toBe(a.state);
    expect(c).toEqual(deriveFrame(replay, seg.endSec + 4));
    expect(derive(0)).toEqual(deriveFrame(replay, 0)); // backward seek
  });
});

describe("defaultTeamId", () => {
  const { home, away } = replay.teams;
  const game = { homeTeam: "Philadelphia 76ers", awayTeam: "Memphis Grizzlies" };

  it("picks an involved favorite", () => {
    expect(defaultTeamId(replay, { ...game, favorite: game.awayTeam })).toBe(away.id);
    expect(defaultTeamId(replay, { ...game, favorite: game.homeTeam })).toBe(home.id);
  });

  it("falls back to home when the favorite is not involved or absent", () => {
    expect(defaultTeamId(replay, { ...game, favorite: "Boston Celtics" })).toBe(home.id);
    expect(defaultTeamId(replay, { ...game, favorite: null })).toBe(home.id);
    expect(defaultTeamId(replay, {})).toBe(home.id);
  });

  it("accepts the payload team name for the favorite", () => {
    expect(defaultTeamId(replay, { favorite: away.name })).toBe(away.id);
  });
});
