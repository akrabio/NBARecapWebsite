// app/api/records/counts/route.js
// Number of recaps per date in a range, for the calendar's game-day dots.
import { getDateCounts } from "@/lib/games";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!DATE_RE.test(from || "") || !DATE_RE.test(to || "")) {
    return Response.json({ error: "from and to (yyyy-MM-dd) are required" }, { status: 400 });
  }

  try {
    const counts = await getDateCounts(from, to);
    return Response.json({ counts });
  } catch (error) {
    console.error("Database error:", error);
    return Response.json({ error: "Failed to fetch counts" }, { status: 500 });
  }
}
