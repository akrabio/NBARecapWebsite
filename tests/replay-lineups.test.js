import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeGame } from "@/lib/replay/normalize";
import { courtActors, initialLineups, lineupAt, lineupContext, lineupTimeline } from "@/lib/replay/lineups";
import { EVENT_KINDS as K, REASON_CODES as R } from "@/lib/replay/types";

// --- Synthetic normalized games -------------------------------------------

const HOME = "1";
const AWAY = "2";
const teams = { home: { id: HOME, side: "home" }, away: { id: AWAY, side: "away" } };

// h1–h5 / a1–a5 start; h6–h8 / a6–a7 bench; h9 / a8 DNP.
const roster = (overrides = {}) => {
  const list = [];
  for (const [team, pre, n, dnp] of [[HOME, "h", 9, 9], [AWAY, "a", 8, 8]]) {
    for (let i = 1; i <= n; i++) {
      const id = `${pre}${i}`;
      list.push({ id, teamId: team, starter: i <= 5, didNotPlay: i === dnp, active: null, ...overrides[id] });
    }
  }
  return list;
};

// Events: assign index and substitutionGroup exactly like normalize
// (consecutive subs at the same period + clock).
function game(specs, players = roster()) {
  const events = [];
  let group = null;
  specs.forEach((s, index) => {
    const e = { index, kind: s.kind, period: s.period ?? 1, clockRemainingSec: s.clock ?? 600, teamId: s.teamId ?? null, roles: s.roles ?? {}, detail: {}, issues: [], substitutionGroup: null };
    if (e.kind === K.SUBSTITUTION) {
      if (!(group && group.period === e.period && group.clock === e.clockRemainingSec)) group = { id: `sub-${index}`, period: e.period, clock: e.clockRemainingSec };
      e.substitutionGroup = group.id;
    } else group = null;
    events.push(e);
  });
  return { teams, players, events };
}
const sub = (entering, leaving, { teamId = entering?.startsWith("a") || leaving?.startsWith("a") ? AWAY : HOME, clock = 600, period = 1 } = {}) => ({
  kind: K.SUBSTITUTION,
  teamId,
  clock,
  period,
  roles: { ...(entering && { entering }), ...(leaving && { leaving }) },
});
const shot = (shooter, { clock = 600, period = 1 } = {}) => ({ kind: K.FIELD_GOAL, teamId: shooter.startsWith("a") ? AWAY : HOME, clock, period, roles: { shooter } });
const codes = (issues) => issues.map((i) => i.code);
const after = (g, i) => lineupTimeline(g).states[i];

describe("initialLineups (R10)", () => {
  it("seeds five ordered starters per team; bench includes DNP; DNP never active", () => {
    const { teams: t, issues } = initialLineups(game([]));
    expect(issues).toEqual([]);
    expect(t[HOME]).toMatchObject({ onCourt: ["h1", "h2", "h3", "h4", "h5"], bench: ["h6", "h7", "h8", "h9"], valid: true, issue: null });
    expect(t[AWAY].onCourt).toEqual(["a1", "a2", "a3", "a4", "a5"]);
    expect(t[AWAY].bench).toContain("a8");
  });

  it("missing starter → invalid lineup with reason, nothing guessed", () => {
    const { teams: t, issues } = initialLineups(game([], roster({ h5: { starter: false } })));
    expect(t[HOME]).toMatchObject({ valid: false, issue: R.LINEUP_NO_STARTERS, onCourt: [] });
    expect(t[HOME].bench).toHaveLength(9); // roster fallback
    expect(t[AWAY].valid).toBe(true);
    expect(issues).toEqual([expect.objectContaining({ code: R.LINEUP_NO_STARTERS, teamId: HOME, detail: "4 starters" })]);
  });

  it("six starters → invalid", () => {
    const { teams: t } = initialLineups(game([], roster({ h6: { starter: true } })));
    expect(t[HOME]).toMatchObject({ valid: false, issue: R.LINEUP_NO_STARTERS });
  });

  it("duplicate starter IDs → invalid", () => {
    const players = roster();
    players.splice(4, 1, { ...players[0] }); // h1 twice, h5 gone
    const { teams: t, issues } = initialLineups(game([], players));
    expect(t[HOME].valid).toBe(false);
    expect(issues[0].detail).toMatch(/duplicate/);
  });

  it("DNP starter flag → invalid, DNP never placed on court", () => {
    const { teams: t } = initialLineups(game([], roster({ h5: { didNotPlay: true } })));
    expect(t[HOME]).toMatchObject({ valid: false, issue: R.LINEUP_NO_STARTERS, onCourt: [] });
    expect(t[HOME].candidates).not.toContain("h5");
  });
});

