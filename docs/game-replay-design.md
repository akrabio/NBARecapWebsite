# Animated game recap — preliminary design

Status: preliminary product and technical design; implementation has not started.
Date: November 12, 2026.

Developer handoff: [ordered implementation plan](replay-implementation/README.md), including small tasks, technical contracts, dependencies, and verification criteria.

## Purpose

Give readers a graphical understanding of how an NBA game unfolded in approximately **1–2 minutes**, with a default target of **90 seconds**.

The reader starts at 0–0, presses Play, and watches the score, player statistics, and win probability develop together. Important plays receive short contextual captions and extra time. The experience should communicate who drove the game, when control changed, and how the result was decided.

This is an animated statistical replay, not video footage or a possession-by-possession recreation on a court.

## Agreed direction

- Integrate replay as a **third tab on the existing game page**: **סיכום | נתונים | שחזור**. Replay uses the game content area rather than opening a separate page or popup.
- Start at 0–0 and advance through actual game events in order.
- Provide player statistics for both teams, side by side when the content area is wide enough and one team at a time through team tabs on mobile or narrower desktop layouts. Show as many useful running statistics as the layout reasonably supports, including shooting makes/attempts, turnovers, steals, and blocks.
- Synchronize the running score, player statistics, win probability, and highlighted event.
- Highlight meaningful individual events and game context. Favor “Dončić hits a three to tie the game” and “first lead since the opening quarter” over generic captions such as “three straight threes.”
- Compress ordinary stretches and spend more time on important moments.
- Keep the full experience around 1–2 minutes at default speed.
- Use the ESPN data already requested by the site where possible.
- Show the **five players currently on court**, updating the visible lineup from substitution events rather than keeping a fixed set of featured players.
- Run quickly through ordinary action and **pause briefly at key moments**, initially around 1–2 seconds. Tune exact speed and hold duration through trial and error with real game replays.

The game-tab integration, mockup direction, and team-tab behavior below are agreed decisions. Remaining layout details, thresholds, and storage choices are proposals to validate.

## Selected mockup direction

Use **mockup 1 (Broadcast)** as the foundation, incorporating selected elements from mockups 2 and 3:

- Keep mockup 1's prominent scoreboard, persistent highlight area, playback controls, and dense, aligned player-stat tables. Tables are the primary stats presentation; individual player cards are not required for every roster member.
- Borrow **mockup 3's player spotlight** for the current key moment: player portrait or initials, event caption, and the player's stat line at that point in the game.
- Move a **compact probability-history graph near the scoreboard and probability bar**, so the reader can follow it without scrolling past the player tables.
- Borrow **mockup 2's previous/next key-moment controls** for revisiting or skipping between highlights.
- Use team tabs on mobile to avoid fitting both teams' detailed stats into the same viewport. Show both panels on desktop when they fit comfortably beside the existing games sidebar; otherwise use team tabs there too.

References: `mockups/replay-5.html` combines the selected visual direction; see also `mockups/replay-index.html`, `mockups/replay-1.html`, `mockups/replay-2.html`, and `mockups/replay-3.html`. The mockups are standalone visual references; the production replay must fit the existing game tab and show substitution-driven lineups.

The mockups use sampled scores/probabilities and reconstructed event order within 30-second windows. They establish presentation direction only; evaluate final pacing and captions using actual play-by-play. Do not carry the mockups' synthetic stat progression into production.

## Page structure

Replay lives in `components/game/GameView.jsx` as the **שחזור** tab alongside **סיכום** and **נתונים**, within the existing `/game/[id]` experience. This supersedes the earlier standalone `/game/[id]/replay` proposal. The tab opens the replay in place and does not navigate to another page.

### Integration with the existing game view

- Keep the game-level tabs accessible in replay mode. These are separate from the team tabs inside replay.
- Keep the written recap as the default game tab. Selecting replay does not start playback automatically; the reader presses Play.
- While replay is selected, its running scoreboard replaces the existing final-score header. The compact score in the sticky top bar must also avoid showing a conflicting final score.
- Switching back to recap or stats restores their normal final-score presentation.
- Retain the existing desktop games sidebar. Determine side-by-side tables versus team tabs from the available content width, not just the overall browser width.
- Pause playback when the reader leaves the replay tab so it does not continue unseen. Decided (R22): returning to the replay tab preserves the position, speed, and team selection, paused (no auto-resume). Changing to another game resets the replay. This state is in memory only (no URL or storage persistence). Hiding the browser tab also pauses without auto-resume, and returning from the background never catches up skipped time.
- At the end, offer replay and an action selecting the written-recap tab, rather than a return link to a separate page.

