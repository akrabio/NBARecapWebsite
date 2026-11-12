# Replay contracts and architecture

Read alongside [the task index](README.md). Preserve these boundaries even if filenames change.

**Status (R04, 2026-11-12):** sections marked *(finalized)* are fixed by the real-fixture audit in [source-findings.md](source-findings.md) and typed in `lib/replay/types.js` (JSDoc typedefs plus frozen `EVENT_KINDS`, `CAPABILITY_FAMILIES`, `CAPABILITY_LEVELS`, `REASON_CODES`, `REPLAY_SCHEMA_VERSION`). Change them only together with `types.js` and a recorded reason. Unmarked sections remain proposals for later tasks.

## Source observations vs assumptions *(finalized)*

Observed/verified on all five fixtures (details and play IDs in source-findings.md):

- Play array order is clock- and score-consistent; `sequenceNumber` is not (15 inversions, ~180 gaps/game). `winprobability` is in sequence order, one sample per play, all linked by `playId`.
- `participants[]` carry only athlete IDs, no roles. Role positions depend on type/text: FG shooter `[0]`; assister `[1]` only with `(X assists)`; **blocked shot `[0]` = shooter, `[1]` = blocker, `team` = shooter's team**; turnover `[0]`, stealer `[1]` only with `(X steals)`; rebounder `[0]`; substitution `[0]` entering, `[1]` leaving; jump ball `[0..1]` jumpers in arbitrary order, `[2]` possession.
- One participant ID contradicted its text and the box score (401810062656, blocker). Roles therefore need a text-name guard.
- Team rebounds / team turnovers have no participants. Box team rebound totals exclude team rebounds; `teamTurnovers` is reported separately.
- `282 Heave Jump Shot` attempts are excluded from box FGA/3PA.
- Between-period lineup changes are logged as substitutions at the new period's start clock; starters + subs reproduce a valid five at every event (0 anomalies).
- With these rules 1,589/1,590 player stat values reconcile; the exception (one 3PA) is an unexplained source inconsistency.

Assumptions (not contradicted, corpus too small to prove): rules hold for playoff/multi-OT games; reviews never require negative corrections (none observed; the feed already removes overturned calls); box `active` = on court at the final horn; technical-foul records may be duplicated; ejections appear as ordinary substitutions.

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

## Identity and time *(finalized)*

- Use stable ESPN team/player IDs. Distinguish recap ID (Mongo ID) from ESPN event ID at every boundary.
- `eventIndex`: unique normalized order, including same-clock events; suitable for state reconstruction.
- `sourcePlayId`: links back to ESPN; keep source sequence/index for diagnostics.
- `period`, `clockRemainingSec`, `gameElapsedSec`: game time, including five-minute overtime periods. Preserve decimal clock precision.
- `replayTimeSec`: condensed playback position, including holds. Never derive this by multiplying game elapsed time by one fixed speed.
- Unknown timestamps stay unknown until an explicit supported rule resolves them; they are not automatically 0:00.

Normalize the established source sequence, not an alphabetical ID order or a clock-only sort. **Adapter rule: ESPN `plays` array order is the normalized order**; `sequenceNumber` is kept as `sourceSequence` for diagnostics and an inversion only produces a `sequence_out_of_order` warning. Only deduplicate proven duplicate records; identical-content records observed so far are all legitimate (e.g. two offensive rebounds by the same player at one clock), so the default is no deduplication. Clocks are `M:SS` or `S.s` (decimal seconds under a minute); overtime periods start at 5:00.

## Normalized events *(finalized)*

Typed as `NormalizedEvent` in `lib/replay/types.js`. Fields:

