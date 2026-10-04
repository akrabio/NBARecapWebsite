import { describe, expect, it } from "vitest";
import { matchVideo } from "@/lib/youtube";
import { oklchToHex, visualRtl } from "@/lib/og";

// Real titles from the channel, newest first
const videos = [
  { videoId: "heat-raptors", title: "Miami Heat vs Toronto Raptors Full Game Highlights - October 3, 2026 | NBA Preseason" },
  { videoId: "gsw-mem", title: "Golden State Warriors vs Memphis Grizzlies Full Game Highlights - July 19, 2026 | NBA Summer League" },
  { videoId: "min-lac", title: "Minnesota Timberwolves vs Los Angeles Clippers Full Game Highlights - July 17, 2026" },
  { videoId: "uta-por", title: "Utah Jazz vs Portland Trail Blazers Full Game Highlights - July 17, 2026 | NBA Summer League" },
  { videoId: "cha-orl", title: "Charlotte Hornets vs Orlando Magic Full Game Highlights - July 16, 2026" },
];

describe("matchVideo", () => {
  it("matches both teams in either order", () => {
    expect(matchVideo(videos, "Toronto Raptors", "Miami Heat", "2026-10-03")).toBe("heat-raptors");
  });

  it("matches 'LA Clippers' to 'Los Angeles Clippers' and multi-word nicknames", () => {
    expect(matchVideo(videos, "LA Clippers", "Minnesota Timberwolves", "2026-07-17")).toBe("min-lac");
    expect(matchVideo(videos, "Portland Trail Blazers", "Utah Jazz", "2026-07-17")).toBe("uta-por");
  });

  it("allows a day's difference for time zones, but not another meeting", () => {
    expect(matchVideo(videos, "Memphis Grizzlies", "Golden State Warriors", "2026-07-18")).toBe("gsw-mem");
    expect(matchVideo(videos, "Memphis Grizzlies", "Golden State Warriors", "2026-07-10")).toBeNull();
  });

  it("matches whole words only, and never falls back to another game", () => {
    expect(matchVideo(videos, "Brooklyn Nets", "Orlando Magic", "2026-07-16")).toBeNull(); // not "Hornets"
    expect(matchVideo(videos, "New York Knicks", "San Antonio Spurs", "2026-06-13")).toBeNull();
  });
});

describe("share image helpers", () => {
  it("puts Hebrew in visual order, keeping Latin and digits", () => {
    expect(visualRtl("ניקס")).toBe("סקינ");
    expect(visualRtl("סיכומי NBA")).toBe("NBA ימוכיס");
    expect(visualRtl("76'רס")).toBe("סר'76");
  });

  it("converts OKLCH team colors to hex", () => {
    expect(oklchToHex("oklch(0.52 0.16 155)")).toBe("#00823c");
    expect(oklchToHex("oklch(1 0 0)")).toBe("#ffffff");
  });
});
