// A team's next game, from ESPN's team schedule (for the "my team" card).
import { ESPN_TEAM_IDS } from "@/utils/consts";

const SCHEDULE_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams";
const SCHEDULE_REVALIDATE = 6 * 60 * 60;
// The list renders without it rather than wait on ESPN
const TIMEOUT_MS = 1500;
const SEASON_TYPES = [2, 3]; // regular season, playoffs

// ESPN times are UTC; game dates in the database are US (Eastern) dates
const usDateKey = (iso) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/New_York" });

async function fetchSchedule(teamId, seasonType) {
  const response = await fetch(`${SCHEDULE_URL}/${teamId}/schedule?seasontype=${seasonType}`, {
    next: { revalidate: SCHEDULE_REVALIDATE },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) return [];
  return (await response.json()).events || [];
}

// → { date, startsAt, opponent, home } for the first game after the night of
// `afterDate`, or null (no game scheduled, or ESPN didn't answer in time).
export async function getNextGame(team, afterDate) {
  const teamId = ESPN_TEAM_IDS[team];
  if (!teamId) return null;
  try {
    for (const seasonType of SEASON_TYPES) {
      const events = await fetchSchedule(teamId, seasonType);
      const next = events
        .filter((e) => e.date && usDateKey(e.date) > afterDate)
        .sort((a, b) => a.date.localeCompare(b.date))[0];
      const competitors = next?.competitions?.[0]?.competitors || [];
      const me = competitors.find((c) => c.team?.id === teamId);
      const opponent = competitors.find((c) => c.team?.id !== teamId);
      if (me && opponent) {
        return { date: usDateKey(next.date), startsAt: next.date, opponent: opponent.team.displayName, home: me.homeAway === "home" };
      }
    }
  } catch {
    // Timed out or ESPN is down: the card just leaves it out
  }
  return null;
}
