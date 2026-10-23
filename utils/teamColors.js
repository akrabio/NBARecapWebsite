// Team colors in OKLCH, keyed by the English team names used in the database
// (see nbaEnToHe in utils/consts.js). `secondary` is used when two teams'
// primaries are too alike to tell apart (see matchupColors). Very light brand
// colors (silver, cream) are toned down so they still show on a light page.
export const nbaTeamColors = {
  "Atlanta Hawks": { primary: "oklch(0.60 0.20 25)", secondary: "oklch(0.78 0.17 116)" },
  "Boston Celtics": { primary: "oklch(0.51 0.14 149)", secondary: "oklch(0.69 0.10 82)" },
  "Brooklyn Nets": { primary: "oklch(0.29 0 0)", secondary: "oklch(0.64 0 0)" },
  "Charlotte Hornets": { primary: "oklch(0.53 0.09 215)", secondary: "oklch(0.30 0.13 279)" },
  "Chicago Bulls": { primary: "oklch(0.54 0.21 17)", secondary: "oklch(0.40 0 0)" },
  "Cleveland Cavaliers": { primary: "oklch(0.40 0.16 7)", secondary: "oklch(0.78 0.16 81)" },
  "Dallas Mavericks": { primary: "oklch(0.43 0.12 248)", secondary: "oklch(0.70 0.03 229)" },
  "Denver Nuggets": { primary: "oklch(0.30 0.07 258)", secondary: "oklch(0.78 0.16 86)" },
  "Detroit Pistons": { primary: "oklch(0.53 0.21 22)", secondary: "oklch(0.44 0.19 265)" },
  "Golden State Warriors": { primary: "oklch(0.40 0.13 262)", secondary: "oklch(0.78 0.16 87)" },
  "Houston Rockets": { primary: "oklch(0.54 0.21 17)", secondary: "oklch(0.70 0.02 234)" },
  "Indiana Pacers": { primary: "oklch(0.32 0.10 256)", secondary: "oklch(0.78 0.16 81)" },
  "LA Clippers": { primary: "oklch(0.53 0.21 22)", secondary: "oklch(0.40 0.13 262)" },
  "Los Angeles Lakers": { primary: "oklch(0.40 0.15 303)", secondary: "oklch(0.78 0.16 80)" },
  "Memphis Grizzlies": { primary: "oklch(0.57 0.08 264)", secondary: "oklch(0.28 0.08 273)" },
  "Miami Heat": { primary: "oklch(0.43 0.17 16)", secondary: "oklch(0.76 0.16 69)" },
  "Milwaukee Bucks": { primary: "oklch(0.38 0.10 149)", secondary: "oklch(0.78 0.06 85)" },
  "Minnesota Timberwolves": { primary: "oklch(0.30 0.07 256)", secondary: "oklch(0.70 0.19 132)" },
  "New Orleans Pelicans": { primary: "oklch(0.30 0.07 256)", secondary: "oklch(0.66 0.09 85)" },
  "New York Knicks": { primary: "oklch(0.52 0.14 249)", secondary: "oklch(0.70 0.17 54)" },
  "Oklahoma City Thunder": { primary: "oklch(0.56 0.14 245)", secondary: "oklch(0.63 0.22 31)" },
  "Orlando Magic": { primary: "oklch(0.55 0.14 246)", secondary: "oklch(0.30 0 0)" },
  "Philadelphia 76ers": { primary: "oklch(0.52 0.14 249)", secondary: "oklch(0.61 0.23 17)" },
  "Phoenix Suns": { primary: "oklch(0.30 0.13 279)", secondary: "oklch(0.65 0.18 42)" },
  "Portland Trail Blazers": { primary: "oklch(0.60 0.20 25)", secondary: "oklch(0.40 0 0)" },
  "Sacramento Kings": { primary: "oklch(0.42 0.14 306)", secondary: "oklch(0.56 0.02 231)" },
  "San Antonio Spurs": { primary: "oklch(0.70 0.02 234)", secondary: "oklch(0.32 0 0)" },
  "Toronto Raptors": { primary: "oklch(0.54 0.21 17)", secondary: "oklch(0.30 0 0)" },
  "Utah Jazz": { primary: "oklch(0.50 0.19 300)", secondary: "oklch(0.30 0 0)" },
  "Washington Wizards": { primary: "oklch(0.32 0.10 255)", secondary: "oklch(0.58 0.23 22)" },
};

const FALLBACK = { primary: "oklch(0.50 0.15 245)", secondary: "oklch(0.70 0.15 60)" };

export function getTeamColors(teamName) {
  return nbaTeamColors[teamName] || FALLBACK;
}

// Colors closer than this (in OKLab) read as the same team color
export const MIN_COLOR_DISTANCE = 0.12;

// Distance between two "oklch(L C H)" colors, in OKLab
export function colorDistance(x, y) {
  const lab = (color) => {
    const [l, c, h] = color.match(/[\d.]+/g).map(Number);
    return [l, c * Math.cos((h * Math.PI) / 180), c * Math.sin((h * Math.PI) / 180)];
  };
  const [p, q] = [lab(x), lab(y)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

// The two teams' colors for anything that shows them side by side: their
// primaries, unless those look alike. Then the away team switches to its
// secondary color first, the home team second.
export function matchupColors(awayTeam, homeTeam) {
  const away = getTeamColors(awayTeam);
  const home = getTeamColors(homeTeam);
  const options = [
    [away.primary, home.primary],
    [away.secondary, home.primary],
    [away.primary, home.secondary],
    [away.secondary, home.secondary],
  ];
  const [a, h] =
    options.find(([a, h]) => colorDistance(a, h) >= MIN_COLOR_DISTANCE) ||
    options.reduce((best, o) => (colorDistance(...o) > colorDistance(...best) ? o : best));
  return { away: a, home: h };
}
