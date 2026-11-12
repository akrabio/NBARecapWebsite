# R41 — end-to-end validation of the fixture games

Date 2026-11-12. Dev server `next dev -p 3119` with `.env`. Scripts were run from a scratch directory outside the repo (not committed); everything below can be reproduced with the commands/approach described per section.

Markers: **[api]** live `GET /api/replay/<id>` (dev server → live ESPN summary) · **[node]** payload replayed through the browser-side modules (`createFrameDeriver`, `replayStateAt`, `tables.js`) in Node · **[live]** observed in the browser pane · **[env]** environment limit.

## Game pages for the fixtures

The five fixture games (Nov 2025) have **no recap in MongoDB** (collection starts 2026-10-29, 102 recaps, read-only query). `/game/<espnId>` legacy links therefore return 404 for all five. For the in-browser checks, each fixture payload was loaded into a real game page by overriding `window.fetch` for `/api/replay/*` in the page (devtools JS, same technique as Gate D): the override fetched the **real endpoint** for the fixture id and only rewrote `espnGameId` to the page's id so the client loader's id check passes. The page's own header/logos therefore belong to the host game, not the fixture (test artifact, not a bug).

| Fixture | Host page used |
| --- | --- |
| 401810791 MEM@PHI | `/game/6af566378ec906cd0ea608a4` |
| 401810798 CHI@GS (OT) | `/game/6af566378ec906cd0ea608a4` |
| 401810062 TOR@BKN | `/game/6af566a48ec906cd0ea608c0` |
| 401810792 DET@BKN | `/game/6af56a9e8ec906cd0ea60a6a` |
| 401810799 CHA@POR | `/game/6af567e88ec906cd0ea60949` |

## Per-game results

"Box cells" = every supported player stat cell (PTS, FG m/a, 3PT m/a, FT m/a, REB, OREB, DREB, AST, TO, STL, BLK, PF) compared against the **live** ESPN box score, parsed independently from `boxscore.players[].statistics[0]` (not via `normalize.js`). "UI cells" = the nine columns rendered in the final-state tables (both teams, bench expanded) read from the DOM and compared with the same live box.

| Check | 791 | 798 | 792 | 799 | 062 |
| --- | --- | --- | --- | --- | --- |
| [api] HTTP / status / Cache-Control | 200 ready, success policy | 200 ready | 200 limited | 200 ready | 200 limited |
| [api] Live body deep-equals `buildReplay(fixture)` | yes | yes | yes | yes | yes |
| [node] End frame = last event, `ended`, score = header final | 129–139 ✓ | 130–124 ✓ | 138–100 ✓ | 103–101 ✓ | 119–109 ✓ |
| [node] Box cells checked / mismatches | 300 / 0 | 285 / 0 | 358 / 0 | 300 / 0 | 344 / 0 |
| [node] Unavailable cells (shown "—") | — | — | Holland II 3PA (pbp 6, box 5) | — | Porter Jr. BLK (pbp 0, box 1) |
| [live] UI cells / mismatches (excluding "—") | 180 / 0 | 171 / 0 | 216 / 0 | 180 / 0 | 207 / 0 |
| [live] Limited banner text | — | — | "שלשות של R. Holland II אינן זמינות." | — | "חסימות של M. Porter Jr. אינן זמינות." |
| [live] End label / actions | "סיום" + replay/recap actions | "סיום · אחרי הארכה" + actions | "סיום" | "סיום" | "סיום" |
| [node] Seek 0 → 0–0, no stats, no spotlight, 0 probability samples | ✓ | ✓ | ✓ | ✓ | ✓ |
| [node] 300 random seeks via memoized deriver = fresh `deriveFrame` | ✓ | ✓ | ✓ | ✓ | ✓ |
| [live] Seek end → mid → 0 (scrubber) | ✓ Q3 4:15 | ✓ | ✓ Q2 2:56 | ✓ Q4 10:08 | ✓ Q3 8:12 |

DNP players: none shows a non-zero value in any game (node and UI).

The two unavailable cells are the known source discrepancies from Gate A/B (play `401810062656` block participant Demin vs text Porter Jr.; Holland II 3PA). They are shown as "— לא זמין" with the footer legend — never patched. DET's 3PT team total (`teamTotal` scope) is likewise unavailable; team totals are not rendered as a table row, so there is nothing to display wrongly.

