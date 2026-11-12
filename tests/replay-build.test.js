import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BUILDER_VERSION, buildReplay, clockDisplay } from "@/lib/replay/build";
import { replayChangesAt, replayStateAt } from "@/lib/replay/client-state";
import { normalizeGame } from "@/lib/replay/normalize";
import { buildStateIndex } from "@/lib/replay/state";
import { frameAt } from "@/lib/replay/timeline";
import { CAPABILITY_FAMILIES as F, CAPABILITY_LEVELS as L, REASON_CODES as R, REPLAY_SCHEMA_VERSION } from "@/lib/replay/types";

const FIXTURE_IDS = ["401810062", "401810791", "401810792", "401810798", "401810799"];
const EXPECTED_STATUS = { "401810062": "limited", "401810791": "ready", "401810792": "limited", "401810798": "ready", "401810799": "ready" };
const raw = Object.fromEntries(FIXTURE_IDS.map((id) => [id, readFileSync(new URL(`./fixtures/replay/${id}.json`, import.meta.url), "utf8")]));
const load = (id) => JSON.parse(raw[id]);
const built = Object.fromEntries(FIXTURE_IDS.map((id) => [id, buildReplay(load(id))]));

// Deterministic PRNG (mulberry32) so failures are reproducible.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const keysDeep = (v, out = new Set()) => {
  if (Array.isArray(v)) v.forEach((x) => keysDeep(x, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) (out.add(k), keysDeep(x, out));
  return out;
};

