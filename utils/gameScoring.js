import { extractRecord, extractSeriesRecord, getWinner } from "./gameUtils";

// Records this short say little about team quality (1-0 vs 1-0 isn't a "top
// matchup"), so they don't count until both teams have played this many games.
const MIN_GAMES_FOR_RECORDS = 10;

// Team records (wins-losses) from the game title, looked up by team name.
// The title lists the home team first, so position-based parsing would swap them.
const getTeamRecords = (game) => {
  const parse = (team) => {
    const record = extractRecord(game.title, team);
    if (!record) return null;
    const [wins, losses] = record.split(/[-:‐-―]/).map(Number);
    return wins + losses >= MIN_GAMES_FOR_RECORDS ? { wins, losses } : null;
  };
  const away = parse(game.away_team);
  const home = parse(game.home_team);
  return away && home ? { away, home } : null;
};

// Calculate win percentage from a record
const getWinPercentage = (record) => {
  const totalGames = record.wins + record.losses;
  return totalGames > 0 ? record.wins / totalGames : 0;
};

// Teams with largest worldwide fanbases
const POPULAR_TEAMS = [
  "lakers",
  "warriors",
  "bulls",
  "celtics",
  "knicks",
  "heat",
];

// Check if a game involves a popular team
const hasPopularTeam = (game) => {
  const homeTeam = game.home_team?.toLowerCase() || "";
  const awayTeam = game.away_team?.toLowerCase() || "";
  return POPULAR_TEAMS.some(
    (team) => homeTeam.includes(team) || awayTeam.includes(team)
  );
};

const isPortlandGame = (game) =>
  [game.home_team, game.away_team].some((t) => /trail blazers|portland/i.test(t || ""));

// Win percentages and whether the underdog won
const getMatchup = (game) => {
  const records = getTeamRecords(game);
  if (!records) return null;
  const awayPct = getWinPercentage(records.away);
  const homePct = getWinPercentage(records.home);
  const winner = getWinner(game);
  const winnerPct = winner === "away" ? awayPct : homePct;
  const loserPct = winner === "away" ? homePct : awayPct;
  const isUpset = winner !== null && loserPct > 0.6 && winnerPct <= 0.5;
  return { awayPct, homePct, isUpset, diff: Math.abs(awayPct - homePct) };
};

// Score a game based on priority criteria
export const scoreGame = (game) => {
  let score = 0;

  // Priority 1: Portland Trail Blazers (highest priority)
  if (isPortlandGame(game)) {
    score += 10000; // Guaranteed top priority
  }

  // Priority 1.5: Popular teams with large global fanbases
  if (hasPopularTeam(game)) {
    score += 200;
  }

  const matchup = getMatchup(game);
  if (matchup) {
    // Priority 2: Matchup between two good teams (both >= 0.5)
    if (matchup.awayPct >= 0.5 && matchup.homePct >= 0.5) {
      // Higher average win percentage = better matchup
      score += ((matchup.awayPct + matchup.homePct) / 2) * 1000;
    }

    // Priority 3: Upset - bad team beat good team
    if (matchup.isUpset) {
      // More extreme difference = more interesting upset
      score += matchup.diff * 1000;
    }
  }

  // Priority 4: Close game (lower score differential = more exciting)
  // (Without scores, a game is neither close nor a blowout.)
  const scoreDiff = getWinner(game) ? Math.abs(game.home_score - game.away_score) : Infinity;
  // Inverse scoring: closer games get more points
  // Max 100 points for games decided by 20 or less
  if (scoreDiff <= 20) {
    score += (20 - scoreDiff) * 5;
  }

  return score;
};

// Splits a day's games into featured and the rest, both sorted by score.
export const orderGames = (games, featuredCount = 3) => {
  const sorted = [...games].sort((a, b) => scoreGame(b) - scoreGame(a));
  return { featured: sorted.slice(0, featuredCount), rest: sorted.slice(featuredCount) };
};

// A short label explaining why a game is worth reading, or null.
export const getGameReason = (game) => {
  if (isPortlandGame(game)) return { key: "deni", label: "דני אבדיה" };
  if (extractSeriesRecord(game.content)) return { key: "playoffs", label: "פלייאוף" };
  const matchup = getMatchup(game);
  if (matchup?.isUpset) return { key: "upset", label: "הפתעה" };
  if (getWinner(game) && Math.abs(game.home_score - game.away_score) <= 5) return { key: "close", label: "צמוד עד הסוף" };
  if (matchup && matchup.awayPct >= 0.5 && matchup.homePct >= 0.5) return { key: "top", label: "קרב צמרת" };
  return null;
};
