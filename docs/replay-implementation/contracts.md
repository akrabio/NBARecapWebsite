# Replay contracts and architecture

Read alongside [the task index](README.md). This is a proposed implementation contract to finalize in R03–R04 after examining real responses. Preserve these boundaries even if filenames change.

## Data flow

```text
GameView selects replay
  → client replay loader
  → GET /api/replay/{numericEspnId}
  → existing fetchEspnSummary
  → normalize → reconstruct → validate → highlights → timeline
  → bounded, versioned replay JSON
  → one playback clock → one derived frame
  → scoreboard + lineups/stats + spotlight + probability
```

The endpoint builds a neutral game replay. Favorite-team preference and selected-team state belong on the client, so the response can be shared across readers. Keep server-only fetching out of client bundles.

## Suggested modules

| Module | Responsibility |
| --- | --- |
| `lib/replay/normalize.js` | Source event order, clocks, IDs, metadata, role attribution adapter |
| `lib/replay/stats.js` | Stat deltas, explicit corrections, team-only attribution |
| `lib/replay/lineups.js` | Starting five, substitutions, confidence/validity |
| `lib/replay/state.js` | Deterministic reducer and checkpoint/event-index lookup |
| `lib/replay/validate.js` | Final totals, coverage and capability diagnostics |
| `lib/replay/highlights.js` | Evidence-based candidate detection and selection |
| `lib/replay/captions.js` | Plain-text Hebrew templates and parameters |
| `lib/replay/timeline.js` | Fast spans, event boundaries, key-moment holds |
| `lib/replay/build.js` | Pure orchestration, version, ready/limited/unavailable result |
| `app/api/replay/[gameId]/route.js` | Server fetching, transport errors, cache policy |
| `utils/replay-api.js` | Client fetch, response validation, bounded caching/deduplication |
| `components/game/replay/` | Replay container, controls, scoreboard, probability, spotlight, tables |

Avoid splitting trivial presentation into many files just to match this table. Pure data modules deserve clear boundaries because they require separate validation.

## Identity and time

- Use stable ESPN team/player IDs. Distinguish recap ID (Mongo ID) from ESPN event ID at every boundary.
- `eventIndex`: unique normalized order, including same-clock events; suitable for state reconstruction.
- `sourcePlayId`: links back to ESPN; keep source sequence/index for diagnostics.
- `period`, `clockRemainingSec`, `gameElapsedSec`: game time, including five-minute overtime periods. Preserve decimal clock precision.
- `replayTimeSec`: condensed playback position, including holds. Never derive this by multiplying game elapsed time by one fixed speed.
- Unknown timestamps stay unknown until an explicit supported rule resolves them; they are not automatically 0:00.

Normalize the established source sequence, not an alphabetical ID order or a clock-only sort. If sequence fields are inconsistent, record the anomaly and apply the documented adapter rule. Only deduplicate proven duplicate records; different free throws can legitimately share the same clock.

## Normalized events

Recommended event fields:

| Field | Meaning |
| --- | --- |
| `index`, `sourcePlayId`, `sourceSequence` | Stable event provenance/order |
| `period`, `clockRemainingSec`, `gameElapsedSec` | Clock context |
| `kind` | Normalized action; preserve unknown source type for diagnostics |
| `teamId` | Acting team when known |
| `roles` | Explicit shooter, assister, stealer, blocker, rebounder, turnover player, entering/leaving players; absent when uncertain |
| `scoreAfter` | Source-supported home/away score or explicit unknown |
| `statDeltas` | Player/team counters affected, including supported negative corrections |
| `lineupChanges` | Entering/leaving IDs and atomic substitution-group reference |
| `probabilityAfter` | Linked home probability, when available |
| `issues` | Structured attribution/coverage diagnostics |

Participant array order is not a player-role contract. Prefer explicit structured roles where verified. If descriptions are necessary, use a constrained source adapter with tests for actual wording. Match to known identities; ambiguous descriptions must produce unknown attribution, not a confident stat.

## Running state and capability

- Start both teams at zero and all supported player counters at zero.
- Player counters: `pts`, `fgm`, `fga`, `tpm`, `tpa`, `ftm`, `fta`, `reb`, `ast`, `to`, `stl`, `blk`; optional `oreb`, `dreb`, `pf` when supported.
- Record team-only counters separately. Do not force player sums to equal a team stat whose official definition differs.
- Keep all players' accumulated stats, even while they are on the bench.
- Lineups include ordered on-court slots, bench IDs, and validity/coverage. Substitution updates membership, not accumulated stats.
- Per-family/per-player capability describes what can be trusted. Unknown is represented explicitly; a displayed dash must not conceal an internal fabricated zero.
- Final box-score expectations belong in validation, not the starting frame or visible future values.

