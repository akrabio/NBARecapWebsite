# 5. Viewing trials, regressions, and developer handoff

Continue after Gate D in [04-interface](04-interface.md). Do not equate passing pure tests with a successful 90-second viewing experience.

## R41 — Validate real games end to end

- **Depends on:** R40. **Artifacts:** fixture audit plus browser QA record.
- Run each fixture through endpoint, client loading, playback, end state, restart, and backward/forward seeks.
- Check supported final totals, active lineup transitions, substitutions at period boundaries, retained bench stats, and highlight claims against the source.
- Cover ready, limited, and unavailable paths with deliberately malformed/removed fields in separate test variants; never alter the baseline real fixtures to make reconciliation pass.
- **Done when:** data checks and displayed states agree; discrepancies identify event IDs and affected stat/lineup intervals.

## R42 — Tune pacing by watching games

- **Depends on:** R41. **Artifacts:** `pacing-trials.md` (new developer output), timeline config.
- Watch at least a comeback, close finish, overtime, and blowout from 0–0 to the end at 1×.
- Start with about 90 seconds total and 1–2 second moment holds. Experiment with fast-span acceleration, final-possession emphasis, hold duration, and moment count. Change one major variable at a time and record the effect.
- Check whether captions can actually be read before progression resumes, whether substitutions/stats are understandable, and whether the viewer can name the key contributors and turning points afterward.
- **Done when:** chosen initial settings have viewing notes, not just a formula. Record games where the target runtime needs a tradeoff and any further product feedback needed. Timing remains tunable after delivery.

## R43 — Check mobile, desktop, and integration regressions

- **Depends on:** R42. **Artifacts:** screenshot/check record, fixes if required.
- Test 320/390px mobile portrait, short-height/landscape, and 1024/1280/1440px desktop with the sidebar retained. Also test the narrower homepage preview.
- Check all three game tabs, reading-progress reset/restoration, sticky headers, date/team navigation, final box score, and browser navigation. Replay must not change how ordinary game cards open the recap.
- Test favorite/home defaults, manual team selection, opponent spotlight, bench expansion, and responsive one/two-team transitions while paused and playing.
- **Done when:** no duplicate final/running score, hidden controls, page overflow, or selected-team reset; baseline recap/stats behavior remains intact.

## R44 — Check performance and cache behavior

- **Depends on:** R43. **Artifacts:** measured report.
- Record source/build latency, raw and compressed replay payload size, cache-hit behavior, memory over several game changes, and worst observed seek latency on representative hardware.
- Verify no replay request/code load on recap-only readers, no per-event network requests, no duplicate loops, and no accumulation of abandoned requests/listeners after switching games.
- If large payloads or reconstruction cost cause noticeable stalls, first reduce unrelated data/checkpoint density and unnecessary renders. Add a worker, derived cache, or persistence only with evidence and a documented lifecycle/invalidation plan.
- **Done when:** measurements and optimization decisions are recorded, 1–2 minute playback stays responsive, and source-correction TTL implications are documented.

## R45 — Run final repository checks

- **Depends on:** R44. **Commands:** `npm test`, `npm run lint`, `npm run build`.
- Run focused tests during implementation; now run the complete relevant suite and build. Compare with R01 baseline and resolve new regressions.
- Ensure fixtures test actual event behavior rather than snapshots of the implementation's own output. Verify at least one manually audited stat/lineup sequence independently.
- Check changed-file scope, accidental generated output, secrets, debug source dumps, and dependencies. No need to repeat passing checks unless subsequent changes justify it.
- **Done when:** checks pass or pre-existing blockers are explicitly separated, with the new feature's own checks passing and any remaining browser limits stated.

## R46 — Prepare the final developer/product handoff

