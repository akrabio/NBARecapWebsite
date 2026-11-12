import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CAPTION_MAX_LENGTH, CAPTION_TYPES, captionFor, formatClock, formatScore, periodLabel } from "@/lib/replay/captions";
import { HIGHLIGHT_TYPES as T, buildHighlights } from "@/lib/replay/highlights";
import { normalizeGame } from "@/lib/replay/normalize";
import { CAPABILITY_FAMILIES as F, CAPABILITY_LEVELS as L } from "@/lib/replay/types";
import { validateReplay } from "@/lib/replay/validate";

const FIXTURES = Object.keys(JSON.parse(readFileSync("tests/fixtures/replay/manifest.json", "utf8")).fixtures).sort();
const UNAVAILABLE = new Set(["401909293"]); // genuinely unavailable replay (no highlights)
const games = Object.fromEntries(
  FIXTURES.map((id) => {
    const normalized = normalizeGame(JSON.parse(readFileSync(`tests/fixtures/replay/${id}.json`, "utf8")));
    return [id, { normalized, highlights: buildHighlights(normalized).highlights }];
  }),
);

// Synthetic context: home Boston (1), away Toronto (2).
const ctx = {
  teams: { home: { id: "1", name: "Boston Celtics", shortName: "Celtics" }, away: { id: "2", name: "Toronto Raptors", shortName: "Raptors" } },
  players: [
    { id: "p1", teamId: "1", name: "Jayson Tatum", shortName: "J. Tatum" },
    { id: "p2", teamId: "2", name: "Scottie Barnes", shortName: "S. Barnes" },
    { id: "p3", teamId: "1", name: "Jaylen Brown", shortName: "J. Brown" },
  ],
  format: { regulationPeriods: 4 },
};
const hl = (type, captionParams, extra = {}) => ({ id: `${type}-1`, type, captionParams, evidence: {}, playerIds: [], teamIds: [], ...extra });
const OT_WORDS = /הארכה|ניצחון|ניצח|הפסד|סיום:/;

function assertClean(c) {
  expect(c).toBeTruthy();
  expect(c.text.length).toBeGreaterThan(0);
  expect(c.text.length).toBeLessThanOrEqual(CAPTION_MAX_LENGTH);
  expect(c.text).not.toMatch(/undefined|null|NaN|\[object/);
  expect(c.text).not.toMatch(/[<>]/);
  expect(c.parts.map((p) => p.value).join("")).toBe(c.text);
  for (const p of c.parts) expect(typeof p.value).toBe("string");
}

describe("formatting helpers", () => {
  it("formats scores with an en dash", () => {
    expect(formatScore(104, 104)).toBe("104–104");
    expect(formatScore(98, null)).toBeNull();
    expect(formatScore(NaN, 1)).toBeNull();
  });
  it("formats clocks: M:SS at/above a minute, decimal seconds below", () => {
    expect(formatClock(406)).toBe("6:46");
    expect(formatClock(60)).toBe("1:00");
    expect(formatClock(59.9)).toBe("59.9 שנ׳");
    expect(formatClock(8.2)).toBe("8.2 שנ׳");
    expect(formatClock(0)).toBe("0.0 שנ׳");
    expect(formatClock(null)).toBeNull();
    expect(formatClock(-1)).toBeNull();
  });
  it("labels periods", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((p) => periodLabel(p))).toEqual(["רבע 1", "רבע 2", "רבע 3", "רבע 4", "הארכה", "הארכה 2", "הארכה 3"]);
    expect(periodLabel(0)).toBeNull();
    expect(periodLabel(undefined)).toBeNull();
  });
});

