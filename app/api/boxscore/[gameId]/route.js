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
    const response = await fetch(espnUrl);

    if (!response.ok) {
      return Response.json(
        { error: "Failed to fetch box score from ESPN" },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Extract box score data
    const boxscore = data.boxscore || null;

    return Response.json({ boxscore, rawData: data });
  } catch (error) {
    console.error("Box score fetch error:", error);
    return Response.json(
      { error: "Failed to fetch box score" },
      { status: 500 }
    );
  }
}
