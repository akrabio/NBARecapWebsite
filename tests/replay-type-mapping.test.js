// W20c: type IDs first seen in the W20b fixtures, verified against the box score.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildHighlights } from "@/lib/replay/highlights";
import { normalizeGame } from "@/lib/replay/normalize";
import { buildStateIndex } from "@/lib/replay/state";
import { EVENT_KINDS as K, REASON_CODES as R } from "@/lib/replay/types";
import { validateReplay } from "@/lib/replay/validate";

const cache = {};
const load = (id) => JSON.parse((cache[id] ??= readFileSync(new URL(`./fixtures/replay/${id}.json`, import.meta.url), "utf8")));
const games = {};
const game = (id) => {
  if (!games[id]) {
    const n = normalizeGame(load(id));
    const index = buildStateIndex(n);
    games[id] = { n, index, v: validateReplay(n, index) };
  }
  return games[id];
};
const ev = (id, playId) => game(id).n.events.find((e) => e.sourcePlayId === playId);
const codes = (e) => e.issues.map((i) => i.code);
const final = (id) => game(id).index.stateAt(game(id).n.events.length - 1);
const playerId = (id, name) => game(id).n.players.find((p) => p.name === name).id;
/** Reconstructed counter equals the box score for that player. */
const reconciles = (id, name, counters) => {
  const pid = playerId(id, name);
  for (const k of counters) expect([name, k, final(id).players[pid][k]]).toEqual([name, k, game(id).n.expected.players[pid][k]]);
};
const mismatches = (id) => game(id).v.reconciliation.players.mismatches.map((m) => `${m.name} ${m.counter}`);

describe("flagrant free throws (106, 157, 165, 166)", () => {
  const cases = [
    ["401909931", "401909931411", "Jamison Battle"],
    ["401909968", "401909968335", "Jayson Tatum"],
    ["401909972", "401909972564", "Egor Demin"],
    ["401909972", "401909972567", "Egor Demin"],
    ["401909972", "401909972568", "Egor Demin"],
  ];
  for (const [id, playId, name] of cases) {
    it(`${playId} is a made flagrant free throw by ${name}`, () => {
      const e = ev(id, playId);
      expect(e.text).toMatch(/makes free throw flagrant \d of \d/);
      expect(e).toMatchObject({ kind: K.FREE_THROW, detail: { made: true, points: 1, ftKind: "flagrant" }, roles: { shooter: playerId(id, name) } });
      expect(codes(e)).not.toContain(R.UNKNOWN_SHOT_VALUE);
      reconciles(id, name, ["pts", "fgm", "fga", "ftm", "fta"]);
    });
  }
});

describe("turnover types 66, 67, 69, 71, 72, 73", () => {
  const cases = [
    ["401909972", "401909972273", "66", "Julius Randle"],
    ["401909972", "401909972458", "67", "Julius Randle"],
    ["401909972", "40190997256", "67", "Day'Ron Sharpe"],
    ["401909290", "401909290155", "67", "Morez Johnson Jr."],
    ["401909962", "401909962206", "71", "Kobe Sanders"],
    ["401909931", "40190993179", "72", "Ja'Kobe Walter"],
    ["401909972", "401909972100", "72", "Herbert Jones"],
    ["401909968", "401909968582", "73", "Neemias Queta"],
  ];
  for (const [id, playId, type, name] of cases) {
    it(`${type}: ${playId} credits a turnover to ${name}`, () => {
      const e = ev(id, playId);
      expect(e.source.typeId).toBe(type);
      expect(e).toMatchObject({ kind: K.TURNOVER, roles: { turnoverBy: playerId(id, name) }, detail: { teamOnly: false } });
      reconciles(id, name, ["to"]);
    });
  }

  it("69 8-second turnover without a participant is a team turnover", () => {
    const e = ev("401909971", "401909971740");
    expect(e).toMatchObject({ kind: K.TURNOVER, teamId: "13", detail: { teamOnly: true } });
    const lal = game("401909971").v.reconciliation.teams["13"];
    expect(lal.teamOnly.teamTo.match).toBe(true);
    expect(lal.teamOnly.totalTo.match).toBe(true);
  });

  it("team turnover totals now reconcile in every affected game", () => {
    for (const id of ["401909290", "401909931", "401909962", "401909968", "401909972"]) {
      for (const t of Object.values(game(id).v.reconciliation.teams)) expect([id, t.abbreviation, t.counters.to.match]).toEqual([id, t.abbreviation, true]);
    }
  });
});

