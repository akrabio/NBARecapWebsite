# Game replay — developer implementation plan

Prepared November 12, 2026. Planning deliverable only: none of the application tasks below have been implemented by this plan.

## Start here

Build an animated NBA game recap as the third game tab: **סיכום | נתונים | שחזור**. Run through ordinary action quickly, hold at key moments for roughly 1–2 seconds, and complete a game in roughly 60–120 seconds at default speed. Show the actual five players on court, running statistics, and win probability in sync.

Read [the product design](../game-replay-design.md) first. It is the authority for agreed product behavior. This plan supplies implementation choices and small tasks. Suggested names and technical defaults can be adjusted with a recorded reason; do not silently change product requirements to accommodate incomplete source data.

## Ordered work packages

Work through tasks in numeric order. Each task should be independently reviewable; use a small commit per task or tightly related pair. Dependencies identify required prior outputs, not permission to skip intervening integration checks.

| Order | Document | Tasks | Result |
| --- | --- | --- | --- |
| Reference | [Contracts and architecture](contracts.md) | Referenced throughout | Module boundaries, state, API, fallback policy |
| 1 | [Data and reconstruction](01-data.md) | R01–R14 | Verified event stream, running stats, active lineups, diagnostics |
| 2 | [Highlights and playback](02-playback.md) | R15–R24 | Supported captions, condensed timeline, deterministic player |
| 3 | [Server and client delivery](03-delivery.md) | R25–R29 | On-demand replay endpoint and isolated client loading |
| 4 | [UI and existing-site integration](04-interface.md) | R30–R40 | Functional third tab, responsive tables, controls, accessibility |
| 5 | [Validation and handoff](05-validation.md) | R41–R46 | Real-game viewing trials, regressions, documented release readiness |

Each task lists dependencies, suggested files, work, and a completion check. Unit tests belong beside the implementation tasks; the final package is for cross-cutting validation, not the first time correctness is tested.

## Non-negotiable requirements

- The replay is a tab within the existing game view, not a new standalone game route, modal, or homepage feature.
- Keep the desktop games sidebar. Use content width to choose two team panels or one selected team.
- Replace the final-score hero while replay is selected; do not leave the final score in the sticky top bar next to a running score.
- Default game tab remains recap. No autoplay. Leaving replay pauses it.
- Actual play-by-play controls stats and substitutions. Mockup-generated events must never enter production.
- Start from 0–0; no future stat values or future probability history in the visible replay.
- Team selection remains under reader control even when an opponent is highlighted.
- Unsupported statistics or lineups are labeled unavailable. Do not guess, manufacture zeros, or silently force final totals to agree.
- Playback timing is experimental. The 90-second target and 1–2 second holds are initial tuning values, not a claim that timing is settled.

## Recommended implementation defaults

These resolve implementation details left open by the design. They are recommendations for the developer, not additional user decisions:

1. Preserve the replay position, selected team, speed, and bench expansion when changing game tabs; return paused. Reset on changing game ID. Persistence is in-memory for the mounted game view, not across browser reloads.
2. Fetch/build replay on first selection of its tab through a dedicated numeric-ESPN-ID API route. Reuse the cached ESPN summary; do not expand the existing box-score response for every reader.
3. Start without MongoDB schema changes, background warming of replay, additional API providers, AI narration, or a feature-flag service.
4. Use JavaScript/JSDoc, React, existing styling conventions, SVG, and existing Vitest. Add a dependency only when a demonstrated need justifies it.
5. Use initials in the player spotlight first; portraits are optional and must have a fallback. Keep the dense player tables from mockup 5.
6. A missing probability feed is a limited replay, not a failed replay. Unreliable team scoring/event coverage is a failed replay. Missing lineup coverage requires a labeled roster fallback, not pretend on-court players.

## Existing-code map

| File | What matters |
| --- | --- |
| `lib/espn.js` | Shared summary fetch; validates numeric ESPN IDs; six-hour source cache |
| `lib/games.js` | Resolves recap/legacy IDs; persists media/story; do not add full replay to existing list warming |
| `lib/story.js` | Compact, sampled story; unsuitable as an event/stat reconstruction source |
| `app/api/boxscore/[gameId]/route.js` | Returns box score and linescores only; preserve this contract |
| `utils/api.js` | Existing client fetch/cache pattern; replay can use a separate helper |
| `components/game/GameView.jsx` | Game tabs, final-score hero, compact sticky score, reading progress, scrolling, desktop game-navigation shortcuts |
| `app/game/[id]/page.js` | Canonical game view and 400px desktop games sidebar |
| `app/page.js` | Also renders `GameView` as the desktop homepage preview; test this entry path |
| `components/games/TeamPicker.jsx` | `useTeamPicker()` exposes the favorite team; use this rather than a separate cookie-reading mechanism |
| `components/game/BoxScore.jsx` | Useful labels/table conventions; final-stat UI must remain separate from running state |
| `mockups/replay-5.html` | Selected visual direction; currently fixed illustrative players, not active lineups |
| `mockups/replay-engine.js` | Synthetic sample progression; visual reference only |
| `tests/fixtures/espn-*.json` | Reduced fixtures; not complete replay data |

The mockups directory is currently ignored by `.gitignore`. Ensure the handoff includes mockup 5 and its shared assets as local reference files; do not assume a repository clone contains them. The product document remains usable without these files. Do not change ignore rules or force-add mockups as part of replay implementation without a separate reason.

## Milestone gates

| Gate | Required evidence before continuing |
| --- | --- |
| A — source feasibility, after R04 | Full-response fixture corpus, observed event-role map, uncertainty report. No assumed participant roles. |
| B — reconstruction, after R14 | Score/stat reconciliation and lineup audit on real fixtures; explicit capability/failure decisions. Unsupported families remain isolated. |
| C — replay core, after R24 | Seek and pause/hold tests; meaningful highlight evidence; default timelines in the target range. |
| D — integrated experience, after R40 | Third tab works on game route and desktop home preview; no conflicting score, keyboard, sticky, or background playback behavior. |
| E — ready for review, after R46 | Viewing-trial record, checks, known limits, and runnable handoff. Publication is outside this implementation plan. |

If a gate exposes incomplete ESPN data, first diagnose the parser and compare with the source. Do not treat a single malformed fixture as proof of universal absence. If reliable five-player lineups or required stat families are broadly unavailable, document the findings and obtain a product decision before calling the intended feature complete. Continue independent work on supported portions.

## Repository rules and checks

Read `AGENTS.md`. Before Next.js application changes, consult the relevant installed docs in `node_modules/next/dist/docs/`; do not implement from assumptions about older Next.js versions. Particularly relevant:

- `01-app/01-getting-started/15-route-handlers.md`
- `01-app/02-guides/lazy-loading.md`
- `01-app/01-getting-started/05-server-and-client-components.md`
- `01-app/03-api-reference/04-functions/fetch.md`

Use `npm test`, `npm run lint`, and `npm run build` as the repository commands. Establish a baseline first and distinguish pre-existing failures from new regressions. The test configuration currently runs `tests/**/*.test.js` in a Node environment; no browser-test runner is installed. Browser integration checks may be manual or use available browser tooling; a new test framework is not required merely for screenshots.

## Tracking

For each task, record its completion, changed files/commit, verification, and any remaining issue. Keep source capability findings, contract changes, and tuning outcomes beside the relevant work package. A task is done when its completion check passes, not just when its proposed file exists.