### Scoreboard and controls

- Team names/logos and running score.
- Quarter or overtime number and game clock.
- Play/pause, restart, playback speed, and a scrubber.
- Previous/next key-moment controls, with the score, statistics, probability, and spotlight all seeking to the selected moment together.
- Progress through the condensed replay, with quarter boundaries and key-moment markers.
- A visible distinction between replay progress and game time: 30 seconds of playback is not necessarily one quarter of the game.
- No automatic playback on page load or when selecting the replay tab.

### Player statistics

Proposed primary columns:

`PLAYER | PTS | FG | 3PT | FT | REB | AST | TO | STL | BLK`

- Shooting columns use makes/attempts, such as `5/9`, to fit more information into less space.
- Briefly emphasize the affected player and changed cells when an event occurs.
- Offer offensive/defensive rebounds and personal fouls in an expanded view if reconstruction is reliable.
- Minutes and plus/minus are optional later additions: both depend on trustworthy lineup reconstruction and should not block the first version.
- The primary table shows the five players currently on court. Initialize from the starting lineups and apply substitution events in order, identifying both the entering and leaving players.
- An entering player brings their accumulated statistics back into view; substitution never resets their numbers. A leaving player moves to an expandable bench section, keeping all players' contributions accessible.
- Briefly emphasize a substitution and the changed row, without treating every substitution as a key moment or interrupting the reader's mobile team selection.
- Validate lineup reconstruction against complete ESPN responses. If starters or substitution events are incomplete, label lineup data as unavailable and provide a clearly labeled roster view; do not claim a guessed lineup is on court.
- Avoid continuously sorting rows by points: moving names would make the replay difficult to follow.
- A bench player responsible for an important event must be visible or clearly represented in the highlight area.
- Team-only events, such as team rebounds or team turnovers, must not be assigned to an arbitrary player.

### Highlight area

A persistent caption area explains the current important event. It replaces popup interruptions. Emphasize the relevant players, team, clock, and score as appropriate.

For player-specific moments, use a spotlight with the player's portrait or initials and running stat line. Keep this spotlight above the mobile team tabs and independent of the selected team: an opposing player's key play must still be visible without changing the stats panel. Display statistics at the highlighted event, never the player's final totals in advance.

Captions should be short enough to read during playback. The site is Hebrew and RTL; English examples in this document specify meaning, not final UI copy. Keep player names, fractions, and numeric score strings readable with explicit text direction where needed.

### Win probability

- Show each team's probability at the current replay position.
- Place a compact history graph near the scoreboard and probability bar, rather than below both team tables.
- Grow the probability history as playback advances; do not reveal the future curve at the start.
- Align the probability update with its associated play.
- Carry forward the most recent known value between samples. Avoid presenting interpolated values as additional ESPN measurements.
- If unavailable, keep the replay usable with a score-margin view or omit the probability module and label the missing data clearly.

### Responsive layout

- Wide game content area: two team panels side by side, with scoreboard, highlight area, and probability chart visible together. If the desktop games sidebar leaves insufficient room, use the same single-team tabs as mobile.
- Mobile: keep both teams' running scores, clock, win probability, and current highlight accessible. Below them, team tabs select one team's player statistics at a time.
- Default to the reader's favorite team when it is involved in the game; otherwise default to the home team.
- The selected team stays selected during playback. Do not automatically switch tabs to follow the current scorer or highlighted player.
- Briefly pulse the unselected team's tab when one of its players records an event. Respect reduced motion and do not require switching tabs to understand the game.
- An opposing player's key event still appears in the spotlight above the tabs, including that player's running stat line.
- Switching teams changes only the visible stats panel; it must not pause, restart, seek, or otherwise alter playback. Show the newly selected team's statistics at the current replay position immediately.
- Keep player names and ideally points fixed while additional statistics scroll horizontally on narrow screens.
- Do not shrink every column until it becomes unreadable. An expanded stats view is preferable.
- Account for the available viewport height: sticky regions must leave useful space for player rows.

## Highlight selection and examples

These examples are hypothetical. Captions must always match the actual event and game state.