describe("fouls 257 and 36, delay technical 28", () => {
  it("257 transition take foul is a personal foul (Kris Dunn)", () => {
    const e = ev("401909962", "401909962292");
    expect(e).toMatchObject({ kind: K.FOUL, roles: { fouler: playerId("401909962", "Kris Dunn") } });
    reconciles("401909962", "Kris Dunn", ["pf"]);
    expect(Object.values(game("401909962").v.reconciliation.teams).every((t) => t.counters.pf.match)).toBe(true);
  });

  it("36 double personal foul charges both participants a PF", () => {
    const e = ev("401909972", "401909972618");
    expect(e.text).toBe("Julian Reese double personal foul (Josh Minott draws the foul)");
    expect(e).toMatchObject({ kind: K.FOUL, roles: { fouler: playerId("401909972", "Julian Reese"), doubleFouler: playerId("401909972", "Josh Minott") } });
    expect(e.roles.fouled).toBeUndefined();
    reconciles("401909972", "Josh Minott", ["pf"]);
    // Both team PF totals reconcile; Reese stays 1 short (see source-findings §10: unexplained source gap).
    expect(Object.values(game("401909972").v.reconciliation.teams).every((t) => t.counters.pf.match)).toBe(true);
    expect(mismatches("401909972")).toEqual(["Julian Reese pf"]);
  });

  it("a double personal foul counts toward foul-outs for both players", () => {
    const s = load("401909972");
    const minott = s.plays.find((p) => p.id === "401909972618").participants[1].athlete.id;
    // Give Minott five more personal fouls before the double foul's position → 6th PF is the double foul.
    const idx = s.plays.findIndex((p) => p.id === "401909972618");
    const extra = Array.from({ length: 5 }, (_, k) => ({ ...s.plays.find((p) => p.id === "401909972634"), id: `x${k}`, sequenceNumber: String(9000 + k) }));
    s.plays.splice(idx, 0, ...extra);
    const n = normalizeGame(s);
    const { candidates } = buildHighlights(n);
    const out = candidates.find((c) => c.type === "foul_out" && c.playerIds[0] === minott);
    expect(out).toBeTruthy();
    expect(n.events[out.keyEventIndex].sourcePlayId).toBe("401909972618");
  });

  it("28 delay technical is a team technical", () => {
    const e = ev("401909293", "401909293624");
    expect(e).toMatchObject({ kind: K.TECHNICAL, teamId: "3" });
    expect(game("401909293").v.reconciliation.teams["3"].teamOnly.technicalFouls.match).toBe(true);
  });
});

describe("non-stat types 10 and 214", () => {
  it("10 lane violation is a violation without counters", () => {
    const e = ev("401909972", "401909972163");
    expect(e).toMatchObject({ kind: K.VIOLATION, roles: { violator: playerId("401909972", "Derik Queen") } });
    reconciles("401909972", "Derik Queen", ["to", "pf"]);
  });

  it("214 coach's challenge (supported) is a review", () => {
    expect(ev("401909290", "401909290528").kind).toBe(K.REVIEW);
    expect(ev("401909971", "401909971530").kind).toBe(K.REVIEW);
  });

  it("no unknown event types remain in any fixture", () => {
    for (const id of ["401909290", "401909293", "401909294", "401909931", "401909962", "401909968", "401909971", "401909972"]) {
      expect(game(id).n.events.flatMap((e) => codes(e)).filter((c) => c === R.UNKNOWN_EVENT_TYPE || c === R.UNKNOWN_SHOT_VALUE)).toEqual([]);
    }
  });
});

describe("free-throw safety net", () => {
  it("an unknown shooting-play type with free-throw text becomes a free throw, never a field goal", () => {
    const s = load("401909931");
    const p = s.plays.find((x) => x.id === "401909931411");
    p.type = { id: "999", text: "Free Throw - Mystery 1 of 1" };
    const e = normalizeGame(s).events.find((x) => x.sourcePlayId === "401909931411");
    expect(e).toMatchObject({ kind: K.FREE_THROW, detail: { made: true, points: 1, ftKind: "flagrant" } });
    expect(e.issues).toContainEqual(expect.objectContaining({ code: R.UNKNOWN_EVENT_TYPE }));
  });

  it("an unknown shooting-play type without free-throw text stays a field goal", () => {
    const s = load("401909931");
    const p = s.plays.find((x) => x.type.id === "92" && x.scoringPlay);
    p.type = { id: "998", text: "Mystery Jumper" };
    expect(normalizeGame(s).events.find((x) => x.sourcePlayId === p.id).kind).toBe(K.FIELD_GOAL);
  });
});
