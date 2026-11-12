import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DROP_REASONS as D, HIGHLIGHT_CONFIG, HIGHLIGHT_TYPES as T, buildHighlights, highlightCandidates, selectHighlights } from "@/lib/replay/highlights";
import { gameElapsedSec, normalizeGame } from "@/lib/replay/normalize";
import { buildStateIndex } from "@/lib/replay/state";
import { capabilityFor, validateReplay } from "@/lib/replay/validate";
import { CAPABILITY_FAMILIES as F, CAPABILITY_LEVELS as L, EVENT_KINDS as K } from "@/lib/replay/types";

// ---------------------------------------------------------------------------
// Synthetic game builder: home "H" (team 1), away "A" (team 2).
// ---------------------------------------------------------------------------

const H = "1";
const A = "2";
const FORMAT = { regulationPeriods: 4, regulationSec: 720, overtimeSec: 300 };
const reliable = () => Object.values(F).map((family) => ({ family, level: L.RELIABLE, reasons: [], scope: "game" }));

function builder() {
  const players = [];
  for (const [t, pre] of [[H, "h"], [A, "a"]]) for (let i = 1; i <= 7; i++) players.push({ id: `${pre}${i}`, teamId: t, starter: i <= 5, didNotPlay: false, shortName: `${pre}${i}` });
  const score = { home: 0, away: 0 };
  const events = [];
  const probability = [];
  const side = (t) => (t === H ? "home" : "away");
  const push = (kind, { team = null, period = 1, clock = 600, roles = {}, detail = {}, prob } = {}) => {
    const index = events.length;
    events.push({ index, sourcePlayId: `p${index}`, sourceSequence: index, source: { typeId: "", typeText: "" }, period, clockRemainingSec: clock, gameElapsedSec: gameElapsedSec(period, clock, FORMAT), kind, teamId: team, roles, detail, scoreAfter: { ...score }, text: "", substitutionGroup: null, issues: [] });
    if (prob != null) probability.push({ eventIndex: index, sourcePlayId: `p${index}`, home: prob, tie: null, derived: false });
    return index;
  };
  const shooterOf = (t) => (t === H ? "h1" : "a1");
  const b = {
    events,
    jump: (o = {}) => push(K.JUMP_BALL, { period: 1, clock: 720, ...o }),
    fg: (team, value, o = {}) => {
      score[side(team)] += value;
      return push(K.FIELD_GOAL, { team, roles: { shooter: o.shooter ?? shooterOf(team) }, detail: { made: true, points: value, attemptValue: value, heave: false, blocked: false }, ...o });
    },
    ft: (team, made = true, o = {}) => {
      if (made) score[side(team)] += 1;
      return push(K.FREE_THROW, { team, roles: { shooter: o.shooter ?? shooterOf(team) }, detail: { made, points: made ? 1 : 0, ftKind: "regular" }, ...o });
    },
    miss: (team, value, o = {}) => {
      const roles = { shooter: o.shooter ?? shooterOf(team), ...(o.blocker ? { blocker: o.blocker } : {}) };
      return push(K.FIELD_GOAL, { team, roles, detail: { made: false, points: 0, attemptValue: value, heave: false, blocked: !!o.blocker }, ...o });
    },
    reb: (team, o = {}) => push(K.REBOUND, { team, roles: o.teamOnly ? {} : { rebounder: team === H ? "h2" : "a2" }, detail: { offensive: !!o.offensive, teamOnly: !!o.teamOnly }, ...o }),
    steal: (loser, stealer, o = {}) => push(K.TURNOVER, { team: loser, roles: { turnoverBy: loser === H ? "h3" : "a3", stealer }, detail: { teamOnly: false }, ...o }),
    turnover: (team, o = {}) => push(K.TURNOVER, { team, roles: { turnoverBy: team === H ? "h3" : "a3" }, detail: { teamOnly: false }, ...o }),
    foul: (team, fouler, o = {}) => push(K.FOUL, { team, roles: { fouler }, ...o }),
    timeout: (team, o = {}) => push(K.TIMEOUT, { team, ...o }),
    periodEnd: (period) => push(K.PERIOD_END, { period, clock: 0 }),
    gameEnd: (period) => push(K.GAME_END, { period, clock: 0 }),
    // Advance the score to (away, home) with alternating baskets in one period (no lead claims of interest).
    normalized: () => ({ espnGameId: "synthetic", final: true, format: FORMAT, teams: { home: { id: H, side: "home", abbreviation: "HHH" }, away: { id: A, side: "away", abbreviation: "AAA" } }, players, expected: { players: {}, teams: {} }, events, probability, issues: [] }),
    run: (opts = {}) => buildHighlights(b.normalized(), { capabilities: opts.capabilities ?? reliable(), config: opts.config }),
  };
  return b;
}

