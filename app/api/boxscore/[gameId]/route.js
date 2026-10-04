// app/api/boxscore/[gameId]/route.js
import { FINISHED_GAME_CACHE, fetchEspnSummary, isEspnId } from "@/lib/espn";

export async function GET(request, { params }) {
  const { gameId } = await params;

  if (!isEspnId(gameId)) {
    return Response.json({ error: "A numeric ESPN game ID is required" }, { status: 400 });
  }

  try {
    const data = await fetchEspnSummary(gameId);
    if (!data) return Response.json({ error: "Game not found" }, { status: 404 });

    // Points per quarter (and overtime) for each team
    const competitors = data.header?.competitions?.[0]?.competitors || [];
    const linescores = competitors.map((c) => ({
      homeAway: c.homeAway,
      team: c.team?.displayName || null,
      periods: (c.linescores || []).map((p) => Number(p.displayValue ?? p.value) || 0),
    }));

    return Response.json({ boxscore: data.boxscore || null, linescores }, { headers: FINISHED_GAME_CACHE });
  } catch (error) {
    console.error("Box score fetch error:", error);
    return Response.json({ error: "Failed to fetch box score" }, { status: 502 });
  }
}