describe("substitution groups (R11)", () => {
  it("single sub: entering player takes the leaving player's slot", () => {
    const s = after(game([sub("h6", "h3")]), 0);
    expect(s.teams[HOME].onCourt).toEqual(["h1", "h2", "h6", "h4", "h5"]);
    expect(s.teams[HOME].bench).toEqual(["h3", "h7", "h8", "h9"]);
  });

  it("multi-player same-clock swap applies atomically at the group end, stable slots", () => {
    const g = game([sub("h6", "h1"), sub("h7", "h2"), sub("a6", "a5"), sub("h8", "h4"), shot("h6")]);
    const t = lineupTimeline(g);
    // Mid-group: visible lineup unchanged, subs pending.
    expect(t.states[1].teams[HOME].onCourt).toEqual(["h1", "h2", "h3", "h4", "h5"]);
    expect(t.states[1].pendingSubs).toEqual([0, 1]);
    expect(t.states[3].teams[HOME].onCourt).toEqual(["h6", "h7", "h3", "h8", "h5"]);
    expect(t.states[3].teams[AWAY].onCourt).toEqual(["a1", "a2", "a3", "a4", "a6"]);
    expect(t.groups).toEqual([{ id: "sub-0", from: 0, to: 3, teams: [HOME, AWAY] }]);
    expect(t.issues).toEqual([]);
  });

  it("intra-group order inconsistency (transient 4/6) resolves to a valid five", () => {
    // Logged order: "h1 enters for h2" (h1 still on court) then "h7 enters for h1".
    // Sequentially the first sub is inconsistent; as a batch it is a valid swap.
    const g = game([sub("h1", "h2"), sub("h7", "h1")]);
    const s = after(g, 1);
    expect(s.teams[HOME]).toMatchObject({ valid: true, onCourt: ["h7", "h1", "h3", "h4", "h5"] });
  });

  it("bench re-entry reuses a slot; lineup state carries no stats", () => {
    const g = game([sub("h6", "h1", { clock: 500 }), shot("h6", { clock: 400 }), sub("h1", "h6", { clock: 300 })]);
    const s = after(g, 2);
    expect(s.teams[HOME].onCourt).toEqual(["h1", "h2", "h3", "h4", "h5"]);
    expect(Object.keys(s.teams[HOME]).sort()).toEqual(["bench", "candidates", "confirmed", "invalidSince", "issue", "onCourt", "valid"]);
  });

  it("subs at the same clock split by another event are separate groups, each validated", () => {
    const g = game([sub("h6", "h1"), shot("a1"), sub("h7", "h2")]);
    const t = lineupTimeline(g);
    expect(t.groups.map((x) => [x.from, x.to])).toEqual([[0, 0], [2, 2]]);
    expect(t.states[1].teams[HOME].onCourt).toEqual(["h6", "h2", "h3", "h4", "h5"]);
  });

  it("incoming already active → invalid, never shown as a valid five", () => {
    const t = lineupTimeline(game([sub("h2", "h1"), shot("h3", { clock: 500 })]));
    const team = t.states[0].teams[HOME];
    expect(team).toMatchObject({ valid: false, issue: R.LINEUP_SUB_INCONSISTENT, onCourt: [], invalidSince: 0 });
    expect(team.candidates).toHaveLength(4); // transient four kept internal only
    expect(codes(t.issues)).toEqual([R.LINEUP_SUB_INCONSISTENT]);
    expect(t.states[1].teams[HOME].valid).toBe(false);
    expect(t.states[0].teams[AWAY].valid).toBe(true);
  });

  it("unknown outgoing (not on court) → invalid", () => {
    const t = lineupTimeline(game([sub("h7", "h6")]));
    expect(t.states[0].teams[HOME]).toMatchObject({ valid: false, issue: R.LINEUP_SUB_INCONSISTENT });
    expect(t.issues[0].detail).toMatch(/not on court/);
  });

  it("wrong-team ID → invalid for the event's team only", () => {
    const t = lineupTimeline(game([sub("a6", "h1", { teamId: HOME })]));
    expect(t.states[0].teams[HOME].valid).toBe(false);
    expect(t.states[0].teams[AWAY].valid).toBe(true);
    expect(t.issues[0].detail).toMatch(/wrong-team/);
  });

  it("missing role (normalize dropped it) → invalid", () => {
    const t = lineupTimeline(game([sub("h6", null)]));
    expect(t.states[0].teams[HOME]).toMatchObject({ valid: false, issue: R.LINEUP_SUB_INCONSISTENT });
  });

  it("DNP player entering → invalid; never placed among candidates", () => {
    const t = lineupTimeline(game([sub("h9", "h1")]));
    expect(t.states[0].teams[HOME].valid).toBe(false);
    expect(t.states[0].teams[HOME].candidates).not.toContain("h9");
  });

  it("period transition: no reset to starters; period-start subs applied", () => {
    const g = game([
      sub("h6", "h1", { clock: 100 }),
      { kind: K.PERIOD_END, period: 1, clock: 0 },
      sub("h7", "h2", { period: 2, clock: 720 }),
      sub("h1", "h3", { period: 2, clock: 720 }),
      shot("h7", { period: 2, clock: 700 }),
    ]);
    const t = lineupTimeline(g);
    expect(t.states[1].teams[HOME].onCourt).toEqual(["h6", "h2", "h3", "h4", "h5"]);
    expect(t.states[4].teams[HOME].onCourt).toEqual(["h6", "h7", "h1", "h4", "h5"]);
    expect(t.issues).toEqual([]);
  });
});