/** A game at `away`–`home` going into Q4 (score built by two lump baskets in Q1). */
function lateGame(away, home, clock = 60) {
  const b = builder();
  b.jump();
  if (home > 0) b.fg(H, home, { period: 1, clock: 700 });
  if (away > 0) b.fg(A, away, { period: 1, clock: 690 });
  for (let p = 1; p <= 3; p++) b.periodEnd(p);
  b.timeout(H, { period: 4, clock: clock + 5 });
  return b;
}

const byType = (r, type) => r.highlights.filter((h) => h.type === type);
const cand = (r, id) => r.candidates.find((c) => c.id === id);

describe("R15 — ties, go-ahead plays and lead history (synthetic)", () => {
  it("detects a late tying basket with score evidence", () => {
    const b = lateGame(98, 100);
    const i = b.fg(A, 2, { period: 4, clock: 30, shooter: "a4" });
    b.periodEnd(4);
    b.gameEnd(4);
    const r = b.run();
    const tie = r.highlights.find((h) => h.keyEventIndex === i);
    expect(tie.type).toBe(T.TIE);
    expect(tie.eventIndex).toBe(i);
    expect(tie.playerIds).toEqual(["a4"]);
    expect(tie.teamIds).toEqual([A]);
    expect(tie.captionParams).toMatchObject({ teamId: A, playerId: "a4", shotValue: 2, scoreHome: 100, scoreAway: 100, period: 4, clockSec: 30 });
    expect(tie.evidence).toMatchObject({ scoreBefore: { home: 100, away: 98 }, scoreAfter: { home: 100, away: 100 }, marginBefore: -2, marginAfter: 0 });
    expect(typeof tie.importance).toBe("number");
    expect(tie.holdSec).toBeGreaterThan(0);
  });

  it("distinguishes go-ahead from a tie and lead change from trailing; groups a free-throw trip", () => {
    const b = lateGame(99, 100);
    b.foul(H, "h2", { period: 4, clock: 20 });
    const ft1 = b.ft(A, true, { period: 4, clock: 20 }); // 100–100
    const ft2 = b.ft(A, true, { period: 4, clock: 20 }); // 101–100
    const ga = b.fg(H, 2, { period: 4, clock: 10 }); // 101–102 lead change
    b.periodEnd(4);
    b.gameEnd(4);
    const r = b.run();
    const trip = r.highlights.find((h) => h.groupStartIndex === ft1);
    expect(trip.type).toBe(T.FIRST_LEAD); // away trailed from the opening lump basket on (complete history)
    expect(trip.evidence.neverLed).toBe(true);
    expect(trip.eventIndex).toBe(ft2); // one moment for the whole trip, held after the 2nd FT
    expect(trip.keyEventIndex).toBe(ft2); // the FT that changed the lead
    expect(trip.evidence.intermediateTie).toBe(true);
    expect(trip.captionParams.viaTie).toBe(1);
    expect(r.highlights.filter((h) => h.eventIndex === ft1)).toEqual([]);
    expect(r.highlights.find((h) => h.keyEventIndex === ga).type).toBe(T.LEAD_CHANGE);

    const b2 = lateGame(100, 100);
    const g = b2.fg(H, 3, { period: 4, clock: 15 }); // home led before the tie (deficit never ≥ 6): plain go-ahead
    b2.periodEnd(4);
    b2.gameEnd(4);
    expect(b2.run().highlights.find((h) => h.keyEventIndex === g).type).toBe(T.GO_AHEAD);
  });

  it("tracks intervening ties: a go-ahead right after its own lead was tied is not a long-awaited lead", () => {
    const b = lateGame(98, 100);
    const t1 = b.fg(A, 2, { period: 4, clock: 50 }); // tie 100–100
    const g1 = b.fg(H, 2, { period: 4, clock: 40 }); // home ahead again
    const t2 = b.fg(A, 2, { period: 4, clock: 30 }); // tie 102–102
    const g2 = b.fg(A, 1 + 1, { period: 4, clock: 20 }); // away first lead
    b.periodEnd(4);
    b.gameEnd(4);
    const r = b.run();
    const types = Object.fromEntries(r.candidates.filter((c) => [t1, g1, t2, g2].includes(c.keyEventIndex)).map((c) => [c.keyEventIndex, c.type]));
    expect(types[t1]).toBe(T.TIE);
    expect(types[g1]).toBe(T.GO_AHEAD);
    expect(types[t2]).toBe(T.TIE);
    const g1c = r.candidates.find((c) => c.keyEventIndex === g1);
    expect(g1c.evidence.leadEnded.eventIndex).toBe(t1); // its lead ended at the intervening tie
    expect(g1c.evidence.droughtSec).toBe(10);
  });

  /** Home leads early, away takes over in Q1 and leads until Q4. */
  function droughtGame({ breakScore = false, late = false } = {}) {
    const b = builder();
    if (!late) b.jump();
    const p1 = late ? 2 : 1;
    b.fg(H, 3, { period: p1, clock: 700 });
    b.fg(H, 3, { period: p1, clock: 680 });
    b.fg(A, 3, { period: p1, clock: 660 });
    const lost = b.fg(A, 3, { period: p1, clock: 640 }); // 6–6: home's lead ended here
    b.fg(A, 3, { period: p1, clock: 620 }); // away 9–6
    b.fg(A, 3, { period: p1, clock: 600 });
    b.fg(A, 3, { period: p1, clock: 580 }); // 15–6
    b.periodEnd(p1);
    if (breakScore) {
      // An invalid source score side in Q3 (with a hidden change): history is incomplete.
      const i = b.turnover(A, { period: 3, clock: 300 });
      b.events[i].scoreAfter = { home: null, away: 15 };
    }
    b.fg(H, 3, { period: 4, clock: 400 });
    b.fg(H, 3, { period: 4, clock: 380 });
    const back = b.fg(H, 3, { period: 4, clock: 300 }); // 15–15 tie
    const lead = b.fg(H, 2, { period: 4, clock: 280 }); // home 17–15
    b.periodEnd(4);
    b.gameEnd(4);
    return { b, lost, back, lead };
  }

  it("flags a first lead since a long stretch without leading, with the prior lead boundary", () => {
    const { b, lost, lead } = droughtGame();
    const r = b.run();
    const c = r.candidates.find((x) => x.keyEventIndex === lead);
    expect(c.type).toBe(T.FIRST_LEAD_SINCE);
    expect(c.status).toBe("selected");
    expect(c.evidence.leadEnded.eventIndex).toBe(lost);
    expect(c.evidence.historyComplete).toBe(true);
    expect(c.evidence.maxDeficitSinceLead).toBe(9);
    expect(c.captionParams).toMatchObject({ sincePeriod: 1, sinceClockSec: 640 });
    expect(c.evidence.droughtSec).toBe(gameElapsedSec(4, 280) - gameElapsedSec(1, 640));
  });

  it("omits the long-lead claim when score history is incomplete (invalid score or late feed start)", () => {
    const broken = droughtGame({ breakScore: true });
    const c = broken.b.run().candidates.find((x) => x.keyEventIndex === broken.lead);
    expect(c.type).toBe(T.GO_AHEAD); // still a factual go-ahead (from a tie)
    expect(c.captionParams.sincePeriod).toBeUndefined();
    expect(c.evidence.historyComplete).toBe(false);
    expect(c.evidence.longLeadClaimOmitted).toBe("history_incomplete");

    // Feed starting in Q2: "first lead of the game" cannot be claimed for the away team.
    const b = builder();
    b.fg(H, 3, { period: 2, clock: 700 });
    b.fg(H, 3, { period: 2, clock: 680 });
    b.fg(H, 3, { period: 2, clock: 660 });
    b.fg(H, 3, { period: 3, clock: 300 }); // 0–12
    b.fg(A, 3, { period: 4, clock: 400 });
    b.fg(A, 3, { period: 4, clock: 380 });
    b.fg(A, 3, { period: 4, clock: 360 });
    b.fg(A, 3, { period: 4, clock: 340 }); // 12–12
    const g = b.fg(A, 2, { period: 4, clock: 300 });
    const cc = b.run().candidates.find((x) => x.keyEventIndex === g);
    expect(cc.type).toBe(T.GO_AHEAD);
    expect(cc.evidence.neverLed).toBe(true);
    expect(cc.evidence.historyComplete).toBe(false);
  });

  it("never treats the opening 2–0 or early routine ties/leads as highlights", () => {
    const b = builder();
    b.jump();
    const first = b.fg(H, 2, { period: 1, clock: 700 });
    const tie = b.fg(A, 2, { period: 1, clock: 680 });
    const ga = b.fg(A, 2, { period: 1, clock: 660 });
    const r = b.run();
    expect(cand(r, `go_ahead-${first}`).reason).toBe(D.OPENING_SCORE);
    expect(cand(r, `tie-${tie}`).reason).toBe(D.EARLY_ROUTINE);
    expect(cand(r, `go_ahead-${ga}`).reason).toBe(D.EARLY_ROUTINE);
    expect(r.highlights).toEqual([]);
  });
});

