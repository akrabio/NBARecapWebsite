# Game replay — developer handoff

Status 2026-11-12: implemented on branch `claude/game-replay-orchestrator-b690dd` (work units W01–W21, see `LEDGER.md`). Gates A–D passed; Gate E is ready for review with the open items below (most importantly: **real 1× viewing trials by the product owner are still pending** — `pacing-trials.md` is a simulation). Not deployed; publishing is a separate action.

Product authority: [`../game-replay-design.md`](../game-replay-design.md). Plan/specs: [`README.md`](README.md), [`contracts.md`](contracts.md), `01-data.md` … `05-validation.md`.

## What it is

A third game tab, **סיכום | נתונים | שחזור**, that replays a finished NBA game from 0–0 in ~60–120 s: running score/clock, win-probability step line, key-moment spotlight with Hebrew captions, controls (play/pause, restart, speed 0.5–2×, scrubber with quarter ticks and moment dots, prev/next moment), and per-team tables of running player stats with the actual five on court first and the bench below. Everything is derived from ESPN play-by-play; stats that do not reconcile with the final box score are shown as unavailable ("—"), never patched.

Screenshots (prod build, game `/game/6af566378ec906cd0ea608a4`, WAS@IND, ESPN 401909966; JPEG frames from the browser pane converted to PNG):

- [`screenshots/desktop-1440-replay.png`](screenshots/desktop-1440-replay.png) — 1440×900 with the games sidebar, both team tables side by side, paused on the "חזרה ליתרון" moment (Q3 1:22, 77–76). The capture is scaled to 800×500.
- [`screenshots/mobile-390-moment.png`](screenshots/mobile-390-moment.png) — 390×844, the same moment; team tabs (IND = home default) below the panel.
- [`screenshots/mobile-390-end.png`](screenshots/mobile-390-end.png) — 390×844 end state: "סיום" 101–114, last reached moment, "צפייה חוזרת" / "לסיכום המלא" actions.

## Architecture and data flow

```
ESPN summary (lib/espn.js fetchEspnSummary, Next data cache 6 h)
  └─ GET /api/replay/[gameId]  app/api/replay/[gameId]/route.js → lib/replay/service.js getReplayResponse
       └─ lib/replay/build.js buildReplay(summary)                       [server only]
            normalize.js   normalizeGame: teams, rosters, clocks, ordered events, verified roles, score-snapshot adapter
            stats.js       per-event stat deltas, accumulate
            lineups.js     starters + substitution groups → on-court five per event (or labelled roster fallback)
            probability.js win-probability join by playId
            state.js       state index / checkpoints (server)
            validate.js    reconciliation vs box score → status + capabilities + reasons
            highlights.js  candidate detection, ranking, selection
            captions.js    Hebrew caption parts per highlight
            timeline.js    condensed timeline (fast segments + holds), frameAt / momentNav / spotlightAt
          → BuildResult JSON { schemaVersion, builderVersion, status, capabilities, warnings, reasons, replay|null }
  └─ utils/replay-api.js useReplayData / loadReplay   [client; dedupe, LRU 6, TTLs]
       └─ components/game/GameView.jsx third tab → next/dynamic(() => import('./replay/ReplayView'), { ssr:false })
            ReplayView.jsx         owns selected team, bench expansion, sticky bar, states/banners
            useReplayPlayback.js   lib/replay/playback.js controller (single RAF clock)
            lib/replay/frame.js    createFrameDeriver(replay)(sec) → frame (state, changes, event, spotlight, nav, probability)
            lib/replay/client-state.js replayStateAt / replayChangesAt (patches + in-memory checkpoints every 32)
            ReplayScoreboard / ReplayProbability / ReplaySpotlight / ReplayControls / ReplayTeamTables(+Table)
            lib/replay/{display,tables,layout,keyboard,messages}.js  browser-safe helpers
```

