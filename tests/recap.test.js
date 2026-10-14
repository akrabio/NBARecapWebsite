import { describe, expect, it } from "vitest";
import { getSnippet, matchTablesToTeams, parseRecap, splitParagraph, tablePlayers, tableValue } from "@/lib/recap";
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

describe("splitParagraph", () => {
  // A real opening paragraph (77 words, three sentences)
  const long =
    "מינסוטה לוקחת פיקוד על הסדרה ועולה ליתרון 1–2, כשאיו דוסונמו מנהל הצגה בהתקפה ודוחף את הטימברוולבס לניצחון 96:113 על דנבר. הגארד מסיים עם 25 נקודות ו־9 אסיסטים, שולט בקצב ומעניש כל טעות בהגנת הנאגטס. מנגד, דנבר מקבלת עוד מפלצת מספרים מניקולה יוקיץ' עם 27 נקודות ו־15 ריבאונדים, אבל גם מדד פלוס־מינוס גרוע במיוחד של מינוס 21 שמשקף עד כמה הקבוצה שלו קרסה סביבו.";
  const words = (text) => text.split(/\s+/).length;

  it("splits a long paragraph into chunks of whole sentences", () => {
    const chunks = splitParagraph(long);
    expect(chunks).toHaveLength(2);
    expect(chunks.join(" ")).toBe(long);
    expect(chunks[0].endsWith("הנאגטס.")).toBe(true);
    chunks.forEach((chunk) => expect(words(chunk)).toBeLessThanOrEqual(50));
  });

  it("doesn't end on a short stub", () => {
    const chunks = splitParagraph(`${long} סוף.`);
    expect(chunks.join(" ")).toBe(`${long} סוף.`);
    expect(chunks.at(-1).endsWith("סביבו. סוף.")).toBe(true);
  });

  it("leaves short paragraphs, scores and other markdown alone", () => {
    expect(splitParagraph("הספרס ניצחו 3.5 פעמים 96:113. סוף.")).toEqual(["הספרס ניצחו 3.5 פעמים 96:113. סוף."]);
    expect(splitParagraph(`## ${long}`)).toEqual([`## ${long}`]);
    expect(splitParagraph(`- ${long}`)).toEqual([`- ${long}`]);
  });

  it("is applied by parseRecap", () => {
    expect(parseRecap(`${long}\n\nקצר.`).blocks.map((b) => b.type)).toEqual(["text", "text", "text"]);
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