describe("on-court evidence and recovery", () => {
  it("actor not in the tracked five → issue + invalid", () => {
    const t = lineupTimeline(game([shot("h6")]));
    expect(t.issues).toEqual([expect.objectContaining({ code: R.LINEUP_ACTOR_OFF_COURT, playerId: "h6", teamId: HOME })]);
    expect(t.states[0].teams[HOME].valid).toBe(false);
  });

  it("DNP actor while valid → issue + invalid, never a candidate", () => {
    const t = lineupTimeline(game([shot("h9")]));
    expect(t.issues).toEqual([expect.objectContaining({ code: R.LINEUP_ACTOR_OFF_COURT, playerId: "h9" })]);
    expect(t.states[0].teams[HOME]).toMatchObject({ valid: false, onCourt: [], confirmed: [] });
    expect(t.states[0].teams[HOME].candidates).not.toContain("h9");
  });

  it("DNP actor + rejected DNP sub cannot recover into an active DNP player", () => {
    const players = roster({ h8: { didNotPlay: true } });
    const g = game([shot("h8", { clock: 600 }), sub("h8", "h1", { clock: 590 }), ...["h2", "h3", "h4", "h5"].map((id, i) => shot(id, { clock: 580 - i }))], players);
    const t = lineupTimeline(g);
    for (const s of t.states) {
      expect(s.teams[HOME].valid).toBe(false);
      expect(s.teams[HOME].candidates).not.toContain("h8");
      expect(s.teams[HOME].confirmed).not.toContain("h8");
    }
    expect(t.states.at(-1).teams[HOME].candidates).toContain("h1"); // rejected sub not applied
  });

  it("technical charged to a bench player is not on-court evidence", () => {
    expect(courtActors({ kind: K.TECHNICAL, roles: { technical: ["h6"] } })).toEqual([]);
    expect(courtActors({ kind: K.JUMP_BALL, roles: { jumpers: ["h1", "a1"], possession: "h2" } })).toEqual(["h1", "a1", "h2"]);
  });

  it("recovers only when five distinct candidates are all confirmed", () => {
    const g = game([
      sub("h2", "h1", { clock: 600 }), // invalid: h2 already on; candidates h2..h5 (4)
      shot("h3", { clock: 590 }), // confirmed {h2,h3}
      shot("h4", { clock: 580 }),
      shot("h5", { clock: 570 }),
      shot("h6", { clock: 560 }), // 5th candidate added: all confirmed → valid
      shot("h1", { clock: 550 }), // h1 now off the valid five → invalid again
    ]);
    const t = lineupTimeline(g);
    expect(t.states.slice(0, 4).every((s) => !s.teams[HOME].valid)).toBe(true);
    expect(t.states[3].teams[HOME].confirmed.sort()).toEqual(["h2", "h3", "h4", "h5"]);
    expect(t.states[4].teams[HOME]).toMatchObject({ valid: true, onCourt: ["h2", "h3", "h4", "h5", "h6"], issue: null });
    expect(t.states[5].teams[HOME]).toMatchObject({ valid: false, issue: R.LINEUP_ACTOR_OFF_COURT });
  });

  it("invalid starting lineup recovers through a full set of evidenced players", () => {
    const g = game(["h1", "h2", "h3", "h4", "h6"].map((id, i) => shot(id, { clock: 600 - i })), roster({ h5: { starter: false } }));
    const t = lineupTimeline(g);
    expect(t.states[3].teams[HOME].valid).toBe(false);
    expect(t.states[4].teams[HOME]).toMatchObject({ valid: true, onCourt: ["h1", "h2", "h3", "h4", "h6"] });
  });

  it("restore after seek: lineup at i equals recomputation from scratch", () => {
    const g = game([
      sub("h6", "h1", { clock: 500 }), sub("h7", "h2", { clock: 500 }), shot("h6", { clock: 450 }),
      sub("h1", "h6", { clock: 400 }), sub("h2", "h3", { clock: 300 }), shot("h2", { clock: 200 }),
    ]);
    const full = lineupTimeline(g);
    for (let i = -1; i < g.events.length; i++) {
      const expected = i < 0 ? full.initial : full.states[i];
      expect(lineupAt(g, i)).toEqual(expected);
      expect(lineupAt(g, i)).toEqual(lineupAt(g, i)); // two seeks identical
    }
    // Backward across the substitution restores the previous five.
    expect(lineupAt(g, 2).teams[HOME].onCourt).toEqual(["h6", "h7", "h3", "h4", "h5"]);
    expect(lineupAt(g, 3).teams[HOME].onCourt).toEqual(["h1", "h7", "h3", "h4", "h5"]);
  });

  it("does not mutate the input", () => {
    const g = game([sub("h6", "h1"), shot("h6")]);
    const snapshot = JSON.stringify(g);
    lineupTimeline(g);
    expect(JSON.stringify(g)).toBe(snapshot);
  });
});

