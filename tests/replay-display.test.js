import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildReplay } from "@/lib/replay/build";
import { deriveFrame } from "@/lib/replay/frame";
import {
  eventRevealSecs,
  familyAvailable,
  formatReplayTime,
  gameClockStatus,
  hePeriodLabel,
  initials,
  momentTeamId,
  panelColor,
  probabilityAvailable,
  probabilityPath,
  probabilityPercents,
  scrubberValueText,
  spotlightStatLine,
} from "@/lib/replay/display";
import { frameAt } from "@/lib/replay/timeline";

const load = (id) => buildReplay(JSON.parse(readFileSync(new URL(`./fixtures/replay/${id}.json`, import.meta.url), "utf8")));
const ot = load("401810798"); // overtime game
const limited = load("401810062"); // Porter Jr. blk unavailable
const replay = ot.replay;

describe("labels", () => {
  it("period labels match captions wording", () => {
    expect(hePeriodLabel(1)).toBe("רבע 1");
    expect(hePeriodLabel(4)).toBe("רבע 4");
    expect(hePeriodLabel(5)).toBe("הארכה");
    expect(hePeriodLabel(6)).toBe("הארכה 2");
    expect(hePeriodLabel(0)).toBeNull();
  });

  it("replay time and initials", () => {
    expect(formatReplayTime(0)).toBe("0:00");
    expect(formatReplayTime(89.9)).toBe("1:29");
    expect(initials("Gary Trent Jr.")).toBe("GT");
    expect(initials("Michael Porter Jr.")).toBe("MP");
    expect(initials("Shai Gilgeous-Alexander")).toBe("SA");
    expect(initials("Nenê")).toBe("N");
  });
});

describe("gameClockStatus", () => {
  it("reads 'before tip-off' at event −1, not Q1", () => {
    const f = deriveFrame(replay, 0);
    expect(gameClockStatus(f)).toEqual({ phase: "pre", label: "לפני פתיחה", clock: null });
  });

  it("shows period + decimal-capable clock while live, and the end label", () => {
    const mid = deriveFrame(replay, replay.timeline.durationSec / 2);
    const s = gameClockStatus(mid);
    expect(s.phase).toBe("live");
    expect(s.label).toBe(hePeriodLabel(mid.event.period));
    expect(s.clock).toBe(mid.event.clock);
    const sub = replay.events.find((e) => e.clockSec < 60);
    expect(sub.clock).toMatch(/^\d+\.\d$/);
    const end = deriveFrame(replay, replay.timeline.durationSec);
    expect(gameClockStatus(end)).toEqual({ phase: "end", label: "סיום · אחרי הארכה", clock: null });
  });

  it("scrubber value text names replay time and game time", () => {
    const f = deriveFrame(replay, 42.3);
    expect(scrubberValueText(f)).toBe(`0:42 מתוך ${formatReplayTime(replay.timeline.durationSec)} · ${hePeriodLabel(f.event.period)} ${f.event.clock}`);
    expect(scrubberValueText(deriveFrame(replay, 0))).toMatch(/^0:00 מתוך .* · לפני פתיחה$/);
  });
});

describe("probability", () => {
  it("availability follows capability and payload", () => {
    expect(probabilityAvailable(replay, ot.capabilities)).toBe(true);
    expect(probabilityAvailable({ ...replay, probability: [] }, ot.capabilities)).toBe(false);
    const caps = ot.capabilities.map((c) => (c.family === "probability" ? { ...c, level: "unavailable" } : c));
    expect(probabilityAvailable(replay, caps)).toBe(false);
  });

  it("percents have no invented initial value", () => {
    expect(probabilityPercents(null)).toBeNull();
    expect(probabilityPercents({ home: 0.673, tie: 0 })).toEqual({ home: 67, away: 33 });
  });

  it("path covers only reached samples and shrinks on backward seek", () => {
    const reveal = eventRevealSecs(replay.timeline);
    expect(reveal.length).toBe(replay.events.length);
    expect(reveal.every((s) => typeof s === "number")).toBe(true);
    // Reveal times agree with frameAt (event revealed at its reveal second).
    for (const i of [0, 100, 300, replay.events.length - 1]) expect(frameAt(replay.timeline, reveal[i]).eventIndex).toBeGreaterThanOrEqual(i);
    const dur = replay.timeline.durationSec;
    const late = deriveFrame(replay, dur * 0.8);
    const early = deriveFrame(replay, dur * 0.3);
    expect(probabilityPath([], reveal, dur, 0)).toBeNull();
    const pLate = probabilityPath(late.probability.samples, reveal, dur, late.sec);
    const pEarly = probabilityPath(early.probability.samples, reveal, dur, early.sec);
    expect(pEarly.d.length).toBeLessThan(pLate.d.length);
    // RTL: the curve never extends past (left of) the current position.
    const xs = (d) => [...d.matchAll(/[MH]([\d.]+)/g)].map((m) => Number(m[1]));
    const minX = Math.min(...xs(pEarly.d));
    expect(minX).toBeCloseTo(1000 - (early.sec / dur) * 1000, 0);
    expect(probabilityPath(early.probability.samples, reveal, dur, null).end.x).toBeNull();
  });
});

