import { describe, expect, it } from "vitest";
import { buildStandingsSnapshot, standingsByTeam, standingsMoves } from "@/lib/standings";
import espnStandings from "./fixtures/espn-standings.json";

const snapshot = (date, east, west) => ({
  date,
  east: east.map((team) => ({ team, w: 1, l: 0, streak: "W1" })),
  west: west.map((team) => ({ team, w: 1, l: 0, streak: "W1" })),
});

describe("buildStandingsSnapshot", () => {
  it("orders each conference by seed", () => {
    const s = buildStandingsSnapshot(espnStandings, "2026-10-12");
    expect(s.date).toBe("2026-10-12");
    expect(s.east).toHaveLength(15);
    expect(s.west).toHaveLength(15);
    expect(Object.keys(s.east[0])).toEqual(["team", "w", "l", "streak"]);
    expect(s.west.map((r) => r.team)).toContain("Portland Trail Blazers");
  });

  it("returns null for an unexpected response", () => {
    expect(buildStandingsSnapshot({}, "2026-10-12")).toBeNull();
    expect(buildStandingsSnapshot(null, "2026-10-12")).toBeNull();
  });
});

describe("standingsByTeam / standingsMoves", () => {
  const before = snapshot("2026-03-09", ["Detroit Pistons", "Boston Celtics"], ["Minnesota Timberwolves", "Los Angeles Lakers", "Houston Rockets"]);
  const after = snapshot("2026-03-10", ["Detroit Pistons", "Boston Celtics"], ["Houston Rockets", "Los Angeles Lakers", "Minnesota Timberwolves"]);

  it("ranks teams and remembers the previous rank", () => {
    const byTeam = standingsByTeam(after, before);
    expect(byTeam["Houston Rockets"]).toMatchObject({ conf: "W", rank: 1, prevRank: 3 });
    expect(byTeam["Boston Celtics"]).toMatchObject({ conf: "E", rank: 2, prevRank: 2 });
  });

  it("lists only teams that moved, best first", () => {
    const moves = standingsMoves(standingsByTeam(after, before));
    expect(moves.east).toEqual([]);
    expect(moves.west.map((m) => [m.team, m.prevRank, m.rank])).toEqual([
      ["Houston Rockets", 3, 1],
      ["Minnesota Timberwolves", 1, 3],
    ]);
  });

  it("has no moves without a previous night", () => {
    const moves = standingsMoves(standingsByTeam(after, null));
    expect(moves.west).toEqual([]);
    expect(standingsByTeam(null, null)).toEqual({});
  });
});