// --- Real fixtures ----------------------------------------------------------

const FIXTURE_IDS = ["401810062", "401810791", "401810792", "401810798", "401810799"];
const load = (id) => normalizeGame(JSON.parse(readFileSync(new URL(`./fixtures/replay/${id}.json`, import.meta.url), "utf8")));

describe.each(FIXTURE_IDS)("fixture %s lineups", (id) => {
  const n = load(id);
  const t = lineupTimeline(n);
  const teamIds = [n.teams.home.id, n.teams.away.id];

  it("no lineup issues; both teams have a valid five after every event", () => {
    expect(t.issues).toEqual([]);
    for (const s of t.states) {
      for (const teamId of teamIds) {
        const team = s.teams[teamId];
        expect(team.valid).toBe(true);
        expect(new Set(team.onCourt).size).toBe(5);
        for (const pid of team.onCourt) expect(n.players.find((p) => p.id === pid)).toMatchObject({ teamId, didNotPlay: false });
        expect(team.bench.length + 5).toBe(n.players.filter((p) => p.teamId === teamId).length);
      }
    }
  });

  it("every on-court actor is in the tracked five (independent check)", () => {
    for (const e of n.events) {
      if (e.kind === K.SUBSTITUTION) continue;
      const s = t.states[e.index];
      for (const pid of courtActors(e)) {
        const teamId = n.players.find((p) => p.id === pid).teamId;
        expect(s.teams[teamId].onCourt).toContain(pid);
      }
    }
  });

  it("final ten equals box `active` players", () => {
    const last = t.states.at(-1);
    const finalTen = teamIds.flatMap((tid) => last.teams[tid].onCourt).sort();
    expect(finalTen).toEqual(n.players.filter((p) => p.active).map((p) => p.id).sort());
  });

  it("each period's starting five is evidenced within that period", () => {
    const periods = [...new Set(n.events.map((e) => e.period))];
    for (const period of periods) {
      const inPeriod = n.events.filter((e) => e.period === period);
      const first = inPeriod.find((e) => e.kind !== K.SUBSTITUTION);
      const lineup = t.states[first.index];
      for (const teamId of teamIds) {
        for (const pid of lineup.teams[teamId].onCourt) {
          // Evidence: acts in the period, or is subbed out before being subbed in.
          const acted = inPeriod.some((e) => e.index >= first.index && courtActors(e).includes(pid));
          const firstSub = inPeriod.find((e) => e.index >= first.index && e.kind === K.SUBSTITUTION && (e.roles.entering === pid || e.roles.leaving === pid));
          expect(acted || firstSub?.roles.leaving === pid).toBe(true);
        }
      }
    }
  });

  it("groups are consecutive same-clock substitutions and leave valid fives", () => {
    for (const g of t.groups) {
      const members = n.events.slice(g.from, g.to + 1);
      expect(members.every((e) => e.kind === K.SUBSTITUTION && e.substitutionGroup === g.id)).toBe(true);
      expect(new Set(members.map((e) => `${e.period}|${e.clockRemainingSec}`)).size).toBe(1);
    }
    expect(t.groups.reduce((a, g) => a + g.to - g.from + 1, 0)).toBe(n.events.filter((e) => e.kind === K.SUBSTITUTION).length);
  });

  it("seek equals full reduction at substitution boundaries", () => {
    const ctx = lineupContext(n);
    const probes = t.groups.slice(0, 4).flatMap((g) => [g.from - 1, g.from, g.to, g.to + 1]);
    for (const i of probes) expect(lineupAt(n, i)).toEqual(i < 0 ? t.initial : t.states[i]);
    expect(ctx.duplicates).toEqual([]);
  });
});