describe("buildReplay — fixtures", () => {
  it("builds every fixture with the expected status and envelope", () => {
    for (const id of FIXTURE_IDS) {
      const r = built[id];
      expect(r.schemaVersion).toBe(REPLAY_SCHEMA_VERSION);
      expect(r.builderVersion).toBe(BUILDER_VERSION);
      expect(r.espnGameId).toBe(id);
      expect(r.status).toBe(EXPECTED_STATUS[id]);
      expect(Array.isArray(r.capabilities)).toBe(true);
      expect(Array.isArray(r.warnings)).toBe(true);
      expect(Array.isArray(r.reasons)).toBe(true);
      expect(r.replay).not.toBeNull();
      expect(r.replay.highlights.length).toBeGreaterThan(0);
      expect(r.replay.durationSec).toBe(r.replay.timeline.durationSec);
      expect(r.replay.durationSec).toBeGreaterThanOrEqual(60);
      expect(r.replay.durationSec).toBeLessThanOrEqual(120);
      expect(r.replay.state.patches).toHaveLength(r.replay.events.length);
    }
  });

  it("is JSON-serializable and deterministic (byte-identical)", () => {
    for (const id of FIXTURE_IDS) {
      const a = JSON.stringify(built[id]);
      expect(JSON.parse(a)).toEqual(built[id]);
      expect(JSON.stringify(buildReplay(load(id)))).toBe(a);
    }
  });

  it("does not mutate the input summary", () => {
    const s = load("401810798");
    buildReplay(s);
    expect(JSON.stringify(s)).toBe(JSON.stringify(JSON.parse(raw["401810798"])));
  });

  it("excludes unrelated ESPN content, look-ahead evidence and HTML", () => {
    const withExtras = { ...load("401810791"), news: { articles: [{ story: "<p>x</p>" }] }, article: { story: "<p>y</p>" }, videos: [{ id: 1 }], standings: { groups: [] }, pickcenter: [], odds: [] };
    for (const r of [...Object.values(built), buildReplay(withExtras)]) {
      const keys = keysDeep(r);
      for (const k of ["news", "article", "articles", "videos", "standings", "pickcenter", "odds", "verification", "evidence", "captionParams", "text_html", "story", "gameInfo", "meta"]) expect(keys.has(k)).toBe(false);
      const json = JSON.stringify(r);
      expect(json).not.toMatch(/<[a-z/][^>]*>/i);
      expect(json).not.toContain("lookAhead");
      for (const e of r.replay.events) expect(e.text).toBeUndefined();
    }
    expect(JSON.stringify(buildReplay(withExtras))).toBe(JSON.stringify(built["401810791"]));
  });

  it("ships compact teams, players, highlights with precomputed captions and a usable timeline", () => {
    const r = built["401810798"].replay;
    expect(r.teams.home).toMatchObject({ id: "9", side: "home", abbreviation: "GS", name: "Golden State Warriors", nameHe: "ווריורס", color: "fdb927" });
    expect(r.teams.home.logo).toMatch(/^https:\/\//);
    expect(Object.keys(r.players[0]).sort()).toEqual(["dnp", "id", "jersey", "name", "position", "shortName", "starter", "teamId"].sort());
    for (const h of r.highlights) {
      expect(Object.keys(h).sort()).toEqual(["caption", "eventIndex", "groupEndIndex", "groupStartIndex", "id", "keyEventIndex", "playerIds", "teamIds", "type"].sort());
      expect(h.caption.text).toBe(h.caption.parts.map((p) => p.value).join(""));
    }
    const f = frameAt(r.timeline, r.durationSec / 2);
    expect(f.eventIndex).toBeGreaterThanOrEqual(0);
    expect(frameAt(r.timeline, r.durationSec).ended).toBe(true);
  });

  it("client replayStateAt equals server state at random indices, -1 and the end", () => {
    const rand = rng(12);
    for (const id of FIXTURE_IDS) {
      const n = normalizeGame(load(id));
      const idx = buildStateIndex(n);
      const replay = JSON.parse(JSON.stringify(built[id].replay)); // as the client receives it
      const last = n.events.length - 1;
      const points = [-1, 0, last, last + 50, -10, ...Array.from({ length: 60 }, () => Math.floor(rand() * (last + 2)) - 1)];
      for (const i of points) expect(replayStateAt(replay, i)).toEqual(idx.stateAt(i));
    }
  });

  it("client states are fresh copies", () => {
    const replay = built["401810791"].replay;
    const a = replayStateAt(replay, 100);
    a.score.home = -1;
    a.lineups.teams[replay.teams.home.id].onCourt.length = 0;
    expect(replayStateAt(replay, 100)).not.toEqual(a);
  });

  it("replayChangesAt returns a copy that cannot corrupt later lookups", () => {
    const replay = JSON.parse(JSON.stringify(built["401810798"].replay));
    const idx = buildStateIndex(normalizeGame(load("401810798")));
    const i = replay.state.patches.findIndex((p) => p.players && p.lineups === undefined);
    const ch = replayChangesAt(replay, i);
    expect(ch).toEqual(replay.state.patches[i]);
    for (const row of Object.values(ch.players)) for (const k of Object.keys(row)) row[k] = 999;
    ch.score = { home: -5, away: -5 };
    expect(replayStateAt(replay, i)).toEqual(idx.stateAt(i));
    expect(replayStateAt(replay, i + 40)).toEqual(idx.stateAt(i + 40));
    expect(replayChangesAt(replay, 1e6)).toBeNull();
  });

  it("orders players per team: starters (box order), then bench by jersey", () => {
    for (const id of FIXTURE_IDS) {
      const r = built[id].replay;
      const n = normalizeGame(load(id));
      expect(r.players).toHaveLength(n.players.length);
      for (const teamId of [r.teams.home.id, r.teams.away.id]) {
        const team = r.players.filter((p) => p.teamId === teamId);
        const starters = team.filter((p) => p.starter);
        expect(starters).toHaveLength(5);
        expect(team.slice(0, 5)).toEqual(starters);
        expect(starters.map((p) => p.id)).toEqual(n.players.filter((p) => p.teamId === teamId && p.starter).map((p) => p.id));
        const jerseys = team.slice(5).map((p) => (/^\d+$/.test(p.jersey ?? "") ? Number(p.jersey) : Infinity));
        expect(jerseys).toEqual([...jerseys].sort((a, b) => a - b));
      }
      expect(r.players.findIndex((p) => p.teamId === r.teams.away.id)).toBe(r.players.filter((p) => p.teamId === r.teams.home.id).length);
    }
  });

  it("formats clocks like the scoreboard", () => {
    expect(clockDisplay(720)).toBe("12:00");
    expect(clockDisplay(65.4)).toBe("1:05");
    expect(clockDisplay(59.96)).toBe("59.9");
    expect(clockDisplay(8.2)).toBe("8.2");
    expect(clockDisplay(0)).toBe("0.0");
    expect(clockDisplay(null)).toBeNull();
  });
});

describe("buildReplay — unavailable and limited variants", () => {
  it("non-final game → unavailable, replay null, no highlights", () => {
    const s = load("401810791");
    s.header.competitions[0].status.type = { ...s.header.competitions[0].status.type, completed: false, state: "in", name: "STATUS_IN_PROGRESS" };
    const r = buildReplay(s);
    expect(r.status).toBe("unavailable");
    expect(r.reasons).toContain(R.GAME_NOT_FINAL);
    expect(r.replay).toBeNull();
    expect(JSON.stringify(r)).not.toContain("highlight");
  });

  it("truncated play-by-play → unavailable, replay null", () => {
    const s = load("401810798");
    s.plays = s.plays.slice(0, 300);
    const r = buildReplay(s);
    expect(r.status).toBe("unavailable");
    expect(r.replay).toBeNull();
    expect(r.reasons.length).toBeGreaterThan(0);
  });

  it("garbage input → unavailable without throwing", () => {
    for (const s of [null, {}, { plays: [] }]) {
      const r = buildReplay(s);
      expect(r.status).toBe("unavailable");
      expect(r.replay).toBeNull();
      expect(JSON.parse(JSON.stringify(r))).toEqual(r);
    }
  });

  it("oversized input → unavailable fast with input_too_large", () => {
    const s = load("401810791");
    const plays = [];
    while (plays.length < 20000) plays.push(...s.plays);
    s.plays = plays;
    const t0 = performance.now();
    const r = buildReplay(s);
    expect(performance.now() - t0).toBeLessThan(20);
    expect(r.status).toBe("unavailable");
    expect(r.reasons).toEqual([R.INPUT_TOO_LARGE]);
    expect(r.replay).toBeNull();
    expect(r.capabilities.every((c) => c.level === L.UNAVAILABLE)).toBe(true);
    expect(r.warnings[0].detail).toMatch(/plays/);
    // Configurable cap.
    expect(buildReplay(load("401810791"), { config: { limits: { maxPlays: 100 } } }).reasons).toEqual([R.INPUT_TOO_LARGE]);
  });

  it("missing winprobability → limited, probability unavailable, payload usable", () => {
    const s = load("401810791");
    delete s.winprobability;
    const r = buildReplay(s);
    expect(r.status).toBe("limited");
    expect(r.capabilities.find((c) => c.family === F.PROBABILITY && c.scope === "game").level).toBe(L.UNAVAILABLE);
    expect(r.replay).not.toBeNull();
    expect(r.replay.probability).toEqual([]);
    expect(r.replay.highlights.length).toBeGreaterThan(0);
    const last = r.replay.events.length - 1;
    const end = replayStateAt(r.replay, last);
    expect(end.probability).toBeNull();
    expect(end.score).toEqual(built["401810791"].replay.events[last].score);
    const idx = buildStateIndex(normalizeGame(s));
    for (const i of [-1, 10, 250, last]) expect(replayStateAt(r.replay, i)).toEqual(idx.stateAt(i));
  });
});
