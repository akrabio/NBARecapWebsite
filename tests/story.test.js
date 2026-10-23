import { describe, expect, it } from "vitest";
import { buildStory, gameLength, gameSeconds } from "@/lib/story";
import chiAtGsw from "./fixtures/espn-chi-gsw-ot.json";
import memAtPhi from "./fixtures/espn-mem-phi.json";

// Real ESPN summaries (trimmed) from March 10, 2026:
// Bulls 130, Warriors 124 (OT) and Grizzlies 129, 76ers 139.

describe("gameSeconds", () => {
  it("counts game time from the clock left in the period", () => {
    expect(gameSeconds(1, "12:00")).toBe(0);
    expect(gameSeconds(1, "11:30")).toBe(30);
    expect(gameSeconds(2, "12:00")).toBe(720);
    expect(gameSeconds(4, "0.0")).toBe(2880);
    expect(gameSeconds(4, "45.2")).toBeCloseTo(2834.8);
  });

  it("uses 5-minute overtimes", () => {
    expect(gameSeconds(5, "5:00")).toBe(2880);
    expect(gameSeconds(5, "0.0")).toBe(3180);
    expect(gameSeconds(6, "2:30")).toBe(3330);
    expect(gameLength(6)).toBe(3480);
  });
});

describe("buildStory", () => {
  it("samples win probability and margin every 30 seconds, overtime included", () => {
    const story = buildStory(chiAtGsw);
    expect(story.periods).toBe(5);
    expect(story.wp).toHaveLength(3180 / 30 + 1);
    expect(story.margin).toHaveLength(3180 / 30 + 1);
    expect(story.margin.at(-1)).toBe(124 - 130); // home minus away
    expect(story.score).toHaveLength(3180 / 30 + 1);
    expect(story.score[0]).toEqual([0, 0]);
    expect(story.score.at(-1)).toEqual([130, 124]); // away, home
    expect(story.wp.at(-1)).toBe(0); // the away team won
  });

  it("finds the comeback: the winner's lowest win probability and when", () => {
    const story = buildStory(chiAtGsw);
    expect(story.winner_min_wp).toBe(0.022);
    expect(story.winner_min_wp_at).toBeGreaterThan(2700); // late in the 4th
    expect(story.winner_min_wp_at).toBeLessThan(2880);
    expect(story.max_lead).toEqual({ home: 10, away: 13 });
    expect(story.lead_changes).toBe(9);
  });

  it("counts lead changes and keeps each side's top scorers", () => {
    const story = buildStory(memAtPhi);
    expect(story.periods).toBe(4);
    expect(story.lead_changes).toBe(18);
    expect(story.max_lead).toEqual({ home: 12, away: 14 });
    expect(story.top_players.home[0]).toMatchObject({ name: "Cameron Payne", pts: 32, ast: 10, tp: "8-8" });
    expect(story.top_players.home).toHaveLength(3);
    expect(story.top_players.away[0].name).toBe("Ty Jerome");
  });

  it("keeps the margin when ESPN has no win probability", () => {
    const story = buildStory({ ...memAtPhi, winprobability: undefined });
    expect(story.wp).toBeNull();
    expect(story.winner_min_wp).toBeNull();
    expect(story.margin).toHaveLength(97);
    expect(story.lead_changes).toBe(18);
  });

  it("works from the box score alone", () => {
    const story = buildStory({ ...memAtPhi, plays: [], winprobability: [] });
    expect(story).toMatchObject({ periods: 4, wp: null, margin: null, score: null, max_lead: null });
    expect(story.top_players.home[0].name).toBe("Cameron Payne");
  });

  it("skips games that aren't final", () => {
    const live = structuredClone(memAtPhi);
    live.header.competitions[0].status.type.completed = false;
    expect(buildStory(live)).toBeNull();
    expect(buildStory(null)).toBeNull();
  });
});