- **Depends on:** R45. **Artifacts:** updated product doc, task completion record, feature README/review notes.
- Summarize implementation, API/capability contract, supported source patterns, known gaps, chosen pause/return behavior, timing settings, and cache refresh procedure.
- Include local run instructions, example game IDs/URLs, tests, source-audit output, representative desktop/mobile screenshots, and pacing-trial notes.
- List any unavailable stats or intervals honestly. If the main active-five behavior cannot be supported broadly, obtain the product decision called for at the feasibility gate; do not present the fallback as full completion.
- **Done when:** Gate E passes and another developer can run, debug, and tune the feature without reading the chat. Deploying/publishing is a separate action, not a requirement of this plan.

## Minimum verification matrix

| Case | Required result | Primary task |
| --- | --- | --- |
| 0–0 start | Zero supported stats, starters, no future curve/caption | R10, R12, R32 |
| Made three | PTS +3, FG +1/+1, 3PT +1/+1 | R07 |
| Missed three | FG and 3PT attempts only | R07 |
| Technical free throw | FT/PTS only; no false personal foul | R07, R09 |
| Blocked miss | One FGA, correct opponent block credit | R09 |
| Turnover without steal | Turnover credit only | R09 |
| Team rebound/turnover | No arbitrary player credit | R08, R09 |
| Same-clock substitutions | Atomic valid five, stable slots, retained stats | R11 |
| Quarter/halftime lineup change | Verified membership or explicit interval fallback | R11 |
| Seek backward across a substitution | Previous five and earlier totals restored | R13, R20 |
| Correction/review reversal | No duplicate credit or silent forced totals | R06, R07, R14 |
| Unknown/unmapped event | Diagnostic and appropriate capability downgrade | R06, R14 |
| Missing probability | Usable replay, no fabricated initial estimate | R12, R33 |
| Late tie/go-ahead | Accurate score, actor, caption, hold | R15–R20 |
| Missed last-second attempt | No premature overtime/winner claim | R16, R18 |
| Pause mid-hold | Remaining hold frozen and resumed correctly | R21 |
| Repeated Play/speed changes | One clock, no jumps or parallel loops | R21 |
| Exit tab/background/hide preview | No invisible progression or auto catch-up | R22, R38 |
| Switch team during play | Time/speed/spotlight preserved | R36 |
| Opposing player highlight | Spotlight visible, selected team unchanged | R34, R36 |
| Invalid ID/upstream failure | Correct status, retry semantics, no cache poisoning | R25–R28 |
| Game changes during fetch | Late response cannot overwrite the next game | R28 |
| Narrow desktop beside sidebar | Team tabs selected by actual content width | R37 |
| Keyboard/reduced motion | One action per key, usable discrete updates | R38, R40 |
| Final state/restart | Validated totals, appropriate actions, clean reset | R21, R31, R41 |

## Completion checklist

Filled in 2026-11-12 (W21). Details: [HANDOFF.md](HANDOFF.md) "Gate E record", [LEDGER.md](LEDGER.md).

- [x] Gates A–E have recorded evidence. A `source-findings.md`, B `reconciliation-report.md`, C `core-audit.md`, D `gate-d.md`, E `HANDOFF.md` + `performance.md`. *Gate E caveat:* the viewing-trial record (`pacing-trials.md`) is a simulation; real 1× trials are pending the product owner.
- [ ] All R01–R46 completion checks are accounted for. All are recorded in the ledger except **R42**, whose "done when" (settings chosen from *viewing* notes) is not met: defaults are unchanged and only simulated notes exist. R44 phone measurements and continuous-playback jank were not measurable in this environment (`performance.md` "Not measured").
- [x] Third-tab design, active-five behavior, and timing direction match the product document (third tab סיכום | נתונים | שחזור, no autoplay, five on court with labelled fallback, ~90 s target with 1.2–2.4 s holds; timing still tunable).
- [x] Source limitations, fallback behavior, and remaining decisions are explicit (HANDOFF "Known gaps and limits", "Open decisions"; design doc "Open decisions").
- [x] No synthetic mockup progression is shipped as real game history (mockups gitignored; replay data comes only from the ESPN summary via `buildReplay`).
- [x] Another developer has enough instructions and artifacts to continue independently (`HANDOFF.md`: module map, contract, run/test/audit commands, tuning knobs, refresh procedure, example games). Native Hebrew review still needed before release.
