import { describe, expect, it } from "vitest";
import { scoreGame } from "@/utils/gameScoring";
import { getTags, orderByStory } from "@/utils/gameStory";
import { game } from "./fixtures";

const regular = (home, away, title, home_score, away_score) => ({
  home_team: home,
  away_team: away,
  title,
  content: "",
  home_score,
  away_score,
});

describe("getTags without a story", () => {
  it("tags playoff games", () => {
    expect(getTags(game)[0]).toEqual({ key: "playoffs", label: "פלייאוף" });
  });

  it("tags Portland games first", () => {
    const blazers = regular("Portland Trail Blazers", "Utah Jazz", "", 100, 99);
    expect(getTags(blazers)[0].key).toBe("deni");
  });

  it("tags upsets and close games", () => {
    const upset = regular("Boston Celtics", "Washington Wizards", "בוסטון סלטיקס (50-10) 90 – 110 וושינגטון ויזארדס (15-45)", 90, 110);
    expect(getTags(upset)[0].key).toBe("upset");
    const close = regular("Utah Jazz", "Charlotte Hornets", "", 101, 98);
    expect(getTags(close)[0].key).toBe("close");
  });

  it("ignores records early in the season", () => {
    const early = regular("Utah Jazz", "Charlotte Hornets", "יוטה ג'אז (1-0) 120 – 100 שארלוט הורנטס (1-0)", 120, 100);
    expect(getTags(early)).toEqual([]); // not a "top matchup" at 1-0 vs 1-0
  });

  it("doesn't call a game without scores close", () => {
    expect(getTags(regular("Utah Jazz", "Charlotte Hornets", "", null, null))).toEqual([]);
  });
});

describe("ranking", () => {
  it("puts popular, close and Portland games first", () => {
    const blowout = regular("Utah Jazz", "Charlotte Hornets", "", 130, 90);
    const close = regular("Utah Jazz", "Charlotte Hornets", "", 101, 99);
    const lakers = regular("Los Angeles Lakers", "Utah Jazz", "", 130, 90);
    const blazers = regular("Portland Trail Blazers", "Utah Jazz", "", 130, 90);

    expect(scoreGame(close)).toBeGreaterThan(scoreGame(blowout));
    expect(orderByStory([blowout, close, lakers, blazers])).toEqual([blazers, lakers, close, blowout]);
  });
});