Recommended seek strategy: immutable checkpoints every fixed number of normalized events plus remaining deltas. Binary search to the target event, take the nearest checkpoint, and reduce the bounded suffix. Benchmark before selecting spacing. Full per-event snapshots are acceptable only if measured size is modest; do not copy all rosters on every animation frame.

## Highlight records

Include: stable ID, event/group index, type, involved player/team IDs, caption parameters, evidence, importance score, and hold duration. Store plain text/structured parameters, not HTML from ESPN. Preserve the distinction between the state at the key event and the current replay state.

Examples of evidence: previous score and resulting score; prior last-lead event; explicit steal/block attribution; linked probability before/after; confirmed period-end ordering. Statistical importance is not proof of a cause, intention, or historical record.

## Timeline segments

- Fast segment: replay-time interval mapping to an ordered interval of game events.
- Hold segment: replay-time interval mapped to one exact event boundary and highlighted moment.
- Key invariant: game state does not advance during a hold; the playback clock does.
- Pausing during a hold freezes the remaining hold time. Speed scales replay time, including holds, unless viewing trials justify a separately documented rule.
- Prefer one major moment per hold; group connected steal/basket or blocked-shot/rebound sequences intentionally.
- End state and restart semantics must be explicit. Suggested: restart resets to 0–0 paused; Play from the end restarts playback from zero.

## API contract

`GET /api/replay/[gameId]` accepts the same numeric ESPN ID format as `lib/espn.js`. It does not accept Mongo IDs or arbitrary URLs. Draft response:

```json
{
  "schemaVersion": 1,
  "builderVersion": 1,
  "status": "ready",
  "espnGameId": "401810062",
  "capabilities": {},
  "warnings": [],
  "replay": {}
}
```

Finalize `replay` fields in R04: teams/players, normalized compact events, initial lineups, checkpoints, supported probability samples, selected highlights, timeline, and duration. Serialize ordinary JSON arrays/objects, not Maps or unconverted typed arrays. No news, article HTML, credentials, or raw unrelated summary sections.

| Outcome | Transport/body | Client behavior |
| --- | --- | --- |
| Ready | 200, `status: ready` | Normal replay |
| Limited but trustworthy | 200, `status: limited`, capabilities/reason codes | Replay with specific labels/omitted unsupported fields |
| Incomplete game or unusable coverage | 200, `status: unavailable`, reason code, `replay: null` | Explanation and actions selecting recap/stats |
| Invalid ID | 400 | Invalid request message |
| Unknown event | 404 | Data unavailable |
| ESPN transport failure | 502, or 504 for implemented timeout | Retry action; no negative cache |

Use explicit HTTP cache headers for validated completed-game success. Version the client cache key with the builder/schema version. Avoid long-lived caching of transient failures, incomplete games, or unexpectedly missing play-by-play. Do not use `Date.now()` inside a pure builder; pass retrieval metadata separately if needed and do not claim a cached fetch was newly published by ESPN.

Initial policy: rely on the existing six-hour source cache and shared success-response caching; measure whether derived-result caching is needed. The six-hour source cache and longer response caches can delay official corrections; record chosen TTLs and provide a development/operational refresh path. A cache-version bump is required when normalized output changes.

## Quality policy

| Problem | Required treatment |
| --- | --- |
| Missing probability | Limited replay, hide/label probability; no invented 50% |
| Invalid/unlinked probability sample | Discard sample with diagnostic; no future value filled backward |
| No starting probability | Show unavailable until first supported linked value |
| Stat mismatch | Diagnose source/parser; disable affected family/player presentation rather than patching final totals |
| Uncertain lineup | Label roster fallback for affected interval/team; restore only when a fully evidenced lineup is available |
| Temporary incomplete substitution group | Apply as a batch at its source boundary; do not render four/six players as a valid five |
| Major missing scoring/event coverage | Unavailable, not a synthetic reconstruction |
| Unsupported event unrelated to core stats | Preserve order/provenance; record whether it affects capability |

## UI state ownership

- `GameView`: game tab, mounted replay lifecycle, normal-header visibility, reading-progress behavior, active game identity.
- Replay controller: loaded data, replay position, playing state, speed, selected team, bench expansion; one frame for all children.
- Team tabs: presentation selection only. Default favorite/home once per game; background provider refresh must not continually reset manual selection.
- On replay-tab exit: pause. Recommended on return: preserve position and remain paused. On game-ID change/unmount: cancel requests/RAF and discard game-local state.
- Background/hidden view: pause or reset the wall-clock baseline to avoid catch-up. A desktop homepage preview hidden by responsive CSS must never keep playing.
- Reconcile keyboard ownership: range/team-tab arrows and replay shortcuts must not trigger `GameView`'s desktop sibling-navigation listener.

No standalone replay route, URL query synchronization, or MongoDB persistence is required for the first implementation.