describe("templates", () => {
  it("has a template for every highlight type", () => {
    expect([...CAPTION_TYPES].sort()).toEqual(Object.values(T).sort());
  });

  it("returns null for unknown types", () => {
    expect(captionFor(hl("mystery", {}), ctx)).toBeNull();
    expect(captionFor(null, ctx)).toBeNull();
  });

  it("produces a clean caption for every type with player and team variants", () => {
    const base = { teamId: "1", scoreHome: 104, scoreAway: 104, period: 4, clockSec: 8.2 };
    const byType = {
      [T.TIE]: { ...base, playerId: "p1", action: "field_goal", shotValue: 3 },
      [T.GO_AHEAD]: { ...base, playerId: "p1", scoreHome: 106 },
      [T.LEAD_CHANGE]: { ...base, playerId: "p1", scoreHome: 106, viaTie: 1 },
      [T.FIRST_LEAD_SINCE]: { ...base, playerId: "p1", scoreHome: 106, sincePeriod: 1, sinceClockSec: 300 },
      [T.FIRST_LEAD]: { ...base, playerId: "p1", scoreHome: 106 },
      [T.BIG_SHOT]: { ...base, playerId: "p1", shotValue: 3, scoreHome: 107 },
      [T.STEAL]: { ...base, playerId: "p1", followedBy: "score", scorerId: "p3", scoreHome: 106 },
      [T.TURNOVER]: { ...base, playerId: "p1" },
      [T.BLOCK]: { ...base, playerId: "p1", stake: "tie", shotValue: 2 },
      [T.MISSED_FINAL_ATTEMPT]: { ...base, playerId: "p1", stake: "win", shotValue: 3 },
      [T.FOUL_OUT]: { teamId: "1", playerId: "p1", fouls: 6, period: 4, clockSec: 25.2 },
      [T.LEAD_MILESTONE]: { ...base, playerId: "p1", threshold: 20, lead: 21, scoreHome: 60, scoreAway: 39, period: 2, clockSec: 400 },
      [T.SCORING_RUN]: { teamId: "1", runPoints: 12, scoreHome: 40, scoreAway: 28, period: 2, clockSec: 300 },
      [T.PLAYER_MILESTONE]: { teamId: "1", playerId: "p1", milestone: "points", threshold: 30, pts: 31, period: 3, clockSec: 200 },
      [T.CLOSING_BASKET]: { teamId: "1", playerId: "p1", action: "field_goal", shotValue: 3, scoreHome: 30, scoreAway: 25, period: 1, clockSec: 0.4 },
      [T.MISSED_LATE_ATTEMPT]: { ...base, playerId: "p1", stake: "go_ahead", shotValue: 3, scoreHome: 102, clockSec: 15.3 },
      [T.PERIOD_END]: { teamId: "1", lead: 5, scoreHome: 30, scoreAway: 25, endedPeriod: 1 },
      [T.OVERTIME]: { scoreHome: 104, scoreAway: 104, endedPeriod: 4, nextPeriod: 5, overtimeNumber: 1 },
      [T.GAME_END]: { scoreHome: 104, scoreAway: 106, winnerTeamId: "2", period: 4 },
    };
    for (const [type, params] of Object.entries(byType)) {
      const withPlayer = captionFor(hl(type, params), ctx);
      assertClean(withPlayer);
      const { playerId, scorerId, ...teamOnly } = params;
      void playerId;
      void scorerId;
      const team = captionFor(hl(type, teamOnly), ctx);
      assertClean(team);
      expect(team.parts.some((p) => p.t === "player")).toBe(false);
    }
  });

  it("uses Hebrew short team names with the right prefixes", () => {
    const c = captionFor(hl(T.GO_AHEAD, { teamId: "1", playerId: "p1", scoreHome: 106, scoreAway: 104, period: 3, clockSec: 300 }), ctx);
    expect(c.text).toBe("J. Tatum מעלה את הסלטיקס ליתרון — 106–104");
    const team = captionFor(hl(T.TIE, { teamId: "2", scoreHome: 104, scoreAway: 104, period: 2, clockSec: 300, action: "free_throw" }), ctx);
    expect(team.text).toBe("הראפטורס משווים מהקו — 104–104");
  });

  it("uses neutral wording and evidence-backed lead-change phrasing", () => {
    const base = { teamId: "1", playerId: "p1", scoreHome: 106, scoreAway: 104, period: 3, clockSec: 300 };
    expect(captionFor(hl(T.BIG_SHOT, { ...base, shotValue: 3 }), ctx).text).toBe("J. Tatum קולע שלשה — 106–104");
    expect(captionFor(hl(T.BIG_SHOT, { ...base, shotValue: 2 }), ctx).text).toBe("סל של J. Tatum — 106–104");
    expect(captionFor(hl(T.BIG_SHOT, base), ctx).text).not.toMatch(/גדול/);
    expect(captionFor(hl(T.GO_AHEAD, { ...base, action: "free_throw" }), ctx).text).toBe("J. Tatum מעלה את הסלטיקס ליתרון מהקו — 106–104");
    // Led earlier (past-only evidence) → "returns the lead"; otherwise plain go-ahead wording.
    const led = captionFor(hl(T.LEAD_CHANGE, base, { evidence: { lastLed: { eventIndex: 3, period: 1, clockSec: 400 } } }), ctx);
    expect(led.text).toBe("J. Tatum מחזיר את היתרון לסלטיקס — 106–104");
    const never = captionFor(hl(T.LEAD_CHANGE, base, { evidence: { lastLed: null } }), ctx);
    expect(never.text).toBe("J. Tatum מעלה את הסלטיקס ליתרון — 106–104");
    expect(captionFor(hl(T.FOUL_OUT, { teamId: "1", playerId: "p1", fouls: 6, period: 2, clockSec: 300 }), ctx).text).toBe("J. Tatum נפסל בעבירה השישית");
  });

  it("puts the subject team's score first and appends the clock late in the game", () => {
    const c = captionFor(hl(T.LEAD_CHANGE, { teamId: "2", playerId: "p2", scoreHome: 98, scoreAway: 99, period: 4, clockSec: 8.2 }), ctx);
    expect(c.parts.find((p) => p.t === "score").value).toBe("99–98");
    expect(c.parts.find((p) => p.t === "clock").value).toBe("8.2");
    expect(c.text).toContain("8.2 שנ׳ לסיום");
    // Early in the game: no clock suffix.
    const early = captionFor(hl(T.LEAD_CHANGE, { teamId: "2", playerId: "p2", scoreHome: 30, scoreAway: 31, period: 2, clockSec: 20 }), ctx);
    expect(early.parts.some((p) => p.t === "clock")).toBe(false);
  });

  it("never names a player missing from the roster (team-level fallback)", () => {
    const c = captionFor(hl(T.TIE, { teamId: "1", playerId: "ghost", scoreHome: 10, scoreAway: 10, period: 1, clockSec: 300 }), ctx);
    expect(c.parts.some((p) => p.t === "player")).toBe(false);
    expect(c.parts.some((p) => p.t === "team" && p.teamId === "1")).toBe(true);
  });

  it("never names unchecked secondary roles (turnover victim, blocked shooter, blocker on a miss)", () => {
    const steal = captionFor(hl(T.STEAL, { teamId: "1", playerId: "p1", turnoverPlayerId: "p2", scoreHome: 50, scoreAway: 50, period: 4, clockSec: 30 }), ctx);
    expect(steal.parts.filter((p) => p.t === "player").map((p) => p.playerId)).toEqual(["p1"]);
    const block = captionFor(hl(T.BLOCK, { teamId: "1", playerId: "p1", shooterId: "p2", stake: "tie", shotValue: 2, scoreHome: 50, scoreAway: 48, period: 4, clockSec: 30 }), ctx);
    expect(block.parts.filter((p) => p.t === "player").map((p) => p.playerId)).toEqual(["p1"]);
    const miss = captionFor(hl(T.MISSED_FINAL_ATTEMPT, { teamId: "2", playerId: "p2", blockerId: "p1", stake: "tie", shotValue: 2, scoreHome: 50, scoreAway: 48, period: 4, clockSec: 1 }), ctx);
    expect(miss.parts.filter((p) => p.t === "player").map((p) => p.playerId)).toEqual(["p2"]);
  });

  it("does not claim a three without shotValue or a stake without evidence", () => {
    const c = captionFor(hl(T.BLOCK, { teamId: "1", playerId: "p1", scoreHome: 50, scoreAway: 48, period: 4, clockSec: 30 }), ctx);
    expect(c.text).not.toMatch(/שלשה|להשוות|יתרון|הפער/);
    const miss = captionFor(hl(T.MISSED_FINAL_ATTEMPT, { teamId: "1", playerId: "p1", scoreHome: 50, scoreAway: 50, period: 4, clockSec: 1 }), ctx);
    expect(miss.text).not.toMatch(/שלשה|להשוות|להכריע/);
    const tie = captionFor(hl(T.TIE, { teamId: "1", playerId: "p1", action: "field_goal", scoreHome: 50, scoreAway: 50, period: 2, clockSec: 300 }), ctx);
    expect(tie.text).not.toMatch(/שלשה/);
  });

  it("first_lead_since without a since period falls back to plain go-ahead wording", () => {
    const c = captionFor(hl(T.FIRST_LEAD_SINCE, { teamId: "1", playerId: "p1", scoreHome: 50, scoreAway: 48, period: 3, clockSec: 300 }), ctx);
    expect(c.text).not.toMatch(/ראשון|מאז/);
    const same = captionFor(hl(T.FIRST_LEAD_SINCE, { teamId: "1", playerId: "p1", scoreHome: 50, scoreAway: 48, period: 3, clockSec: 100, sincePeriod: 3, sinceClockSec: 525 }), ctx);
    expect(same.text).toContain("מאז 8:45 ברבע השלישי");
    const prev = captionFor(hl(T.FIRST_LEAD_SINCE, { teamId: "1", playerId: "p1", scoreHome: 50, scoreAway: 48, period: 4, clockSec: 100, sincePeriod: 2, sinceClockSec: 525 }), ctx);
    expect(prev.text).toBe("J. Tatum מעלה את הסלטיקס ליתרון ראשון מאז הרבע השני — 50–48");
    const ot = captionFor(hl(T.FIRST_LEAD_SINCE, { teamId: "1", scoreHome: 50, scoreAway: 48, period: 6, clockSec: 100, sincePeriod: 5, sinceClockSec: 200 }), ctx);
    expect(ot.text).toContain("מאז ההארכה");
  });

  it("missed final attempt is chronology-safe; overtime announces OT", () => {
    for (const stake of ["win", "tie", undefined]) {
      for (const period of [4, 5]) {
        const c = captionFor(hl(T.MISSED_FINAL_ATTEMPT, { teamId: "1", playerId: "p1", stake, shotValue: 3, scoreHome: 104, scoreAway: 104, period, clockSec: 0.5 }), ctx);
        assertClean(c);
        expect(c.text).not.toMatch(OT_WORDS);
        expect(c.text).not.toMatch(/אחרונ/); // "last shot" would be a look-ahead claim
        if (stake === undefined) expect(c.text).toMatch(/^J\. Tatum מחטיא שלשה — /);
      }
    }
    const ot = captionFor(hl(T.OVERTIME, { scoreHome: 118, scoreAway: 118, endedPeriod: 4, nextPeriod: 5, overtimeNumber: 1 }), ctx);
    expect(ot.text).toBe("שוויון 118–118 בסיום הזמן החוקי — יוצאים להארכה");
    const ot2 = captionFor(hl(T.OVERTIME, { scoreHome: 120, scoreAway: 120, endedPeriod: 5, nextPeriod: 6, overtimeNumber: 2 }), ctx);
    expect(ot2.text).toBe("שוויון 120–120 בסיום ההארכה — יוצאים להארכה שנייה");
    const ot3 = captionFor(hl(T.OVERTIME, { scoreHome: 125, scoreAway: 125, endedPeriod: 6, nextPeriod: 7, overtimeNumber: 3 }), ctx);
    expect(ot3.text).toBe("שוויון 125–125 בסיום ההארכה השנייה — יוצאים להארכה שלישית");
  });

  it("never reads evidence.verification (poisoned look-ahead)", () => {
    const poison = "POISON_LOOKAHEAD";
    const verification = { lookAhead: true, periodEndIndex: poison, nextPeriodFirstIndex: poison };
    for (const type of Object.values(T)) {
      const evidence = { scoreAfter: { home: 1, away: 1 } };
      Object.defineProperty(evidence, "verification", {
        enumerable: true,
        get() {
          throw new Error("verification must not be read");
        },
      });
      const h = hl(type, { teamId: "1", playerId: "p1", scoreHome: 104, scoreAway: 104, period: 4, clockSec: 3, endedPeriod: 4, nextPeriod: 5, winnerTeamId: "1", lead: 20, fouls: 6, runPoints: 10, milestone: "points", pts: 20 }, { evidence, verification });
      const c = captionFor(h, ctx);
      expect(c.text).not.toContain(poison);
    }
  });

  it("strips bidi controls from source strings and keeps them plain text", () => {
    const evil = { ...ctx, players: [{ id: "x", teamId: "1", shortName: "\u202eEvil <b>Name</b>\u0000" }] };
    const c = captionFor(hl(T.TURNOVER, { teamId: "1", playerId: "x", scoreHome: 1, scoreAway: 1, period: 1, clockSec: 300 }), evil);
    const name = c.parts.find((p) => p.t === "player").value;
    expect(name).not.toMatch(/[\u202e\u0000]/);
    expect(name).toBe("Evil bName/b"); // angle brackets stripped (defense in depth); UI still renders text nodes
  });

  it("flags names, scores, clocks and numbers for bidi isolation", () => {
    const c = captionFor(hl(T.LEAD_MILESTONE, { teamId: "1", playerId: "p1", lead: 21, threshold: 20, scoreHome: 60, scoreAway: 39, period: 4, clockSec: 30 }), ctx);
    const kinds = new Set(c.parts.map((p) => p.t));
    for (const k of ["player", "team", "score", "clock", "number"]) expect(kinds.has(k)).toBe(true);
    for (const p of c.parts) {
      if (p.t === "text") expect(p.isolate).toBeUndefined();
      else expect(p.isolate).toBe(true);
      if (["score", "clock", "number"].includes(p.t)) expect(p.dir).toBe("ltr");
      if (["player", "team"].includes(p.t)) expect(p.dir).toBe("auto");
    }
  });
});