| Event/context | Example caption | Evidence required |
| --- | --- | --- |
| Late tying basket | “Dončić hits a three to tie it — 104–104.” | Scorer, made three, score before/after, clock |
| Long-awaited lead | “Dallas takes its first lead since the opening quarter.” | Complete earlier lead history, current go-ahead event |
| Consequential steal | “Big steal by Irving — Dallas gets possession down one.” | Explicit steal attribution, score, clock; probability swing can support importance |
| Miss at the buzzer | “Tatum misses the potential game-winner. Overtime.” | Attempt, shooter, score, period ending, confirmed subsequent overtime |
| Late lead change | “Edwards puts Minnesota ahead with 8.2 seconds left.” | Scorer, lead change, clock |
| Important block | “Gobert blocks the potential tying layup.” | Explicit block attribution, shot type/value, score before shot |
| Foul-out | “Sixth foul on Davis — his night is over.” | Verified personal foul count and disqualification context |

Selection principles:

1. Use changes in ESPN win probability as one importance signal, not as the caption itself.
2. Include missed shots, steals, blocks, and turnovers when they materially affect the outcome.
3. Consider score margin, period, remaining time, lead changes, and how long a team has trailed.
4. Deduplicate connected events. A steal and the transition basket that follows may deserve one sequence rather than two competing captions.
5. Reserve extra time for the finish of a close game; do not treat every fourth-quarter basket as decisive.
6. Prefer a small set of readable, varied moments over a caption for every event. Prototype roughly 8–12 featured moments, adjusting to the runtime budget.
7. Do not invent motives, tactics, emotional descriptions, or historical records from numerical events.
8. Use deterministic caption templates first. Generative narration is not required for this feature.

Important distinctions:

- A play with a large probability swing is consequential, not necessarily visually spectacular.
- A last-second attempt is not automatically a buzzer-beater; distinguish made shots from missed attempts and confirm the period boundary.
- Do not call a shot a potential tying shot or game-winner without checking the score and shot value.
- Technical fouls must not automatically increment the personal-foul count.
- “First lead since…” requires trustworthy event history; omit that wording if coverage is incomplete.

## Playback and pacing

Keep **game time**, **event order**, and **replay time** separate.

- Quiet stretches: accelerate and, where useful, batch several events into one short visual update. Still apply every included event to the statistics.
- Important events: briefly pause game progression, show the caption, and emphasize the relevant cells/player, then resume fast playback automatically. The replay remains in its playing state during these scheduled holds; manual pause still works normally.
- Start by trying holds of roughly 1–2 seconds. Exact event speed, acceleration, and hold durations are intentionally unsettled: tune them through trial and error while watching representative games, checking readability and whether the story is easy to follow.
- Runs and changes in control: allow enough intermediate updates for the reader to see the progression.
- Close finish: devote a larger fraction of playback to the final possessions.
- Blowout finish: accelerate once the competitive story is settled; do not stretch the ending to fill two minutes.
- Overtime: include each overtime period and rebalance the runtime. Permit the upper end of the target duration for complex games.
- Make caption holds part of the runtime budget rather than adding them after scheduling 90 seconds of action.

Illustrative 90-second allocation, not a universal rule: opening quarter 12 seconds, second quarter 15, third quarter 18, fourth quarter/finish 40, final state 5. An overtime or a first-half comeback should change this allocation. These numbers are starting points for experimentation, not fixed timing requirements.

Playback state should be deterministic. Pausing, restarting, seeking backward, or changing speed must not duplicate events or accumulate incorrect totals. After backgrounding the browser, resume predictably instead of firing a backlog of animations.

At the end, hold the final score and reconciled statistics, and offer replay and return-to-recap actions.

## Data sources and existing integration

The website currently calls four ESPN endpoints:

| Endpoint | Existing code | Relevance |
| --- | --- | --- |
| `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event={espnId}` | `lib/espn.js` | Main replay source: plays, box score, win probability, teams, periods |
| `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates={YYYYMMDD}` | `utils/espnGameId.js` | Resolve the ESPN event ID for a recap |
| `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/{teamId}/schedule?seasontype={type}` | `lib/schedule.js` | Not required for the initial replay |
| `https://site.api.espn.com/apis/v2/sports/basketball/nba/standings` | `scripts/snapshot-standings.mjs` | Not required for the initial replay |

Fields observed in a fetched game summary, event `401810062` (Toronto at Brooklyn, November 11, 2025):

