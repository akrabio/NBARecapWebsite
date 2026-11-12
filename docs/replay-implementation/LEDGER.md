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
| W06 | R12–R13 win probability join + state/checkpoints | | in progress | | |
| W07 | R14 reconcile + quality classification | B | todo | | |
| W08 | R15–R17 highlight detection/ranking | | todo | | |
| W09 | R18 Hebrew captions | | todo | | |
| W10 | R19–R20 timeline + frame lookup/moment nav | | todo | | |
| W11 | R21–R22 playback clock + lifecycle | | todo | | |
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

## Open issues / escalations

- (→W07) Per-player capability must mark Porter Jr. blk (401810062) and Holland II 3PA (401810792) as limited/unknown so UI never shows a supported-looking value.
- (→W07, defensive) `lib/replay/stats.js` silently drops team rebound/turnover with null teamId and technicals for players not in `playerTeam` — add issues.
- (→normalize, defensive) self-assist (assister = shooter) not guarded; not in corpus.