Server-only modules: `normalize, stats, lineups, probability, state, validate, highlights, captions, timeline (builder side), build, service, types`. Browser-safe (no ESPN/Node imports): `client-state, frame, playback, display, tables, layout, keyboard, messages` and the `timeline` lookup functions. The replay JS (~67 KB raw / ~22 KB gzip) and CSS load only on first selection of the tab.

## API and capability contract

- `GET /api/replay/<espnId>` (1–12 digits; Mongo ids are rejected). Body = `BuildResult` (`lib/replay/types.js`); payload shape in `contracts.md` "API contract" and ledger W12.
- Outcomes / headers (`delivery.md`): 200 `ready`/`limited` (`s-maxage=3600, stale-while-revalidate=21600`), 200 `unavailable` with `replay: null` (`s-maxage=60`), 400 invalid id, 404 unknown event, 500 build failed, 502 upstream, 504 upstream timeout (8 s, `REPLAY_UPSTREAM_TIMEOUT_MS`), errors `no-store`. Headers `X-Replay-Schema`, `X-Replay-Builder`.
- `capabilities` is a list of `{ family, scope: game|player|team|teamTotal, status, … }`; resolve with `capabilityFor(caps, family, { playerId, teamId, eventIndex, teamTotal })` (server) / `familyAvailable` (`lib/replay/display.js`, client). A player override beats the game level. UI shows unavailable cells as "—" + sr "לא זמין" + footer legend, and a "שחזור חלקי" banner for `limited`.
- Unavailable when: not final, missing teams/box/plays, unexplained score regression, final/credited/period score mismatch, no GAME_END/final PERIOD_END, >2% events without clock, size cap exceeded. Reason codes: `REASON_CODES` in `types.js`; Hebrew text per code in `lib/replay/messages.js`.
- Bump `BUILDER_VERSION` (`build.js`, now 3) whenever output changes, `REPLAY_SCHEMA_VERSION` when the shape changes; the client cache key includes both.

## Supported source patterns and adapter rules

Full detail: [`source-findings.md`](source-findings.md) (Gate A + §10 W20b) and ledger W02–W07, W20b, W20c.

- Order = `plays` array order (`sequenceNumber` regresses). Win probability joins by `playId`, not index.
- Roles by `type.id`: shot `[0]` shooter, `[1]` assister only with "(X assists)"; block `[0]` shooter `[1]` blocker; turnover `[0]` player, `[1]` stealer only with "(X steals)"; rebound `[0]`; substitution `[0]` enters `[1]` leaves; jump ball `[2]`. A role is applied only when the participant matches the name in the text; otherwise the credit is unattributed (`role_text_conflict`).
- Counting: heaves (282) excluded from FGA/3PA; FT never FGA; technical ≠ PF; flagrant FT types 106/157/165/166 → FT; extra turnover types 66/67/69/71/72/73 (participant-less → team TO); 257 → PF; 36 double foul → PF to both; 28 → team technical; 10 lane violation → violation (not TO); 214 → review; unknown shooting play + "free throw" → FT.
- Lineups: starters + substitutions; same-clock substitution groups applied atomically at the group end; entering player takes the leaving player's slot; invalid → labelled roster fallback until a fully evidenced five reappears. Final five must equal the box `active` list, else lineup limited from the last substitution group.
- Late-recorded plays (W20b `staleSnapshot`): a score snapshot is replaced only when it is provably stale (source + points of earlier-placed later-sequence scoring plays = expected); raw kept in `sourceScoreAfter`, warning `score_snapshot_out_of_order`.

## Known gaps and limits (honest list)

