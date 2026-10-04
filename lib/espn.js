// ESPN's game summary (box score, line score, photos, header). Recaps are
// written after the final buzzer, so the data is stable and cached for hours;
// the box score route and the game page's photos share one cached response.
const SUMMARY_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=";
const SUMMARY_REVALIDATE = 6 * 60 * 60;

export const isEspnId = (id) => /^\d{1,12}$/.test(id || "");

// Resolves to the summary JSON, or null if ESPN has no such game.
export async function fetchEspnSummary(espnId) {
  if (!isEspnId(espnId)) return null;
  const response = await fetch(SUMMARY_URL + espnId, { next: { revalidate: SUMMARY_REVALIDATE } });
  // ESPN answers unknown ids with a 4xx (not always 404)
  if (response.status >= 400 && response.status < 500) return null;
  if (!response.ok) throw new Error(`ESPN summary request failed: ${response.status}`);
  return response.json();
}

// Cache headers for API responses built from a finished game's data.
export const FINISHED_GAME_CACHE = {
  "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
};
