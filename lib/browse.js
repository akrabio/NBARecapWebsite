// Data for the games list column, shared by the home page and the game page
// (which shows the same list beside the recap on desktop).
import { getDateCounts, getGamesByDate, getLatestGameDate, getRecentGamesByTeam } from "@/lib/games";
import { parseDateKey, shiftDateKey } from "@/lib/dates";
import { orderGames } from "@/utils/gameScoring";

export async function getBrowseData({ date: dateParam, team, favorite, today }) {
  if (team) {
    const games = await getRecentGamesByTeam(team, 5);
    return { mode: "team", team, date: null, counts: {}, games, ordered: games };
  }

  // Default to the latest day that has recaps, so the offseason never opens on an empty page.
  // Future dates have nothing to show, so they're treated like no date.
  const validDate = parseDateKey(dateParam) && dateParam <= today;
  const date = validDate ? dateParam : (await getLatestGameDate({ onOrBefore: today })) || today;
  const [games, counts] = await Promise.all([
    getGamesByDate(date),
    getDateCounts(shiftDateKey(date, -21), shiftDateKey(date, 3)),
  ]);

  if (games.length === 0) {
    const previousDate = await getLatestGameDate({ before: date });
    return { mode: "date", date, counts, ordered: [], previousDate };
  }

  // "My team" goes first: its game that day, or its most recent one.
  const favoriteGame = favorite ? games.find((g) => g.home_team === favorite || g.away_team === favorite) : null;
  const lastFavoriteGame =
    favorite && !favoriteGame ? (await getRecentGamesByTeam(favorite, 1, { onOrBefore: date }))[0] || null : null;
  const { featured, rest } = orderGames(games.filter((g) => g !== favoriteGame));

  return {
    mode: "date",
    date,
    counts,
    favoriteGame,
    lastFavoriteGame,
    featured,
    rest,
    ordered: [favoriteGame, ...featured, ...rest].filter(Boolean),
  };
}

// Minimal fields for previous/next navigation on the game page.
export function toSiblings(games) {
  return games.map((g) => ({
    id: g.id,
    home_team: g.home_team,
    away_team: g.away_team,
    home_score: g.home_score,
    away_score: g.away_score,
  }));
}
