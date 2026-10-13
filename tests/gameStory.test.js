import { describe, expect, it } from "vitest";
import { describeGameTime, getLowPoint, getNightSummary, getTags, orderByStory, storyScore } from "@/utils/gameStory";
import { buildStory } from "@/lib/story";
import { game as playoffGame } from "./fixtures";
import chiAtGsw from "./fixtures/espn-chi-gsw-ot.json";
import memAtPhi from "./fixtures/espn-mem-phi.json";

const recap = (home, away, home_score, away_score, extra = {}) => ({
  home_team: home,
  away_team: away,
  home_score,
  away_score,
  title: "",
  content: "",
  ...extra,
});

const bullsOt = recap("Golden State Warriors", "Chicago Bulls", 124, 130, { story: buildStory(chiAtGsw) });
const sixers = recap("Philadelphia 76ers", "Memphis Grizzlies", 139, 129, { story: buildStory(memAtPhi) });

describe("getTags", () => {
  it("tags a late comeback in overtime", () => {
    expect(getTags(bullsOt)).toEqual([
      { key: "comeback", label: "מהפך מ־10" },
      { key: "ot", label: "הארכה" },
    ]);
  });

  it("puts a big night first", () => {
    const story = buildStory(memAtPhi);
    story.top_players.home[0] = { ...story.top_players.home[0], pts: 83 };
    expect(getTags({ ...sixers, story })[0]).toEqual({ key: "perf", label: "83 נקודות" });
  });

  it("counts lead changes and win streaks", () => {
    const tags = getTags({ ...sixers, story: { ...sixers.story, winner_min_wp: 0.4 }, streaks: { home: "W6", away: "L5" } });
    expect(tags).toEqual([
      { key: "seesaw", label: "18 חילופי הובלה" },
      { key: "streak", label: "6 ניצחונות ברצף" },
    ]);
  });

  it("works without a story", () => {
    expect(getTags(playoffGame)).toEqual([
      { key: "playoffs", label: "פלייאוף" },
      { key: "close", label: "צמוד עד הסוף" },
    ]);
    expect(getTags(recap("Utah Jazz", "Charlotte Hornets", 140, 110))).toEqual([{ key: "blowout", label: "הפרש 30" }]);
    expect(getTags(recap("Utah Jazz", "Charlotte Hornets", null, null))).toEqual([]);
  });

  it("keeps Portland near the top", () => {
    expect(getTags(recap("Portland Trail Blazers", "Utah Jazz", 100, 99))[0].key).toBe("deni");
  });
});

describe("storyScore", () => {
  it("ranks a comeback in overtime above a regular win", () => {
    const plain = recap("Utah Jazz", "Charlotte Hornets", 120, 105);
    expect(orderByStory([plain, bullsOt])).toEqual([bullsOt, plain]);
    expect(storyScore(bullsOt)).toBeGreaterThan(storyScore({ ...bullsOt, story: undefined }));
  });
});

describe("getNightSummary", () => {
  const plain = (home, away, extra) => recap(home, away, 110, 100, extra);
  const night = [
    bullsOt,
    { ...sixers, headline: "פיין קלע 8 מ־8 לשלוש" },
    plain("Utah Jazz", "Charlotte Hornets", { headline: "יוטה ניצחה" }),
    plain("Detroit Pistons", "Brooklyn Nets"),
  ];

  it("leads with the top headline and lists three more", () => {
    const withHeadline = { ...bullsOt, headline: "הבולס ניצחו בהארכה" };
    const s = getNightSummary([withHeadline, ...night.slice(1)]);
    expect(s.show).toBe(true);
    expect(s.lead).toEqual({ type: "headline", game: withHeadline });
    expect(s.stories.map((g) => g.headline)).toEqual(["פיין קלע 8 מ־8 לשלוש", "יוטה ניצחה"]);
    expect(s.counts).toEqual({ games: 4, overtimes: 1, comebacks: 2, close: 0, blowouts: 0 }); // the 76ers were down 14
  });

  it("leads with a 50-point night, and leaves out the favorite team", () => {
    const story = buildStory(memAtPhi);
    story.top_players.home[0] = { ...story.top_players.home[0], pts: 83 };
    const big = { ...sixers, story, headline: "83 נקודות" };
    const s = getNightSummary([big, ...night.slice(2)], { favorite: "Utah Jazz" });
    expect(s.lead).toMatchObject({ type: "performance", game: big, player: { pts: 83, side: "home" } });
    expect(s.stories).toEqual([]); // the Jazz game is the favorite's
  });

  it("stays hidden on small nights or with nothing to say", () => {
    expect(getNightSummary(night.slice(0, 2)).show).toBe(false);
    expect(getNightSummary([bullsOt, plain("Utah Jazz", "Charlotte Hornets"), plain("Detroit Pistons", "Brooklyn Nets")]).show).toBe(false);
  });
});

describe("game time", () => {
  it("describes a moment in the game", () => {
    expect(describeGameTime(2790)).toBe("ברבע הרביעי, 1:30 לסיום");
    expect(describeGameTime(30)).toBe("ברבע הראשון, 11:30 לסיום");
    expect(describeGameTime(1440)).toBe("בסיום הרבע השני");
    expect(describeGameTime(3000)).toBe("בהארכה, 3:00 לסיום");
    expect(describeGameTime(3300)).toBe("בהארכה השנייה, 3:00 לסיום");
  });

  it("finds the winner's worst moment", () => {
    expect(getLowPoint(bullsOt)).toMatchObject({ team: "בולס", pct: 2 });
    expect(getLowPoint(bullsOt).when).toMatch(/^ברבע הרביעי/);
    expect(getLowPoint(recap("Utah Jazz", "Charlotte Hornets", 110, 100))).toBeNull();
  });
});