describe("R16 — defensive plays and missed finishers (synthetic)", () => {
  it("excludes a routine early steal and keeps a late close one grouped with its basket", () => {
    const b = lateGame(98, 100);
    const early = builder();
    early.jump();
    early.fg(H, 2, { period: 1, clock: 700 });
    early.fg(A, 2, { period: 1, clock: 690 });
    const s0 = early.steal(H, "a5", { period: 1, clock: 600 });
    expect(cand(early.run(), `steal-${s0}`).reason).toBe(D.ROUTINE);

    const s = b.steal(H, "a5", { period: 4, clock: 30 });
    const basket = b.fg(A, 2, { period: 4, clock: 26, shooter: "a2" });
    b.periodEnd(4);
    b.gameEnd(4);
    const r = b.run();
    const h = r.highlights.find((x) => x.groupStartIndex === s);
    expect(h).toBeDefined();
    expect(h.eventIndex).toBe(basket); // steal → basket is one moment held after the basket
    expect(h.groupEndIndex).toBe(basket);
    expect(r.highlights.filter((x) => x.keyEventIndex === basket && x.id !== h.id)).toEqual([]);
    const ids = [h.id, ...(h.evidence.related ?? []).map((x) => x.id)].sort();
    expect(ids).toEqual([`steal-${s}`, `tie-${basket}`].sort());
    expect(h.playerIds).toEqual(expect.arrayContaining(["a5", "a2"]));
  });

  it("excludes a block on a shot that could not tie; keeps a block on a potential tying three", () => {
    const b = lateGame(96, 100);
    const blk = b.miss(A, 2, { period: 4, clock: 30, blocker: "h4" }); // down 4, a two cannot tie
    b.reb(H, { period: 4, clock: 28 });
    b.fg(A, 1 + 0, { period: 4, clock: 20 }); // 97–100 (one-point "fg" keeps the test small)
    const blk3 = b.miss(A, 3, { period: 4, clock: 10, blocker: "h4" }); // down 3, a three ties
    const reb = b.reb(H, { period: 4, clock: 8 });
    b.periodEnd(4);
    b.gameEnd(4);
    const r = b.run();
    expect(cand(r, `block-${blk}`).reason).toBe(D.SHOT_COULD_NOT_TIE);
    const h = r.highlights.find((x) => x.id === `block-${blk3}`);
    expect(h.captionParams).toMatchObject({ teamId: H, playerId: "h4", stake: "tie", shotValue: 3, shooterId: "a1" });
    expect(h.eventIndex).toBe(reb); // block → rebound
  });

  it("does not claim a final attempt when more possessions followed", () => {
    const b = lateGame(99, 100);
    const m1 = b.miss(A, 2, { period: 4, clock: 6 });
    b.reb(H, { period: 4, clock: 5 });
    b.foul(A, "a2", { period: 4, clock: 4 });
    b.ft(H, false, { period: 4, clock: 4 });
    b.ft(H, false, { period: 4, clock: 4 });
    b.reb(A, { period: 4, clock: 3 });
    const m2 = b.miss(A, 3, { period: 4, clock: 1 }); // the real last attempt
    b.reb(H, { period: 4, clock: 0.2 });
    b.periodEnd(4);
    b.gameEnd(4);
    const r = b.run();
    const c1 = cand(r, `missed_final_attempt-${m1}`);
    expect(c1.reason).toBe(D.MORE_POSSESSIONS_FOLLOWED);
    expect(c1.status).toBe("dropped");
    const h = r.highlights.find((x) => x.id === `missed_final_attempt-${m2}`);
    expect(h.captionParams.stake).toBe("win");
    expect(byType(r, T.MISSED_FINAL_ATTEMPT)).toHaveLength(1);
  });

  it("models regulation miss → overtime as two moments: the miss knows nothing of OT; OT only at PERIOD_END", () => {
    const b = lateGame(100, 100);
    const miss = b.miss(H, 3, { period: 4, clock: 2, shooter: "h5" });
    const reb = b.reb(H, { period: 4, clock: 0.3, offensive: true, teamOnly: true });
    const end4 = b.periodEnd(4);
    b.jump({ period: 5, clock: 300 });
    b.fg(A, 2, { period: 5, clock: 250 });
    b.fg(H, 2, { period: 5, clock: 200 });
    b.fg(A, 2, { period: 5, clock: 150 }); // 104–102
    const otMiss = b.miss(H, 2, { period: 5, clock: 1 }); // potential tying two at the end of OT
    const end5 = b.periodEnd(5);
    b.gameEnd(5);
    const r = b.run();

    const m = r.highlights.find((h) => h.id === `missed_final_attempt-${miss}`);
    expect(m.eventIndex).toBe(reb);
    expect(m.eventIndex).toBeLessThan(end4);
    expect(m.captionParams).toMatchObject({ teamId: H, playerId: "h5", stake: "win", shotValue: 3, scoreHome: 100, scoreAway: 100 });
    for (const k of Object.keys(m.captionParams)) expect(k).not.toMatch(/overtime|nextPeriod|winner|outcome/i);
    // Look-ahead facts are nested under `verification`, never top-level evidence.
    expect(m.evidence.periodEndIndex).toBeUndefined();
    expect(m.evidence.verification).toMatchObject({ lookAhead: true, periodEndIndex: end4, eventsUntilPeriodEnd: [{ eventIndex: reb, kind: K.REBOUND }] });

    const ot = byType(r, T.OVERTIME);
    expect(ot).toHaveLength(1);
    expect(ot[0].eventIndex).toBe(end4);
    expect(b.events[ot[0].eventIndex].kind).toBe(K.PERIOD_END);
    expect(ot[0].captionParams).toMatchObject({ endedPeriod: 4, nextPeriod: 5, overtimeNumber: 1, scoreHome: 100, scoreAway: 100 });

    // The OT miss ends the game: its own moment (stake tie) plus a game-end boundary.
    const m2 = r.highlights.find((h) => h.id === `missed_final_attempt-${otMiss}`);
    expect(m2.captionParams.stake).toBe("tie");
    const ge = byType(r, T.GAME_END);
    expect(ge.map((h) => h.eventIndex)).toEqual([end5]);
    expect(ge[0].captionParams.winnerTeamId).toBe(A);
    // Chronology: highlights are in event order and the OT boundary follows the miss.
    const order = r.highlights.map((h) => h.eventIndex);
    expect(order).toEqual([...order].sort((x, y) => x - y));
  });

  it("does not create an overtime moment at a non-tied period end or an end-of-game boundary without a final miss", () => {
    const b = lateGame(100, 102);
    b.periodEnd(4);
    b.gameEnd(4);
    const r = b.run();
    expect(byType(r, T.OVERTIME)).toEqual([]);
    expect(byType(r, T.GAME_END)).toEqual([]);
  });

  it("reports a foul-out only with usable PF data and a verified sixth foul", () => {
    const b = lateGame(98, 100);
    let sixth = null;
    for (let k = 0; k < 6; k++) sixth = b.foul(H, "h2", { period: 4, clock: 50 - k });
    b.periodEnd(4);
    b.gameEnd(4);
    const r = b.run();
    const fo = r.candidates.find((c) => c.type === T.FOUL_OUT);
    expect(fo.keyEventIndex).toBe(sixth);
    expect(fo.captionParams).toMatchObject({ playerId: "h2", fouls: 6 });
    expect(fo.status).toBe("selected");
    const noPf = reliable().map((c) => (c.family === F.PF ? { ...c, level: L.UNAVAILABLE } : c));
    expect(b.run({ capabilities: noPf }).candidates.find((c) => c.type === T.FOUL_OUT).reason).toBe(D.CAPABILITY_UNAVAILABLE);
  });

  it("never attributes a steal or block to a player whose capability is unavailable", () => {
    const b = lateGame(98, 100);
    const s = b.steal(H, "a5", { period: 4, clock: 30 });
    const blk = b.miss(H, 2, { period: 4, clock: 20, blocker: "a4" });
    b.periodEnd(4);
    b.gameEnd(4);
    const caps = [...reliable(), { family: F.STL, level: L.UNAVAILABLE, reasons: ["stat_mismatch"], players: ["a5"], scope: "player" }, { family: F.BLK, level: L.UNAVAILABLE, reasons: ["stat_mismatch"], players: ["a4"], scope: "player" }];
    const r = b.run({ capabilities: caps });
    expect(cand(r, `steal-${s}`).reason).toBe(D.CAPABILITY_UNAVAILABLE);
    expect(cand(r, `block-${blk}`).reason).toBe(D.CAPABILITY_UNAVAILABLE);
    expect(r.highlights.flatMap((h) => h.playerIds)).not.toContain("a5");
  });
});

