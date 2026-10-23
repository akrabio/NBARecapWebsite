import { describe, expect, it } from "vitest";
import { buildStandingsSnapshot, conferenceTable, rankMove, standingsByTeam } from "@/lib/standings";
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

describe("standingsByTeam", () => {
  const before = snapshot("2026-03-09", ["Detroit Pistons", "Boston Celtics"], ["Minnesota Timberwolves", "Los Angeles Lakers", "Houston Rockets"]);
  const after = snapshot("2026-03-10", ["Detroit Pistons", "Boston Celtics"], ["Houston Rockets", "Los Angeles Lakers", "Minnesota Timberwolves"]);

  it("ranks teams and remembers the previous rank", () => {
    const byTeam = standingsByTeam(after, before);
    expect(byTeam["Houston Rockets"]).toMatchObject({ conf: "W", rank: 1, prevRank: 3 });
    expect(byTeam["Boston Celtics"]).toMatchObject({ conf: "E", rank: 2, prevRank: 2 });
  });

  it("has no previous rank without a previous night", () => {
    expect(standingsByTeam(after, null)["Houston Rockets"].prevRank).toBeNull();
    expect(standingsByTeam(null, null)).toEqual({});
  });
});

describe("rankMove", () => {
  it("counts places gained and lost", () => {
    expect(rankMove({ rank: 4, prevRank: 6, w: 10, l: 5 })).toBe(2);
    expect(rankMove({ rank: 6, prevRank: 4, w: 10, l: 5 })).toBe(-2);
  });

  it("ignores moves early in the season or without a previous night", () => {
    expect(rankMove({ rank: 1, prevRank: 3, w: 2, l: 0 })).toBe(0);
    expect(rankMove({ rank: 1, prevRank: null, w: 20, l: 5 })).toBe(0);
  });
});

describe("conferenceTable", () => {
  const byTeam = {
    "Boston Celtics": { conf: "E", rank: 2, prevRank: 1, w: 18, l: 7, streak: "L1" },
    "Detroit Pistons": { conf: "E", rank: 1, prevRank: 2, w: 20, l: 6, streak: "W3" },
    "New York Knicks": { conf: "E", rank: 3, prevRank: 3, w: 15, l: 11, streak: "W1" },
    "Houston Rockets": { conf: "W", rank: 1, prevRank: 1, w: 21, l: 4, streak: "W5" },
  };

  it("orders one conference with games behind and moves", () => {
    expect(conferenceTable(byTeam, "E").map((r) => [r.team, r.gb, r.move])).toEqual([
      ["Detroit Pistons", 0, 1],
      ["Boston Celtics", 1.5, -1],
      ["New York Knicks", 5, 0],
    ]);
  });
});
