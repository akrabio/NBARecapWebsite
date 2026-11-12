# R43 — mobile, desktop and integration regression sweep

Date 2026-11-12. Dev server `next dev -p 3119` with `.env`, browser pane with viewport emulation. Pages: `/game/6af566378ec906cd0ea608a4` (WAS@IND, `limited`), `/game/6af567798ec906cd0ea60909` (SAS@CHI), `/game/6af408798ec906cd0ea586a9` (BOS@PHI), `/game/6af023718ec906cd0ea3e134` (ORL@GS, OT), `/?date=2026-11-10` (desktop home preview, OKC@POR).

Markers: **[live]** observed (DOM read + screenshot) · **[env]** environment limit. The pane advances frames only on screenshots, so sticky/IntersectionObserver states were confirmed after a screenshot; one-frame-stale screenshots were re-taken.

## Viewports

| Viewport | Checks | Result |
| --- | --- | --- |
| 390×844 portrait | 3 tabs; recap scrolled → sticky top bar shows compact final score, sticky tabs; reading bar 29 % → 39 % while scrolling recap, `0` on stats and replay; replay tab: top bar shows "ויזארדס נגד פייסרס" + date (no score), hero hidden, no final score anywhere in main; tabs pinned under top bar after switch; default team = home (IND); bench expand; sticky score bar + sticky table header copy once the panel scrolls away; play from the sticky bar; switch team while playing (position, speed, playing kept); no horizontal overflow (`scrollWidth 390`) | PASS |
| 320×640 portrait | Same while playing; overflow none (`scrollWidth 320`); sticky bar | **FIXED** (see below), otherwise PASS |
| 740×360 landscape (short) | Sticky bar hidden (< 520 px tall, by design); sticky table header copy below the tabs; limited banner; no overflow | PASS — note: with the bar hidden, play/pause is only in the main controls (or Space/K with focus inside the replay); W18 design decision, unchanged |
| 1024×768 + sidebar | Replay panel tabs layout, selection kept, playing kept across resize; next-moment navigation | PASS |
| 1280×800 + sidebar | Resize 1440 → 1280 **while playing**: both tables → team tabs, manual selection (away, WAS) kept, position kept, still playing | PASS |
| 1440×900 + sidebar | Both tables side by side (panel 1040 px), paused and playing | PASS |
| `/` preview 1280 | Preview replay tab loads (`limited` banner), tabs layout, default home (POR); with favorite = OKC (away) after reload → default OKC; manual switch to POR survives recap → replay round trip | PASS |

## Integration

| Check | Result | How |
| --- | --- | --- |
| Ordinary game cards open the recap tab | PASS | [live] from the game page with the replay tab active, clicking a sidebar card (SAS@CHI) → `/game/…` on **סיכום**, replay panel empty and hidden, **no** `/api/replay` request for the new game; same from `/` (BOS@PHI) |
| Browser back / forward | PASS | [live] back → previous game on סיכום (replay reset on game change, as designed in R22); forward → SAS@CHI |
| Final box score (נתונים) | PASS | [live] full table with starters/bench, minutes, FG |
| Date navigation | PASS | [live] sidebar date button → `/?date=2026-11-10`, list and preview updated |
| Team navigation | n/a | no team routes exist (only `/` and `/game`); team filtering is via the favorite picker |
| Favorite via the site's team picker | PASS | [live] "יש לכם קבוצה אהובה?" → dialog → Thunder → cookie `fav_team` set; an already-open replay keeps its selection (set once); after reload the away favorite is the default. Cookie removed again after the test |
| Opponent spotlight | PASS | [live] with WAS selected, IND moments ("חטיפה וסל של P. Siakam", "A. Nembhard …") show in the spotlight; selected team unchanged |
| Bench expansion | PASS | [live] toggles per team; expanded state shared between team tabs |
| Reading-progress reset / restore | PASS | [live] bar width 0 on stats/replay, recomputed from scroll on return to recap |
| Duplicate final/running score | none | [live] replay tab: hero and top-bar compact score hidden; desktop sidebar list still shows final scores (known open design call in the ledger) |
| Hidden controls / page overflow | none | [live] `scrollWidth === innerWidth` at every size |

## Fixed

1. **Sticky score bar period label wrapped at 320 px** ("רבע" / "1" on two lines). `components/game/replay/ReplayView.jsx` `StickyBar`: the live label (`רבע N`, `הארכה N`) is `whitespace-nowrap`; the longer pre/end labels ("לפני פתיחה", "סיום · אחרי הארכה") may still wrap (centered, tight leading) — forcing them onto one line made "סיום · אחרי הארכה" collide with the away score at 320 px (checked on the OT game). Verified at 320×640: pre, Q4 2:34, OT 18.1 and OT final all fit; no overflow.

## Observed, not changed

- [env] Entering the replay tab from a deeply scrolled recap once showed the sticky bar mid-fade in a screenshot (opacity transition captured while it hid; computed opacity 0 immediately after). Probably a ≤150 ms fade in a real browser; worth a glance in the user's own viewing.
- At 320 px the sticky bar's team blocks are ~9 px narrower than their content (logo + abbreviation + score shrink with `min-w-0`); visually intact.
- The same replay payload was requested twice for the test game during the session (after an HMR edit of `ReplayView.jsx`); not reproducible as a user path, to be covered by the R44 request accounting.
- Real-time 1× playback could not be watched ([env]); playing state, position advance and pause/resume were verified between screenshots.

## Repository checks

`npm test`: 28 files / 549 tests pass. `npm run lint`: clean.
