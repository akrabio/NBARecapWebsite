# R42 — pacing trials

Date 2026-11-12. Timeline defaults: `lib/replay/timeline.js` `TIMELINE_CONFIG` (W10; summary in `timeline-report.md`).

**What this is and is not.** The in-app browser pane renders frames only while a screenshot is taken, so the agent could not watch a replay in real time at 1×. These trials are a **frame-by-frame simulation**: the real payload (`buildReplay(fixture)`, byte-identical to the live endpoint, see `e2e-report.md`) was stepped with `frameAt(timeline, t)` every 0.25 s from 0 to the end, and the per-window description below is what the UI renders at those positions (scoreboard = `replayStateAt`, spotlight = `spotlightAt`, captions from the payload). Visual feel (motion, flashes, whether a reader actually follows) still needs the **user's own 1× viewing**, protocol at the end. No default was changed.

How to read the tables: windows of 10 replay seconds; "events" = source events revealed in the window (every one is applied to the stats); "max/0.25 s" = largest number of events revealed in one 0.25 s tick (batching); holds = moments whose hold starts in the window (`type game-clock (hold s)`). Scores away–home. After a hold ends the spotlight keeps the caption on screen, dimmed, labelled "באותו רגע", until the next moment — so a caption's **visible time** is hold + gap to the next moment.

## W22 update — more key moments (builder v4)

User feedback: too few key moments (the Nuggets–Grizzlies game 401909970 had **one**); target **10–20 per completed game**, blowouts and ordinary games included. W22 widened the evidence-based moment types (scoring runs, lead milestones 10/15/…/40, player point milestones and double/triple-doubles from running state, closing baskets in Q1–Q3, late non-final tying/go-ahead misses, end-of-period state, close-finish baskets, steal→basket and could-tie blocks at any time), changed selection to coverage-per-period + per-type caps + a 10/12–20 count band, and the timeline now keeps ≥ 2 s of fast time between consecutive holds and grows the target by 1 s per moment beyond 10. Simulated from `buildReplay(fixture)` (same method as below); real 1× viewing still pending.

| Game | Matchup / status | Moments (v3 → v4) | Per period (v4) | Duration s | Holds s | Min hold s | Min gap s | Longest stretch without a new moment s |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 401810062 | TOR@BKN limited | 2 → 12 | Q1 1 · Q2 4 · Q3 4 · Q4 3 | 87.8 | 17.5 | 1.3 | 2.0 | 11.1 |
| 401810791 | MEM@PHI ready | 7 → 15 | Q1 2 · Q2 4 · Q3 2 · Q4 7 | 94.2 | 22.3 | 1.3 | 2.0 | 18.6 |
| 401810792 | DET@BKN limited | 2 → 10 | Q1 2 · Q2 4 · Q3 4 | 75.0 | 13.8 | 1.3 | 2.0 | 11.4 |
| 401810798 | CHI@GS ready (OT) | 12 → 16 | Q1 2 · Q2 2 · Q3 2 · Q4 6 · OT 4 | 108.0 | 29.2 | 1.4 | 2.0 | 11.1 |
| 401810799 | CHA@POR ready | 12 → 15 | Q1 2 · Q2 2 · Q3 2 · Q4 9 | 95.0 | 24.7 | 1.4 | 2.0 | 15.3 |
| 401909290 | UTAH@DAL limited | 4 → 15 | Q1 2 · Q2 4 · Q3 4 · Q4 5 | 90.1 | 22.5 | 1.3 | 2.0 | 13.6 |
| 401909293 | MIN@NO unavailable | 0 → 0 | — | — | — | — | — | — |
| 401909294 | POR@LAL ready | 4 → 15 | Q1 2 · Q2 2 · Q3 4 · Q4 7 | 95.0 | 24.3 | 1.3 | 2.0 | 12.5 |
| 401909931 | TOR@DEN limited | 3 → 12 | Q1 3 · Q2 4 · Q3 4 · Q4 1 | 79.4 | 18.1 | 1.3 | 2.0 | 18.6 |
| 401909962 | LAC@PHX limited | 3 → 10 | Q1 4 · Q2 2 · Q3 4 | 78.0 | 15.2 | 1.3 | 2.0 | 16.0 |
| 401909968 | BOS@TOR limited | 12 → 15 | Q1 2 · Q2 2 · Q3 2 · Q4 9 | 95.0 | 26.1 | 1.3 | 2.0 | 16.4 |
| 401909970 | DEN@MEM ready | 1 → 15 | Q1 3 · Q2 2 · Q3 4 · Q4 6 | 95.0 | 24.2 | 1.3 | 2.0 | 16.3 |
| 401909971 | LAL@MIL limited | 4 → 12 | Q1 3 · Q2 3 · Q3 4 · Q4 2 | 83.2 | 18.0 | 1.3 | 2.0 | 14.5 |
| 401909972 | BKN@NO limited | 3 → 10 | Q1 4 · Q2 2 · Q3 4 | 75.5 | 14.6 | 1.3 | 2.0 | 14.6 |

