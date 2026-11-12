# Game replay — implementation ledger

Single source of truth for progress. Maintained by the orchestrator; sub-agents read it for context and report back (they do not edit it unless told to).

- Branch: `claude/game-replay-orchestrator-b690dd` (worktree). One commit per validated work unit. No co-author lines in commits.
- Specs: `docs/game-replay-design.md` (product authority), `docs/replay-implementation/README.md`, `contracts.md`, `01-data.md` … `05-validation.md`.
- Mockups (gitignored, local reference only): `mockups/replay-5.html`, `mockups/replay-base.css`, `mockups/replay-engine.js` (synthetic — never ship its data).
- Status values: `todo` · `in progress` · `validating` · `fix` · `done` · `blocked`.

## Work units

| Unit | Tasks | Gate | Status | Commit | Notes |
| --- | --- | --- | --- | --- | --- |
| W01 | R01–R02 baseline + real fixtures | | done | W01 | Validator PASS. Minor script nits (no fetch timeout, ID check per-loop) accepted. |
| W02 | R03–R04 source audit, types, support matrix | A | done | W02 | Gate A PASS (validator reproduced roles, ordering, reconciliation, lineups). |
| W03 | R05–R06 normalize teams/rosters/clocks/order | | done | W03 | Validator PASS; follow-up fix: all roles must match name captured from text (shooter etc.), `clock_fallback` issue. 112 tests. |
| W04 | R07–R09 stat deltas (scoring, ast/reb, to/stl/blk/pf) | | done | W04 | Validator PASS (own reconciliation, all 5 fixtures). 156 tests. |
| W05 | R10–R11 lineups + substitutions | | done | W05 | Validator FAIL→fix→PASS (DNP actor could become active). 210 tests. |
| W06 | R12–R13 win probability join + state/checkpoints | | done | W06 | Validator PASS (independent accumulate+lineupAt path, random seeks). 290 tests. |
| W07 | R14 reconcile + quality classification | B | done | W07 | Gate B PASS. Validator FAIL (truncated feed → ready) → fix → PASS. 323 tests. Report: `reconciliation-report.md`. |
| W08 | R15–R17 highlight detection/ranking | | done | W08 | Validator A PASS / B NEEDS-TUNING → tuned → A PASS / B GOOD. 365 tests. Report: `highlights-report.md`. |
| W09 | R18 Hebrew captions | | in progress | | |
| W10 | R19–R20 timeline + frame lookup/moment nav | | done | W10 | Validator PASS + hardening (holds snap to sub-group end). |
| W11 | R21–R22 playback clock + lifecycle | | done | W11 | Validator PASS + follow-ups (design doc default recorded, callback ref, single now()). Browser check deferred to W18/W20. | | |
| W12 | R23–R24 builder + core audit | C | todo | | |
| W13 | R25–R27 replay API route + cache + tests | | todo | | |
| W14 | R28–R29 client loader + lazy UI boundary | | todo | | |
| W15 | R30–R31 third tab + frame container | | todo | | |
| W16 | R32–R34 scoreboard, probability, spotlight, controls | | todo | | |
| W17 | R35–R36 active-five tables + team tabs | | todo | | |
| W18 | R37–R38 layout fit + keyboard/lifecycle isolation | | todo | | |
| W19 | R39–R40 states + accessibility/motion | D | todo | | |
| W20 | R41–R43 E2E, pacing trials, regressions | | todo | | |
| W21 | R44–R46 perf, final checks, handoff | E | todo | | |

## Baseline (R01)

2026-11-12, before any replay code: `npm test` 9 files / 79 tests pass; `npm run lint` clean; `npm run build` succeeds (9 routes). Mockups present locally.

## Key findings & decisions (append-only)

_Record source-capability findings, contract changes, deviations from the plan (with reason), and open product questions here._

