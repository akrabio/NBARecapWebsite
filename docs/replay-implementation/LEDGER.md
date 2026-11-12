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
| W02 | R03–R04 source audit, types, support matrix | A | in progress | | |
| W03 | R05–R06 normalize teams/rosters/clocks/order | | todo | | |
| W04 | R07–R09 stat deltas (scoring, ast/reb, to/stl/blk/pf) | | todo | | |
| W05 | R10–R11 lineups + substitutions | | todo | | |
| W06 | R12–R13 win probability join + state/checkpoints | | todo | | |
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

## Open issues / escalations

_none yet_
