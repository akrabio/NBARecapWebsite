// Extract team record (wins-losses) from game title
const extractTeamRecords = (game) => {
  const regex = /\((\d+)[:-](\d+)\)/g;
  const matches = [...(game.title?.matchAll(regex) || [])];

  if (matches.length >= 2) {
    const record1 = { wins: parseInt(matches[0][1]), losses: parseInt(matches[0][2]) };
    const record2 = { wins: parseInt(matches[1][1]), losses: parseInt(matches[1][2]) };
    return [record1, record2];
  }
  return null;
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

// Score a game based on priority criteria
export const scoreGame = (game) => {
  let score = 0;

  // Priority 1: Portland Trail Blazers (highest priority)
  const isPortland =
    game.home_team?.toLowerCase().includes("trail blazers") ||
    game.away_team?.toLowerCase().includes("trail blazers") ||
    game.home_team?.toLowerCase().includes("portland") ||
    game.away_team?.toLowerCase().includes("portland");

  if (isPortland) {
    score += 10000; // Guaranteed top priority
  }

  // Priority 1.5: Popular teams with large global fanbases
  if (hasPopularTeam(game)) {
    score += 200;
  }

  const records = extractTeamRecords(game);

  if (records) {
    const [record1, record2] = records;
    const winPct1 = getWinPercentage(record1);
    const winPct2 = getWinPercentage(record2);
    const avgWinPct = (winPct1 + winPct2) / 2;
    const minWinPct = Math.min(winPct1, winPct2);
    const maxWinPct = Math.max(winPct1, winPct2);

    // Priority 2: Matchup between two good teams (both >= 0.5)
    if (winPct1 >= 0.5 && winPct2 >= 0.5) {
      // Higher average win percentage = better matchup
      score += avgWinPct * 1000;
    }

    // Priority 3: Upset - bad team beat good team
    if (maxWinPct > 0.6 && minWinPct <= 0.5) {
      // Check if the underdog actually won
      // record1 = away team, record2 = home team (based on title format)
      const awayWon = (game.away_score || 0) > (game.home_score || 0);
      const homeWon = (game.home_score || 0) > (game.away_score || 0);
      const underdogWon =
        (winPct1 < winPct2 && awayWon) || (winPct2 < winPct1 && homeWon);

      if (underdogWon) {
        // More extreme difference = more interesting upset
        const recordDiff = Math.abs(winPct1 - winPct2);
        score += recordDiff * 1000;
      }
    }
  }

  // Priority 4: Close game (lower score differential = more exciting)
  const scoreDiff = Math.abs((game.home_score || 0) - (game.away_score || 0));
  // Inverse scoring: closer games get more points
  // Max 100 points for games decided by 20 or less
  if (scoreDiff <= 20) {
    score += (20 - scoreDiff) * 5;
  }

  return score;
};

// Get featured games sorted by score
export const getFeaturedGames = (games, limit = 3) => {
  if (!games || games.length === 0) return [];

  // Score all games and sort by score (highest first)
  const scoredGames = games.map((game) => ({
    game,
    score: scoreGame(game),
  }));

  scoredGames.sort((a, b) => b.score - a.score);

  // Take top N games
  return scoredGames.slice(0, limit).map((sg) => sg.game);
};