- **Most real games are `limited`**, usually one player's TO/BLK/3PA/PF/REB, because ESPN's play-by-play disagrees with its own box score. Of the 13 fixtures: 4 `ready`, 8 `limited`, 1 `unavailable`. ESPN-side issues seen: block participant ≠ text (401810062656, Porter Jr.), Holland II 3PA 6 vs 5 (401810792), swapped turnover credit (401909931 Barnes/Murray-Boyles), box PF counting double technicals (401909971, 401909972), a rebound recorded before the player's own sub-in (401909290 Ace Bailey → lineup limited), late turnovers placed after a substitution (401909962, 401909968 → `lineup_actor_off_court`), stale box `active` in garbage time (401909931, 401909971).
- **401909293 (MIN@NO) is genuinely unavailable**: play 401909293681 (a turnover, Q4 1:33) carries +2 NOP points with no scoring record; source final 111 ≠ header 109. Not patched.
- Team totals with `teamTotal` unavailable (e.g. DET 3PT in 401810792) are not rendered (no team-total row exists).
- Corpus never contained ejections, score corrections or replay-review reversals — those paths are tested with synthetic variants only.
- Self-assist (assister = shooter) is not guarded (not seen in the corpus).
- Fixture games (Nov 2025) have no recap in MongoDB, so `/game/<espnId>` returns 404 for them; QA used real recap games from Nov 2026 (below).
- Pacing is a frame-by-frame **simulation** (`pacing-trials.md`): long stretches without a moment (791: 31.5 s; 062: 64 s), the 791 turning-point caption visible only 2.1 s, and in 401909966 (13-pt win) the last moment is at Q4 11:44 — the final ~12 game minutes carry no caption. Defaults unchanged pending real viewing.
- Hebrew captions/messages were written and fact-checked by the agents, **not reviewed by a native speaker**.
- Not measured: phone CPU/memory, continuous-playback jank (browser pane renders only on screenshots), hosted compression. See `performance.md`.
- `next start` serves the API JSON uncompressed (~150–190 KB); needs CDN/proxy compression when self-hosting.

## Chosen behaviors

- **Default tab** stays recap; no autoplay. The replay tab is always present (states explain unavailability).
- **Return to tab:** leaving the replay tab pauses; returning restores position, speed, selected team and bench expansion, **paused** (no auto-resume). Hiding the browser tab pauses without auto-resume; frame gaps > 250 ms are not credited (no catch-up). Changing game resets everything. In memory only (no URL/storage).
- **Restart:** "חזרה להתחלה" → 0:00, paused. Play from the ended state restarts from 0. End actions: "צפייה חוזרת" (restart and play) and "לסיכום המלא" (recap tab).
- **Replay mode header:** hero hidden; top bar shows logos + "A נגד B" + date, no score. The desktop sidebar list and document title still show final scores (open decision).
- **Team default:** favorite team (site team picker, `fav_team` cookie) if involved, else home; set once, never follows the spotlight.
- **Layout threshold:** both team tables iff the replay container is ≥ 960 px (`BOTH_MIN_WIDTH`, `lib/replay/layout.js`); in practice 1440 + sidebar → both, ≤ 1280 + sidebar → tabs; mobile → tabs. Sticky compact score bar at 96 px once the panel scrolls away, hidden when the viewport is < 520 px tall.
- **Keyboard** (only with focus inside the replay; native control keys win): Space/K play-pause, ← next moment, → previous moment (RTL); team tabs ArrowLeft = next, Home/End. GameView's ↑/↓ sibling-game navigation ignores the replay panel.
- **Reduced motion:** all replay animations/transitions removed; static cues kept. Screen readers: one polite live region for captions (≤ 1 per 4 s), static "רגעי מפתח עד כה" list.

## Timing settings and where to tune