describe("W22 caption templates", () => {
  const cap = (type, params) => captionFor(hl(type, params), ctx);
  it("scoring run: the run so far as an isolated LTR number, then the score", () => {
    const c = cap(T.SCORING_RUN, { teamId: "1", runPoints: 12, scoreHome: 40, scoreAway: 28, period: 2, clockSec: 300 });
    expect(c.text).toBe("ריצת 12–0 של הסלטיקס — 40–28");
    expect(c.parts.find((p) => p.value === "12–0")).toMatchObject({ t: "number", dir: "ltr", isolate: true });
    expect(cap(T.SCORING_RUN, { teamId: "1", scoreHome: 40, scoreAway: 28 })).toBeNull(); // no run evidence → nothing to say
  });

  it("player milestones state the value at the moment; double/triple-double list their stats", () => {
    expect(cap(T.PLAYER_MILESTONE, { teamId: "1", playerId: "p1", milestone: "points", threshold: 30, pts: 31, period: 3, clockSec: 200 }).text).toBe("J. Tatum מגיע ל-31 נקודות");
    expect(cap(T.PLAYER_MILESTONE, { teamId: "1", playerId: "p1", milestone: "double_double", stat1: "pts", value1: 14, stat2: "reb", value2: 10, period: 3, clockSec: 200 }).text).toBe("J. Tatum משלים דאבל-דאבל: 14 נק׳ ו-10 ריב׳");
    expect(cap(T.PLAYER_MILESTONE, { teamId: "1", playerId: "p1", milestone: "triple_double", stat1: "pts", value1: 20, stat2: "reb", value2: 11, stat3: "ast", value3: 10, period: 4, clockSec: 100 }).text).toBe("J. Tatum משלים טריפל-דאבל: 20 נק׳, 11 ריב׳ ו-10 אס׳");
    // Unknown player → team-level wording; incomplete stats → null.
    expect(cap(T.PLAYER_MILESTONE, { teamId: "1", playerId: "nobody", milestone: "points", threshold: 20, pts: 20 }).text).toBe("שחקן של הסלטיקס מגיע ל-20 נקודות");
    expect(cap(T.PLAYER_MILESTONE, { teamId: "1", playerId: "p1", milestone: "double_double", stat1: "pts", value1: 14 })).toBeNull();
  });

  it("closing basket states the shot's own clock and period; period end states the boundary", () => {
    expect(cap(T.CLOSING_BASKET, { teamId: "1", playerId: "p1", shotValue: 3, scoreHome: 30, scoreAway: 25, period: 1, clockSec: 0.4 }).text).toBe("J. Tatum קולע שלשה, 0.4 שנ׳ לסיום הרבע הראשון — 30–25");
    expect(cap(T.CLOSING_BASKET, { teamId: "2", playerId: "p2", shotValue: 2, scoreHome: 30, scoreAway: 27, period: 3, clockSec: 0 }).text).toBe("סל של S. Barnes עם סיום הרבע השלישי — 27–30");
    expect(cap(T.PERIOD_END, { teamId: "1", lead: 5, scoreHome: 30, scoreAway: 25, endedPeriod: 1 }).text).toBe("סיום הרבע הראשון: הסלטיקס מובילים 30–25");
    expect(cap(T.PERIOD_END, { teamId: "2", lead: 3, scoreHome: 50, scoreAway: 53, endedPeriod: 2, halftime: 1 }).text).toBe("מחצית: הראפטורס מובילים 53–50");
    expect(cap(T.PERIOD_END, { scoreHome: 50, scoreAway: 50, endedPeriod: 3 }).text).toBe("שוויון 50–50 בסיום הרבע השלישי");
  });

  it("late non-final miss: stake only, chronology-safe", () => {
    const c = cap(T.MISSED_LATE_ATTEMPT, { teamId: "2", playerId: "p2", stake: "go_ahead", shotValue: 3, scoreHome: 100, scoreAway: 98, period: 4, clockSec: 15.3 });
    expect(c.text).toBe("S. Barnes מחטיא שלשה שיכלה לתת יתרון — 98–100, 15.3 שנ׳ לסיום");
    expect(c.text).not.toMatch(OT_WORDS);
  });
});

