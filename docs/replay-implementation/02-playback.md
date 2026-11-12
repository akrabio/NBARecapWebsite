# 2. Highlight selection, condensed timeline, and playback

Continue after Gate B in [01-data](01-data.md). Use the pure normalized stream; do not couple this package to React rendering.

## R15 — Detect tying/go-ahead plays and lead-history moments

- **Depends on:** R14. **Suggested files:** `lib/replay/highlights.js`, `tests/replay-highlights.test.js`.
- Track non-tied leader, previous lead times, ties, and supported score changes.
- Detect late tying/go-ahead baskets and “first lead since…” candidates. Record evidence rather than assembling free-form prose.
- Avoid dramatic lead-history claims when earlier coverage is incomplete. One team leading 2–0 is not automatically a major highlight.
- **Done when:** tests validate late ties, go-ahead shots, intervening ties, a long period without leading, and incomplete-history exclusions.

## R16 — Detect consequential defensive plays and missed finishers

- **Depends on:** R15. **Files:** highlight module/tests.
- Add steals, blocks, and turnovers using explicit attribution, score margin, game clock, and probability changes where available.
- Detect missed potential tying/winning attempts near period end; confirm attempt value and period sequence. Distinguish regulation ending in overtime from game ending.
- Apply chronology-safe captions: at the missed shot use “misses the potential winner”; announce overtime only at the confirmed period boundary, so the replay does not narrate a later outcome early.
- Foul-outs remain conditional on verified foul/disqualification data.
- **Done when:** tests exclude routine early steals, blocked attempts that could not tie, and missed shots followed by additional possessions from “buzzer” claims.

## R17 — Rank, group, and cap moments

- **Depends on:** R16. **Files:** highlight module/config/tests.
- Rank by context and supported probability change. Group linked actions and avoid several holds for one possession or closely related final free throws.
- Select varied moments with useful game coverage, starting around 8–12, without a mandatory quota or fabricated drama. Prefer specific events to generic run summaries.
- Keep selection deterministic; use event order as a tie-breaker. Missing probability must still permit contextual highlights.
- **Done when:** an inspectable candidate/selection report explains why moments were kept/dropped for each fixture; the finish is not crowded out by routine first-half actions.

## R18 — Write Hebrew caption templates

- **Depends on:** R17. **Suggested files:** `lib/replay/captions.js`, caption tests.
- Implement short templates for supported highlight types with player/team identity and score/clock parameters.
- Keep source text out of HTML injection paths. Render plain text/React nodes, isolating names and numeric fractions for bidi correctness.
- Support a team-level caption when a player role is unknown; never select a guessed name. Verify source evidence for every template parameter.
- **Done when:** captions remain readable in Hebrew RTL with English names, decimal clocks, and scores, and have negative tests for unavailable claims.

## R19 — Build the fast-span/hold timeline

- **Depends on:** R18. **Suggested files:** `lib/replay/timeline.js`, `tests/replay-timeline.test.js`.
- Define tunable config for default target duration, fast-span weighting, finish emphasis, and roughly 1–2 second holds.
- Reserve hold time inside the total budget. Map ordinary events through fast segments and exact key-event states through hold segments.
- Include all events in state progression even when the UI batches updates. Include all overtime periods. Avoid forcing many captions into unreadably short holds to hit 90 seconds.
- **Done when:** timelines are monotonic and finite; normal fixtures land around 60–120 seconds at 1×; state remains unchanged across every scheduled hold.

## R20 — Implement frame lookup and moment navigation

- **Depends on:** R19. **Files:** timeline/state modules/tests.
- Map replay time to event/group boundary plus active hold/moment. Define boundaries at zero, hold start/end, periods, and final whistle.
- Provide previous/next moment targets with a small documented tolerance so the current moment is not selected repeatedly.
- Expose a spotlight frame at its selected event and the current running frame separately. Do not quietly freeze the whole table while time advances beyond a retained caption.
- **Done when:** seek during a hold, backward across substitutions, next/previous round trips, and seek-to-end produce expected deterministic states.

## R21 — Implement a single playback clock

- **Depends on:** R20. **Suggested files:** a testable playback controller plus `components/game/replay/useReplayPlayback.js` adapter.
- One RAF/time source owns replay position. Never independently increment a score, player counter, and probability.
- Implement play/pause, seek, speed, restart, and ended behavior. Repeated Play must not create parallel loops. Keep speed outside event reconstruction.
- Manual pause freezes both fast spans and remaining hold time. Holds resume automatically while the player remains logically playing.
- **Done when:** a fake/injected clock proves pause/resume during a hold, speed changes without jumps, idempotent Play, bounded seek, and exact end behavior.

## R22 — Implement lifecycle and game-tab suspension

- **Depends on:** R21. **Files:** playback adapter/controller/tests.
- Accept an `active` condition from `GameView`; pause on tab exit and cancel RAF on unmount/game change.
- Recommended: retain position/speed/selection on return, paused. Record this default in the product doc when implemented.
- Handle document visibility, responsive hiding of the desktop homepage preview, and return from browser background without catch-up bursts or silent auto-resume.
- **Done when:** lifecycle tests and a browser check show no background progression, duplicate RAF loops, or state leaking to another game.

## R23 — Compose the versioned replay builder

- **Depends on:** R22. **Suggested files:** `lib/replay/build.js`, builder tests.
- Compose normalization, stats/lineups, validation, moments, and timeline into the contract. Reject unusable coverage before generating misleading highlights.
- Keep the builder pure and deterministic for the same source/version/config. Cap unreasonable input size with a diagnosed unavailable result rather than freezing the server.
- **Done when:** building each fixture returns JSON-serializable results with capabilities, reason codes, and no unrelated ESPN content.

## R24 — Run a core acceptance audit

- **Depends on:** R23. **Suggested files:** `scripts/audit-replay-source.mjs` extensions, report.
- For each fixture, print final reconciliation, lineup gaps, selected moment evidence, duration, hold count, and payload size.
- Sample arbitrary replay positions and compare reconstructed state to sequential state. Inspect at least one substitution, block/steal, late miss, and overtime transition.
- **Done when:** Gate C passes; remaining source limits are explicit. This is a correctness gate, not a final approval of pacing: real viewing trials come after the UI exists.
