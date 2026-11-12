# 3. On-demand server/client delivery

Continue after [02-playback](02-playback.md). Follow the [contracts](contracts.md) and installed Next.js route-handler/caching guidance.

## R25 — Add a dedicated replay endpoint

- **Depends on:** R24. **Suggested files:** `app/api/replay/[gameId]/route.js`.
- Await route params and validate numeric ESPN ID using `isEspnId`. Use `fetchEspnSummary`; do not accept arbitrary upstream URLs or resolve Mongo IDs here.
- Build from the cached summary and return ready/limited/unavailable results. Keep transport errors distinguishable from missing coverage.
- Do not expand `/api/boxscore`, serialize full replay into all game pages, or add replay generation to `warmGames`.
- **Done when:** valid fixtures and invalid/unknown IDs produce the documented transport/body outcomes without changing existing box-score behavior.

## R26 — Set cache and failure policy

- **Depends on:** R25. **Files:** endpoint, shared constants if useful.
- Explicitly cache only trustworthy finished-game results. Document TTLs and correction implications; do not assume route-handler GETs are automatically cached.
- Do not long-cache upstream errors or transient missing/incomplete source data. Keep personalized team choice out of shared responses.
- Expose builder/schema version. Add only measured derived-result caching; no database writes in this phase.
- **Done when:** response-header checks show shared success caching and non-poisoning failure behavior; correction/refresh procedure is recorded.

## R27 — Verify endpoint behavior

- **Depends on:** R26. **Suggested files:** `tests/replay-route.test.js` or pure response/service tests plus route smoke check.
- Mock the source fetch for invalid ID, no game, unfinished game, malformed plays, missing probability, build failure, and upstream timeout/failure.
- Verify no article/news HTML is returned and no error response contains credentials or full upstream dumps.
- Keep tests compatible with the Node Vitest setup. Prefer extracting a small server service if importing Next internals makes tests brittle.
- **Done when:** meaningful contract tests pass and the actual route has a successful local HTTP smoke check.

## R28 — Add the replay client loader

- **Depends on:** R27. **Suggested files:** `utils/replay-api.js`, loader tests.
- Fetch on the first replay-tab selection, with idle/loading/ready/limited/unavailable/error states and an explicit retry action.
- Deduplicate concurrent requests, bound cache size/TTL, and key by ESPN ID/version. Do not permanently cache failures.
- Ensure request cancellation/late results cannot populate a different game's view. Define ownership so one aborted consumer does not poison a shared in-flight fetch for others.
- **Done when:** out-of-order completion, retries, repeat opens, and game changes are verified; no requests occur per playback event/frame.

## R29 — Lazy-load the replay UI boundary

- **Depends on:** R28. **Suggested files:** `GameView.jsx`, initial `components/game/replay/ReplayView.jsx`.
- Add a demand-loaded client boundary using the installed Next.js guidance; load neither replay data nor its heavy UI on a reader who stays in recap/stats.
- On first opening, mount the replay view. Keep its state for later tab returns while ensuring inactive content is hidden from focus/assistive navigation and playback is paused.
- Use existing context for favorite-team initialization. Do not add another preference store.
- **Done when:** browser network/bundle inspection shows on-demand loading, and loading/error/unavailable placeholders are functional before the finished visual components are added.
