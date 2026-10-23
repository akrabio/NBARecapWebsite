import { describe, expect, it } from "vitest";
import { colorDistance, matchupColors, MIN_COLOR_DISTANCE, nbaTeamColors } from "@/utils/teamColors";

const teams = Object.keys(nbaTeamColors);

describe("matchupColors", () => {
  it("keeps both primaries when they differ", () => {
    expect(matchupColors("Boston Celtics", "Los Angeles Lakers")).toEqual({
      away: nbaTeamColors["Boston Celtics"].primary,
      home: nbaTeamColors["Los Angeles Lakers"].primary,
    });
  });

  it("switches the away team to its secondary when the primaries look alike", () => {
    expect(matchupColors("Philadelphia 76ers", "New York Knicks")).toEqual({
      away: nbaTeamColors["Philadelphia 76ers"].secondary,
      home: nbaTeamColors["New York Knicks"].primary,
    });
  });

  it("tells every pair of teams apart", () => {
    for (const away of teams) {
      for (const home of teams) {
        if (away === home) continue;
        const colors = matchupColors(away, home);
        expect(colorDistance(colors.away, colors.home), `${away} @ ${home}`).toBeGreaterThanOrEqual(MIN_COLOR_DISTANCE);
      }
    }
  });
});