Quality pass (validator follow-up): a period end is not selected when another moment of that period already shows the same score; runs, lead milestones and closing baskets are dropped once the game is settled (timeline rule: margin ≥ 10 + 1.5/min of regulation left) or when a run/closing basket leaves its team ≥ 20 behind, and Q4 player milestones in a settled game are garbage time; outside the finish window at most 2 moments within 5 events / 30 game seconds (fill pass exempt); Q4/OT coverage must be a game-flow moment; ≤ 3 lead milestones and ≤ 2 period ends per game. Per-period counts use the period of the hold's event (an end-of-period hold counts for the period that ended). The blowouts (792 by 38, 962 by 23, 972 by 34) have no Q4 moment: every Q4 candidate there is garbage time (runs/lead milestones with ≤ 6 min left and a ≥ 15 margin are dropped), and nothing is invented to fill it. 401909293 stays unavailable (score regression, W20b). Recommendations 1–3 below are addressed by W22 (min fast gap + context-moment spacing; runs/lead milestones narrate deficits as of the moment; per-period coverage removes the long silences — longest stretch now 11–19 s instead of 31–64 s). The per-window tables below are the **v3 (pre-W22)** simulation, kept for comparison.

## Comeback — 401810791 MEM@PHI 129–139 (PHI trailed by 14)

89.2 s, 7 holds (10.5 s). Periods Q1 14.2 · Q2 19.5 · Q3 19.6 · Q4 35.9 s.

| Replay s | Period | Score at end | Events | ev/s | Max/0.25 s | Holds starting |
| --- | --- | --- | ---: | ---: | ---: | --- |
| 0–10 | Q1 | 29–22 | 92 | 9.2 | 5 | — |
| 10–20 | Q1→Q2 | 40–40 | 61 | 6.1 | 5 | steal 0:34.9 (1.5); steal 9:17 (1.5) |
| 20–30 | Q2 | 62–60 | 71 | 7.1 | 6 | lead_change 2:41 (1.7) |
| 30–40 | Q2→Q3 | 83–76 | 67 | 6.7 | 5 | — |
| 40–50 | Q3 | 99–88 | 70 | 7.0 | 5 | — |
| 50–60 | Q3→Q4 | 115–110 | 56 | 5.6 | 5 | steal 8:56 (1.5) |
| 60–70 | Q4 | 115–116 | 28 | 2.8 | 3 | first_lead_since 6:46 (1.7); turnover 6:44 (1.3) |
| 70–80 | Q4 | 118–130 | 42 | 4.2 | 3 | turnover 5:57 (1.3) |
| 80–89 | Q4 | 127–139 | 39 | 4.2 | 4 | — |

