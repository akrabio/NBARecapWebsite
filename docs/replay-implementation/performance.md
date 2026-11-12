# R44 — performance and cache behavior

Date 2026-11-12. Builder v3, schema v1. Hardware: Apple M4 Max, 64 GB, Node v24.8.0; browser = the Claude desktop app's in-app Chromium pane. **Representative-hardware caveat:** everything below was measured on a fast desktop. No phone or low-end device was available; mobile numbers are not measured (see "Not measured").

Markers: **[prod]** `npm run build` + `next start -p 3121`, live ESPN · **[node]** benchmark over all 13 fixtures (`tests/fixtures/replay/`), script kept outside the repo · **[browser]** the prod server in the browser pane, devtools JS (`performance.now()`, Resource Timing, `performance.memory`, wrapped `requestAnimationFrame` / `addEventListener` / `fetch`).

## Server: source fetch and build latency

[prod] `curl` of `/api/replay/<id>`, three requests each, cold = first request for that id since the build (source not in the Next data cache):

| ESPN id | Status | Cold | Warm | Warm 2 | Raw body |
| --- | --- | ---: | ---: | ---: | ---: |
| 401810799 CHA@POR | ready | 0.996 s | 0.057 s | 0.053 s | 168,307 B |
| 401909962 | limited | 0.539 s | 0.050 s | 0.044 s | 151,690 B |
| 401810798 CHI@GS (OT) | ready | 0.586 s | 0.063 s | 0.056 s | 189,934 B |
| 401909293 | unavailable | 0.579 s | — | — | (small) |

Cold ≈ ESPN summary fetch (0.5–1.0 s) + build. Warm = data-cache hit + a full rebuild per request (~45–60 ms end to end). This matches the W13 smoke test (0.69 s / 0.05 s).

[node] `buildReplay(summary)` + `JSON.stringify`, 8 runs per fixture: median **36–47 ms** (max single run 61 ms, 401810062 first run / JIT warm-up); `unavailable` (401909293) 17.5 ms.

## Payload size

[node] per fixture (identical bytes to the endpoint, see `e2e-report.md`):

| Range over the 12 ready/limited fixtures | Raw JSON | gzip -6 | brotli (Node default) |
| --- | ---: | ---: | ---: |
| smallest (401909931, 446 events) | 146,846 B | 18,553 B | 13,217 B |
| largest (401810798 OT, 568 events) | 189,934 B | 23,522 B | 16,638 B |
| `unavailable` body (401909293) | 1,376 B | 335 B | 280 B |

Compression ratio is ~8× (gzip) / ~11× (brotli).