- `lib/replay/timeline.js` `TIMELINE_CONFIG`: target 90 s (+12 s per OT), clamp 60–120 s; period weights 1 / 1.2 / 1.45 / 1.9, OT 2.1; close-finish ×2.6 (margin ≤ 5, last 6 min); settled ×0.35; holds 1.2–2.4 s by type (+0.3 s in the last 2 min).
- `lib/replay/highlights.js` `HIGHLIGHT_CONFIG`: `maxHighlights` 12, `minImportance` 22, coverage floor 10, milestone limits, per-type rules.
- `lib/replay/playback.js`: `maxFrameGapMs` 250, speeds 0.5–2× (controls).
- After any change: `npm test`, `node scripts/replay-timeline-report.mjs` (durations), `node scripts/replay-highlights-report.mjs`, bump `BUILDER_VERSION`. Change one variable at a time and record viewing notes in `pacing-trials.md` (protocol at its end).

## Cache and refresh procedure

Layers: ESPN summary data cache 6 h → CDN 1 h + SWR 6 h → client memory 10 min (unavailable 60 s, failures never). Worst-case correction delay ≈ 7 h. Full procedure (dev `Cache-Control: no-cache`, delete `.next/cache/fetch-cache`, Vercel data-cache/CDN purge, version bumps): [`delivery.md`](delivery.md) "Refresh procedure"; implications: [`performance.md`](performance.md).

## Run locally

```bash
npm install
# .env (gitignored) must define MONGODB_USER and MONGODB_PASSWORD for the site's recaps;
# the replay endpoint itself reads only ESPN (network access required).
# Note: normal page loads may write cache fields (media/story) to MongoDB.
npm run dev -- -p 3000          # or: npm run build && npx next start -p 3000
```

Then open a game page and choose שחזור. Example games (Nov 2026 recaps present in the database):

| Page | ESPN id | Notes |
| --- | --- | --- |
| `/game/6af566378ec906cd0ea608a4` | 401909966 | WAS@IND 101–114, `ready` (builder 3) — main QA game |
| `/game/6af023718ec906cd0ea3e134` | — | ORL@GS, overtime |
| `/game/6af567798ec906cd0ea60909` | — | SAS@CHI |
| `/game/6af408798ec906cd0ea586a9` | — | BOS@PHI |
| `/?date=2026-11-10` | — | desktop home preview (OKC@POR) |

Endpoint directly: `curl -s localhost:3000/api/replay/401810799 | head -c 300`. Fixture ids (endpoint only, no game page): 401810791 MEM@PHI comeback, 401810798 CHI@GS OT, 401810792 DET@BKN blowout, 401810799 CHA@POR close finish, 401810062 TOR@BKN ordinary, 401909290/293/294/931/962/968/971/972 (late-recorded-play games; 293 unavailable).

## Tests and audits

```bash
npm test                                   # 30 files / 590 tests (vitest, Node env)
npm run lint
npm run build
node scripts/replay-core-audit.mjs --check # client state = server state at every position (Gate C)
node scripts/replay-report.mjs > docs/replay-implementation/reconciliation-report.md   # Gate B reconciliation
node scripts/replay-highlights-report.mjs  # writes highlights-report.md
node scripts/replay-timeline-report.mjs    # writes timeline-report.md
node scripts/audit-replay-source.mjs [--section=roles] [ids…]   # Gate A source audit
node scripts/capture-replay-fixture.mjs [ids…]                  # (re)capture fixtures from live ESPN
```

Fixtures: `tests/fixtures/replay/*.json` + `manifest.json` (verbatim ESPN keys, unrelated sections dropped). Never edit a fixture to make reconciliation pass; use test variants.

Browser checks are manual (no browser runner installed): see `gate-d.md`, `regression-check.md`, `e2e-report.md` for the procedures (fetch override for failure states, DOM reads + screenshots).

## Reports