### Period-boundary substitution (Q2 12:00 group, every game)

[node] For the first substitution group at the start of Q2 in each game: every leaving player was on court before the group, every entering player is on court after it, the entering player takes the leaving player's slot, the five stays at 5, the leaving player's counters are unchanged (bench stats retained), and seeking forward to the end then back to the event before the group restores the exact previous state.

| Game | Events | Source play IDs | Example |
| --- | --- | --- | --- |
| 791 | 120–122 | 401810791179–181 | Ty Jerome for Javon Small (MEM) |
| 798 | 115–119 | 401810798167–171 | Nate Williams for Gui Santos (GS) |
| 792 | 114–120 | 401810792167–173 | Porter Jr. for Minott (BKN), Cunningham for Harris (DET) |
| 799 | 113–117 | 401810799177–181 | Murray for Thybulle (POR), Ball for James (CHA) |
| 062 | 98–100 | 401810062145–147 | Claxton for Clowney (BKN), Barrett for Walter (TOR) |

[live] 799 checked in the UI at replay 11.5 s (Q1 0.0) vs 11.6 s (Q2 12:00): POR five Krejci/Avdija/Henderson/Camara/Thybulle → Krejci/Avdija/Henderson/**Clingan**/**Murray** (Clingan takes Camara's slot, Murray takes Thybulle's), CHA James/Miller/Green → **Ball/Knueppel/Connaughton** in the same slots, exactly as the source; Camara (6 pts) and Miller (9 pts) moved to the bench with their totals.

### Highlight claims vs source (two or more per game)

All selected captions were compared with the source play text, scores and clocks (full list in the script output; spot-checks below). Captions put the acting team's score first.

| Game | Moment | Caption | Source | Verdict |
| --- | --- | --- | --- | --- |
| 791 | `first_lead_since-440` | Q. Grimes gives PHI first lead since Q2 — 116–115 | `401810791665` Q4 6:46 Grimes FT 2 of 2 → 115–116 (MEM–PHI); PHI last led Q2 2:41 | correct |
| 791 | `turnover-442` | turnover by K. Oubre Jr. — 116–115 | `401810791669` Jackson bad pass (Oubre steals), `401810791671` Oubre out-of-bounds turnover, Q4 6:44 | correct; the steal is not mentioned (merged), see pacing notes |
| 798 | `missed_final_attempt-515` | B. Podziemski misses a three that could have decided — 118–118, 0.5 s | `401810798764` Q4 0.5 "misses heave jump shot", type 282, `pointsAttempted 3` | correct (a heave is a 3-point try; it is excluded from FGA/3PA by the counting rules — wording vs stats is consistent enough, noted only) |
| 798 | `tie-514` | J. Smith ties from the line — 118–118, 1.4 s | `401810798758`/`763` FT 1 and 2 of 2 at 1.4 (two subs between) | correct |
| 798 | `big_shot-530` | D. Green makes a three — 121–122 | `401810798791` OT 3:45, 27-ft three → 122–121 (CHI–GS) | correct |
| 792 | `lead_milestone-163` / `-220` | Cunningham → lead of 20 (49–29); Duren → lead of 30 (66–36) | `401810792245` Q2 7:10 49–29; `401810792332` Q2 2:14 66–36 | correct |
| 799 | `foul_out-482` | L. Ball fouls out with his sixth — 25.2 s | `401810799702` Q4 25.2 personal foul; box PF = 6; 6 fouls in pbp | correct |
| 799 | `block-471` | M. Diabate blocks a shot that could have extended the lead — 97–98 | `401810799684` Q4 1:25 Diabate blocks R. Williams III; POR led 98–97 | correct |
| 062 | `first_lead-103` | S. Barnes gives TOR first lead of the game — 31–30 | `401810062152`/`156` Q2 11:47 and-one; TOR never led before | correct |
| 062 | `go_ahead-147` | B. Ingram puts TOR ahead from the line — 41–40 | `401810062217` Q2 7:40 **technical** FT | correct but weak as a story beat (see pacing) |

No factual discrepancy found.

## Ready / limited / unavailable variants

