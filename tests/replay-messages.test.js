import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildReplay } from "@/lib/replay/build";
import { REASON_CODES } from "@/lib/replay/types";
import { CLIENT_REASONS } from "@/utils/replay-api";
import { spotlightAt } from "@/lib/replay/timeline";
import { STICKY_TOP, stickyHeadTop } from "@/lib/replay/layout";
import {
  ANNOUNCE_MIN_MS,
  ERROR_MESSAGES,
  GENERIC_ERROR,
  GENERIC_UNAVAILABLE,
  REASON_MESSAGES,
  announceDelay,
  capabilityGaps,
  errorMessage,
  reachedMoments,
  reasonMessage,
  teamGapNotes,
  unavailableMessage,
} from "@/lib/replay/messages";

const load = (id) => buildReplay(JSON.parse(readFileSync(new URL(`./fixtures/replay/${id}.json`, import.meta.url), "utf8")));
const ot = load("401810798"); // ready, overtime
const porter = load("401810062"); // Porter Jr. blk unavailable
const holland = load("401810792"); // Holland II 3PT unavailable + DET 3PT teamTotal limited

const hebrew = /[֐-׿]/;

describe("reason → message mapping", () => {
  it("every server REASON_CODE and client reason has an explicit Hebrew message", () => {
    for (const code of [...Object.values(REASON_CODES), ...Object.values(CLIENT_REASONS)]) {
      expect(REASON_MESSAGES, code).toHaveProperty(code);
      expect(REASON_MESSAGES[code]).toMatch(hebrew);
      expect(reasonMessage(code)).toBe(REASON_MESSAGES[code]);
    }
  });

  it("has no stale codes (the table mirrors types.js + CLIENT_REASONS exactly)", () => {
    const known = new Set([...Object.values(REASON_CODES), ...Object.values(CLIENT_REASONS)]);
    for (const code of Object.keys(REASON_MESSAGES)) expect(known.has(code), code).toBe(true);
  });

  it("unknown codes fall back to the generic message", () => {
    expect(reasonMessage("something_new")).toBe(GENERIC_UNAVAILABLE);
    expect(reasonMessage(undefined)).toBe(GENERIC_UNAVAILABLE);
    expect(reasonMessage("hasOwnProperty")).toBe(GENERIC_UNAVAILABLE);
    expect(unavailableMessage(["x_unknown"])).toEqual({ title: "השחזור אינו זמין למשחק הזה", detail: GENERIC_UNAVAILABLE, reason: null });
    expect(unavailableMessage(null).detail).toBe(GENERIC_UNAVAILABLE);
  });

  it("picks the first known reason and titles not-final games differently", () => {
    const m = unavailableMessage(["x_unknown", REASON_CODES.NO_GAME_END, REASON_CODES.NO_PLAYS]);
    expect(m.reason).toBe("no_game_end");
    expect(m.detail).toBe(REASON_MESSAGES.no_game_end);
    expect(unavailableMessage(["game_not_final"]).title).toBe("המשחק עדיין לא הסתיים");
    expect(unavailableMessage([CLIENT_REASONS.NO_ESPN_ID]).detail).toContain("ESPN");
  });

  it("temporary failures map by error code with a generic fallback", () => {
    for (const code of ["network", "upstream", "http", "bad_response"]) expect(errorMessage({ code }).detail).toBe(ERROR_MESSAGES[code]);
    expect(errorMessage({ code: "weird" }).detail).toBe(GENERIC_ERROR);
    expect(errorMessage(null).detail).toBe(GENERIC_ERROR);
  });
});