| Report | Content |
| --- | --- |
| [`source-findings.md`](source-findings.md) | Gate A: event types, role map, ordering, lineups, §10 late-recorded plays |
| [`reconciliation-report.md`](reconciliation-report.md) | Gate B: per-game stat reconciliation and statuses |
| [`highlights-report.md`](highlights-report.md) | Highlight candidates/selection per game |
| [`timeline-report.md`](timeline-report.md) | Durations, segments, holds |
| [`core-audit.md`](core-audit.md) | Gate C: client vs server state, seeks |
| [`delivery.md`](delivery.md) | Endpoint, headers, TTLs, refresh procedure |
| [`gate-d.md`](gate-d.md) | Gate D: states, accessibility, reduced motion |
| [`e2e-report.md`](e2e-report.md) | R41 end-to-end per fixture |
| [`pacing-trials.md`](pacing-trials.md) | R42 simulated pacing + 1× viewing protocol |
| [`regression-check.md`](regression-check.md) | R43 viewports and integration |
| [`performance.md`](performance.md) | R44 latency, payload, bundle, seeks, memory, cache |
| [`LEDGER.md`](LEDGER.md) | Work-unit record, decisions, open issues |

## Gate E record (W21, 2026-11-12)

| Gate E item | Evidence | Verdict |
| --- | --- | --- |
| Viewing-trial record | `pacing-trials.md` — frame-by-frame **simulation** of comeback, close finish, OT and blowout with recommendations; **real 1× viewing by the product owner is pending** (protocol included) | partial — pending user |
| Checks (R45) | `npm test` 30 files / 590 tests pass (R01 baseline 9 / 79); `npm run lint` clean (baseline clean); `npm run build` succeeds, 10 routes (baseline 9; + `ƒ /api/replay/[gameId]`); `replay-core-audit --check` 0 mismatches over 2,916 positions | PASS |
| Scope / hygiene | `package.json` / lockfile unchanged vs `main` (no new dependencies); `.env` untracked (`.env*` ignored); no build output, logs or dumps tracked; no `console.log`/`debugger` in replay code; changed files limited to replay modules, `GameView.jsx`, the replay route, `utils/replay-api.js`, scripts, tests/fixtures (4.1 MB, documented projections), docs | PASS |
| Fixture tests test behavior | Spot-check: `replay-stats.test.js` uses hand-built events for each matrix case (made/missed three, technical FT, team rebound/turnover…); reconciliation tests compare against the box score parsed independently, no snapshot tests (`toMatchSnapshot` unused) | PASS |
| Manually audited sequence | 401810799 CHA@POR, computed straight from raw `plays` (participants + text, not via `normalize.js`): K. Knueppel running PTS and L. Ball running AST at all 506 events = `replayStateAt` (final 15 / 4 = box 15 / 4); CHA on-court five (box starters + "enters the game for" subs) = replay five at all 469 positions outside same-clock substitution groups, 0 mismatches. Plus the Q2 12:00 group audit in `e2e-report.md` | PASS |
| Performance (R44) | `performance.md` | PASS (desktop only; phone not measured) |
| Known limits | "Known gaps and limits" above | recorded |
| Runnable handoff | this file | PASS |

**Verdict:** ready for review, conditional on the product owner's real 1× viewing trials (R42), native Hebrew review, and the open decisions below. Active-five behavior is broadly supported (lineup limits are per team/interval, labelled), so no feasibility escalation is needed.

## Open decisions for the product owner

1. **Hebrew copy review** — captions (`captions.js`), messages/banners/legends (`messages.js`) need native review.
2. **Spoilers outside the replay** — the side game list and document title show the final score while the replay plays from 0–0 (out of agreed scope; decide whether to hide).
3. **Live-game source cache** — `lib/espn.js` caches any 200 summary for 6 h regardless of game status; a summary fetched while a game is in progress keeps the replay `unavailable` (and the box score stale) for up to 6 h. Suggested fix: status-aware/short revalidate when not completed. Shared code, not changed.
4. **Pacing** — recommendations in `pacing-trials.md` (space consecutive moments, "largest lead so far" moment, fill long silences, cap plain turnovers in the finish, longer holds for long captions, late-game moments in comfortable wins) await the **real 1× viewing trials (R42)** of a comeback, close finish, overtime and blowout.
5. **Self-hosted compression** — only if not deploying behind a compressing CDN.
