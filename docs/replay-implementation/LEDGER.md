# Game replay — implementation ledger

Single source of truth for progress. Maintained by the orchestrator; sub-agents read it for context and report back (they do not edit it unless told to).

- Branch: `claude/game-replay-orchestrator-b690dd` (worktree). One commit per validated work unit. No co-author lines in commits.
- Specs: `docs/game-replay-design.md` (product authority), `docs/replay-implementation/README.md`, `contracts.md`, `01-data.md` … `05-validation.md`.
- Mockups (gitignored, local reference only): `mockups/replay-5.html`, `mockups/replay-base.css`, `mockups/replay-engine.js` (synthetic — never ship its data).
- Status values: `todo` · `in progress` · `validating` · `fix` · `done` · `blocked`.

## Work units

| Unit | Tasks | Gate | Status | Commit | Notes |
| --- | --- | --- | --- | --- | --- |
| W01 | R01–R02 baseline + real fixtures | | todo | | |
| W02 | R03–R04 source audit, types, support matrix | A | todo | | |
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

_pending_

## Key findings & decisions (append-only)

_Record source-capability findings, contract changes, deviations from the plan (with reason), and open product questions here._

## Open issues / escalations

_none yet_
