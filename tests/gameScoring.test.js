import { describe, expect, it } from "vitest";
import { getGameReason, orderGames, scoreGame } from "@/utils/gameScoring";
import { game } from "./fixtures";

const regular = (home, away, title, home_score, away_score) => ({
  home_team: home,
  away_team: away,
  title,
  content: "",
  home_score,
  away_score,
});

describe("getGameReason", () => {
  it("tags playoff games", () => {
    expect(getGameReason(game)).toEqual({ key: "playoffs", label: "פלייאוף" });
  });

  it("tags Portland games first", () => {
    const blazers = regular("Portland Trail Blazers", "Utah Jazz", "", 100, 99);
    expect(getGameReason(blazers).key).toBe("deni");
  });

  it("tags upsets and close games", () => {
    const upset = regular("Boston Celtics", "Washington Wizards", "בוסטון סלטיקס (50-10) 90 – 110 וושינגטון ויזארדס (15-45)", 90, 110);
    expect(getGameReason(upset).key).toBe("upset");
    const close = regular("Utah Jazz", "Charlotte Hornets", "", 101, 98);
    expect(getGameReason(close).key).toBe("close");
  });

  it("ignores records early in the season", () => {
    const early = regular("Utah Jazz", "Charlotte Hornets", "יוטה ג'אז (1-0) 120 – 100 שארלוט הורנטס (1-0)", 120, 100);
    expect(getGameReason(early)).toBeNull(); // not a "top matchup" at 1-0 vs 1-0
  });

  it("doesn't call a game without scores close", () => {
    expect(getGameReason(regular("Utah Jazz", "Charlotte Hornets", "", null, null))).toBeNull();
  });
});

describe("ranking", () => {
  it("puts popular, close and Portland games first", () => {
    const blowout = regular("Utah Jazz", "Charlotte Hornets", "", 130, 90);
    const close = regular("Utah Jazz", "Charlotte Hornets", "", 101, 99);
    const lakers = regular("Los Angeles Lakers", "Utah Jazz", "", 130, 90);
    const blazers = regular("Portland Trail Blazers", "Utah Jazz", "", 130, 90);

    expect(scoreGame(close)).toBeGreaterThan(scoreGame(blowout));
    const { featured, rest } = orderGames([blowout, close, lakers, blazers], 2);
    expect(featured).toEqual([blazers, lakers]);
    expect(rest).toEqual([close, blowout]);
  });
});
