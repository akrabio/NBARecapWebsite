# 1. Source audit and deterministic reconstruction

Predecessor: read [README](README.md), [contracts](contracts.md), and the product design. This package intentionally precedes application UI work.

## R01 — Establish repository baseline

- **Depends on:** none. **Files:** existing project/docs only.
- Read repository instructions and relevant installed Next.js docs; inspect the integration map in the index.
- Run the existing tests, lint, and build once. Record pre-existing failures without fixing unrelated code.
- Confirm mockup 5 and shared assets are available to the developer; obtain them from the handoff if ignored files are absent.
- **Done when:** baseline results and source references are recorded; implementation scope is clear.

## R02 — Capture complete real-game fixtures

- **Depends on:** R01. **Suggested files:** `scripts/capture-replay-fixture.mjs`, `tests/fixtures/replay/`, fixture manifest.
- Fetch full ESPN summaries for the candidate games: `401810791` comeback, `401810798` overtime, `401810792` blowout, `401810799` close finish. Verify these descriptions against the actual response; add `401810062` or another ordinary game as needed.
- Capture the complete relevant sections before pruning unrelated news/media. Record event ID, game date, retrieval date, source URL, and whether the fixture is raw or a documented projection.
- Include starters, full rosters, stat labels, all plays, sequence fields, substitution descriptions/participants, period scores, completion status, probability, and final team/player stats.
- **Done when:** offline fixtures cover at least these game shapes. Existing reduced fixtures and mockup data are not substituted for real event details.

## R03 — Audit event attribution and lineup coverage

- **Depends on:** R02. **Suggested files:** `scripts/audit-replay-source.mjs`, `docs/replay-implementation/source-findings.md` (new developer output).
- Produce event-type counts, field presence, duplicate/order anomalies, missing probability links, and representative event samples.
- For each required stat, document how player roles are identified, including events crediting the opposing team. Inspect made/missed shots, assisted baskets, blocked shots, turnovers with steals, team rebounds, and technical free throws.
- Inspect starters and substitutions, including batches at one timestamp and changes between periods. Find out whether incoming/outgoing IDs are structured or require description parsing.
- **Done when:** a field/role map is supported by examples, uncertainty is explicit, and no implementation assumes the first participant always has a particular role.

## R04 — Finalize contracts and source-feasibility gate

- **Depends on:** R03. **Suggested files:** `lib/replay/types.js` (JSDoc), `contracts.md`, source findings.
- Define event, stat-delta, lineup, capability, checkpoint, highlight, timeline, and build-result shapes described in the contracts.
- Define stable failure reason codes and per-family capability scope. Separate source observations from assumptions.
- Record a support matrix: reliable, requires parser work, absent/uncertain. Assess whether active-five reconstruction is feasible across the corpus.
- **Done when:** Gate A passes. Escalate broad source limitations before promising active lineups or all stat columns; proceed with supported data work while unresolved items remain explicit.

## R05 — Normalize teams, rosters, and final expectations

- **Depends on:** R04. **Suggested files:** `lib/replay/normalize.js`, `tests/replay-normalize.test.js`.
- Match home/away by IDs and `homeAway`, not source array order or team-name position. Build complete player metadata, starter flags, DNP status, and final expected counters from source labels.
- Do not treat absent stat values as zero. Preserve final values only for validation; initialize running values separately.
- **Done when:** reversed team arrays, missing labels, DNP players, and unknown IDs have meaningful fixture assertions.

## R06 — Normalize clocks and event ordering

- **Depends on:** R05. **Files:** normalization module/tests.
- Parse `M:SS`, decimal seconds, quarter boundaries, and successive overtime periods. Preserve source sequence through same-clock events.
- Handle proven duplicates and score corrections explicitly; keep unknown event types and provenance.
- **Done when:** tests cover multiple same-clock free throws/substitutions, fractional late clocks, period-end events, and missing/invalid clocks. No silent coercion of missing clock to final buzzer.

## R07 — Implement scoring and shooting deltas

- **Depends on:** R06. **Suggested files:** `lib/replay/stats.js`, `tests/replay-stats.test.js`.
- Support two/three-point makes/misses and free throws, including technical free throws. Made threes affect both FG and 3PT; free throws do not affect FG.
- Use explicit player attribution and source score progression. Identify goaltending, continuation/review corrections, and unknown scoring cases from the audit.
- **Done when:** selected sequences reconcile scoring/shooting; unsupported credits are flagged and no made basket or overturned basket is counted twice.

