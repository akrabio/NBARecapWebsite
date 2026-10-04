import { describe, expect, it } from "vitest";
import { getSnippet, matchTablesToTeams, parseRecap, tablePlayers, tableValue } from "@/lib/recap";
import { game, recapContent } from "./fixtures";

describe("parseRecap", () => {
  const recap = parseRecap(recapContent);

  it("pulls out the bold header line and its series record", () => {
    expect(recap.header).toContain("ניו יורק ניקס (53-29)");
    expect(recap.series).toBe("2-1");
  });

  it("splits paragraphs and stat tables, in order", () => {
    expect(recap.blocks.map((b) => b.type)).toEqual(["text", "text", "table", "table"]);
    expect(recap.tables).toHaveLength(2);
    expect(recap.tables[0].head).toEqual(["TEAM", "PTS", "AST", "REB", "TO", "+/-"]);
  });

  it("handles empty content", () => {
    expect(parseRecap("")).toEqual({ header: null, series: null, blocks: [], tables: [] });
  });
});

describe("stat tables", () => {
  const [nyk, sas] = parseRecap(recapContent).tables;

  it("reads values by row label, ignoring the team abbreviation", () => {
    expect(tableValue(nyk, "Team", "PTS")).toBe(111);
    expect(tableValue(sas, "Bench", "PTS")).toBe(25);
    expect(tableValue(nyk, "Team", "MISSING")).toBeNaN();
  });

  it("lists only player rows", () => {
    expect(tablePlayers(nyk).map((row) => row[0])).toEqual(["Player NYK"]);
  });

  it("matches tables to teams by points", () => {
    const tables = matchTablesToTeams(game, [nyk, sas]);
    expect(tables.home).toBe(nyk); // Knicks are home, 111
    expect(tables.away).toBe(sas);
  });

  it("gives up when the points don't match the score", () => {
    expect(matchTablesToTeams({ ...game, home_score: 100 }, [nyk, sas])).toBeNull();
    expect(matchTablesToTeams({ ...game, home_score: null, away_score: null }, [nyk, sas])).toBeNull();
  });
});

describe("getSnippet", () => {
  it("returns the first real paragraph, without markdown", () => {
    expect(getSnippet(recapContent)).toMatch(/^סן אנטוניו ספרס ניצחה/);
    expect(getSnippet("**short**\n\n**A long enough paragraph with bold text in it.**")).toBe(
      "A long enough paragraph with bold text in it."
    );
  });
});
