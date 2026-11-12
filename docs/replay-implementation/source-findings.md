# Replay source findings (R03) and feasibility gate (R04)

Audit date: 2026-11-12. Corpus: the five real ESPN summaries in `tests/fixtures/replay/` (see `manifest.json`): 401810062 TOR@BKN, 401810791 MEM@PHI, 401810792 DET@BKN, 401810798 CHI@GS (OT), 401810799 CHA@POR. 2,570 plays, 106 player box lines, 42 team-period starts.

Reproduce everything below with `node scripts/audit-replay-source.mjs` (sections: `types, fields, order, duplicates, probability, roles, reconcile, subs, lineups, periods, samples`; `--json` for machine output). The script is offline and only reads fixtures.

**Status words used here.** *Observed* = true in every case in this corpus, with counts. *Verified* = observed **and** reproduces the final ESPN box score. *Assumption* = not contradicted, but the corpus is too small to prove it in general (five regular-season games, one OT, no ejection, no score correction).

## 1. Record shape

- Every play has `id`, `sequenceNumber` (string), `type{id,text}`, `text`, `awayScore`, `homeScore`, `period{number,displayValue}`, `clock{displayValue}`, `scoringPlay`, `scoreValue`, `shootingPlay`, `pointsAttempted`, `coordinate`, `wallclock`, `shortDescription`. `team` is absent on 36 plays (End Period, End Game, ref-initiated reviews, some challenges). `participants` is absent on 205 plays (team rebounds, team turnovers, timeouts, period markers, reviews, delay of game).
- `participants[]` items contain only `{ athlete: { id } }` — **no role/type field**. Roles must come from type + text pattern + position, cross-checked.
- `clock.displayValue` is `M:SS` (2,261) or `S.s` under one minute (309). No numeric `clock.value`. All parsed. Overtime period length = 5:00 (OT starts at `5:00`).
- `play.id` = `eventId + sequenceNumber` for all 2,570 plays.
- There are **no period-start events** (only `412 End Period` and `402 End Game`).
- `type.text` can contain newlines (e.g. `"62 Bad Pass\nTurnover"`, Terance Mann `"defensive 3-seconds (technical foul)\n"`); normalize whitespace and match on `type.id`.
- Shot `coordinate` uses sentinel `-214748340/-214748365` for non-shots (W01).
- No ejection type or text in the corpus; box `ejected` is false for all players.

Event types (count): Substitution 351, Defensive Rebound 346, Jump Shot 283, Offensive Rebound 190, Shooting Foul 112, FT 1 of 2 110, FT 2 of 2 109, ~45 shot subtypes, Personal Foul 75, Full Timeout 58, Bad Pass Turnover 43, Lost Ball Turnover 35, FT 1 of 1 33, Offensive Foul Turnover 22, End Period 21, Offensive Foul 16, Loose Ball Foul 14, Jumpball 11, Shot Clock Turnover 9, Traveling 9, technical variants 10, reviews/challenges 22, goaltending 5, heave 5, etc. Full list: `--section=types`.

## 2. Ordering and duplicates