What a viewer sees: a fast, even first half (6–9 events/s — the score ticks several points per second; individual plays are not followable, which matches the design's "batch quiet stretches"). From 28 s to 59.7 s (**31.5 s**, all of Q3 and the start of Q4) there is no moment: the dimmed caption "J. Small gives MEM the lead back — 62–60" stays up while MEM builds the 14-point lead (99–88 at ~50 s). The comeback itself is compressed: the C. Payne steal at 59.7 s, then Grimes' first PHI lead since Q2 at 65.9 s — the key turning point — is **visible for only 2.1 s** before `turnover-442` (Oubre steals, then loses it out of bounds, 2 s of game time later) replaces it. Then another turnover (J. Small) at 71.8 s, and **17.4 s with no moment** while PHI pulls away 121–117 → 139–129 at a moderate 4 ev/s. The finish is not emphasized (correct: it is not close by the end) but the decisive run is not narrated either.

Verdict: duration fine; holds readable for short captions; the story's two biggest beats (MEM's 14-point lead, PHI's run to take over) are under-told. Key contributors: Payne (32) and Oubre (30) are named in moments; Jerome (26, MEM) is not.

## Close finish — 401810799 CHA@POR 103–101 (CHA came back from −19)

90.0 s, 12 holds (20.6 s). Q1 11.6 · Q2 12.5 · Q3 17.7 · Q4 48.2 s; last 2 min of regulation = 21.5 s.

| Replay s | Period | Score at end | Events | ev/s | Max/0.25 s | Holds starting |
| --- | --- | --- | ---: | ---: | ---: | --- |
| 0–10 | Q1 | 19–29 | 89 | 8.9 | 8 | lead_change 7:36 (1.7) |
| 10–20 | Q1→Q2 | 37–50 | 107 | 10.7 | 7 | — |
| 20–30 | Q2→Q3 | 54–67 | 75 | 7.5 | 5 | steal 11:06 (1.5) |
| 30–40 | Q3 | 74–75 | 80 | 8.0 | 3 | — |
| 40–50 | Q3→Q4 | 88–87 | 60 | 6.0 | 6 | first_lead_since 7:28 (1.7) |
| 50–60 | Q4 | 95–91 | 45 | 4.5 | 6 | big_shot 3:45 (1.8) |
| 60–70 | Q4 | 97–98 | 13 | 1.3 | 1 | tie 2:51 (1.6); go_ahead 2:28 (1.6); lead_change 2:12 (1.7) |
| 70–80 | Q4 | 99–98 | 13 | 1.3 | 1 | block 1:23 (1.8); lead_change 1:18 (2.0); steal 1:00 (1.8); foul_out 0:25.2 (1.8) |
| 80–90 | Q4 | 103–101 | 22 | 2.2 | 2 | turnover 0:08.5 (1.6) |

What a viewer sees: the first half flies (up to 10.7 ev/s, 8 events in one tick at 0–10 s) — POR's 19-point lead (67–48 early Q3) builds in ~25 s with one caption. The finish works as designed: the last 3:45 of the game take ~32 s, events slow to ~1/s, and nine moments narrate the exchange of leads. Caption visible times in the crunch: 2.1–5.4 s (tie and go-ahead are the shortest, 2.1 s each, 29/38 characters). The final 4.7 s after Camara's turnover (8.5 s left) show the closing free throws to 103–101 and the end state.

Verdict: the best of the four. The early CHA deficit (−19) is barely visible as a story; acceptable for a close-finish game but worth a "largest deficit" beat (see recommendations). Key contributors: Grant (24) and Ball are named; Miller (23) and Avdija (22, three assists in captioned plays) never are.

## Overtime — 401810798 CHI@GS 130–124 OT

102.0 s (clamped upper end of the OT budget), 12 holds (22.8 s). Q1 8.7 · Q2 12.2 · Q3 17.5 · Q4 40.0 · OT 23.6 s; last 2 min of regulation + OT = 44.5 s.

| Replay s | Period | Score at end | Events | ev/s | Max/0.25 s | Holds starting |
| --- | --- | --- | ---: | ---: | ---: | --- |
| 0–10 | Q1→Q2 | 31–34 | 129 | 12.9 | 8 | — |
| 10–20 | Q2 | 54–49 | 96 | 9.6 | 6 | first_lead_since 2:27 (1.7) |
| 20–30 | Q2→Q3 | 75–72 | 90 | 9.0 | 5 | — |
| 30–40 | Q3→Q4 | 96–86 | 74 | 7.4 | 8 | first_lead_since 4:16 (1.7) |
| 40–50 | Q4 | 105–104 | 58 | 5.8 | 9 | steal 5:13 (1.5) |
| 50–60 | Q4 | 110–115 | 30 | 3.0 | 3 | first_lead_since 4:11 (1.7) |
| 60–70 | Q4 | 116–118 | 34 | 3.4 | 3 | steal 0:21.4 (1.8) |
| 70–80 | Q4→OT | 120–118 | 12 | 1.2 | 3 | tie 0:01.4 (1.9); missed_final_attempt 0:00.1 (2.3); overtime (2.3); go_ahead OT 4:44 (1.9) |
| 80–90 | OT | 125–121 | 19 | 1.9 | 3 | big_shot 3:45 (2.1); steal 3:18 (1.8); big_shot 2:20 (2.1) |
| 90–100 | OT | 129–124 | 19 | 1.9 | 1 | — |
| 100–102 | OT | 130–124 | 7 | 3.5 | 2 | — |

What a viewer sees: Q1 is the fastest stretch in the corpus (12.9 ev/s, **Q1 in 8.7 s**) — a blur; the first caption arrives at 16.6 s. The end of regulation is the highlight of the corpus: tie with 1.4 s left, Podziemski's miss, "tied 118–118 — overtime", then Buzelis' go-ahead — four holds in 8 s with captions visible 2.6–3.4 s each. OT keeps the slower close-finish pace. The last 12.3 s (after Buzelis' second three at 89.7 s, 125–121) have no moment and run at ~1.9 ev/s while CHI closes it out; this tail is the one place the OT game drags slightly.

Verdict: holds readable; final-possession emphasis clearly visible; runtime at the 102 s budget is justified. Buzelis (41) is named twice; Giddey (21, assists on two captioned shots) is not.

## Blowout — 401810792 DET@BKN 138–100

75.0 s (trimmed below 90 because the last period is settled), 2 holds (3.0 s). Q1 19.0 · Q2 25.8 · Q3 17.8 · Q4 12.4 s.

| Replay s | Period | Score at end | Events | ev/s | Max/0.25 s | Holds starting |
| --- | --- | --- | ---: | ---: | ---: | --- |
| 0–10 | Q1 | 23–13 | 53 | 5.3 | 2 | — |
| 10–20 | Q1→Q2 | 38–27 | 71 | 7.1 | 7 | — |
| 20–30 | Q2 | 49–29 | 43 | 4.3 | 2 | lead_milestone 7:10 (1.5) |
| 30–40 | Q2 | 66–36 | 54 | 5.4 | 5 | lead_milestone 2:14 (1.5) |
| 40–50 | Q2→Q3 | 75–47 | 49 | 4.9 | 7 | — |
| 50–60 | Q3 | 102–63 | 56 | 5.6 | 6 | — |
| 60–70 | Q3→Q4 | 124–85 | 101 | 10.1 | 5 | — |
| 70–75 | Q4 | 138–100 | 48 | 9.6 | 3 | — |

What a viewer sees: a steady first half where DET's lead grows to 20 (27.6 s, Cunningham) and 30 (38.9 s, Duren); from then on nothing is captioned for **36 s** and the second half accelerates to ~10 ev/s — Q4 in 12.4 s. The ending is not stretched. Design intent met ("accelerate once settled; do not stretch").

Verdict: good. The first half is relatively slow (Q1 19 s, Q2 25.8 s) because "settled" only applies from the current margin with time left (margin ≥ 10 + 1.5/min left); a 30-point lead at halftime is not "settled" by that rule until mid-Q3.

## Ordinary game (for comparison) — 401810062 TOR@BKN 119–109

85.8 s, 2 holds, both in Q2 (13.5 s and 21.8 s). The last **64 s** (Q2 7:40 → end, TOR leading throughout, up to 17) have no moment; the dimmed caption "B. Ingram puts TOR ahead from the line — 41–40" stays up the whole time. That caption is for a **technical free throw** (`401810062217`) selected as the decisive lead change — accurate but a weak story beat (ledger optional note).

## Readability summary

| Game | Shortest caption visible time | Worst chars/s during the hold alone | Worst chars/s over visible time |
| --- | ---: | ---: | ---: |
| 791 | 2.1 s | 36.5 (62-char `first_lead_since`, 1.7 s) | 29.2 |
| 799 | 2.1 s | 35.3 | 19.5 |
| 798 | 2.4 s | 38.2 (65-char `first_lead_since`) | 23.4 |
| 792 | 11.3 s | 34.0 | 4.5 |
| 062 | 8.3 s | 33.1 | 6.4 |

All holds are ≥ 1.2 s (minimum 1.3 s turnover). Short captions (12–30 characters: "L. Ball makes a three — 95–91") are readable inside the hold. The long `first_lead_since` captions (59–65 characters) need roughly 3–4 s for comfortable reading; the hold gives 1.7 s but the caption remains visible (dimmed) afterwards, so in practice they get 2.1 s (791, the tight case) to 17 s. Only 791's `first_lead_since-440` → `turnover-442` pair is clearly too tight.

## Experiments (one variable each, via `buildTimeline(..., { config })`; defaults unchanged)

| Experiment | 791 | 799 | 798 | 792 | Effect |
| --- | --- | --- | --- | --- | --- |
| Baseline | 89.2 s, holds 10.5 s | 90.0 s, holds 20.6 s, last-2-min 21.5 s, min visible 2.09 s | 102.0 s, holds 22.8 s, last-2-min+OT 44.5 s, min visible 2.39 s | 75.0 s, Q4 12.4 s | |
| A: `hold.lateBonusSec` 0.3 → 0.6 | unchanged (no late holds) | holds 22.1 s; last-2-min 22.8 s; Q1–Q3 each −0.3 s; min visible 2.08 s | holds 24.8 s; last-2-min+OT 46.0 s; min visible 2.69 s | unchanged | +1.5–2 s of reading time in crunch moments, paid by slightly faster early quarters; runtime unchanged (holds are inside the budget). Helps the long late captions a little; does not fix the 791 overlap (not in the last 2 min). |
| B: `settled.factor` 0.35 → 0.2 | Q4 −0.1 s | unchanged | unchanged | Q4 12.4 → 7.9 s, **Q1 19.0 → 21.1 s, Q2 25.8 → 28.3 s**, total still 75 s | More acceleration of the settled part only moves time into the already-slow first half of the blowout (the trim is driven by `settled.trimSec`, not the factor). Worse; keep 0.35. |

Decision: keep defaults. Experiment A is a reasonable option if the user's viewing finds late captions rushed; B should not be adopted.

## Recommendations (not implemented; for the user / a later tuning pass)

1. **Minimum visible time between moments** (791): when a lower-importance moment would start < ~3 s after a higher-importance one, drop or merge it (here `turnover-442`, whose steal by the same player was merged into it). This also addresses the ledger note "791 #442/#456 both turnovers (repetitive)": allow at most one plain `turnover` moment per finish window unless it changes the lead.
2. **Narrate the deficit in comebacks**: add a look-back `largest_lead` / `run` moment when a team builds a lead ≥ 12 that is later overturned *as of that moment only* (e.g. "MEM up 14" at Q3 in 791, "POR up 19" in 799). Must be phrased without look-ahead ("biggest lead of the game so far").
3. **Long silences**: 791 (31.5 s and 17.4 s), 062 (64 s), 798 OT tail (12.3 s). Consider a low-importance coverage moment per period without moments in the second half (lead milestone for the leading team, or a `game_end` hold — the type exists, hold 2.2 s, but none is selected in the corpus; the final state currently just shows "סיום" + end actions).
4. **062 technical-FT decisive lead**: exclude technical free throws from `go_ahead`/`lead_change` decisive-boost candidates (or require the lead to come from a field goal / regular FT trip) so the coverage moment goes to a more meaningful play.
5. **Caption-length-aware holds**: `hold = max(typeHold, chars / 25)` capped at `hold.maxSec`, so the 60+ character `first_lead_since` captions get ~2.4 s. Equivalent effect to experiment A but targeted.
6. **Early-quarter speed in OT games** (798 Q1 in 8.7 s at 12.9 ev/s): acceptable per design (batched), but if the user finds it a blur, raise `minFastSec` or lower `overtimeWeight` slightly rather than extending the runtime past 102 s.
7. Key contributors: the spotlight names 2–9 players per game; the top scorer is named in 4 of 5 games (not Jerome/MEM). The final table state shows everyone; no change proposed without viewing feedback.

## Protocol for the user's real 1× viewing trial

Use a normal browser window (not the agent pane), laptop and phone, default speed 1×, sound irrelevant. Open the page, choose **שחזור**, press play once, and do not touch anything until the end. Then answer the questions without rewinding.

Suggested games (real recaps in the database; fixture games have no page):

| Kind | Page | Why |
| --- | --- | --- |
| Comeback | `/game/6af567798ec906cd0ea60909` SAS@CHI 124–119 | ready; SAS came back from 22 |
| Close finish | `/game/6aec2b90cd5ba125ff21aa7a` DAL@SAS 111–112 | margin 1, 12 moments (limited) |
| Overtime | `/game/6aec2c1ecd5ba125ff21abd4` MIA@LAC 117–116 OT | OT, margin 1, MIA came back from 20 (limited) |
| Overtime (alt.) | `/game/6af023718ec906cd0ea3e134` ORL@GS 119–126 OT | limited |
| Blowout | `/game/6af2c55c8ec906cd0ea4b47c` NOP@GS 87–138 | margin 51 |
| Ordinary | `/game/6af566378ec906cd0ea608a4` WAS@IND 101–114 | the QA test game |

While watching, note the replay time (shown under the scrubber) whenever:

- a caption disappears or is replaced before you finished reading it;
- you lose track of the score because it moves too fast (especially the first quarter of an OT game);
- the replay feels stalled (long stretch, nothing captioned, score barely moving);
- the end feels rushed (close game) or dragged (blowout);
- a substitution or table change is confusing (wrong team tab, row jumping).

After each game answer: who were the 2–3 key players? When did the game turn? Was the winner clear before the end (should be, for a blowout; should not be, for a close game)? Total feel: too long / right / too short. Report the noted replay times; each maps to a moment or fast segment that can be tuned (`TIMELINE_CONFIG`, `HIGHLIGHT_CONFIG`), one variable at a time.
