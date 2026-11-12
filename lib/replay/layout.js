// Replay layout decisions (task R37). Browser-safe, zero imports.
//
// The team-stats layout is chosen from the REPLAY CONTAINER's own content
// width (measured with ResizeObserver in ReplayView), never the window width:
// on desktop the 400px games sidebar takes part of the window, so a 1280px
// window leaves only ~850px for the replay.
//
// Threshold: a team table is name (118px) + 9 stat columns × 44px = 514px wide
// (replay.module.css `.statTable` min-width). Side by side with a 14px gap,
// each table gets (width − 14) / 2. At BOTH_MIN_WIDTH = 960 each table gets
// ≥ 473px: name, PTS and 7 of the remaining 8 columns are visible, at most
// one column (BLK) scrolls. Below that, two tables would each hide 3+ columns
// behind a horizontal scroll, so the one-team tabs (as on mobile) are used.
// Measured live (W18): 1440px window + sidebar → content 1008px → 'both'
// (tables 497px, 17px of scroll); 1280px → 848px → 'tabs'; 1024px → 592px → 'tabs'.

export const TABLE_MIN_WIDTH = 118 + 9 * 44;
export const TABLES_GAP = 14;
export const BOTH_MIN_WIDTH = 960;

/** 'both' | 'tabs' for a measured container content width; `fallback` when unmeasured/hidden (0). */
export function tableLayoutFor(width, fallback = "tabs") {
  if (!Number.isFinite(width) || width <= 0) return fallback;
  return width >= BOTH_MIN_WIDTH ? "both" : "tabs";
}

/**
 * Compact sticky score bar (shown once the broadcast panel scrolls away),
 * pinned under the site's 52px top bar + 44px game tabs. 96 + 44px bar =
 * 140px; at 520px viewport height that still leaves ~380px (≈ 8 player rows
 * of 42px). Shorter viewports (landscape phones) get no sticky bar — enforced
 * by the `max-height: 519px` rule in replay.module.css.
 */
export const STICKY_TOP = 52 + 44;
export const STICKY_MIN_VIEWPORT_HEIGHT = 520;
