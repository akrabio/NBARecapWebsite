// Data for the games list column, shared by the home page and the game page
// (which shows the same list beside the recap on desktop).
import { getDateCounts, getGamesByDate, getLatestGameDate, getRecentGamesByTeam, getStandings } from "@/lib/games";
import { getNextGame } from "@/lib/schedule";
import { parseDateKey, shiftDateKey } from "@/lib/dates";
import { getNightSummary, orderByStory } from "@/utils/gameStory";

// The team schedule is the current season's, so "next game" only makes sense
// for recent nights.
const NEXT_GAME_DAYS = 7;
const FORM_GAMES = 5;

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

  // "My team" goes first: its game that day, its recent form and next game.
  const favoriteGame = favorite ? games.find((g) => g.home_team === favorite || g.away_team === favorite) : null;
  const [standings, favoriteRecent, nextGame] = await Promise.all([
    getStandings(date),
    favorite ? getRecentGamesByTeam(favorite, FORM_GAMES, { onOrBefore: date }) : [],
    // undefined = not looked up (an old night), null = nothing scheduled
    favorite && date >= shiftDateKey(today, -NEXT_GAME_DAYS) ? getNextGame(favorite, date) : undefined,
  ]);
  const others = orderByStory(games.filter((g) => g !== favoriteGame));

  return {
    mode: "date",
    date,
    counts,
    favoriteGame,
    favoriteRecent,
    favoriteStanding: (favorite && standings[favorite]) || null,
    standings: Object.keys(standings).length ? standings : null,
    nextGame,
    summary: getNightSummary(games, { favorite }),
    others,
    ordered: [favoriteGame, ...others].filter(Boolean),
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
