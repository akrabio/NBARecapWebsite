import { describe, expect, it } from "vitest";
import {
  extractRecord,
  extractSeriesRecord,
  formatScore,
  getWinner,
  matchupText,
  normalizeApostrophes,
} from "@/utils/gameUtils";
import { game } from "./fixtures";

describe("extractRecord", () => {
  it("finds each team's record by its Hebrew name, not by position", () => {
    expect(extractRecord(game.title, "New York Knicks")).toBe("53-29");
    expect(extractRecord(game.title, "San Antonio Spurs")).toBe("62-20");
  });

  it("matches English names", () => {
    expect(extractRecord("Boston Celtics (40-20) 101 – 99 Miami Heat (30-30)", "Miami Heat")).toBe("30-30");
  });

  it("tolerates small spelling differences", () => {
    expect(extractRecord("**אוקלהומה סיטי ת׳אנדר (60-10) 120 – 100 יוטה ג'אז (20-50)**", "Oklahoma City Thunder")).toBe("60-10");
    expect(extractRecord("ממפיס גריזליז (30-30) 99 – 98 מיאמי היט (31-29)", "Memphis Grizzlies")).toBe("30-30");
  });

  it("knows the 76ers' alternate Hebrew name", () => {
    expect(extractRecord("פילדלפיה סיקסרס (24-58) 99 – 120 בוסטון סלטיקס (61-21)", "Philadelphia 76ers")).toBe("24-58");
  });

  it("returns null when the team isn't there", () => {
    expect(extractRecord(game.title, "Utah Jazz")).toBeNull();
    expect(extractRecord("", "Utah Jazz")).toBeNull();
  });
});

describe("extractSeriesRecord", () => {
  it("reads the series from the header line", () => {
    expect(extractSeriesRecord(game.content)).toBe("2-1");
  });

  it("ignores direction marks and returns null outside the playoffs", () => {
    expect(extractSeriesRecord("**א (1-0) 1 – 2 ב (0-1) | סדרה:‏ 3-2**")).toBe("3-2");
    expect(extractSeriesRecord("**א (1-0) 1 – 2 ב (0-1)**\n\nסדרה: 1-0 בפסקה אחרת")).toBeNull();
  });
});

describe("normalizeApostrophes", () => {
  it("maps geresh and curly quotes to a plain apostrophe", () => {
    expect(normalizeApostrophes("ג׳אז ת’אנדר מג‘יק")).toBe("ג'אז ת'אנדר מג'יק");
  });
});

describe("scores", () => {
  it("finds the winner, or nobody when a score is missing or tied", () => {
    expect(getWinner(game)).toBe("away");
    expect(getWinner({ home_score: 100, away_score: 90 })).toBe("home");
    expect(getWinner({ home_score: null, away_score: 90 })).toBeNull();
    expect(getWinner({ home_score: 0, away_score: 0 })).toBeNull();
  });

  it("formats scores and matchups", () => {
    const name = (team) => team.split(" ").pop();
    expect(formatScore(0)).toBe(0);
    expect(formatScore(null)).toBe("–");
    expect(matchupText(game, name)).toBe("Spurs 115–111 Knicks");
    expect(matchupText({ ...game, home_score: null }, name)).toBe("Spurs נגד Knicks");
  });
});
