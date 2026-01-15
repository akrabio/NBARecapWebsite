// app/api/records/[date]/route.js
import clientPromise, { DB_NAME, COLLECTIONS } from "@/lib/mongodb";
import { enrichGamesWithEspnIds } from "@/utils/espnGameId";

export async function GET(request, { params }) {
  try {
    const { date } = await params;

    if (!date) {
      return Response.json(
        { error: "Date parameter is required" },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTIONS.GAME_RECAPS);

    let records = await collection.find({ date }).toArray();

    // Enrich records with ESPN game IDs if missing
    records = await enrichGamesWithEspnIds(records);

    return Response.json({ records });
  } catch (error) {
    console.error("Database error:", error);
    return Response.json({ error: "Failed to fetch records" }, { status: 500 });
  }
}
