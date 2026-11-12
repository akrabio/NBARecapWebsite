# Replay delivery (R25–R27)

`GET /api/replay/[gameId]` — `app/api/replay/[gameId]/route.js` awaits params and returns `getReplayResponse(gameId)` from `lib/replay/service.js` (no Next imports; tests inject `fetchSummary` / `build` / `timeoutMs`). Source: `fetchEspnSummary` only (fixed ESPN summary URL, `isEspnId` = 1–12 digits; no Mongo IDs, no arbitrary URLs). Body: `BuildResult` from `buildReplay`; `espnGameId` is the requested ID (a summary for a different ID → 502). The route is dynamic (`ƒ` in `next build`); there is no route-segment caching and none is assumed.

## Outcome / header matrix

All responses carry `X-Replay-Schema` (`REPLAY_SCHEMA_VERSION`) and `X-Replay-Builder` (`BUILDER_VERSION`); bodies also carry `schemaVersion`/`builderVersion`.

| Outcome | Status | Body | Cache-Control |
| --- | --- | --- | --- |
| ready / limited | 200 | BuildResult | `public, max-age=0, s-maxage=3600, stale-while-revalidate=21600` |
| unavailable (not final, bad coverage, too large) | 200 | BuildResult, `replay: null` | `public, max-age=0, s-maxage=60` |
| invalid ID | 400 | `{error:"invalid_id", message, versions}` | `no-store` |
| unknown event (ESPN 4xx → `fetchEspnSummary` null; ESPN uses 404 and 400) | 404 | `not_found` | `no-store` |
| build threw | 500 | `build_failed` | `no-store` |
| ESPN 5xx / network error / unparsable or non-object JSON / ID mismatch | 502 | `upstream_failed` | `no-store` |
| no summary within 8 s (`REPLAY_UPSTREAM_TIMEOUT_MS`) | 504 | `upstream_timeout` | `no-store` |

Error bodies are fixed strings: never the upstream body/URL, error message or stack. Server logs record only a label + error name. Only listed summary fields reach the body (builder whitelist), so no news/article HTML.

## TTL decisions

- **Success (ready/limited)**: validation already requires a final game (STATUS_FINAL, GAME_END, reconciled scores), so the result is shared. CDN fresh 1 h, then up to 6 h stale-while-revalidate (served stale while a background refresh runs). `max-age=0`: browsers revalidate; the client loader (R28) keeps its own bounded memory cache keyed by ID + versions. Nothing personalized is in the response (team choice is client-side), so no `Vary`.
- **Unavailable**: 60 s shared, no SWR — absorbs bursts during a live game without pinning a transient result.
- **Errors**: `no-store`, never negatively cached.

## Correction implications

Two layers can delay an official ESPN correction (stat change, score fix):
1. **Source cache** — `fetchEspnSummary` uses `next.revalidate = 6 h` (Next data cache, shared with `/api/boxscore` and game-page photos; only 200 responses are stored).
2. **Response cache** — CDN `s-maxage` 1 h + SWR 6 h.

Worst case a correction appears ≈ 6 h (source) + 1 h (fresh) after the next request, and a stale copy may be served once more while SWR refreshes; with no traffic for > 7 h the next request refreshes. **Known caveat:** the source cache is per URL and ignores game status, so a summary fetched while a game is still in progress stays cached for up to 6 h — the replay then stays `unavailable` (and the box score stale) until that entry expires. Only the 60 s response layer is short. Fixing this needs a status-aware or tagged source fetch in `lib/espn.js` (out of scope for W13; box-score behavior unchanged).

## Refresh procedure

- **Development (`next dev`)**: a request with `Cache-Control: no-cache` (DevTools "Disable cache" or hard refresh, or `curl -H 'Cache-Control: no-cache' localhost:3000/api/replay/<id>`) bypasses the fetch cache. Otherwise delete `.next/cache/fetch-cache` and restart.
- **Self-hosted (`next start`)**: stop the server, delete `.next/cache/fetch-cache` (source cache), start again; then purge `/api/replay/<id>` at any CDN/proxy in front.
- **Vercel**: purge the project's Data Cache from the dashboard for the source layer (a redeploy does not necessarily clear it — verify), and purge the CDN cache for `/api/replay/<id>` for the response layer.
- **Builder output changes**: bump `BUILDER_VERSION` (or `REPLAY_SCHEMA_VERSION` for shape changes). Clients key their cache on these; the CDN entries for old outputs expire within ≤ 7 h, or purge `/api/replay/*` to switch immediately.

## Derived-result caching: not added (measured)

Build + `JSON.stringify` on the five fixtures, Node, median of 10 warm runs: 36.4–44.8 ms; `JSON.parse` of the summary < 1 ms. Live smoke: cold request 0.69 s (ESPN fetch + build), warm request 0.05 s (data-cache hit + build). With the CDN sharing finished-game responses, the ~40 ms build runs about once per game per hour per edge — no in-memory or database result cache is justified. Revisit if p95 build time exceeds ~200 ms or traffic bypasses the CDN.

## Smoke check (2026-11-12, `npm run build` + `next start -p 3107`, live ESPN)

| Request | Status | Cache-Control | Size | Time |
| --- | --- | --- | --- | --- |
| `/api/replay/401810062` (cold) | 200, `status: limited`, 492 events, 2 highlights, 85.8 s | success policy, `x-replay-builder: 1`, `x-replay-schema: 1` | 156,507 B | 0.69 s |
| same (warm) | 200 | same | 156,507 B | 0.05 s |
| `/api/replay/abc` | 400 `invalid_id` | `no-store` | 106 B | 0.002 s |
| `/api/replay/1` and `/999999999999` (ESPN 404 / 400) | 404 `not_found` | `no-store` | 85 B | 0.3–0.5 s |

`next start` locally sent the JSON uncompressed (chunked); hosted compression is expected to bring it to ~20 KB (W12 gzip measurement). Tests: `tests/replay-route.test.js`.
