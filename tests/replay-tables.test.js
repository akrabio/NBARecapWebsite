import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildReplay } from "@/lib/replay/build";
import { replayStateAt } from "@/lib/replay/client-state";
import {
  NATURAL_STEP,
  TABLE_COLUMNS,
  activityTeams,
  cellValue,
  changedCells,
  columnAvailable,
  enteredPlayers,
  isNaturalStep,
  rtlTabIndex,
  teamRows,
} from "@/lib/replay/tables";

const load = (id) => buildReplay(JSON.parse(readFileSync(new URL(`./fixtures/replay/${id}.json`, import.meta.url), "utf8")));
const nets = load("401810062"); // Porter Jr. blk unavailable
const det = load("401810792"); // Holland II 3PT unavailable
const ot = load("401810798");
const col = (key) => TABLE_COLUMNS.find((c) => c.key === key);
const byName = (r, re) => r.replay.players.find((p) => re.test(p.name));

describe("columns", () => {
  it("are PTS FG 3PT FT REB AST TO STL BLK in that order", () => {
    expect(TABLE_COLUMNS.map((c) => c.key)).toEqual(["pts", "fg", "tpt", "ft", "reb", "ast", "to", "stl", "blk"]);
  });
});

describe("teamRows", () => {
  const { replay, capabilities } = ot;
  const home = replay.teams.home.id;

  it("starts with the five starters in slot order, bench = rest of roster in payload order", () => {
    const rows = teamRows(replay, replayStateAt(replay, -1), home, capabilities);
    expect(rows.fallback).toBe(false);
    const roster = replay.players.filter((p) => p.teamId === home);
    expect(rows.onCourt).toEqual(replayStateAt(replay, -1).lineups.teams[home].onCourt);
    expect(new Set(rows.onCourt)).toEqual(new Set(roster.filter((p) => p.starter).map((p) => p.id)));
    expect(rows.bench).toEqual(roster.filter((p) => !rows.onCourt.includes(p.id)).map((p) => p.id));
  });

  it("an entering player takes the leaving player's slot and keeps earlier stats; nobody is lost", () => {
    const groupEnd = replay.events.findIndex((e, i) => e.kind === "substitution" && e.teamId === home && replay.events[i + 1]?.subGroup !== e.subGroup);
    const before = teamRows(replay, replayStateAt(replay, groupEnd - 1), home, capabilities);
    const after = teamRows(replay, replayStateAt(replay, groupEnd), home, capabilities);
    const entered = enteredPlayers(before.onCourt, after.onCourt);
    expect(entered.length).toBeGreaterThan(0);
    for (const id of entered) {
      const slot = after.onCourt.indexOf(id);
      expect(before.onCourt[slot]).not.toBe(id);
      expect(after.bench).toContain(before.onCourt[slot]); // leaving player moved to the bench
    }
    expect(new Set([...after.onCourt, ...after.bench])).toEqual(new Set([...before.onCourt, ...before.bench]));
    // Stats carried: a player's counters never decrease across the game.
    const last = replay.events.length - 1;
    const s1 = replayStateAt(replay, Math.floor(last / 2));
    const s2 = replayStateAt(replay, last);
    for (const id of Object.keys(s1.players)) expect(s2.players[id].pts).toBeGreaterThanOrEqual(s1.players[id].pts);
  });

  it("pending subs are reported per team during a group", () => {
    const i = replay.events.findIndex((e) => e.kind === "substitution");
    const team = replay.events[i].teamId;
    const rows = teamRows(replay, replayStateAt(replay, i), team, capabilities);
    expect(rows.pendingSubs).toContain(i);
  });

  it("invalid lineup → roster fallback with the whole team, no on-court claim", () => {
    const state = structuredClone(replayStateAt(replay, 100));
    state.lineups.teams[home] = { ...state.lineups.teams[home], valid: false, onCourt: [] };
    const rows = teamRows(replay, state, home, capabilities);
    expect(rows.fallback).toBe(true);
    expect(rows.onCourt).toEqual([]);
    expect(rows.bench).toEqual(replay.players.filter((p) => p.teamId === home).map((p) => p.id));
  });

  it("lineup capability unavailable for the team → fallback", () => {
    const caps = [...capabilities, { family: "lineups", level: "unavailable", reasons: ["x"], teams: [home], interval: { from: 50, to: 200 }, scope: "team" }];
    expect(teamRows(replay, replayStateAt(replay, 100), home, caps).fallback).toBe(true);
    expect(teamRows(replay, replayStateAt(replay, 10), home, caps).fallback).toBe(false);
  });

  it("never reads the dnp flag (rows identical with dnp flipped)", () => {
    const flipped = { ...replay, players: replay.players.map((p) => ({ ...p, dnp: !p.dnp })) };
    expect(teamRows(flipped, replayStateAt(replay, -1), home, capabilities)).toEqual(teamRows(replay, replayStateAt(replay, -1), home, capabilities));
  });
});