describe("capability-gap summary", () => {
  it("is empty for a fully reliable replay", () => {
    const gaps = capabilityGaps(ot.replay, ot.capabilities);
    expect(gaps).toEqual({ items: [], probability: true, any: false });
  });

  it("names the player whose blocks are unavailable, only for his team", () => {
    const gaps = capabilityGaps(porter.replay, porter.capabilities);
    expect(gaps.any).toBe(true);
    expect(gaps.items).toHaveLength(1);
    const [item] = gaps.items;
    expect(item).toMatchObject({ kind: "stat", family: "blk", scope: "player", playerIds: ["4278104"], teamIds: ["17"] });
    expect(item.text).toBe("חסימות של M. Porter Jr. אינן זמינות.");
    expect(teamGapNotes(gaps, "17")).toEqual([item.text]);
    const other = porter.replay.teams.away.id;
    expect(teamGapNotes(gaps, other)).toEqual([]);
  });

  it("ignores teamTotal-scoped limits (no team-total row is shown)", () => {
    const gaps = capabilityGaps(holland.replay, holland.capabilities);
    expect(gaps.items.map((i) => [i.family, i.scope])).toEqual([["tpt", "player"]]);
    expect(gaps.items[0].text).toMatch(/^שלשות של .+ אינן זמינות\.$/);
  });

  it("covers game-scope stats, team lineups from a period, and missing probability", () => {
    const { replay } = ot;
    const home = replay.teams.home.id;
    const late = replay.events.findIndex((e) => e.period === 3);
    const caps = [
      { family: "ast", level: "unavailable", reasons: ["stat_mismatch"], scope: "game" },
      { family: "lineups", level: "reliable", reasons: [], scope: "game" },
      { family: "lineups", level: "unavailable", reasons: ["lineup_invalid"], scope: "team", teams: [home], interval: { from: late, to: replay.events.length - 1 } },
      { family: "probability", level: "unavailable", reasons: ["probability_missing"], scope: "game" },
    ];
    const gaps = capabilityGaps(replay, caps);
    expect(gaps.probability).toBe(false);
    expect(gaps.items.map((i) => i.kind)).toEqual(["stat", "lineup", "probability"]);
    expect(gaps.items[0].text).toBe("אסיסטים אינם זמינים בשחזור הזה.");
    expect(gaps.items[0].teamIds).toHaveLength(2);
    expect(gaps.items[1].text).toContain("החל מרבע 3");
    expect(gaps.items[1].teamIds).toEqual([home]);
    // Table notes never include the probability line.
    expect(teamGapNotes(gaps, home)).toHaveLength(2);
    expect(teamGapNotes(gaps, replay.teams.away.id)).toEqual([gaps.items[0].text]);
  });

  it("treats an empty probability series as missing even without a capability entry", () => {
    const gaps = capabilityGaps({ ...ot.replay, probability: [] }, ot.capabilities);
    expect(gaps.probability).toBe(false);
    expect(gaps.items.map((i) => i.kind)).toEqual(["probability"]);
  });
});

describe("reached moments", () => {
  for (const [name, result] of [["ot", ot], ["porter", porter], ["holland", holland]]) {
    it(`${name}: never includes a future moment and matches the spotlight`, () => {
      const { replay } = result;
      const tl = replay.timeline;
      expect(reachedMoments(replay, 0)).toEqual([]);
      expect(reachedMoments(replay, -5)).toEqual([]);
      for (let sec = 0; sec <= tl.durationSec + 1; sec += 0.37) {
        const list = reachedMoments(replay, sec);
        const x = Math.min(sec, tl.durationSec);
        for (const m of list) expect(m.sec).toBeLessThanOrEqual(x);
        const expected = tl.moments.filter((m) => x > 0 && m.startSec <= x).length;
        expect(list).toHaveLength(expected);
        const spot = spotlightAt(tl, sec);
        expect(list.at(-1)?.highlightId ?? null).toBe(spot?.highlightId ?? null);
        list.forEach((m, i) => expect(m.momentIndex).toBe(i));
      }
      const all = reachedMoments(replay, tl.durationSec);
      expect(all).toHaveLength(tl.moments.length);
      for (const m of all) {
        expect(m.caption?.text).toMatch(hebrew);
        expect(m.period).toMatch(/^(רבע \d|הארכה( \d)?)$/);
      }
    });
  }

  it("a moment appears exactly at its hold start, not before", () => {
    const { replay } = ot;
    const m = replay.timeline.moments[2];
    expect(reachedMoments(replay, m.startSec - 0.01).map((x) => x.highlightId)).not.toContain(m.highlightId);
    expect(reachedMoments(replay, m.startSec).map((x) => x.highlightId)).toContain(m.highlightId);
  });
});

describe("announcement pacing and sticky header line", () => {
  it("rate-limits live-region updates", () => {
    expect(announceDelay(0, 1000)).toBe(0);
    expect(announceDelay(1000, 1000)).toBe(ANNOUNCE_MIN_MS);
    expect(announceDelay(1000, 1000 + ANNOUNCE_MIN_MS + 5)).toBe(0);
    expect(announceDelay(1000, 2500, 4000)).toBe(2500);
  });

  it("pins table headers below the sticky bar, or below the tabs without it", () => {
    expect(stickyHeadTop(800)).toBe(STICKY_TOP + 44);
    expect(stickyHeadTop(519)).toBe(STICKY_TOP);
    expect(stickyHeadTop(undefined)).toBe(STICKY_TOP + 44);
  });
});
