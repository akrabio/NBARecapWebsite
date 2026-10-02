// app/api/boxscore/[gameId]/route.js

export async function GET(request, { params }) {
  try {
    const { gameId } = await params;

    if (!gameId) {
      return Response.json(
        { error: "Game ID parameter is required" },
        { status: 400 }
      );
    }

    // Fetch box score data from ESPN API
    const espnUrl = `https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${gameId}`;
    const response = await fetch(espnUrl, { next: { revalidate: 3600 } });

    if (!response.ok) {
      return Response.json(
        { error: "Failed to fetch box score from ESPN" },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Extract box score data
    const boxscore = data.boxscore || null;

    // Points per quarter (and overtime) for each team
    const competitors = data.header?.competitions?.[0]?.competitors || [];
    const linescores = competitors.map((c) => ({
      homeAway: c.homeAway,
      team: c.team?.displayName || null,
      periods: (c.linescores || []).map((p) => Number(p.displayValue ?? p.value) || 0),
    }));

    return Response.json({ boxscore, linescores });
  } catch (error) {
    console.error("Box score fetch error:", error);
    return Response.json(
      { error: "Failed to fetch box score" },
      { status: 500 }
    );
  }
}
