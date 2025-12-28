// Utility to fetch ESPN game ID for a given game

function normalizeTeamName(name) {
  return name?.toLowerCase().replace(/\s+/g, "") || "";
}

function matchTeams(dbTeam, espnTeam) {
  const normalizedDb = normalizeTeamName(dbTeam);
  const normalizedEspn = normalizeTeamName(espnTeam);

  return (
    normalizedDb === normalizedEspn ||
    normalizedDb.includes(normalizedEspn) ||
    normalizedEspn.includes(normalizedDb)
  );
}

/**
 * Fetch ESPN game ID for a game based on teams and date
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name
 * @param {string} date - Game date in YYYY-MM-DD format
 * @returns {Promise<string|null>} ESPN game ID or null if not found
 */
export async function fetchEspnGameId(homeTeam, awayTeam, date) {
  try {
    // Convert date to ESPN format (YYYYMMDD)
    const espnDate = date.replace(/-/g, "");
    const espnUrl = `https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${espnDate}`;

    const response = await fetch(espnUrl);
    if (!response.ok) {
      console.error("Failed to fetch from ESPN:", response.status);
      return null;
    }

    const data = await response.json();
    const espnGames = data.events || [];

    // Find matching game
    for (const espnGame of espnGames) {
      const competition = espnGame.competitions?.[0];
      if (!competition) continue;

      const competitors = competition.competitors;
      if (!competitors || competitors.length !== 2) continue;

      const espnHome = competitors.find((c) => c.homeAway === "home");
      const espnAway = competitors.find((c) => c.homeAway === "away");

      if (!espnHome || !espnAway) continue;

      const espnHomeName = espnHome.team.displayName;
      const espnAwayName = espnAway.team.displayName;

      // Check if teams match
      if (matchTeams(homeTeam, espnHomeName) && matchTeams(awayTeam, espnAwayName)) {
        return espnGame.id;
      }
    }

    console.log(`No ESPN game found for ${awayTeam} @ ${homeTeam} on ${date}`);
    return null;
  } catch (error) {
    console.error("Error fetching ESPN game ID:", error);
    return null;
  }
}

/**
 * Enrich games array with ESPN game IDs
 * @param {Array} games - Array of game objects
 * @returns {Promise<Array>} Games array with espn_game_id added
 */
export async function enrichGamesWithEspnIds(games) {
  if (!games || games.length === 0) return games;

  const enrichedGames = await Promise.all(
    games.map(async (game) => {
      // Skip if already has ESPN game ID
      if (game.espn_game_id) {
        return game;
      }

      // Fetch ESPN game ID
      const espnGameId = await fetchEspnGameId(
        game.home_team,
        game.away_team,
        game.date
      );

      return {
        ...game,
        espn_game_id: espnGameId,
      };
    })
  );

  return enrichedGames;
}