## R08 — Implement assists and rebounds

- **Depends on:** R07. **Files:** stats module/tests.
- Attribute assists once per supported scoring play; do not count a separate assist description again if it describes the same credit.
- Distinguish player versus team rebounds, and optional offensive/defensive categories when explicitly supported. Handle dead-ball events using observed source conventions.
- **Done when:** explicit multi-player plays, team rebounds, unassisted baskets, and ambiguous descriptions have tests. Unknown attribution propagates capability warnings.

## R09 — Implement turnovers, steals, and blocks

- **Depends on:** R08. **Files:** stats module/tests.
- Handle team turnovers separately from player turnovers. A steal is not implied by every turnover.
- Correctly credit opponent steal/block roles. Ensure a blocked attempt contributes the appropriate shooter's FGA exactly once.
- Add personal fouls only if supported; distinguish technical, offensive, and disqualifying foul context. Omit foul-out highlights until this is reliable.
- **Done when:** positive and negative attribution cases pass, including a turnover without a steal and a block paired with a missed attempt.

## R10 — Initialize first-period active lineups

- **Depends on:** R09. **Suggested files:** `lib/replay/lineups.js`, `tests/replay-lineups.test.js`.
- Seed five unique starters per team using verified source fields. Initialize zero stats for bench players too.
- Establish stable five-slot ordering; do not sort by changing points.
- **Done when:** duplicate/missing starters cause a labeled invalid lineup rather than guessed players; DNP metadata does not create an active player.

## R11 — Apply substitutions and period transitions

- **Depends on:** R10. **Files:** lineup module/tests.
- Apply verified incoming/outgoing events; group connected same-clock substitutions without reordering unrelated plays. Preserve cumulative stats and reuse the outgoing player's slot for the entering player when possible.
- Validate each completed group for five distinct members. Detect an incoming player already active, an unknown outgoing player, and wrong-team IDs.
- Audit quarter/halftime/overtime starts specifically: first-period starter flags do not prove who starts subsequent periods. Do not blindly reset to the original five or assume missing intermission substitutions never occurred.
- Define interval-level roster fallback and recovery only when source evidence establishes a full valid lineup again.
- **Done when:** tests cover multi-player swaps, bench re-entry with existing stats, period changes, incomplete groups, and restore-after-seek membership expectations.

## R12 — Join win probability to events

- **Depends on:** R11. **Suggested files:** normalization/state modules and tests.
- Link `playId` to normalized order; validate finite fractions in `[0,1]`. Record unlinked/conflicting samples.
- Carry forward known values only after they occur. If no initial value exists, show unknown until the first supported value; do not fill a later estimate back to 0–0.
- **Done when:** tests cover sparse/missing samples, invalid values, and sample association at same-clock actions. Final outcome certainty is explicitly labeled as derived if synthesized at the final whistle.

## R13 — Build pure running-state reconstruction and checkpoints

- **Depends on:** R12. **Suggested files:** `lib/replay/state.js`, `tests/replay-state.test.js`.
- Reduce normalized events into synchronized score, player counters, lineup, and probability state; keep source-backed score and stat attribution separate.
- Implement lookup by event index and compact checkpoints; support backward/forward reconstruction without mutating source fixtures.
- Treat substitution groups as atomic visible lineup transitions while retaining original event provenance.
- **Done when:** arbitrary event lookups equal straight sequential reduction, especially before/after substitutions and corrections. Two seeks to the same index yield identical state.

## R14 — Reconcile and classify replay quality

- **Depends on:** R13. **Suggested files:** `lib/replay/validate.js`, `tests/replay-validate.test.js`, audit script/report.
- Compare final player counters, score, period totals, and applicable team totals against official expectations. Explain definition differences instead of forcing sums.
- Run lineup invariants across the whole event stream. Report where exact membership cannot be independently validated; five unique players alone does not prove the right five.
- Classify ready/limited/unavailable and disable affected stat/lineup families with reason codes. Do not patch end-state stats or pretend source revisions are known event timings.
- **Done when:** Gate B passes with a game-by-game reconciliation report. Unresolved broadly missing active-five/stat coverage requires a documented product decision before claiming the feature complete.