describe("spotlight stats", () => {
  it("uses the snapshot and omits unavailable families", () => {
    const { replay: r, capabilities } = limited;
    const porter = r.players.find((p) => p.name === "Michael Porter Jr.");
    expect(porter).toBeTruthy();
    expect(familyAvailable(capabilities, "blk", { playerId: porter.id, teamId: porter.teamId })).toBe(false);
    expect(familyAvailable(capabilities, "pts", { playerId: porter.id, teamId: porter.teamId })).toBe(true);
    const state = { players: { [porter.id]: { pts: 7, fgm: 3, fga: 5, tpm: 1, tpa: 2, ftm: 0, fta: 0, reb: 2, ast: 1, stl: 0, blk: 4 } } };
    const line = spotlightStatLine(state, porter, capabilities, 10);
    expect(line.map((s) => s.key)).toEqual(["pts", "fg", "tpt", "reb", "ast"]);
    expect(line[0].value).toBe("7");
  });
});

describe("momentTeamId", () => {
  const teams = replay.teams; // home GS (9), away CHI (4)
  const players = replay.players;
  const homePlayer = players.find((p) => p.teamId === teams.home.id);
  const awayPlayer = players.find((p) => p.teamId === teams.away.id);
  const both = [teams.away.id, teams.home.id];

  it("overtime (both teams listed) is neutral — real fixture moment", () => {
    const ot = replay.highlights.find((h) => h.type === "overtime");
    expect(ot.teamIds).toEqual(both);
    expect(momentTeamId(ot, { players, teams, score: { home: 110, away: 110 } })).toBeNull();
  });

  it("game_end credits the winner from the snapshot score, neutral when tied/unknown", () => {
    const end = { type: "game_end", playerIds: [], teamIds: both };
    expect(momentTeamId(end, { players, teams, score: { home: 124, away: 130 } })).toBe(teams.away.id);
    expect(momentTeamId(end, { players, teams, score: { home: 112, away: 104 } })).toBe(teams.home.id);
    expect(momentTeamId(end, { players, teams, score: { home: 100, away: 100 } })).toBeNull();
    expect(momentTeamId(end, { players, teams })).toBeNull();
  });

  it("team-only and player moments", () => {
    expect(momentTeamId({ type: "turnover", playerIds: [], teamIds: [teams.home.id] }, { players, teams })).toBe(teams.home.id);
    expect(momentTeamId({ type: "big_shot", playerIds: [awayPlayer.id], teamIds: [teams.away.id] }, { players, teams })).toBe(teams.away.id);
    // Player's team wins over a listed pair.
    expect(momentTeamId({ type: "tie", playerIds: [homePlayer.id], teamIds: both }, { players, teams })).toBe(teams.home.id);
    for (const h of replay.highlights.filter((x) => x.playerIds.length)) {
      expect(momentTeamId(h, { players, teams })).toBe(players.find((p) => p.id === h.playerIds[0]).teamId);
    }
  });
});

describe("panelColor", () => {
  it("lifts dark OKLCH colors, keeps light ones and other formats", () => {
    expect(panelColor("oklch(0.32 0.10 256)")).toBe("oklch(0.62 0.10 256)");
    expect(panelColor("oklch(0.78 0.16 81)")).toBe("oklch(0.78 0.16 81)");
    expect(panelColor("#123456")).toBe("#123456");
  });
});
