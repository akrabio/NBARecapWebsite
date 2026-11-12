# 4. Replay interface and game-tab integration

Continue after [03-delivery](03-delivery.md). Use mockup 5 for visual direction, but implement actual events and active-five rows from the validated core. Avoid copying its global DOM manipulation, synthetic event generator, or window-width-only layout rule.

## R30 — Add the third game tab and replace the final-score header

- **Depends on:** R29. **Files:** `components/game/GameView.jsx`, replay container.
- Add **שחזור** after **סיכום** and **נתונים**. Update the existing two-way content conditional into explicit three-way rendering so replay cannot accidentally render the final box score.
- Keep recap as default. Selecting replay does not start it. Keep tab keyboard behavior and reading progress appropriate to each view.
- In replay mode, hide the final-score hero and suppress its compact final score in the 52px sticky top bar. Retain game identity/date as needed without repeating the result.
- Keep a semantic page heading when the hero is absent. Handle hero observer setup/cleanup when its DOM node appears/disappears rather than assuming it mounts only once.
- **Done when:** game-level tabs remain visible; only the running replay score appears in replay content; recap/stats restore their normal header and content on return.

## R31 — Implement one synchronized replay frame container

- **Depends on:** R30. **Suggested files:** `ReplayView.jsx`, playback adapter.
- Connect the loaded contract to one derived frame, passed to every replay component. Own selected-team/bench state here.
- Integrate active/inactive lifecycle and end-state actions. “לסיכום המלא” selects the recap tab; it is not a route change.
- **Done when:** all visible subviews use the same frame/index; switching game tabs retains paused state and switching games resets it.

## R32 — Build the running scoreboard

- **Depends on:** R31. **Suggested files:** `ReplayScoreboard.jsx`, replay-scoped styles.
- Show both teams/logos, score, quarter/overtime, and decimal-capable clock. Start at 0–0 and support a final label.
- Briefly emphasize real score changes during forward playback, not every render or seek. Do not use winner-based final styling before the result.
- Reuse existing team colors/logos with readable contrast, respecting site light/dark tokens.
- **Done when:** supported sample games, 0–0, ties, and overtime display correctly without cumulative score mutation in the component.

## R33 — Add compact probability history

- **Depends on:** R32. **Suggested files:** `ReplayProbability.jsx`.
- Place current probabilities and a compact growing graph near the scoreboard. Label which team an upward curve favors.
- Reveal only reached samples; use current state for current value and no invented initial 50%. Keep quarter/overtime labels consistent with clock boundaries.
- For missing probability, show the designed unavailable label or clearly labeled margin view. Avoid a blank unlabeled chart.
- **Done when:** backward seek removes future history; missing/sparse probability works; the chart does not need a large plotting dependency.

## R34 — Add player spotlight and moment controls

- **Depends on:** R33. **Suggested files:** `ReplaySpotlight.jsx`, `ReplayControls.jsx`.
- Show the supported moment caption, player initials/portrait fallback, team, clock, and selected running stat values. Snapshot-at-highlight values must be labeled as such if the caption stays after play resumes.
- Place spotlight above the team tabs, independent of selected team. Handle team-only moments without inventing a player.
- Implement previous/next key moment with appropriate disabled states, Play/Pause, seek, speed, and restart. Provide accessible names and distinguish replay duration from game clock.
- **Done when:** an opposing player's moment appears while the selected stats team stays unchanged; all controls synchronize score, stats, lineup, and probability.

## R35 — Render active-five tables and expandable bench

- **Depends on:** R34. **Suggested files:** `ReplayTeamTable.jsx`.
- Render current on-court IDs in stable slots, with accumulated PTS, FG, 3PT, FT, REB, AST, TO, STL, BLK for supported families.
- Substitutions replace slot membership with a brief transition; entering players retain earlier stats and outgoing players remain accessible in an expandable bench section.
- Make all roster stats available without continuously sorting by points. Do not describe the roster fallback as “on court.” Unsupported values display as unavailable, distinct from a supported zero.
- Keep player names/points fixed while remaining columns can scroll inside the table; do not overflow the page.
- **Done when:** a player exits/re-enters with intact totals, bench expansion works, and incomplete lineup coverage produces the documented fallback.