describe("cellValue", () => {
  it("formats m/a shooting, plain counters, and supported zero", () => {
    const row = { pts: 12, fgm: 5, fga: 9, tpm: 0, tpa: 0, ftm: 2, fta: 2, reb: 0 };
    expect(cellValue(row, col("fg"))).toEqual({ text: "5/9", unavailable: false, zero: false });
    expect(cellValue(row, col("tpt"))).toEqual({ text: "0/0", unavailable: false, zero: true });
    expect(cellValue(row, col("pts"))).toEqual({ text: "12", unavailable: false, zero: false });
    expect(cellValue(row, col("reb"))).toEqual({ text: "0", unavailable: false, zero: true });
  });

  it("unavailable is '—', distinct from 0", () => {
    expect(cellValue({ blk: 0 }, col("blk"), false)).toEqual({ text: "—", unavailable: true, zero: false });
  });

  it("Porter Jr. BLK in 401810062 → '—'; teammates' BLK supported", () => {
    const { replay, capabilities } = nets;
    const porter = byName(nets, /Porter Jr/);
    const mate = replay.players.find((p) => p.teamId === porter.teamId && p.id !== porter.id);
    const last = replay.events.length - 1;
    const state = replayStateAt(replay, last);
    expect(columnAvailable(capabilities, col("blk"), porter, last)).toBe(false);
    expect(cellValue(state.players[porter.id], col("blk"), columnAvailable(capabilities, col("blk"), porter, last)).text).toBe("—");
    expect(columnAvailable(capabilities, col("blk"), mate, last)).toBe(true);
    expect(columnAvailable(capabilities, col("pts"), porter, last)).toBe(true);
  });

  it("Holland II 3PT in 401810792 → '—'; his FG and DET teammates' 3PT supported (teamTotal limit is not a player limit)", () => {
    const { replay, capabilities } = det;
    const holland = byName(det, /Holland II/);
    const mate = replay.players.find((p) => p.teamId === holland.teamId && p.id !== holland.id);
    const last = replay.events.length - 1;
    const state = replayStateAt(replay, last);
    const avail = columnAvailable(capabilities, col("tpt"), holland, last);
    expect(avail).toBe(false);
    expect(cellValue(state.players[holland.id], col("tpt"), avail).text).toBe("—");
    expect(columnAvailable(capabilities, col("fg"), holland, last)).toBe(true);
    expect(columnAvailable(capabilities, col("tpt"), mate, last)).toBe(true);
  });
});

describe("changed cells and activity (forward only)", () => {
  const { replay } = ot;
  const made = replay.events.findIndex((e) => e.kind === "field_goal" && e.made && e.roles?.assister);

  it("a natural forward step marks the changed cells of the event", () => {
    const e = replay.events[made];
    const cells = changedCells(replay, made - 1, made);
    expect(cells.has(`${e.roles.shooter}:pts`)).toBe(true);
    expect(cells.has(`${e.roles.shooter}:fg`)).toBe(true);
    expect(cells.has(`${e.roles.assister}:ast`)).toBe(true);
    expect(cells.has(`${e.roles.assister}:pts`)).toBe(false);
  });

  it("nothing on seek (backwards, zero or large step), when paused, or at mount", () => {
    expect(changedCells(replay, made, made - 1).size).toBe(0);
    expect(changedCells(replay, made, made).size).toBe(0);
    expect(changedCells(replay, made - NATURAL_STEP - 1, made).size).toBe(0);
    expect(changedCells(replay, made - 1, made, { playing: false }).size).toBe(0);
    expect(activityTeams(replay, made + 5, made).size).toBe(0);
    expect(activityTeams(replay, made - 1, made, { playing: false }).size).toBe(0);
    expect(isNaturalStep(undefined, 3)).toBe(false);
  });

  it("activity reports the scorer's team only; substitutions and team-only events do not count", () => {
    const e = replay.events[made];
    const shooterTeam = replay.players.find((p) => p.id === e.roles.shooter).teamId;
    expect([...activityTeams(replay, made - 1, made)]).toEqual([shooterTeam]);
    const sub = replay.events.findIndex((x) => x.kind === "substitution");
    expect(activityTeams(replay, sub - 1, sub).size).toBe(0);
    const teamOnly = replay.state.patches.findIndex((p) => p.teams && !p.players);
    if (teamOnly >= 0) expect(activityTeams(replay, teamOnly - 1, teamOnly).size).toBe(0);
  });
});

describe("enteredPlayers", () => {
  it("lists only new ids; none without a previous lineup", () => {
    expect(enteredPlayers(["a", "b", "c", "d", "e"], ["a", "x", "c", "d", "y"])).toEqual(["x", "y"]);
    expect(enteredPlayers([], ["a"])).toEqual([]);
    expect(enteredPlayers(undefined, ["a"])).toEqual([]);
  });
});

describe("rtlTabIndex", () => {
  it("ArrowLeft = next, ArrowRight = previous (clamped), Home/End", () => {
    expect(rtlTabIndex("ArrowLeft", 0, 2)).toBe(1);
    expect(rtlTabIndex("ArrowLeft", 1, 2)).toBe(1);
    expect(rtlTabIndex("ArrowRight", 1, 2)).toBe(0);
    expect(rtlTabIndex("ArrowRight", 0, 2)).toBe(0);
    expect(rtlTabIndex("Home", 1, 2)).toBe(0);
    expect(rtlTabIndex("End", 0, 2)).toBe(1);
    expect(rtlTabIndex("ArrowUp", 0, 2)).toBeNull();
  });
});