- `plays[]`: `id`, `sequenceNumber`, `type`, `text`, `shortDescription`, `period`, `clock`, `awayScore`, `homeScore`, `scoringPlay`, `scoreValue`, `team`, `participants`, `wallclock`, `shootingPlay`, `coordinate`, `pointsAttempted`. Some fields are absent on some events.
- `winprobability[]`: `playId`, `homeWinPercentage`, and `tiePercentage` in the sample. Treat `homeWinPercentage` as a fraction from 0 to 1 despite its name.
- `boxscore.players[]`: team/player IDs, player metadata, starter/DNP flags, stat labels and final player stat lines.
- `boxscore.teams[]`: final team totals for reconciliation.
- `header.competitions[]`: team identities, home/away mapping, final score, completion status, and period scores.

This is observed coverage, not a guaranteed schema. No explicit critical-play flag or importance rating was present in the inspected `plays` array. Steal/assist/block attribution must be investigated: participant IDs alone do not necessarily describe each participant's role, so event types and descriptions may also be needed.

The summary can also contain `article.story`, season-series information, news, injuries, videos, and standings. These are not required for the first replay. In the inspected historical response, news, injuries, and standings reflected the retrieval date rather than game night. Do not use those sections as historical game context without verifying their dates.

Existing integration constraints:

- `fetchEspnSummary` already caches the full summary for six hours.
- `app/api/boxscore/[gameId]/route.js` exposes only `boxscore` and derived `linescores`; it does **not** expose plays or win probability to the client.
- `lib/story.js` saves a compact story with 30-second samples and only three top scorers per side. This is insufficient to reconstruct event-level stats or precise key plays.
- `lib/games.js` resolves ESPN IDs and saves derived game/media fields to MongoDB. Reuse the existing resolution path.
- `components/game/BoxScore.jsx` contains useful existing table conventions and labels, but displays final statistics rather than historical running state.
- Existing summary fixtures under `tests/fixtures/` are reduced to the fields used by current tests. They lack much of the event detail needed for replay reconstruction; do not mistake them for complete ESPN responses.

## Proposed processing architecture

1. Resolve the recap and ESPN event ID on the server.
2. Retrieve the summary through the existing shared fetch helper.
3. Normalize and validate events, player identities, and team identities.
4. Build cumulative game/player states and align probability samples by play ID.
5. Detect highlight candidates and select moments within the runtime budget.
6. Generate a replay timeline containing visual updates, caption holds, and seek checkpoints.
7. Send only the required normalized data to the replay view inside the game tab.

Use a pure, versioned builder so fixture tests and future background generation share the same logic. Initial delivery can compute the replay on demand from the cached summary. Persisting a compact replay in MongoDB is optional, to be decided after measuring response size and build cost; avoid writing every raw response into the database by default.

Suggested conceptual model, not a committed schema:

- Replay metadata: schema/builder version, event ID, source retrieval time, duration, completion status, coverage warnings.
- Players/teams: stable IDs and presentation metadata.
- Events: source ID, source sequence, period/clock, score after event, attributed stat deltas, linked probability, attribution confidence.
- Moments: event or event-range reference, caption type/parameters, importance, replay hold duration.
- Timeline: replay-time mapping and cumulative-state checkpoints for efficient seeking.
- Validation: final score checks and per-stat reconciliation results.

Retain source ordering for events at the same game-clock time. Do not sort solely by elapsed seconds: free throws, rebounds, substitutions, and corrections can share a timestamp. Handle duplicate IDs, out-of-order records, score corrections, and missing clock values explicitly.

## Statistical integrity and fallback behavior

- Use play-by-play to reconstruct running statistics; use the final box score as validation, not as a way to invent when statistics occurred.
- Validate player and team totals independently. Team rebounds/turnovers mean team totals do not always equal the sum of player totals.
- Track lineup membership independently of accumulated statistics. Handle substitutions sharing a timestamp in source order, and verify that complete substitution groups leave five distinct players on court per team. Seeking backward must restore the lineup as well as the statistics.
- Confirm that three-point makes also increment field-goal makes/attempts; free throws must not increment field-goal attempts.
- Check scoring corrections and review reversals so points are not counted twice.
- Resolve identities by player/team ID, not display-name matching. Do not infer a steal merely because an opponent committed a turnover.
- If a stat cannot be reliably reconstructed, show it as unavailable during replay or omit that column with a clear explanation. Do not display fabricated zeros or silently switch to final totals mid-replay.
- If final totals disagree, record the mismatch and disable affected running statistics until handled. Do not silently patch the final animation frame to hide errors.
- For major score/event gaps, provide a clearly labeled limited replay only if it still tells a trustworthy story; otherwise explain that replay data is unavailable and link to the written recap/box score.
- Missing probability should not prevent a score/stat replay. Missing play-by-play should.
- Restrict the initial feature to completed games. Live replay is outside this design.