describe("R17 — ranking, grouping and selection (synthetic)", () => {
  it("lead milestones: first time a lead reaches 20, not in garbage time, not with incomplete history", () => {
    const b = builder();
    b.jump();
    for (let k = 0; k < 6; k++) b.fg(H, 3, { period: 2, clock: 700 - k * 20 }); // 0–18
    const m20 = b.fg(H, 2, { period: 2, clock: 500 }); // 0–20
    b.fg(A, 2, { period: 2, clock: 480 }); // 2–20
    const again = b.fg(H, 2, { period: 2, clock: 460 }); // 2–22: already reached, no new milestone
    for (let k = 0; k < 5; k++) b.fg(H, 2, { period: 4, clock: 300 - k * 10 }); // 2–32 (lead 30) in garbage time
    b.periodEnd(4);
    b.gameEnd(4);
    const r = b.run();
    const ms = r.candidates.filter((c) => c.type === T.LEAD_MILESTONE);
    expect(ms.map((c) => [c.keyEventIndex, c.captionParams.threshold, c.reason])).toEqual([
      [m20, 20, null],
      [ms[1].keyEventIndex, 30, D.GARBAGE_TIME],
    ]);
    expect(ms.some((c) => c.keyEventIndex === again)).toBe(false);
    b.events[m20 - 2].scoreAfter = { home: null, away: 0 };
    expect(b.run().candidates.find((c) => c.keyEventIndex === m20 && c.type === T.LEAD_MILESTONE).reason).toBe(D.HISTORY_INCOMPLETE);
  });

  it("groups a steal with the stealing team's immediate give-back turnover", () => {
    const b = lateGame(98, 100);
    const s = b.steal(H, "a5", { period: 4, clock: 30 });
    const back = b.turnover(A, { period: 4, clock: 28 });
    b.periodEnd(4);
    b.gameEnd(4);
    const r = b.run();
    const sel = r.highlights.filter((h) => [s, back].includes(h.keyEventIndex) || h.groupStartIndex === s);
    expect(sel).toHaveLength(1);
    expect(sel[0].groupStartIndex).toBe(s);
    expect(sel[0].eventIndex).toBe(back);
  });

  it("requires a probability swing for late turnovers when probability is available", () => {
    const b = lateGame(98, 100);
    b.timeout(H, { period: 4, clock: 31, prob: 0.6 });
    const t = b.turnover(A, { period: 4, clock: 30, prob: 0.61 });
    b.periodEnd(4);
    b.gameEnd(4);
    expect(cand(b.run(), `turnover-${t}`).reason).toBe(D.BELOW_SWING);
  });

  it("works without probability, uses probability swings when present, and is deterministic", () => {
    const mk = (withProb) => {
      const b = lateGame(98, 100);
      const opts = withProb ? { prob: 0.7 } : {};
      b.timeout(H, { period: 4, clock: 41, ...opts });
      const i = b.fg(A, 2, { period: 4, clock: 40, ...(withProb ? { prob: 0.45 } : {}) });
      b.periodEnd(4);
      b.gameEnd(4);
      return { r: b.run(), i, b };
    };
    const no = mk(false);
    const yes = mk(true);
    const hn = no.r.highlights.find((h) => h.keyEventIndex === no.i);
    const hy = yes.r.highlights.find((h) => h.keyEventIndex === yes.i);
    expect(hn.evidence.probability).toBeNull();
    expect(hy.evidence.probability).toMatchObject({ homeBefore: 0.7, homeAfter: 0.45, delta: 0.25 });
    expect(hy.importance).not.toBe(hn.importance);
    expect(JSON.stringify(yes.b.run())).toBe(JSON.stringify(yes.r));
  });

  it("caps selection, keeps finish moments ahead of early ones and reports every candidate", () => {
    const b = builder();
    b.jump();
    let c = 700;
    // Many early lead changes in Q2/Q3 (each > minPoints).
    b.fg(H, 3, { period: 1, clock: 710 });
    b.fg(H, 3, { period: 1, clock: 705 });
    b.fg(H, 3, { period: 1, clock: 704 });
    b.fg(H, 3, { period: 1, clock: 703 }); // 0–12
    b.fg(A, 3, { period: 1, clock: 702 });
    b.fg(A, 3, { period: 1, clock: 701 });
    b.fg(A, 3, { period: 1, clock: 700 });
    b.fg(A, 2, { period: 1, clock: 699 }); // 11–12
    for (let k = 0; k < 20; k++) {
      const p = k < 10 ? 2 : 3;
      if (k === 10) c = 700;
      b.fg(k % 2 ? H : A, 2, { period: p, clock: (c -= 10) }); // alternating lead changes
    }
    const finish = [];
    for (let k = 0; k < 10; k++) finish.push(b.fg(k % 2 ? H : A, 2, { period: 4, clock: 110 - k * 10 }));
    b.periodEnd(4);
    b.gameEnd(4);
    const r = b.run();
    expect(r.highlights.length).toBeLessThanOrEqual(HIGHLIGHT_CONFIG.maxHighlights);
    const late = r.highlights.filter((h) => finish.includes(h.keyEventIndex));
    expect(late.length).toBeGreaterThanOrEqual(HIGHLIGHT_CONFIG.finishReserve);
    for (const p of [2, 3]) expect(r.highlights.filter((h) => b.events[h.keyEventIndex].period === p).length).toBeLessThanOrEqual(HIGHLIGHT_CONFIG.maxPerEarlyPeriod);
    expect(r.candidates.every((x) => (x.status === "selected") === (x.reason === null))).toBe(true);
    expect(r.candidates.filter((x) => x.status === "dropped").every((x) => Object.values(D).includes(x.reason))).toBe(true);
    expect(new Set(r.highlights.map((h) => h.id)).size).toBe(r.highlights.length);
    // Smaller cap via config.
    expect(b.run({ config: { maxHighlights: 3 } }).highlights).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Real fixtures
// ---------------------------------------------------------------------------

const FIXTURE_IDS = ["401810062", "401810791", "401810792", "401810798", "401810799"];
const fixtures = Object.fromEntries(
  FIXTURE_IDS.map((id) => {
    const n = normalizeGame(JSON.parse(readFileSync(new URL(`./fixtures/replay/${id}.json`, import.meta.url), "utf8")));
    const idx = buildStateIndex(n);
    const v = validateReplay(n, idx);
    return [id, { n, idx, v, r: buildHighlights(n, { stateIndex: idx, capabilities: v.capabilities }) }];
  }),
);
const margin = (score, teamId, n) => (teamId === n.teams.home.id ? score.home - score.away : score.away - score.home);
const QUIET = new Set([K.REBOUND, K.TIMEOUT, K.SUBSTITUTION, K.REVIEW]);

describe("highlights — real fixtures", () => {
  it.each(FIXTURE_IDS)("%s: every selected moment's evidence holds in stateAt", (id) => {
    const { n, idx, v, r } = fixtures[id];
    expect(r.highlights.length).toBeLessThanOrEqual(HIGHLIGHT_CONFIG.maxHighlights);
    const order = r.highlights.map((h) => h.eventIndex);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    for (const h of r.highlights) {
      for (const val of Object.values(h.captionParams)) expect(["string", "number"]).toContain(typeof val);
      expect(h.groupStartIndex).toBeLessThanOrEqual(h.keyEventIndex);
      expect(h.keyEventIndex).toBeLessThanOrEqual(h.eventIndex);
      const at = idx.stateAt(h.eventIndex);
      const before = idx.stateAt(h.groupStartIndex - 1);
      const team = h.teamIds.length === 1 ? h.teamIds[0] : null;
      if (h.captionParams.scoreHome != null && h.type !== T.MISSED_FINAL_ATTEMPT) expect([at.score.home, at.score.away]).toEqual([h.captionParams.scoreHome, h.captionParams.scoreAway]);
      switch (h.type) {
        case T.TIE:
          expect(at.score.home).toBe(at.score.away);
          expect(margin(before.score, team, n)).toBeLessThan(0);
          break;
        case T.GO_AHEAD:
        case T.LEAD_CHANGE:
        case T.FIRST_LEAD:
        case T.FIRST_LEAD_SINCE:
          expect(margin(at.score, team, n)).toBeGreaterThan(0);
          expect(margin(before.score, team, n)).toBeLessThanOrEqual(0);
          if (h.type === T.FIRST_LEAD_SINCE) {
            // No lead for this team between the recorded lead end and the moment.
            for (let k = h.evidence.leadEnded.eventIndex; k < h.groupStartIndex; k++) expect(margin(idx.stateAt(k).score, team, n)).toBeLessThanOrEqual(0);
            expect(margin(idx.stateAt(h.evidence.leadEnded.eventIndex - 1).score, team, n)).toBeGreaterThan(0);
          }
          break;
        case T.STEAL: {
          const k = h.keyEventIndex;
          expect(n.events[k].roles.stealer).toBe(h.captionParams.playerId);
          expect(idx.stateAt(k).players[h.captionParams.playerId].stl).toBe(idx.stateAt(k - 1).players[h.captionParams.playerId].stl + 1);
          break;
        }
        case T.BLOCK:
          expect(n.events[h.keyEventIndex].roles.blocker).toBe(h.captionParams.playerId);
          break;
        case T.MISSED_FINAL_ATTEMPT: {
          const e = n.events[h.keyEventIndex];
          const m = margin(before.score, e.teamId, n);
          expect(m).toBeLessThanOrEqual(0);
          expect(e.detail.attemptValue + m).toBeGreaterThanOrEqual(0);
          const pe = h.evidence.verification.periodEndIndex;
          for (let k = h.keyEventIndex + 1; k < pe; k++) expect(QUIET.has(n.events[k].kind)).toBe(true);
          expect(n.events[pe].kind).toBe(K.PERIOD_END);
          expect(h.eventIndex).toBeLessThan(pe);
          break;
        }
        case T.OVERTIME:
          expect(n.events[h.eventIndex].kind).toBe(K.PERIOD_END);
          expect(at.score.home).toBe(at.score.away);
          break;
        case T.FOUL_OUT: {
          const pid = h.captionParams.playerId;
          expect(at.players[pid].pf).toBe(6);
          expect(idx.stateAt(h.eventIndex - 1).players[pid].pf).toBe(5);
          expect(n.expected.players[pid].pf).toBe(6);
          break;
        }
        case T.LEAD_MILESTONE: {
          const th = h.captionParams.threshold;
          expect(margin(at.score, team, n)).toBeGreaterThanOrEqual(th);
          for (let k = -1; k < h.groupStartIndex; k++) expect(margin(idx.stateAt(k).score, team, n)).toBeLessThan(th); // first time
          break;
        }
        default:
          break;
      }
      expect(h.selection).toBeUndefined(); // selection-only hints never reach the record
      // Never attribute a player whose family is unavailable (e.g. Porter Jr. BLK in 401810062).
      if (h.type === T.BLOCK) expect(capabilityFor(v.capabilities, F.BLK, { playerId: h.captionParams.playerId, teamId: team }).level).not.toBe(L.UNAVAILABLE);
    }
    for (const c of r.candidates) expect(c.status === "selected" ? c.reason === null : typeof c.reason === "string").toBe(true);
  });

  it("tunes selection on the comeback/ordinary fixtures (Q4 coverage, decisive lead, grouped give-back)", () => {
    const r791 = fixtures["401810791"].r;
    expect(r791.highlights.filter((h) => fixtures["401810791"].n.events[h.keyEventIndex].period === 4).length).toBeGreaterThanOrEqual(2);
    // Steal and immediate give-back turnover are one moment.
    expect(cand(r791, "steal-441").reason).toBe(D.MERGED);
    expect(cand(r791, "steal-441").mergedInto).toBe("turnover-442");
    const r062 = fixtures["401810062"].r;
    expect(r062.highlights.map((h) => h.id)).toContain("go_ahead-147");
    expect(cand(r062, "go_ahead-147").selection).toEqual({ decisiveLead: true });
    // Late turnover without supported swing is not selected.
    expect(cand(fixtures["401810799"].r, "turnover-485").reason).toBe(D.BELOW_SWING);
    expect(fixtures["401810799"].r.highlights.find((h) => h.id === "block-471").captionParams.stake).toBe("extend");
  });

  it("represents the close finish of 401810799 (CHA 103–101)", () => {
    const { n, r } = fixtures["401810799"];
    const finish = r.highlights.filter((h) => n.events[h.keyEventIndex].period === 4 && n.events[h.keyEventIndex].clockRemainingSec <= 120);
    expect(finish.length).toBeGreaterThanOrEqual(3);
    expect(r.highlights.map((h) => h.id)).toEqual(expect.arrayContaining(["lead_change-475", "first_lead_since-410"])); // Bridges' FTs; CHA's first lead since Q1
    const fl = r.highlights.find((h) => h.id === "first_lead_since-410");
    expect(fl.captionParams).toMatchObject({ sincePeriod: 1 });
    expect(fl.evidence.maxDeficitSinceLead).toBeGreaterThanOrEqual(15);
    // Henderson's 41-footer at 0:00 (down 5) cannot tie: no buzzer moment.
    expect(r.highlights.some((h) => h.keyEventIndex === 502)).toBe(false);
  });

  it("represents the regulation finish and overtime of 401810798 (CHI 130–124 OT)", () => {
    const { n, r } = fixtures["401810798"];
    const ids = r.highlights.map((h) => h.id);
    expect(ids).toEqual(expect.arrayContaining(["tie-514", "missed_final_attempt-515", "overtime-517"]));
    expect(n.events[517].kind).toBe(K.PERIOD_END);
    const miss = r.highlights.find((h) => h.id === "missed_final_attempt-515");
    expect(miss.eventIndex).toBeLessThan(517);
    expect(miss.captionParams.stake).toBe("win");
    expect(r.highlights.filter((h) => n.events[h.keyEventIndex].period === 5).length).toBeGreaterThanOrEqual(1);
    // The last OT attempt (down 6) could not tie.
    expect(cand(r, "missed_final_attempt-564").reason).toBe(D.SHOT_COULD_NOT_TIE);
    expect(byType(r, T.GAME_END)).toEqual([]);
  });

  it("gives the blowout 401810792 evidence-backed lead milestones only, and keeps the API entry points consistent", () => {
    const { n, idx, v, r } = fixtures["401810792"];
    expect(r.highlights.length).toBeGreaterThanOrEqual(1);
    expect(byType(r, T.LEAD_MILESTONE).length).toBeGreaterThanOrEqual(1);
    expect(byType(r, T.LEAD_MILESTONE).length).toBeLessThanOrEqual(HIGHLIGHT_CONFIG.maxMilestones);
    expect(r.highlights.every((h) => h.importance >= HIGHLIGHT_CONFIG.coverageMinImportance)).toBe(true);
    const opts = { stateIndex: idx, capabilities: v.capabilities };
    expect(selectHighlights(n, opts)).toEqual(r.highlights);
    expect(highlightCandidates(n, opts)).toEqual(r.candidates);
    // Defaults (no stateIndex/capabilities passed) give the same result.
    expect(buildHighlights(n)).toEqual(r);
  });
});
