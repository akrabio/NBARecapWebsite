// Team primary colors in OKLCH, keyed by the English team names used in the
// database (see nbaEnToHe in utils/consts.js).
export const nbaTeamColors = {
  "Atlanta Hawks": { primary: "oklch(0.62 0.18 25)" },
  "Boston Celtics": { primary: "oklch(0.52 0.16 155)" },
  "Brooklyn Nets": { primary: "oklch(0.25 0 0)" },
  "Charlotte Hornets": { primary: "oklch(0.50 0.15 255)" },
  "Chicago Bulls": { primary: "oklch(0.50 0.22 25)" },
  "Cleveland Cavaliers": { primary: "oklch(0.40 0.15 25)" },
  "Dallas Mavericks": { primary: "oklch(0.35 0.10 255)" },
  "Denver Nuggets": { primary: "oklch(0.35 0.10 255)" },
  "Detroit Pistons": { primary: "oklch(0.45 0.18 25)" },
  "Golden State Warriors": { primary: "oklch(0.50 0.15 245)" },
  "Houston Rockets": { primary: "oklch(0.50 0.22 25)" },
  "Indiana Pacers": { primary: "oklch(0.35 0.10 255)" },
  "LA Clippers": { primary: "oklch(0.45 0.18 25)" },
  "Los Angeles Lakers": { primary: "oklch(0.50 0.18 285)" },
  "Memphis Grizzlies": { primary: "oklch(0.35 0.10 240)" },
  "Miami Heat": { primary: "oklch(0.40 0.15 25)" },
  "Milwaukee Bucks": { primary: "oklch(0.30 0.08 155)" },
  "Minnesota Timberwolves": { primary: "oklch(0.35 0.10 255)" },
  "New Orleans Pelicans": { primary: "oklch(0.35 0.10 255)" },
  "New York Knicks": { primary: "oklch(0.45 0.18 35)" },
  "Oklahoma City Thunder": { primary: "oklch(0.35 0.12 240)" },
  "Orlando Magic": { primary: "oklch(0.35 0.10 240)" },
  "Philadelphia 76ers": { primary: "oklch(0.45 0.18 25)" },
  "Phoenix Suns": { primary: "oklch(0.45 0.18 285)" },
  "Portland Trail Blazers": { primary: "oklch(0.50 0.22 25)" },
  "Sacramento Kings": { primary: "oklch(0.45 0.18 285)" },
  "San Antonio Spurs": { primary: "oklch(0.70 0.05 220)" },
  "Toronto Raptors": { primary: "oklch(0.50 0.22 25)" },
  "Utah Jazz": { primary: "oklch(0.35 0.10 255)" },
  "Washington Wizards": { primary: "oklch(0.35 0.10 255)" },
};

const FALLBACK = { primary: "oklch(0.50 0.15 245)" };

export function getTeamColors(teamName) {
  return nbaTeamColors[teamName] || FALLBACK;
}
