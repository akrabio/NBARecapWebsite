// app/api/replay/[gameId]/route.js — condensed game replay (R25–R26).
// Outcomes, cache headers and versions come from lib/replay/service.js; see
// docs/replay-implementation/delivery.md for the cache/refresh policy.
import { getReplayResponse } from "@/lib/replay/service";

export async function GET(request, { params }) {
  const { gameId } = await params;
  const { status, headers, body } = await getReplayResponse(gameId);
  return Response.json(body, { status, headers });
}
