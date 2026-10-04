// Finds a game's ESPN event id from the scoreboard for its date.

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
    const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${espnDate}`;

    // A past day's scoreboard doesn't change
    const response = await fetch(espnUrl, { next: { revalidate: 86400 } });
    if (!response.ok) {
      console.error("Failed to fetch from ESPN:", response.status);
      return null;
    }

    const data = await response.json();

    for (const espnGame of data.events || []) {
      const competitors = espnGame.competitions?.[0]?.competitors;
      if (!competitors || competitors.length !== 2) continue;

      const espnHome = competitors.find((c) => c.homeAway === "home");
      const espnAway = competitors.find((c) => c.homeAway === "away");
      if (!espnHome || !espnAway) continue;

      if (matchTeams(homeTeam, espnHome.team.displayName) && matchTeams(awayTeam, espnAway.team.displayName)) {
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