| Field | Meaning |
| --- | --- |
| `index`, `sourcePlayId`, `sourceSequence` | Stable event provenance/order |
| `period`, `clockRemainingSec`, `gameElapsedSec` | Clock context |
| `source` | `{ typeId, typeText }` — preserved for unknown types and diagnostics |
| `kind` | One of `EVENT_KINDS` |
| `teamId` | ESPN `team.id` (acting team; for blocked shots the shooter's team) or null |
| `roles` | Verified roles only (`EventRoles`): shooter, assister, blocker, rebounder, turnoverBy, stealer, fouler, technical[], fouled, jumpers[], possession, entering, leaving; absent when uncertain |
| `detail` | made, points, attemptValue, heave, offensive, ftKind, teamOnly |
| `scoreAfter` | Home/away score from the event record |
| `text` | Plain source text (captions/diagnostics; never HTML) |
| `substitutionGroup` | Shared ID for substitutions at one period/clock boundary, applied atomically |
| `issues` | `EventIssue[]` with `REASON_CODES` values |

Stat deltas (`EventStatDeltas` in `lib/replay/stats.js`) and the linked probability sample are derived from the event by the stats/state modules rather than duplicated on every serialized event; the builder may inline them if measurement shows it is cheaper for the client.

Participant array order is not a player-role contract. A positional role is accepted only when (a) the type/text pattern implies it, (b) the athlete is on the box roster, (c) the athlete's display name appears in the text, and (d) the team relation holds (blocker/stealer = opponent, assister = teammate). If (c) fails, drop the role with `role_text_conflict`; a unique exact roster-name match from the role pattern is recorded on the issue as `candidate` for diagnostics but never applied (W03 decision: two sources disagree, so attribution is unknown; validation limits the affected stat). A wrong-side role (blocker/stealer not an opponent, assister not a teammate) is dropped with `role_team_conflict`. Ambiguous descriptions produce unknown attribution, not a confident stat. Counting rules: FTs (type 97–105) never count as FGA despite `shootingPlay: true`; heaves (type 282) do not count as FGA/3PA; PF types are 22, 24, 32, 40, 42, 43, 44, 45 (technicals 29, 30, 35, 48 are not PF); turnover types are 61–65, 70, 84, 86, 87, 90.

## Running state and capability *(finalized)*

- Start both teams at zero and all supported player counters at zero.
- Player counters: `pts`, `fgm`, `fga`, `tpm`, `tpa`, `ftm`, `fta`, `reb`, `ast`, `to`, `stl`, `blk`; optional `oreb`, `dreb`, `pf` when supported.
- Record team-only counters separately. Do not force player sums to equal a team stat whose official definition differs.
- Keep all players' accumulated stats, even while they are on the bench.
- Lineups include ordered on-court slots, bench IDs, and validity/coverage. Substitution updates membership, not accumulated stats.
- Per-family/per-player capability (`Capability`: family from `CAPABILITY_FAMILIES`, level `reliable | limited | unavailable`, reason codes, optional players/teams/interval) describes what can be trusted. Unknown is represented explicitly; a displayed dash must not conceal an internal fabricated zero.
- Team-only counters (`teamReb`, `teamOreb`, `teamDreb`, `teamTo`): `teamTo` validates against box `teamTurnovers`; team rebounds have no box counterpart and are never validated or added to box team totals.
- Final box-score expectations belong in validation, not the starting frame or visible future values.

Recommended seek strategy: immutable checkpoints every fixed number of normalized events plus remaining deltas. Binary search to the target event, take the nearest checkpoint, and reduce the bounded suffix. Benchmark before selecting spacing. Full per-event snapshots are acceptable only if measured size is modest; do not copy all rosters on every animation frame.

## Highlight records *(finalized shape: `Highlight`; detection rules in R15–R17)*

Include: stable ID, event/group index, type, involved player/team IDs, caption parameters, evidence, importance score, and hold duration. Store plain text/structured parameters, not HTML from ESPN. Preserve the distinction between the state at the key event and the current replay state.

Examples of evidence: previous score and resulting score; prior last-lead event; explicit steal/block attribution; linked probability before/after; confirmed period-end ordering. Statistical importance is not proof of a cause, intention, or historical record.

## Timeline segments *(finalized shape: `TimelineSegment`)*

- Fast segment: replay-time interval mapping to an ordered interval of game events.
- Hold segment: replay-time interval mapped to one exact event boundary and highlighted moment.
- Key invariant: game state does not advance during a hold; the playback clock does.
- Pausing during a hold freezes the remaining hold time. Speed scales replay time, including holds, unless viewing trials justify a separately documented rule.
- Prefer one major moment per hold; group connected steal/basket or blocked-shot/rebound sequences intentionally.
- End state and restart semantics must be explicit. Suggested: restart resets to 0–0 paused; Play from the end restarts playback from zero.

## API contract *(body shape finalized; transport/cache policy finalized in R25–R27)*

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

The body is `BuildResult` (`lib/replay/types.js`; `capabilities` is a `Capability[]` and `reasons`/`warnings` use `REASON_CODES`). `replay` is `ReplayPayload`: `teams`, `players`, `events`, `initialLineups`, `checkpoints`, `probability` (linked `{ eventIndex, home }` samples only), `highlights`, `timeline`, `durationSec`. Serialize ordinary JSON arrays/objects, not Maps or unconverted typed arrays. No news, article HTML, credentials, or raw unrelated summary sections.

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

## Quality policy *(finalized; reason codes in `REASON_CODES`)*

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