- **W01 fixtures** (`tests/fixtures/replay/`, documented projection; kept: header, boxscore, plays, winprobability, format, gameInfo, meta, wallclockAvailable; manifest.json): 401810791 MEM@PHI 129–139 comeback (PHI −14); 401810798 CHI@GS 130–124 OT (also comeback); 401810792 DET@BKN 138–100 blowout; 401810799 CHA@POR 103–101 close finish (CHA −19 comeback); 401810062 TOR@BKN 119–109 ordinary. Recapture: `node scripts/capture-replay-fixture.mjs [ids…]`.
- All final; last-play score = header final; winprobability has exactly one entry per play, all linked.
- `sequenceNumber` occasionally goes backwards vs array order (1–4×/game) → order by array order, not sequenceNumber (to confirm in W02).
- Shot `coordinate` uses sentinel values (e.g. −214748340) on non-shots.
- Substitutions: 53–95/game, all with 2 participants.
- **W02 / Gate A** — full detail in `source-findings.md`; types/reason codes in `lib/replay/types.js`. Role map: shots `[0]` shooter, `[1]` assister only with "(X assists)"; blocks `[0]` shooter `[1]` blocker, `team` = shooter's team; turnovers `[0]` player, `[1]` stealer only with "(X steals)"; rebounds `[0]`; subs `[0]` enters `[1]` leaves; jump ball `[2]` gains possession (jumper order arbitrary). Team rebounds/turnovers have no participants.
- Order = plays array order (sequenceNumber regresses 15×). Win prob joins by `playId` (index join misaligns).
- Counting rules: heaves (type 282) excluded from FGA/3PA; FT never FGA; TO/PF via fixed type-ID lists; technicals ≠ PF. Match roles by `type.id`, not text regexes.
- Known source error: play 401810062656 block participant is Demin but text/box say Porter Jr. → role must be cross-checked against text (name guard), else attribution unknown.
- Reconciliation with this map: 1,589/1,590 player stat values match; only Holland II 3PA (6 pbp vs 5 box) — limit that stat, never patch.
- Lineups: starters + subs in array order → always 5, 0 off-court actors (except the bad block), 42/42 period starting fives evidenced; between-period changes appear as subs at 12:00/5:00. Same-clock sub groups (≤7) apply atomically. Active-five feasible → no product escalation.
- Corpus limits: no ejections, corrections, or reviews observed.
- **W03** `lib/replay/normalize.js`: `normalizeGame(summary)` → `{espnGameId, final, format, teams:{home,away}, players, expected:{players,teams}, events, issues}`. Event `detail`: `made, points, attemptValue (2|3|null), heave, blocked, offensive, ftKind (regular|technical|flagrant), teamOnly`. Roles only set when participant matches the name captured from text; failures → `role_text_conflict` issue with `candidate` (never applied). Consequence: Porter Jr. reconstructs 0 blk vs box 1 (play 401810062656) → W07 must limit his blk. Corpus issues: only that conflict + 15 `sequence_out_of_order`.
- **W04** `lib/replay/stats.js`: `statContext(normalized)`, `eventStatDeltas(event, ctx)` → `{eventIndex, players:{id:Partial}, teams:{teamId:TeamOnly}, unattributed:{teamId:Partial}, points:{teamId:n}, issues}` (non-zero only); `applyDeltas(state, event, deltas, teams)` in-place step w/ `score_delta_mismatch` check vs source scoreAfter; `initialStatState`, `accumulate(normalized,{uptoIndex})`; exports `PLAYER_COUNTERS`, `TEAM_ONLY_COUNTERS`. Unknown credit → `unattributed[team]` + `attribution_unknown`. Team-only counters incl. `teamRebounds`, `teamTurnovers`, `technicalFouls`. Reconciliation exact except the two known exceptions.
- **W05** `lib/replay/lineups.js`: `lineupContext`, `initialLineups(normalized)` → `{eventIndex:-1, teams, pendingSubs, issues}`; step `applyLineupEvent(state, event, ctx)` → `{state, issues, appliedGroup}`; `lineupTimeline(normalized,{uptoIndex})` → `{initial, states[i], groups[{id,from,to,teams}], issues}`; `lineupAt(normalized,i)`. Group = consecutive subs at same period+clock (`substitutionGroup` from normalize); any other event ends a group; applied atomically at its last event — inside a group state = pre-group five + `pendingSubs` (UI may show "change pending"). Entering player takes leaving player's slot. Invalid → empty `onCourt` (roster fallback) + `candidates`/`confirmed`; recovers only when 5 distinct candidates all confirmed post-failure (no look-ahead). DNP never active. Corpus: 0 lineup issues, final ten = box `active`.
- **W06** `lib/replay/probability.js`: `joinWinProbability(wp, events, opts)` → `{samples:[{eventIndex, sourcePlayId, home, tie, derived}], issues}`; `normalizeGame` now outputs `probability`. Codes: `probability_unlinked|out_of_range|conflict|missing`. Final synthesis opt-in only (`derived:true`), never needed in corpus.
- **W06** `lib/replay/state.js`: `buildStateIndex(normalized,{checkpointEvery=25})` → `{checkpointEvery, checkpoints, issues, stateAt(i)}` (i clamped to [-1,last]); `stateFromCheckpoints(normalized, checkpoints, i)` works on wire checkpoints; `stepState`, `initialState`, `stateContext`. State: `{eventIndex, score, creditedScore, players, teams, unattributed, lineups:{teams,pendingSubs}, probability|null}`. Checkpoint size on 568-event OT game: every 25 → 99 KB, every 50 → 51 KB; lookups <0.15 ms at any spacing → consider 50+ for payload in W12/W13.
- **W07 / Gate B** `lib/replay/validate.js`: `validateReplay(normalized, stateIndex?, opts?)` → `{validatorVersion, espnGameId, status, reasons, capabilities, warnings, reconciliation:{score,players,teams}, lineups, probability}`. `capabilities: Capability[]` with `scope` (`game` one per family | `player` | `team` (opt. event interval) | `teamTotal`). `capabilityFor(caps, family, {playerId, teamId, eventIndex, teamTotal})` — throws if playerId w/o teamId; player override beats game level. Statuses: 791/798/799 `ready`; 062 `limited` (Porter Jr. blk unavailable); 792 `limited` (Holland II 3PT unavailable + DET 3PT teamTotal). Holland's FG reconciles → keep; never derive 2PT = FG−3PT for him. Unavailable when: not final (completed+post+STATUS_FINAL*), missing teams/box/plays, score regression, final/credited/period score mismatch, no GAME_END / final PERIOD_END, >2% events no clock. Tunable defaults: family disabled for all if ≥3 players and ≥20% mismatch; lineup limited from last sub if final five ≠ box active; missing linescores → ready + warning. `normalize` adds `periodScores`. Report via `node scripts/replay-report.mjs`.
- **W11** `lib/replay/playback.js`: `createPlaybackController({durationSec, now, requestFrame, cancelFrame, onChange?, speed?, maxFrameGapMs=250})` → `play, pause, toggle, seek, setSpeed, restart, setActive, getSnapshot, subscribe, destroy, isDestroyed`; snapshot frozen `{positionSec, playing, speed, ended, active}`. Play ignored while inactive; play from ended restarts at 0; restart → 0 paused; gaps >250 ms not credited (no catch-up). **Timeline contract W10 must satisfy:** `{durationSec, segments:[{kind:'fast'|'hold', startSec, endSec, …}]}`; speed scales holds too; consumer maps time→frame. Hook `components/game/replay/useReplayPlayback.js`: `useReplayPlayback({gameKey, durationSec, active})` → `{snapshot, play, pause, toggle, seek, setSpeed, restart, containerRef}` (callback ref; zero-size → inactive); hidden document → pause, no auto-resume; SSR/first render → idle snapshot. Return-to-tab default recorded in design doc.
- **W08** `lib/replay/highlights.js`: `buildHighlights(normalized,{stateIndex?, capabilities?, config?})` → `{version, highlights, candidates}`; also `selectHighlights`, `highlightCandidates` (status + `DROP_REASONS`), `HIGHLIGHT_CONFIG`, `HIGHLIGHT_TYPES`. Record: `id` (`type-keyEventIndex`), `eventIndex` (= group END; hold shows state after it), `keyEventIndex`, `groupStartIndex/EndIndex`, `type`, `playerIds`, `teamIds`, `captionParams` (strings/numbers only), `evidence` (look-ahead fields only under `evidence.verification` with `lookAhead:true` — NEVER surface), `importance`, `holdSec` (placeholder). Types: tie, go_ahead, lead_change, first_lead_since, first_lead, big_shot, steal, turnover, block, missed_final_attempt, foul_out, overtime (at confirmed PERIOD_END), game_end, lead_milestone. Selected: 062:2, 791:7, 792:2, 798:12, 799:12. Players with unavailable capability never named (fall back to team).
- **W10** `lib/replay/timeline.js`: `buildTimeline(normalized, highlights,{config})` → `{version, durationSec, targetSec, segments, moments, periods, lastEventIndex, issues}`; fast segs `{kind:'fast', startSec, endSec, fromEventIndex, toEventIndex, revealSec[], eventsPerSec}`; hold segs `{kind:'hold', startSec, endSec, eventIndex, highlightId, momentIndex}` (half-open). `frameAt(tl, sec)` → `{replaySec, eventIndex, segmentIndex, segmentKind, hold:{highlightId,momentIndex,remainingSec}|null, period, periodLabel, ended}`; `momentNav(tl, sec,{toleranceSec=0.25})` → `{prev,next}` (hold starts); `spotlightAt(tl, sec)` → last reached moment + `active`, `sinceEndSec`; `scrubberMarkers`, `TIMELINE_CONFIG`. Defaults: 90 s target +12 s/OT, clamp 60–120; period weights 1/1.2/1.45/1.9, OT 2.1; close-finish ×2.6 (margin ≤5, last 6 min); settled ×0.35 (margin ≥10+1.5/min left, current state only). Holds 1.2–2.4 s by type (+0.3 s last 2 min). Durations: 062 85.8, 791 89.2, 792 75.0, 798 102.0, 799 90.0. Sub groups never split by a frame.

## Open issues / escalations

- ~~(→W07) per-player capability for Porter/Holland~~ done. ~~(→W07) stats.js silent drops~~ done (`unknown_team`, `unknown_athlete`).
- ~~(→W10) holdSec~~ resolved: timeline hold rule uses only type/period/clock. Previously: holdSec currently derives from importance incl. the decisive-lead +12 boost (future-dependent). Timeline should compute holds from pre-boost importance / own rule.
- (→W20 pacing) optional: 062 decisive lead #147 is a technical FT (weak); 791 #442/#456 both turnovers (repetitive).
- (→normalize, defensive) self-assist (assister = shooter) not guarded; not in corpus.
