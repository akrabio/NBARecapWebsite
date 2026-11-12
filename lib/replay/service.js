// Replay API service (tasks R25–R26).
//
// `getReplayResponse(gameId, { fetchSummary, build, timeoutMs })` turns an
// ESPN game ID into `{ status, headers, body }` for `GET /api/replay/[id]`.
// It has no Next.js imports so tests can drive it with a mocked fetch; the
// route handler only awaits params and wraps the result in a Response.
//
// Outcomes (contracts.md "API contract"):
//   200 ready / limited  → BuildResult, shared cache (finished, validated game)
//   200 unavailable      → BuildResult with replay: null, short shared cache
//   400 invalid ID       → no-store
//   404 unknown event    → no-store (ESPN answers unknown IDs with a 4xx,
//                          which fetchEspnSummary maps to null)
//   502 upstream failure → no-store (5xx, network error, unparsable JSON)
//   504 upstream timeout → no-store (timeoutMs elapsed before the summary)
//   500 build failure    → no-store (builder threw)
// Error bodies are a fixed code + message + versions only: never the upstream
// body, URL, error message or a stack trace.
//
// Cache policy and the correction/refresh procedure: docs/replay-
// implementation/delivery.md. No derived-result cache (build ≈ 40 ms, the
// summary itself is in Next's data cache) and no database writes.

import { fetchEspnSummary, isEspnId } from "../espn.js";
import { BUILDER_VERSION, buildReplay } from "./build.js";
import { REPLAY_SCHEMA_VERSION } from "./types.js";

/** Upstream wait before answering 504 (the fetch itself is left to finish and fill the source cache). */
export const REPLAY_UPSTREAM_TIMEOUT_MS = 8000;

/** Cache-Control per outcome. Only validated finished-game results are shared for long. */
export const REPLAY_CACHE = Object.freeze({
  // ready / limited: validation already required a final game (STATUS_FINAL,
  // GAME_END, scores reconciled). CDN 1 h fresh + 6 h stale-while-revalidate;
  // browsers always revalidate (the client loader keeps its own memory cache).
  success: "public, max-age=0, s-maxage=3600, stale-while-revalidate=21600",
  // unavailable: usually a game in progress or coverage not yet complete —
  // must not stick, but a minute of sharing absorbs bursts.
  unavailable: "public, max-age=0, s-maxage=60",
  // 4xx / 5xx: never cached anywhere.
  error: "no-store",
});

const ERRORS = Object.freeze({
  invalid_id: { status: 400, message: "A numeric ESPN game ID is required" },
  not_found: { status: 404, message: "Game not found" },
  build_failed: { status: 500, message: "Replay could not be built" },
  upstream_failed: { status: 502, message: "Game data source is unavailable" },
  upstream_timeout: { status: 504, message: "Game data source timed out" },
});

const versionHeaders = () => ({
  "X-Replay-Schema": String(REPLAY_SCHEMA_VERSION),
  "X-Replay-Builder": String(BUILDER_VERSION),
});

function errorResponse(code) {
  const { status, message } = ERRORS[code];
  return {
    status,
    headers: { "Cache-Control": REPLAY_CACHE.error, ...versionHeaders() },
    body: { error: code, message, schemaVersion: REPLAY_SCHEMA_VERSION, builderVersion: BUILDER_VERSION },
  };
}

class UpstreamTimeout extends Error {}

function withTimeout(promise, ms) {
  if (!(ms > 0) || !Number.isFinite(ms)) return promise;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new UpstreamTimeout()), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Server log only: a short label, never the summary or upstream body.
const logFailure = (label, gameId, error) => console.error(`[replay] ${label} for ${gameId}: ${error?.name || "Error"}`);

/**
 * @param {string} gameId  Route param (untrusted)
 * @param {{ fetchSummary?: (id: string) => Promise<object | null>, build?: typeof buildReplay, timeoutMs?: number }} [deps]
 * @returns {Promise<{ status: number, headers: Record<string, string>, body: object }>}
 */
export async function getReplayResponse(gameId, { fetchSummary = fetchEspnSummary, build = buildReplay, timeoutMs = REPLAY_UPSTREAM_TIMEOUT_MS } = {}) {
  if (typeof gameId !== "string" || !isEspnId(gameId)) return errorResponse("invalid_id");

  let summary;
  try {
    summary = await withTimeout(Promise.resolve().then(() => fetchSummary(gameId)), timeoutMs);
  } catch (error) {
    if (error instanceof UpstreamTimeout) {
      logFailure("upstream timeout", gameId, error);
      return errorResponse("upstream_timeout");
    }
    logFailure("upstream failure", gameId, error);
    return errorResponse("upstream_failed");
  }
  if (summary == null) return errorResponse("not_found");
  if (typeof summary !== "object" || Array.isArray(summary)) {
    logFailure("upstream non-object summary", gameId, null);
    return errorResponse("upstream_failed");
  }

  let result;
  try {
    result = build(summary);
  } catch (error) {
    logFailure("build failure", gameId, error);
    return errorResponse("build_failed");
  }

  // The builder reads the ID from the summary; the requested ID is the one
  // the client keys on, so a mismatch means a source we should not trust.
  if (result.espnGameId != null && String(result.espnGameId) !== gameId) {
    logFailure("game ID mismatch", gameId, null);
    return errorResponse("upstream_failed");
  }

  const cache = result.status === "ready" || result.status === "limited" ? REPLAY_CACHE.success : REPLAY_CACHE.unavailable;
  return {
    status: 200,
    headers: { "Cache-Control": cache, ...versionHeaders() },
    body: { ...result, espnGameId: gameId },
  };
}