describe("capabilities end to end", () => {
  it("a scorer with unavailable PTS is never named (team-level caption)", () => {
    const { normalized, highlights } = games["401810799"];
    const target = highlights.find((h) => [T.GO_AHEAD, T.LEAD_CHANGE, T.TIE].includes(h.type) && h.captionParams.playerId);
    expect(target).toBeTruthy();
    const scorer = target.captionParams.playerId;
    const base = validateReplay(normalized).capabilities;
    const capabilities = [...base, { family: F.PTS, level: L.UNAVAILABLE, reasons: ["stat_mismatch"], players: [scorer], scope: "player" }];
    const again = buildHighlights(normalized, { capabilities }).highlights;
    const scoring = again.filter((h) => [T.TIE, T.GO_AHEAD, T.LEAD_CHANGE, T.FIRST_LEAD_SINCE, T.FIRST_LEAD, T.BIG_SHOT, T.LEAD_MILESTONE].includes(h.type));
    const same = again.find((h) => h.keyEventIndex === target.keyEventIndex);
    expect(same).toBeTruthy();
    for (const h of scoring) {
      const c = captionFor(h, normalized);
      assertClean(c);
      expect(c.parts.some((p) => p.t === "player" && p.playerId === scorer)).toBe(false);
    }
    const c = captionFor(same, normalized);
    expect(c.parts.some((p) => p.t === "player")).toBe(false);
    expect(c.parts.some((p) => p.t === "team" && p.teamId === target.captionParams.teamId)).toBe(true);
  });
});