## Accessibility and performance

- Keyboard-accessible controls, named speed settings, and an accessible scrubber.
- Respect reduced motion; offer discrete updates and readable key-moment text instead of animated transitions.
- Avoid screen-reader announcements for every changing cell; announce selected moments at a manageable rate and provide a static moments list.
- Do not rely on color alone for team identity or changed statistics.
- Start only when requested; allow reading captions while paused.
- Fetch once and play locally. No network request per event or animation frame.
- Prefer one playback clock and derived state over independent timers for every player or stat.
- Measure payload size, mobile rendering, table stability, and seek latency before deciding whether stored replay artifacts are necessary.

## Implementation sequence

1. **Data feasibility:** inspect complete responses for a normal game, close finish, overtime, comeback, and blowout. Include events with assists, steals, blocks, technical fouls, reviews, and team-only statistics. Establish which stats can be reconstructed reliably.
2. **Normalization and validation:** build a pure event/state processor, capture representative fixtures, and reconcile against final box scores.
3. **Highlight selection and pacing:** generate an inspectable list of chosen moments and an initial 60–120 second timeline. During the page prototype, repeatedly watch representative games and adjust fast stretches and roughly 1–2 second key-moment holds by trial and error.
4. **Integrated prototype:** build desktop/mobile layouts within the game's third tab, with synchronized scoreboard, player tables, captions, probability, and controls. Verify the available width beside the desktop games sidebar.
5. **Playback verification:** test pause, restart, speed changes, backward/forward seeking, same-clock events, overtime, missing probability, and incomplete data.
6. **Game-page integration:** finish third-tab behavior, replace the final-score header in replay mode, and add appropriate loading/unavailable states. Verify switching among recap, stats, and replay.

Before writing Next.js application code, read the relevant installed guides in `node_modules/next/dist/docs/` as required by the repository's `AGENTS.md`.

## Acceptance criteria

- Starts at 0–0 without future statistics or probability history exposed by the replay itself.
- Replay is accessible as the third game tab, **סיכום | נתונים | שחזור**, without separate-page navigation or autoplay.
- Replay mode shows its running score rather than a simultaneous final-score header; leaving the tab pauses playback and restores the normal game header.
- Completes in approximately 60–120 seconds at default speed, including highlight holds.
- Score, player statistics, caption, and probability correspond to the same event position.
- Supported running statistics reconcile with final source totals on the validation corpus.
- With complete source data, the primary rows follow the five players on court through substitutions; bench statistics persist, and seeking restores the correct lineup.
- Playback moves quickly between key moments, briefly holds at them, and resumes automatically. Exact timings remain subject to viewing trials.
- Captions accurately describe specific events and context, including important defensive plays and misses.
- Seeking to the same position produces the same state regardless of previous playback actions.
- Works on a narrow mobile viewport without illegibly small tables or controls.
- Mobile team tabs default to an involved favorite team or otherwise the home team; the reader's selection stays unchanged during playback.
- Opposing-team highlights remain visible above the tabs, and switching teams preserves playback position and state.
- The compact probability history and previous/next moment controls remain accessible alongside the replay's main presentation.
- Remains useful with missing win probability, and fails clearly when reliable replay is impossible.
- Readers can identify the main contributors and decisive changes after watching a comeback and a close-finish prototype.

## Open decisions

- Exact substitution animation, row placement, and expandable bench presentation. The primary lineup is the five players on court; narrow content areas use one selected team panel and wider areas show both teams side by side.
- The content-width breakpoint for team tabs beside the desktop sidebar. (Decided in R22: returning to the replay tab restores its paused position, speed, and selection; a game change resets it; in memory only.)
- Which additional stats meet the reconstruction accuracy bar.
- Highlight thresholds, maximum caption count, and minimum readable hold duration.
- Whether the player spotlight uses portraits or initials, and whether table rows also include portraits.
- Whether replay duration is fixed per game or adapts within the target range.
- Whether to persist derived timelines or rely on cached source responses initially.
- Whether surrounding page metadata/navigation should also hide the final result. The replay starts at 0–0, but a site-wide spoiler-free experience is not part of the agreed scope.

## Out of scope for the first version

- Actual video highlights or synchronization to video timestamps.
- Live-game support, audio narration, or a court simulation.
- External news retrieval, historical records, and player-career trend databases.
- Generative captions that require external reporting or unsupported interpretation.

