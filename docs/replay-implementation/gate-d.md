# Gate D — integrated experience (W19, R39–R40)

Date 2026-11-12. Dev server `next dev -p 3117` with `.env`. Pages: `/game/6af566378ec906cd0ea608a4` (WAS@IND, ESPN 401909966, `limited`: K. George TO unavailable) and desktop home preview `/` (OKC–POR, `limited`: R. Williams III TO unavailable).

Markers: **[live]** observed in the browser · **[code]** code review / unit test · **[env]** environment limit noted.

Failure states were simulated by overriding `window.fetch` for `/api/replay/*` in the page (devtools JS); no source was changed for them.

## R39 — states

| Check | Result | How |
| --- | --- | --- |
| Loading = panel-shaped skeleton (`role=status`, sr-only "טוען שחזור…") | PASS | [live] hung fetch → `data-replay-state=loading` |
| Loading never spins forever: after 12 s → "הטעינה נמשכת יותר מהרגיל" + retry + recap/stats | PASS | [live] hung fetch, 13 s |
| Temporary failure (502/504) → "לא ניתן לטעון…" / "מקור הנתונים לא הגיב בזמן" + "נסו שוב" + recap/stats (`role=alert`) | PASS | [live] game page and `/` |
| Network failure / non-JSON 200 / bad-shape 200 → distinct Hebrew detail, retry | PASS | [live] `network`, `malformed`, `badshape` |
| Failure not cached: retry after 502/slow loads the real replay | PASS | [live] game page (after slow) and `/` (after 502) |
| 200 `unavailable` with reason → reason text (`no_game_end` → "נתוני המהלכים נקטעים…") + recap/stats buttons (working: switched to נתונים) | PASS | [live] |
| `game_not_final` → title "המשחק עדיין לא הסתיים" | PASS | [live] |
| Unknown reason code → generic "אין מספיק נתונים אמינים…" | PASS | [live] + [code] test |
| 404 → `unknown_event` text | PASS | [live] |
| Every `REASON_CODES` + `CLIENT_REASONS` value has a Hebrew message; no stale keys; generic fallback | PASS | [code] `tests/replay-messages.test.js` |
| No ESPN id → no request, "המשחק אינו מקושר לנתוני המהלכים של ESPN…" | PASS | [code] hook test `reports no_espn_id without fetching` + message test (no such game available live) |
| Third tab always present (static `TABS`), not gated on `game.story` | PASS | [code] GameView; [live] tab present in every state |
| Limited banner "שחזור חלקי" listing gaps from capabilities | PASS | [live] "איבודים של K. George אינם זמינים." |
| Missing probability → "הסתברות ניצחון אינה זמינה למשחק זה" (W16) + banner line | PASS | [live] payload with `probability: []` |
| Stat-family gap legend in team-table footer (only that team's notes) | PASS | [live] injected game-scope `stl` gap + real player gaps |
| Lineup fallback labelled (header, section row, caption, banner) | PASS | [live] injected `lineups` unavailable |

## R40 — accessibility and motion

| Check | Result | How |
| --- | --- | --- |
| Semantic tables: `<caption>` (sr-only), `scope=col/row/colgroup` | PASS | [live] caption text read from DOM |
| Stat labels: short label `aria-hidden` + sr-only full name (e.g. "נק׳" → "נקודות"), `abbr title` tooltip | PASS | [live] |
| Keyboard-only walkthrough, game page (1024 px): Tab order next-moment → play → range → speed → restart → "רגעי מפתח עד כה" → team tab → table scroller → bench → out; prev disabled at start (skipped); hidden sticky-bar button inert | PASS | [live] |
| Keys: Enter on next ×2 → moment 1; Space on play → playing; K → paused (focus kept); ← → next moment; Enter on summary opens list; Enter on list item seeks; →/← team tabs (RTL, clamped); Enter on bench expands | PASS | [live] |
| Keyboard-only walkthrough, desktop home preview `/`: same Tab order; Space plays; ← next moment; ↓ inside replay does not switch sibling game | PASS | [live] |
| Visible focus on all replay controls (2px brand outline, `.replayRoot :focus-visible`; range via track ring; team tabs; scroller; bench; list buttons; message buttons) | PASS | [live] computed outline on bench toggle; [code] |
| Slider labelled "מיקום בשחזור" with `aria-valuetext` (replay + game clock) | PASS | [code] W16, unchanged |
| Reached-moments list: only reached captions, current marked `aria-current` + text "נוכחי"; seeking back removes later items (3 → 1) | PASS | [live] + [code] test (never future, matches spotlight, all fixtures) |
| Live region: moment captions only, rate-limited to one per 4 s (fast moment jumps collapse to latest) | PASS | [live] after 3 quick jumps region showed the 1st, then the latest after 4 s; [code] `announceDelay` test |
| Reduced motion: all replay animations/transitions removed (catch-all under `prefers-reduced-motion`), static cues kept (changed-cell weight/outline, unseen-activity dot) | PASS | [live, emulated] media rules applied unconditionally in page → animated/transitioning elements 4 → 0; [env] no native media emulation in the pane; [code] audit of `replay.module.css` (score flash, spotlight-in, probSeg, cell-changed, row-in, tab-activity, sticky bar, skeleton pulse) |
| No color-only signals: team identity = logo + name/abbr; changed cells = weight + outline; unavailable = "—" + sr "לא זמין" + footer legend; activity = dot + sr "פעילות חדשה"; moment dots decorative (`aria-hidden`), list gives text | PASS | [code] |
| Portraits: none loaded; spotlight uses initials; team logos via `TeamLogo` (initials fallback `onError`) | PASS | [code] no `<img>`/headshot in replay components besides `TeamLogo` |
| Ledger item: 320 px column headers lost under sticky bar → sticky header copy pinned below the bar (140 px; 96 px when bar hidden <520 px tall), horizontally synced with the table | PASS | [live] 320×600 and 1024×768 screenshots; scrollLeft sync −228/−228 |
| Page-level horizontal overflow at 320 px | FIXED | [live] found `scrollWidth 517` at 320 px: absolutely positioned sr-only labels in cells escaped the table scroller; `.statScroll { position: relative }` → 320 |

## Environment notes

- The browser pane only advances rendering frames (rAF, IntersectionObserver delivery) while a screenshot is taken; sticky-header and bar visibility were confirmed via screenshots.
- Narrow-width emulation reported a 517 px layout viewport until the overflow above was fixed; afterwards 320 px layout matched.
- Reduced motion verified by applying the stylesheet's own `prefers-reduced-motion` rules in-page (cascade identical), not by OS-level emulation.

## Gate D verdict

PASS for R39–R40 on `/game/[id]` and the desktop home preview, with the items above. Open for W20: native review of the new Hebrew copy (messages/banner/legend) together with W09 captions.