describe("fixture captions", () => {
  for (const id of FIXTURES) {
    it(`${id}: every selected highlight has a clean, evidence-consistent caption`, () => {
      const { normalized, highlights } = games[id];
      if (UNAVAILABLE.has(id)) return expect(highlights).toEqual([]);
      expect(highlights.length).toBeGreaterThanOrEqual(10);
      for (const h of highlights) {
        const c = captionFor(h, normalized);
        assertClean(c);
        const named = c.parts.filter((p) => p.t === "player").map((p) => p.playerId);
        for (const pid of named) expect(h.playerIds).toContain(pid);
        if (h.captionParams.playerId) expect(named[0]).toBe(String(h.captionParams.playerId));
        if (!h.captionParams.playerId) expect(named).toEqual([]);
        const name = normalized.players.find((p) => p.id === h.captionParams.playerId);
        if (name) expect(c.text).toContain(name.shortName ?? name.name);
        for (const p of c.parts.filter((x) => x.t === "team")) expect(h.teamIds.map(String)).toContain(p.teamId);
        if (h.type === T.MISSED_FINAL_ATTEMPT) expect(c.text).not.toMatch(OT_WORDS);
        // Score part matches the record's score (either order).
        const s = c.parts.find((p) => p.t === "score");
        if (s) expect([formatScore(h.captionParams.scoreHome, h.captionParams.scoreAway), formatScore(h.captionParams.scoreAway, h.captionParams.scoreHome)]).toContain(s.value);
      }
    });
  }

  it("798 (OT game): the miss and the overtime boundary are separate, chronology-safe captions", () => {
    const { normalized, highlights } = games["401810798"];
    const miss = highlights.find((h) => h.type === T.MISSED_FINAL_ATTEMPT);
    const ot = highlights.find((h) => h.type === T.OVERTIME);
    expect(captionFor(miss, normalized).text).toMatch(/מחטיא שלשה שיכלה להכריע/);
    expect(captionFor(miss, normalized).text).not.toMatch(OT_WORDS);
    expect(captionFor(ot, normalized).text).toContain("הארכה");
  });
});