- **Array order is authoritative; `sequenceNumber` is not an ordering key.** In array order: 0 clock regressions, 0 period regressions, 0 score decreases in all games. `sequenceNumber` goes backwards 15 times (1–4 per game), and sorting by it would create 12 clock regressions and 12 score decreases. Example (401810791, #146): seq 229 "Cedric Coward offensive rebound" (9:33) is followed in the array by seq 218 "Justin Edwards personal foul" (9:30) — the foul was logged late with an earlier sequence number. Reviews at `00:00` are placed before `End of the Nth Quarter` despite a higher sequence (e.g. 401810062524).
- `sequenceNumber` has ~180 gaps per game (deleted/hidden records, e.g. overturned calls). Do not treat gaps as missing data.
- `winprobability[]` is ordered by `sequenceNumber`, not by play array order (1–4 inversions/game). **Join by `playId`**, never by index.
- Duplicate IDs: 0. Identical-content records (same period/clock/type/text/participants/score): 5 pairs, all **legitimate and non-adjacent** — e.g. 401810791262/264 "Kelly Oubre Jr. offensive rebound" twice around a missed tip; 401810062277/281 "Raptors offensive team rebound" before/after a missed FT 1 of 2; 401810798717/722 two "Warriors Full timeout" at 17.5. Player rebounds reconcile only if both are counted. **Rule: never deduplicate by content.** No proven duplicates exist in the corpus.

## 3. Role map (evidence-backed)

The "name in text" check (`--section=roles`) looks up each participant's box-score `displayName` in `text`: 2,364 of 2,365 participant-bearing plays contain every participant's name; the one exception is a source error (see blocks).

| Event | Structured roles | Evidence | Status |
| --- | --- | --- | --- |
| Made/missed FG | `participants[0]` = shooter; `team.id` = shooter's team | name order in text; shooter always on acting team; pts/fgm/fga reconcile 106/106 | Verified |
| 3PT vs 2PT | `pointsAttempted` 3/2; made `scoreValue` 3/2 | tpm 106/106; tpa 105/106 (see §5) | Verified (1 unexplained) |
| Assisted FG | `participants[1]` = assister **only when** `scoringPlay` and text contains `(X assists)`. Ex: 4018100627 "Egor Demin makes 24-foot three point jumper (Terance Mann assists)" → [Demin, Mann] | ast 106/106; assister always shooter's teammate; no 2-participant made shot lacks "assists" | Verified |
| Blocked shot | `participants[0]` = **shooter**, `participants[1]` = blocker; `team.id` = **shooter's** team (53/53). Text reverses the order: "X blocks Y's …". Ex: 401810062306 "Scottie Barnes blocks Nic Claxton 's 6-foot…" → [Claxton, Barnes], team BKN | blk reconciles 106/106 **only with text guard** | Verified + guard |
| Block source error | 401810062656 "Michael Porter Jr. blocks RJ Barrett's two point shot": participants = [Barrett, **Egor Demin**]. Box: Porter 1 BLK, Demin 0. The text was right; the participant ID was wrong | | Guard required |
| Turnover + steal | `participants[0]` = turnover player, `participants[1]` = stealer when text has `(X steals)`. Ex: 40181006261 "Noah Clowney lost ball turnover (Jakob Poeltl steals)" | to/stl 106/106; stealer always opponent | Verified |
| Turnover without steal | 1 participant (travel, offensive foul TO, out of bounds, double dribble, `61 "No Turnover"` — still counted by the box) | to 106/106 | Verified |
| Team turnover | `70 Shot Clock Turnover` with 0 participants, `team.id` = team. Ex: 401810062115 "shot clock turnover " | equals box `teamTurnovers` in 10/10 team-games | Verified |
| Turnover type IDs | 61, 62, 63, 64, 65, 70, 84, 86, 87, 90 (`12 Kicked Ball` and `9 Defensive Goaltending` are **not** turnovers) | to reconciles | Verified |
| Rebounds | `155` defensive, `156` offensive; `participants[0]` = rebounder; 0 participants = team rebound (88: 24 def, 64 off), `team.id` = team | reb/oreb/dreb 106/106 | Verified |
| Team rebounds | Box `totalRebounds`/`offensiveRebounds`/`defensiveRebounds` = **player sum only**; there is no team-rebound field. Many are dead-ball (after FT 1 of 2) | cannot be validated | Observed |
| Personal fouls (PF) | `participants[0]` = fouler for types 22 take, 24 charge, 32 flagrant 1, 40 away-from-play, 42 offensive, 43 loose ball, 44 shooting, 45 personal | pf 106/106; team `fouls` 10/10 | Verified |
| Fouled player | absent (shooting fouls have 1 participant). Only exception: 401810792232 "Noah Clowney technical foul (Ronald Holland II draws the foul)" → [Clowney, Holland] | 1 case | Absent |
| Offensive foul | two records: `42 Offensive Foul` (PF) + `84 Offensive Foul Turnover` (TO), e.g. 401810062511 + 513 | pf & to reconcile | Verified |
| Technicals | 29 def. 3-seconds, 30 double technical (2 participants: both charged), 35 technical, 48 flopping. Not in PF. Player box has no technical column; team `technicalFouls` matches counts (incl. Ty Jerome twice at 1:18, 401810791754/755, not ejected — unexplained) | team-level only | Observed |
| Free throws | `participants[0]` = shooter; types 97 (1 of 1 / and-one), 98–102 (n of m), 103 technical, 104/105 flagrant; `scoringPlay` = made; `shootingPlay` is true on FTs, so exclude FTs from FGA by type | ftm/fta 106/106 | Verified |
| Heave | `282 Heave Jump Shot` (5, all misses, end of periods incl. Q4 0.5s) **is excluded from box FGA/3PA**. With exclusion fga goes 101→106/106 | Verified rule | Parser rule |
| Goaltending | `9 Defensive Goaltending` credits the defender with no counter; the basket is a separate normal made shot. Ex: 401810062514 "Immanuel Quickley makes driving layup" then 515 "Noah Clowney defensive goaltending violation" | | Observed |
| Jump ball | `participants[0..1]` = jumpers in **arbitrary order** (6/11 reversed vs text), `participants[2]` = player who "gains possession" (10/10 when present); one has no gainer (401810791152 "GG Jackson vs. Trendon Watford") | | Observed |
| Reviews/challenges | Types 213, 215, 216, 277–280, 0 participants, `team` sometimes absent. They annotate; the overturned call is already removed from the feed (sequence gap), the replacement call follows. No score decrease or negative correction anywhere | | Observed |
| Substitution | `participants[0]` = **entering**, `participants[1]` = **leaving**: 351/351 match "X enters the game for Y"; never reversed; never cross-team | lineup experiment §4 | Verified |

Implementation rule (all roles): accept a positional role only when (a) type/text pattern says the role exists, (b) the athlete is on the box roster, (c) their name appears in the text, (d) team relation holds (stealer/blocker = opponent, assister = teammate). On (c) failure, resolve by a unique exact roster-name match from the role pattern in the text; otherwise drop the role and record `role_text_conflict`/`role_unresolved`. Never assume `participants[0]` is any particular role without the type rule above.

## 4. Lineups

- Starters: box `starter: true`, exactly five per team in every game.
- Substitutions: 351, all 2 participants, all match text. Same-clock batches: 86 multi-sub groups (sizes 2–7); 59 subs logged at the period's starting clock (12:00 / 5:00).
- **Period starts are explicit:** between-period changes appear as substitutions at the start clock of the new period, after `End Period` and before the first action (e.g. 401810792: 7 subs before Q2 and Q3). No inference is needed.
- **Experiment** (`--section=lineups,periods`): start from starters, apply subs in array order, carry lineups across periods:
  - role-bearing player not on tracked court: **0** (across 2,219 non-sub events, both teams);
  - team lineup ≠ 5 at any non-sub event: **0 / 4,438** team-event checks;
  - entering player already on court / leaving player not on court: **0 / 0**;
  - final tracked ten = box `active: true` players (exactly 10 per game) in **5/5** games — `active` appears to mean "on court at the final horn" (assumption; useful as a final check);
  - an alternative "infer period-start five from in-period evidence" rule changed nothing;
  - all **42/42** team-period starting fives are fully confirmed by evidence within the period (each player acts, or is subbed out before being subbed in).
- Caveat: mid-batch states can transiently have ≠5 (we only checked after non-sub events); apply a same-clock substitution group atomically.
- **Verdict: active-five reconstruction is feasible and reliable on this corpus.**

## 5. Box-score reconciliation

With the role map above (heave exclusion + text guard): **1,589 / 1,590** player stat values match (106 lines × 15 stats: pts, fgm, fga, tpm, tpa, ftm, fta, reb, oreb, dreb, ast, to, stl, blk, pf). Team: player-TO, team-TO and PF match in 10/10 team-games.

Only remaining mismatch: 401810792 Ronald Holland II 3PA 6 (play-by-play) vs 5 (box), while his FGA matches — the box counts one of his "three point" misses as a two (candidates 401810792164 Q1 2.0 "22-foot three point pullup jump shot"). Unexplained source inconsistency; validation must report it (`stat_mismatch`) and limit the affected player/family, not patch it.

## 6. Win probability

- Exactly one sample per play, all 2,570 linked by `playId`, 0 unlinked, all in [0, 1], `tiePercentage` always 0. First sample is on the opening jump ball (no pre-tip sample); last sample is 0/1 consistent with the winner in 5/5.
- `homeWinPercentage` is a fraction. Order differs from plays (sequence order) → join by ID.

## 7. Support matrix

| Family | Status | Notes |
| --- | --- | --- |
| Score / PTS | Reliable | event scores monotonic; pts 106/106 |
| FG (fgm/fga) | Requires parser work | exclude FTs by type; exclude `282` heaves from attempts |
| 3PT (tpm/tpa) | Requires parser work | `pointsAttempted`; heaves; 1 unexplained tpa mismatch (validator must handle) |
| FT | Reliable | by type id 97–105 |
| REB | Reliable | team rebounds kept team-only, not validatable |
| OREB/DREB | Reliable | type 155/156 |
| AST | Requires parser work | `participants[1]` only with `(X assists)` text + teammate check |
| TO | Reliable | type-id set; team turnovers team-only (validates vs `teamTurnovers`) |
| STL | Requires parser work | `participants[1]` only with `(X steals)` + opponent check |
| BLK | Requires parser work | reversed order vs text; text guard needed (1 bad participant ID in corpus) |
| PF | Reliable | type-id set; technicals excluded |
| Technical fouls | Absent/uncertain (player) | team-level only; not a planned column |
| Fouled player / FT "drawn by" | Absent | do not caption "fouled by" except explicit text |
| Active lineups | Reliable (requires parser work: atomic same-clock groups) | 0 anomalies, 42/42 period starts confirmed |
| Probability | Reliable | join by playId |
| Corrections / reversals | Absent-uncertain | none observed in the original 5; late-recorded scoring plays leave stale score snapshots (§10, adapter rule); one unexplained phantom score (401909293) stays unavailable; keep `score_regression` detection |
| Ejections | Absent-uncertain | none in corpus; rely on subs + box `ejected` |

## 8. Uncertainty / not covered by this corpus

- Only five regular-season games from two dates; one OT. Rules may break on playoff games, multiple OTs, ejections, score corrections, or late ESPN edits. Validator must stay the safety net.
- Technical-foul duplicates (Ty Jerome twice, no ejection) are unexplained; technical counts are team-level only.
- Holland 3PA discrepancy suggests ESPN can reclassify a shot in the box without editing play text.
- `active` = "on court at end" is an inference from 5/5 games.
- Heave exclusion is inferred from 5/5 heave events (all misses). A made heave was not observed (Scoot Henderson's 41-foot make at 0.0, 401810799734, is type `131`, not a heave, and counts normally).

## 9. Gate A assessment

- Fixture corpus: present (W01), five real games covering comeback, OT, blowout, close finish, ordinary.
- Role map: documented above with play IDs; every rule reconciles with the box score.
- Uncertainty report: §8; one unexplained stat mismatch, unexplained technical duplicate.
- **Gate A: PASS.** Active five, all primary columns (PTS FG 3PT FT REB AST TO STL BLK) and the expanded OREB/DREB/PF are supported. No product-level escalation is required; the open risks are corpus breadth and the need for the validator to limit (not patch) rare source mismatches.

## 10. Score snapshots after late-recorded scoring plays (W20b)

Corpus: eight more fixtures captured from the 60 most recent games that were `unavailable` (401909972, 401909971, 401909968, 401909962, 401909294, 401909293, 401909290, 401909931; `manifest.json`). Reproduce with `tests/replay-score-snapshot.test.js`.

- **Position is right, snapshot is stale.** In all 13 fixtures the array order has 0 clock regressions within a period, so every play — including the late ones — sits at its correct game position. The anomaly is only in `homeScore`/`awayScore`.
- **Pattern (7 of 8 games, 9 late scoring plays).** A scoring play is recorded late (its `sequenceNumber` is higher than plays placed after it) — e.g. 40190997275 "Day'Ron Sharpe makes tip shot" (seq 75, Q1 6:32) sits between seq 67 and seq 68. Its own score is correct (previous + its points). Every following play recorded **earlier** (lower `sequenceNumber`) carries the score from its own recording time, i.e. **without** the late play's points; the first play with a higher sequence number resyncs. Stale plays include non-scoring plays (where the dip shows as a "regression") **and** scoring plays (e.g. 40190997271 MPJ +2 shows 16–10 instead of 18–10; its delta is still +2, so it does not look like a regression). Windows: 5 (401909972), 38 (401909971), 140 (401909968, crosses Q3→Q4), 21 (401909962), 183 (401909294, crosses two period ends), 5 (401909290, two late plays), 2 (401909931) plays.
- **Model (falsifiable, 100% fit).** For play *k*: source score = Σ points of scoring plays *j ≤ k* (array order) with `sequenceNumber_j ≤ sequenceNumber_k`. It reproduces every one of the 394 stale snapshots and every other snapshot in the 12 games it applies to (the five original fixtures included, where no scoring play is late so it equals the plain running sum). It fails only for 401909293 (below).
- **Adapter rule (`normalize.js` `staleSnapshot`).** Per side, a source score is replaced only when it is proven stale: it differs from the expected score (previous normalized score + the points this event itself credits, same rule as `stats.js`), and source + the points of the earlier-placed scoring plays with a higher `sequenceNumber` equals that expected score exactly. The event keeps the raw value in `sourceScoreAfter` and gets a `score_snapshot_out_of_order` issue (detail + `lateSourcePlayIds`); validation reports it as a warning. Anything else (any other dip, a side not explained by the late points) is left untouched and stays a `score_regression` / `score_delta_mismatch`. Nothing is invented — the added points are scoring records in the feed — and the validator still requires final source score = credited score = header final, and every period = linescore.
- **Status policy.** A game whose only score anomaly is explained by this rule is `ready` (score capability reliable) with the warning; e.g. 401909294 (POR@LAL, comeback from 14) is `ready`. The other six become `limited` only for unrelated stat/lineup gaps (below).
- **Genuine gap: 401909293 (MIN@NO).** Play 401909293681 "Saddiq Bey lost ball turnover" (Q4 1:33) adds 2 NOP points with no scoring record and no late play; source final 111 ≠ header 109 = credited 109; Q4 ≠ linescore. Likely a removed basket whose score persisted. Not explained → stays `unavailable` (`score_coverage_gap`, `period_score_mismatch`).
- **New type IDs seen (parser gaps, not fixed in W20b).** These cause most of the `limited` capabilities in the new games: turnovers 66 Disc Dribble, 67 3-Second, 69 8-Second, 71 Inbound, 72 Back Court, 73 Offensive Goaltending; fouls 36 Double Personal, 257 Transition Take; flagrant FTs 106 (1 of 1), 157/165/166 (1–3 of 3) — not in the FT table so they are parsed as field goals (FG/FT mismatch for Demin, Tatum, Battle); 10 Lane violation; 214 Coach's Challenge (Supported). Candidate follow-up: extend the type tables and re-reconcile.