`getReplayResponse(id, { fetchSummary })` with deliberately modified **clones** of fixture 401810791 (fixture files untouched) plus error injections.

| Variant | HTTP | Status / error | Reasons | Non-reliable capabilities | Replay | Cache-Control |
| --- | --- | --- | --- | --- | --- | --- |
| baseline | 200 | ready | — | — | payload | success |
| `winprobability` removed | 200 | limited | probability_missing | probability:unavailable | payload | success |
| one box AST +1 | 200 | limited | stat_mismatch | ast:limited, ast:unavailable/player | payload | success |
| REB +1 for 4 players per team | 200 | limited | stat_mismatch | reb:unavailable (game) | payload | success |
| last substitution play removed | 200 | limited | lineup_actor_off_court, probability_unlinked¹ | lineups:limited (+team interval), probability:limited | payload | success |
| plays truncated at Q3 | 200 | unavailable | score_coverage_gap, period_score_mismatch, no_game_end, no_final_period_end | (all) | null | `s-maxage=60` |
| header status in progress | 200 | unavailable | game_not_final | — | null | `s-maxage=60` |
| `boxscore` removed | 200 | unavailable | no_boxscore | stats + lineups unavailable | null | `s-maxage=60` |
| one play's home score → 0 | 200 | unavailable | score_regression | score:limited | null | `s-maxage=60` |
| every 10th play without clock | 200 | unavailable | clock_coverage_gap | — | null | `s-maxage=60` |
| `plays` removed | 200 | unavailable | no_plays | (all) | null | `s-maxage=60` |
| header score +2 | 200 | unavailable | score_coverage_gap | score:unavailable | null | `s-maxage=60` |
| plays duplicated past 1500 | 200 | unavailable | input_too_large | (all) | null | `s-maxage=60` |
| fetch → null | 404 | not_found | | | | no-store |
| fetch throws | 502 | upstream_failed | | | | no-store |
| fetch hangs (timeout 50 ms) | 504 | upstream_timeout | | | | no-store |
| non-object summary | 502 | upstream_failed | | | | no-store |
| summary id ≠ requested id | 502 | upstream_failed | | | | no-store |
| id `abc` | 400 | invalid_id | | | | no-store |
| builder throws | 500 | build_failed | | | | no-store |

¹ artifact of the variant: the removed play's win-probability entry stayed in the clone.

The client side of these states (messages, retry, banner, "—" cells) was verified live at Gate D and is unchanged.

## Corpus finding beyond the fixtures (needs a product/engineering decision)

Classifying the 60 most recent recaps through the live endpoint: **8 of 60 (13%) are `unavailable`**, almost all with `score_regression` (401909972, 401909971, 401909968, 401909962, 401909294, 401909293, 401909290, 401909931; one `score_coverage_gap`). The pattern in every inspected case is the same ESPN artefact: a play recorded **late** (higher `sequenceNumber`, e.g. `40190997275` seq 75 placed between seq 67 and 68; `401909971755` seq 755 between 707-range plays) carries the score at insertion time, while the following originally-recorded plays still carry the old score, so the running score dips by 1–2 points for a few plays and then resyncs. Examples: 401909972 play index 48 (`40190997268`, Q1 6:20, 16–10 → 14–10); 401909971 index 467 (`401909971707`, Q4 3:55); 401909962 index 445 (`401909962627`, Q4 2:24); 401909294 index 92 (`401909294134`, Q1 3:14). Notably `/game/6af5670c8ec906cd0ea608db` (BOS@TOR, tagged "comeback from 22, close to the end") is one of them, so some of the most replay-worthy games are blocked. Not changed in W20 (validation rule, "never patch"); options: tolerate a bounded regression that is explained by an out-of-sequence play (re-order by `sequenceNumber` locally, or carry the monotone score and mark the interval `limited`).

Also observed: 52 of the 60 games load, but most are `limited` (typically one player's TO/BLK/3PA), so the "שחזור חלקי" banner is the common case on real games.

## Environment notes

- [env] The browser pane only advances animation frames while a screenshot is taken, so real-time 1× playback could not be watched; playback was verified to run (button state "השהיה", position advancing between screenshots) and everything else was driven by seeking.
- Live ESPN = fixtures for all five games at the time of the run (byte-identical payloads).