## R36 — Implement team tabs and activity indicators

- **Depends on:** R35. **Files:** replay container/table wrappers.
- Default selected team once per game: involved favorite, otherwise home. Use `useTeamPicker()`'s preference, not new cookie access logic.
- Team switching changes visible statistics only. Preserve replay time, playing state, hold progress, and spotlight.
- Briefly indicate activity for the unselected team on supported events during forward playback. Do not pulse repeatedly from seeks or data refreshes.
- Add ARIA relationships, roving focus, and RTL arrow navigation for team tabs; distinguish them from game-level tabs.
- **Done when:** opponent highlights never force a switch; active playback survives manual team switching without resetting time/speed.

## R37 — Fit the actual game content area

- **Depends on:** R36. **Files:** `GameView.jsx`, replay-scoped styles.
- Address the existing `max-w-[680px]` content wrapper: allow replay-specific sizing inside the available pane while preserving recap/stats widths.
- Retain the 400px desktop sidebar and test actual available widths. Prefer CSS container queries or a measured container breakpoint for side-by-side versus team-tab layout.
- Reconcile the 52px top bar, game tabs, and replay's sticky regions. The standalone mockup's `top: 0` rule must not cover the site tabs. Keep enough vertical room for player rows on small screens.
- **Done when:** 320/390px mobile and 1024/1280/1440px desktop layouts have no page-level overflow, covered controls, or misleading two-table layout in a narrow desktop pane.

## R38 — Isolate keyboard, scrolling, and lifecycle behavior

- **Depends on:** R37. **Files:** `GameView.jsx`, controls/playback adapter.
- Prevent Space on a focused button from both native-clicking and triggering a global playback shortcut. Range/team-tab arrows must not also seek or navigate sibling games.
- Review `GameView`'s existing desktop Up/Down game-navigation handler while replay controls are focused. Scope replay shortcuts to the active view, ignoring form controls/dialogs as appropriate.
- Test tab switches when scrolled down: maintain useful tab/header position without hiding the new replay scoreboard. Verify home-preview hiding on viewport shrink pauses playback.
- **Done when:** keyboard actions have one predictable effect, switching games cleans up, and switching tabs/backgrounding never runs an invisible replay.

## R39 — Add loading, retry, limited-data, and unavailable states

- **Depends on:** R38. **Files:** replay container and loading/error presentation.
- Provide Hebrew messages distinguishing loading, temporary fetch failure, no reliable play-by-play, missing probability, stat-family gaps, and lineup fallback.
- Keep the third tab discoverable even if data is unavailable; provide recap/stats actions rather than a dead control. Do not infer support from `game.story` alone.
- A game with no resolved ESPN ID must not make an invalid API request. Retry when appropriate without permanently caching the failure.
- **Done when:** fixture/mocked failure modes show useful recovery and never leave a skeleton or spinner running forever.

## R40 — Finish accessibility and motion behavior

- **Depends on:** R39. **Files:** replay components/styles.
- Use semantic tables, stat-label explanations, keyboard controls, visible focus, and labeled sliders with meaningful value text.
- Reduced motion removes flashes/row movement; keep discrete accurate updates and readable captions. Do not announce every frame/stat cell through a live region.
- Provide a readable reached-moments list or equivalent accessible history that can be revisited. Future captions remain hidden until reached, though previous/next controls may intentionally seek forward.
- Do not make team identity, stat changes, or availability rely on color alone. Verify initials and broken portrait handling.
- **Done when:** Gate D passes on both `/game/[id]` and the desktop homepage preview, with keyboard-only and reduced-motion checks recorded.
