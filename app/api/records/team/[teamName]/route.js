// app/api/records/team/[teamName]/route.js
import clientPromise, { DB_NAME, COLLECTIONS } from "@/lib/mongodb";
import { enrichGamesWithEspnIds } from "@/utils/espnGameId";

export async function GET(request, { params }) {
  try {
    const { teamName } = await params;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit")) || 5;

    if (!teamName) {
      return Response.json(
        { error: "Team name parameter is required" },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTIONS.GAME_RECAPS);

    // Query for games where either home_team or away_team matches the team name
    let records = await collection
      .find({
        $or: [
          { home_team: { $regex: teamName, $options: "i" } },
          { away_team: { $regex: teamName, $options: "i" } },
        ],
      })
      .sort({ date: -1 }) // Sort by most recent first
      .limit(limit)
      .toArray();

    // Enrich records with ESPN game IDs if missing
    records = await enrichGamesWithEspnIds(records);

    return Response.json({ records });
  } catch (error) {
    console.error("Database error:", error);
    return Response.json({ error: "Failed to fetch records" }, { status: 500 });
  }
}