**Observed transport:** `next start` sent the **API response uncompressed** (`Transfer-Encoding: chunked`, no `Content-Encoding`, even with `Accept-Encoding: gzip, br`; the browser's Resource Timing `transferSize` was 153,146 B for a 152,846 B body), while it did compress static chunks (replay JS 66,922 B → 22,105 B transferred). Vercel/most CDNs compress JSON at the edge, so the hosted wire size should be ~18–24 KB. **If the site is self-hosted with plain `next start`, put a compressing proxy in front** (or the replay costs ~150–190 KB per first open). Not changed: hosting config is outside replay scope.

## Cache behavior

[prod] headers, unchanged from W13 (`delivery.md`):

| Outcome | Cache-Control |
| --- | --- |
| 200 ready / limited | `public, max-age=0, s-maxage=3600, stale-while-revalidate=21600` |
| 200 unavailable | `public, max-age=0, s-maxage=60` |
| 400 invalid id | `no-store` |

Plus `x-replay-schema: 1`, `x-replay-builder: 3`. Next also adds `vary: rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch` to the route; plain `fetch` from the loader sends none of these headers, so CDN keys are effectively per URL. `next start` itself does not cache the response (each warm request rebuilds, ~50 ms); sharing relies on the CDN.

[browser] client cache (`utils/replay-api.js`): over six game switches each game's replay was requested **exactly once**; returning to the first game re-used the in-memory entry (**0** new requests). LRU 6 games, ready/limited TTL 10 min, unavailable 60 s, failures never cached (W14/W19 tests and live checks).

## Client: code loading

[prod] `.next/static/chunks/` after `npm run build`:

| Asset | Raw | gzip -9 | In initial HTML of `/game/[id]` / `/`? |
| --- | ---: | ---: | --- |
| Replay JS chunk (`ReplayView` + all `components/game/replay/*`, `lib/replay/*` browser modules, `utils/replay-api.js`) | 66,922 B | 21,645 B | no / no |
| Replay CSS (`replay.module.css`) | 7,792 B | 2,318 B transferred | no / no |

The chunk is the only static asset containing replay code (`replayStateAt`, `createPlaybackController`, the `/api/replay` URL); it grew from ~16 KB (W14 placeholder) as the UI was built.

[browser] recap-only reader on `/game/6af566378ec906cd0ea608a4`: load, switch to נתונים, scroll, back to סיכום → **0** `/api/replay` requests, **0** replay chunk/CSS loads (38 resources, none replay). First click on שחזור → replay CSS (6 ms), replay JS (7 ms), one `/api/replay/401909966` (75 ms, warm server). During play: **no further requests** (no per-event or per-frame fetches).

## Seek and frame cost

[node] all 13 fixtures (12 with a replay), payload parsed fresh as the client does:

| Measure | Range over fixtures |
| --- | --- |
| First `replayStateAt` call (builds the client checkpoints, every 32 events) | 0.57–1.32 ms |
| Worst `replayStateAt` over every index −1…last, after that | 0.039–0.396 ms (spikes are GC) |
| p99 of 2,000 random seeks | 0.039–0.053 ms |
| `createFrameDeriver` full frame (state + changes + spotlight + probability), 1,000 random seconds: p99 / max | 0.072–0.089 ms / 0.61–0.86 ms |
| Sequential playback at 60 fps (one frame per 1/60 s over the whole replay): max | 0.55–0.71 ms |

[browser] 60 scrubber seeks (native value setter + `input`/`change` events, then a forced layout read, so it includes the React render and layout of the whole replay panel; first seek = 0 → end, second = end → 0, then random): median **4.8 ms**, p95 **6.8 ms**, worst **12.0 ms** (the first jump to the final state). Well inside a 16 ms frame on this machine.

## Loops, listeners, memory over game switches

[browser] instrumentation installed before the replay chunk loaded; then six client-side game switches via the sidebar, each time opening שחזור and pressing play:

- **RAF:** while playing, exactly **1** pending `requestAnimationFrame`; after seven rapid play/pause clicks still 1 (one clock). After every game switch: **0** pending (the old controller is destroyed).
- **Listeners on `window`/`document`:** opening the replay adds `document:visibilitychange` +1 and `window:scroll` +1 (sticky bar); after each switch both return to the pre-replay count. No accumulation across the six switches (resize count constant).
- **Requests:** six games → six `/api/replay` requests, one per game; no abandoned in-flight requests observed (late responses for a previous game are ignored by key, tested in `tests/replay-api-hook.test.js`).
- **JS heap** (`performance.memory.usedJSHeapSize`, Chromium, coarse): 6.8 MB recap-only → 7.5 MB with the replay loaded → **10–21 MB** across the switches, rising and falling with GC (21.4 → 18.0 → 12.0 → 14.5 → 17.2 → 18.3 MB); no monotonic growth. The client LRU holds at most six payloads (~150–190 KB of JSON each). No heap snapshot / detached-DOM count was taken (not available from the pane's JS) — best effort.

## 1–2 minute playback responsiveness

The pane renders frames only during screenshots ([env], see `gate-d.md`), so continuous 1× playback could not be watched or profiled for jank. Evidence instead: per-frame derivation ≤ 0.9 ms worst in Node, a full seek + render ≤ 12 ms in the browser, one RAF loop, no network during play. A real-device 1× viewing (part of the pending R42 trials) should confirm smoothness on a phone.

## Decisions

- **No Web Worker.** Reconstruction is < 1 ms per frame and < 1.5 ms for the one-time checkpoint pass; nothing blocks the main thread measurably.
- **No derived-result cache / persistence** (server or MongoDB). Build is ~40 ms; CDN `s-maxage` shares finished games. Revisit if p95 build exceeds ~200 ms, traffic bypasses the CDN, or self-hosting without a cache in front.
- **Checkpoint density unchanged** (wire: none — `state.patches` only; client: every 32 events in memory). Payload size is dominated by per-event patches, already compact; no reduction needed at ~20 KB compressed.
- **Compression** is a deployment concern (see above), not a code change.

## Source-correction TTL implications

A corrected ESPN stat/score can be delayed by up to four layers:

1. Next data cache for the ESPN summary (`lib/espn.js`, `revalidate` 6 h, shared with the box score).
2. CDN response `s-maxage` 1 h, then up to 6 h `stale-while-revalidate` (one stale serve while it refreshes).
3. Client in-memory cache: 10 min, only while the page stays open.
4. Builder/schema version bump invalidates client keys immediately and CDN entries within ≤ 7 h (or purge `/api/replay/*`).

Worst case ≈ 7 h after the correction plus one stale serve. Because validation reconciles against the box score, a correction that touches play-by-play but not yet the box score (or vice versa) can briefly downgrade a game to `limited`/`unavailable` until both refresh. The live-game caveat (a summary fetched before final stays cached up to 6 h → replay `unavailable`) is still open — see `HANDOFF.md` open decisions. Refresh procedure: `delivery.md`.

## Not measured

- Phone / low-end CPU timings and memory (no device).
- Real-time jank during continuous playback (pane limitation).
- Hosted (Vercel) compression and CDN hit rates (not deployed — publishing is out of scope).
