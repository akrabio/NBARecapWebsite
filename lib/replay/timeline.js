// Replay timeline: fast spans, holds, frame lookup and moment navigation
// (tasks R19–R20).
//
// Pure and deterministic: consumes `normalizeGame(...)` output and
// `buildHighlights(...).highlights`, never mutates them, reads no clock, uses
// no randomness. Output is plain JSON (no Maps/functions), so it can be
// serialized into the replay payload; the lookups below work on that JSON.
//
// Replay time is NOT game time × a constant (contracts.md "Identity and
// time"). It is built from a budget:
//
//   1. Holds first. Every highlight gets one hold segment at its `eventIndex`
//      (state AFTER that event; the game state does not advance during the
//      hold). Hold length is this module's own rule (`holdSecFor`): a base by
//      highlight type, +`lateBonusSec` for moments in the finish (period ≥ the
//      last regulation period with ≤ `lateClockSec` left, or any overtime),
//      clamped to [minSec, maxSec]. It deliberately ignores `importance` and
//      the W08 `holdSec` placeholder, because importance includes the
//      decisive-lead boost, which depends on the future.
//   2. Target duration: `targetSec` + `overtimeExtraSec` per overtime period
//      − `settled.trimSec` × (share of last-regulation-period events played
//      with a settled margin), clamped to [minSec, maxSec] (the upper end is
//      allowed for OT games; blowouts end earlier instead of being stretched).
//   3. Fast time = target − holds. If that falls below `minFastSec`, the
//      target first grows (up to maxSec); only then are holds scaled down,
//      never below `hold.minSec`. Pathological inputs that still do not fit
//      exceed maxSec with a `timeline_over_budget` issue rather than
//      producing unreadable holds.
//   4. Fast time is split over events by weight (`eventWeight`):
//        kindWeight × periodWeight × finish/settled factor
//      - periodWeight emphasizes later periods (illustrative 12/15/18/40 s
//        allocation of the design doc) and every overtime.
//      - In periods ≥ the last regulation period, events with a CLOSE margin
//        (score before the event, i.e. known at that point of the replay) get
//        up to (1 + finish.maxBoost)× as the clock runs down (finish window).
//      - Events where the margin before them is already "settled" for the
//        remaining regulation time (≥ baseMargin + perMinute × minutes left)
//        are accelerated (× settled.factor). Blowouts therefore end quickly
//        without stretching to fill two minutes.
//      - Substitution groups (same period/clock) carry their weight on the
//        first member and 0 on the rest, so the whole group is revealed at
//        one instant: a frame never lands between the members of a group.
//        A highlight whose eventIndex is a non-final group member has its
//        hold snapped to the group end (`timeline_hold_snapped_to_group_end`
//        issue; moment/segment keep `snappedFromEventIndex`).
//
// Segments (W11 interface `{ durationSec, segments:[{kind, startSec, endSec}] }`),
// contiguous, half-open [startSec, endSec), covering [0, durationSec]:
//   fast: { kind:"fast", startSec, endSec, fromEventIndex, toEventIndex,
//           revealSec: number[] (absolute replay second at which each event
//           from..to is applied; non-decreasing; last = endSec),
//           eventsPerSec }  — `eventsPerSec` is a visual-batching hint only:
//           the UI may coalesce DOM updates, but every event still advances
//           the state (eventIndex is exact at every replay second).
//   hold: { kind:"hold", startSec, endSec, fromEventIndex = toEventIndex =
//           eventIndex, eventIndex, highlightId, momentIndex }
// Fast segments' event intervals are contiguous and cover 0..N−1 exactly.
// All times are rounded to milliseconds.
//
// Frame semantics (`frameAt`):
//   - sec ≤ 0 → eventIndex −1 (the 0–0 start state).
//   - inside a fast segment → from − 1 + (number of reveals ≤ sec).
//   - inside a hold → the hold's eventIndex (constant for the whole hold);
//     the hold starts exactly when its event has been revealed.
//   - sec ≥ durationSec → last event index (final state).
//   Period of a frame = period of the current event (period 1 at −1), so a
//   period starts at the reveal of its first event; a hold at a PERIOD_END
//   (overtime moment) belongs to the period that just ended.
//
// Moment navigation (`momentNav`): targets are each moment's hold start.
// prev = the last moment starting before `sec − toleranceSec`, excluding the
// moment whose hold contains `sec`; next = the first moment starting after
// `sec + toleranceSec`. Default tolerance 0.25 s: after seeking to a moment
// (or while its hold plays) "next"/"prev" never re-select it, and
// next→prev round-trips back to the same moment.
//
// Spotlight (`spotlightAt`): the most recently REACHED moment (hold start ≤
// sec) with its own eventIndex (for a snapshot state) — separate from the
// running frame, so the UI can keep a caption after the hold while the tables
// keep advancing (the UI must label snapshot values as such).

import { EVENT_KINDS as K } from "./types.js";

export const TIMELINE_VERSION = 1;

/** Tunable defaults. Override any top-level key via `options.config` (shallow per key). */
export const TIMELINE_CONFIG = deepFreeze({
  targetSec: 90,
  minSec: 60,
  maxSec: 120,
  overtimeExtraSec: 12, // per overtime period, before clamping to maxSec
  minFastSec: 50, // fast spans are shortened down to this before holds are touched
  hold: {
    minSec: 1.2, // minimum readable hold
    maxSec: 2.4,
    defaultSec: 1.5,
    lateBonusSec: 0.3,
    lateClockSec: 120,
    byType: {
      overtime: 2,
      game_end: 2.2,
      missed_final_attempt: 2,
      big_shot: 1.8,
      lead_change: 1.7,
      first_lead_since: 1.7,
      first_lead: 1.6,
      go_ahead: 1.6,
      tie: 1.6,
      steal: 1.5,
      block: 1.5,
      foul_out: 1.5,
      lead_milestone: 1.5,
      turnover: 1.3,
    },
  },
  kindWeights: {
    field_goal: 1,
    free_throw: 0.6,
    rebound: 0.45,
    turnover: 0.7,
    foul: 0.5,
    technical: 0.4,
    violation: 0.4,
    substitution: 0.35, // per substitution GROUP (carried by its first member)
    jump_ball: 0.5,
    timeout: 0.3,
    review: 0.2,
    period_end: 0.6,
    game_end: 0.3,
    other: 0.2,
  },
  periodWeights: { 1: 1, 2: 1.2, 3: 1.45 }, // earlier regulation periods; missing → 1
  lastRegulationWeight: 1.9,
  overtimeWeight: 2.1,
  finish: { windowSec: 360, closeMargin: 5, farMargin: 12, maxBoost: 1.6 }, // periods ≥ last regulation period
  // margin ≥ base + perMinute × regulation minutes left; the target shrinks by trimSec × (share of
  // last-regulation-period events that are settled), so a blowout is not stretched to fill the budget.
  settled: { baseMargin: 10, perMinute: 1.5, factor: 0.35, trimSec: 15 },
  momentToleranceSec: 0.25,
});

function deepFreeze(v) {
  if (v && typeof v === "object" && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v)) deepFreeze(v[k]);
  }
  return v;
}

const ms = (x) => Math.round(x * 1000) / 1000;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const lerp01 = (x, a, b) => (b === a ? (x <= a ? 0 : 1) : clamp((x - a) / (b - a), 0, 1));

function mergeConfig(override) {
  if (!override) return TIMELINE_CONFIG;
  const out = { ...TIMELINE_CONFIG };
  for (const [k, v] of Object.entries(override)) {
    out[k] = v && typeof v === "object" && !Array.isArray(v) && TIMELINE_CONFIG[k] && typeof TIMELINE_CONFIG[k] === "object" ? { ...TIMELINE_CONFIG[k], ...v } : v;
  }
  return out;
}

const regulationPeriodsOf = (normalized) => normalized?.format?.regulationPeriods ?? 4;
const regulationSecOf = (normalized) => normalized?.format?.regulationSec ?? 720;

/** "Q1".."Q4", "OT1".. (UI localizes). */
export function periodLabel(period, regulationPeriods = 4) {
  if (!Number.isInteger(period) || period < 1) return null;
  return period <= regulationPeriods ? `Q${period}` : `OT${period - regulationPeriods}`;
}

/**
 * Hold duration rule (seconds). Type base + finish bonus, clamped. Uses only
 * facts known at the moment (type, period, clock) — never importance.
 */
export function holdSecFor(highlight, event, regulationPeriods = 4, config = TIMELINE_CONFIG) {
  const h = config.hold;
  let sec = h.byType[highlight?.type] ?? h.defaultSec;
  const late = event && Number.isInteger(event.period) && (event.period > regulationPeriods || (event.period === regulationPeriods && event.clockRemainingSec != null && event.clockRemainingSec <= h.lateClockSec));
  if (late) sec += h.lateBonusSec;
  return ms(clamp(sec, h.minSec, h.maxSec));
}

/** Margin (home − away) BEFORE each event, from source-backed scoreAfter with carry. */
function marginsBefore(events) {
  const out = new Array(events.length);
  let home = 0;
  let away = 0;
  for (let i = 0; i < events.length; i++) {
    out[i] = home - away;
    const s = events[i].scoreAfter;
    if (Number.isFinite(s?.home)) home = s.home;
    if (Number.isFinite(s?.away)) away = s.away;
  }
  return out;
}

/** Per-event fast-span weights (see header). */
export function eventWeights(normalized, config = TIMELINE_CONFIG) {
  return weighEvents(normalized, config).weights;
}

function weighEvents(normalized, config) {
  const events = normalized.events ?? [];
  const reg = regulationPeriodsOf(normalized);
  const regSec = regulationSecOf(normalized);
  const margins = marginsBefore(events);
  const { finish, settled } = config;
  const weights = new Array(events.length);
  let finishEvents = 0;
  let settledFinishEvents = 0;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    let kw = config.kindWeights[e.kind] ?? config.kindWeights.other ?? 0.2;
    // Substitution groups: whole weight on the first member → revealed at once.
    if (e.kind === K.SUBSTITUTION && e.substitutionGroup != null && i > 0 && events[i - 1].kind === K.SUBSTITUTION && events[i - 1].substitutionGroup === e.substitutionGroup) kw = 0;
    const p = Number.isInteger(e.period) ? e.period : 1;
    const pw = p > reg ? config.overtimeWeight : p === reg ? config.lastRegulationWeight : (config.periodWeights[p] ?? 1);
    let factor = 1;
    const abs = Math.abs(margins[i]);
    const clock = e.clockRemainingSec;
    if (p >= reg && clock != null) {
      const urgency = 1 - lerp01(clock, 0, finish.windowSec); // 1 at 0:00, 0 at ≥ window
      const close = 1 - lerp01(abs, finish.closeMargin, finish.farMargin);
      factor *= 1 + finish.maxBoost * urgency * close;
    }
    if (p <= reg && clock != null) {
      const minutesLeft = ((reg - p) * regSec + clock) / 60;
      if (abs >= settled.baseMargin + settled.perMinute * minutesLeft) {
        factor *= settled.factor;
        if (p === reg) settledFinishEvents++;
      }
    }
    if (p === reg) finishEvents++;
    weights[i] = kw * pw * factor;
  }
  return { weights, settledFinishShare: finishEvents ? settledFinishEvents / finishEvents : 0 };
}

/**
 * Build the replay timeline.
 *
 * @param {object} normalized  `normalizeGame(...)` output
 * @param {import("./types.js").Highlight[]} highlights  selected highlights (any order)
 * @param {{ config?: object }} [options]
 * @returns {{ version: number, durationSec: number, targetSec: number, segments: object[],
 *   moments: { index: number, highlightId: string, type: string, eventIndex: number, keyEventIndex: number, startSec: number, endSec: number, holdSec: number }[],
 *   periods: { period: number, label: string, startSec: number, endSec: number, fromEventIndex: number, toEventIndex: number }[],
 *   lastEventIndex: number, issues: { code: string, detail?: string }[] }}
 */
export function buildTimeline(normalized, highlights = [], options = {}) {
  const config = mergeConfig(options.config);
  const events = normalized?.events ?? [];
  const n = events.length;
  const reg = regulationPeriodsOf(normalized);
  const issues = [];
  if (n === 0) return { version: TIMELINE_VERSION, durationSec: 0, targetSec: 0, segments: [], moments: [], periods: [], lastEventIndex: -1, issues: [{ code: "timeline_no_events" }] };

  // Holds in event order (ties by key event, then id).
  const valid = [];
  for (const h of highlights ?? []) {
    if (!Number.isInteger(h?.eventIndex) || h.eventIndex < 0 || h.eventIndex >= n || typeof h.id !== "string") {
      issues.push({ code: "timeline_invalid_highlight", detail: String(h?.id) });
      continue;
    }
    // A hold inside a substitution group would show a half-applied group: snap it to the group end.
    let at = h.eventIndex;
    const g = events[at].kind === K.SUBSTITUTION ? events[at].substitutionGroup : null;
    if (g != null) while (at + 1 < n && events[at + 1].kind === K.SUBSTITUTION && events[at + 1].substitutionGroup === g) at++;
    if (at !== h.eventIndex) issues.push({ code: "timeline_hold_snapped_to_group_end", detail: `${h.id}: ${h.eventIndex} → ${at}` });
    valid.push(at === h.eventIndex ? h : { ...h, eventIndex: at, snappedFromEventIndex: h.eventIndex });
  }
  valid.sort((a, b) => a.eventIndex - b.eventIndex || (a.keyEventIndex ?? 0) - (b.keyEventIndex ?? 0) || a.id.localeCompare(b.id));
  let holds = valid.map((h) => holdSecFor(h, events[h.keyEventIndex] ?? events[h.eventIndex], reg, config));

  // Budget.
  const otPeriods = Math.max(0, Math.max(...events.map((e) => (Number.isInteger(e.period) ? e.period : 1))) - reg);
  const { weights, settledFinishShare } = weighEvents(normalized, config);
  let target = clamp(config.targetSec + otPeriods * config.overtimeExtraSec - config.settled.trimSec * settledFinishShare, config.minSec, config.maxSec);
  let holdTotal = holds.reduce((a, b) => a + b, 0);
  if (target - holdTotal < config.minFastSec) target = Math.min(config.maxSec, holdTotal + config.minFastSec);
  if (target - holdTotal < config.minFastSec && holdTotal > 0) {
    const room = Math.max(0, target - config.minFastSec);
    const scale = room / holdTotal;
    holds = holds.map((s) => ms(Math.max(config.hold.minSec, s * scale)));
    holdTotal = holds.reduce((a, b) => a + b, 0);
  }
  const fastTotal = Math.max(config.minFastSec, target - holdTotal);
  if (fastTotal + holdTotal > config.maxSec + 1e-9) issues.push({ code: "timeline_over_budget", detail: `${ms(fastTotal + holdTotal)}s` });

  // Weights; a segment may never begin with a zero-weight member (it would be revealed at the segment start).
  for (const from of [0, ...valid.map((h) => h.eventIndex + 1)]) {
    if (from < n && weights[from] === 0) weights[from] = config.kindWeights.substitution ?? 0.35;
  }
  const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;

  // Fast-span intervals between holds.
  const segments = [];
  const moments = [];
  let t = 0; // unrounded running position
  let next = 0; // next event to reveal
  const unit = fastTotal / totalWeight;
  const pushFast = (from, to) => {
    if (to < from) return;
    const start = ms(t);
    const revealSec = [];
    for (let i = from; i <= to; i++) {
      t += weights[i] * unit;
      revealSec.push(ms(t));
    }
    let end = revealSec[revealSec.length - 1];
    if (end <= start) {
      // Degenerate (all-zero weights): give it one millisecond.
      t = start + 0.001;
      end = ms(t);
      revealSec[revealSec.length - 1] = end;
    }
    for (let k = 0; k < revealSec.length; k++) revealSec[k] = Math.min(revealSec[k], end);
    segments.push({ kind: "fast", startSec: start, endSec: end, fromEventIndex: from, toEventIndex: to, revealSec, eventsPerSec: ms((to - from + 1) / (end - start)) });
  };
  valid.forEach((h, k) => {
    pushFast(next, h.eventIndex);
    next = Math.max(next, h.eventIndex + 1);
    const start = ms(t);
    t = start + holds[k];
    const end = ms(t);
    const momentIndex = moments.length;
    const snap = h.snappedFromEventIndex != null ? { snappedFromEventIndex: h.snappedFromEventIndex } : {};
    segments.push({ kind: "hold", startSec: start, endSec: end, fromEventIndex: h.eventIndex, toEventIndex: h.eventIndex, eventIndex: h.eventIndex, highlightId: h.id, momentIndex, ...snap });
    moments.push({ index: momentIndex, highlightId: h.id, type: h.type, eventIndex: h.eventIndex, keyEventIndex: h.keyEventIndex ?? h.eventIndex, startSec: start, endSec: end, holdSec: ms(end - start), ...snap });
  });
  pushFast(next, n - 1);
  // Absorb accumulated millisecond rounding into the final segment so durationSec = fast + holds.
  const lastSeg = segments[segments.length - 1];
  const planned = ms(fastTotal + holdTotal);
  if (planned > lastSeg.startSec && (lastSeg.kind === "hold" || planned >= (lastSeg.revealSec.at(-2) ?? lastSeg.startSec))) {
    lastSeg.endSec = planned;
    if (lastSeg.kind === "fast") lastSeg.revealSec[lastSeg.revealSec.length - 1] = planned;
    else moments[moments.length - 1].endSec = planned;
  }
  const durationSec = lastSeg.endSec;

  // Periods: a period starts at the reveal of its first event (period 1 at 0).
  const reveal = revealTimes(segments, n);
  const periods = [];
  for (let i = 0; i < n; i++) {
    const p = Number.isInteger(events[i].period) ? events[i].period : periods.length ? periods[periods.length - 1].period : 1;
    const last = periods[periods.length - 1];
    if (!last || last.period !== p) {
      const startSec = periods.length === 0 ? 0 : reveal[i];
      if (last) last.endSec = startSec;
      periods.push({ period: p, label: periodLabel(p, reg), startSec, endSec: durationSec, fromEventIndex: i, toEventIndex: i });
    } else last.toEventIndex = i;
  }

  return { version: TIMELINE_VERSION, durationSec, targetSec: ms(target), segments, moments, periods, lastEventIndex: n - 1, issues };
}

/** Absolute replay second at which each event is applied (from fast segments). */
export function revealTimes(segments, n) {
  const out = new Array(n);
  for (const s of segments) if (s.kind === "fast") for (let i = s.fromEventIndex; i <= s.toEventIndex; i++) out[i] = s.revealSec[i - s.fromEventIndex];
  return out;
}

// ---------------------------------------------------------------------------
// Lookups (work on the plain-JSON timeline)
// ---------------------------------------------------------------------------

function clampSec(timeline, sec) {
  const x = Number(sec);
  if (!Number.isFinite(x) || x <= 0) return 0;
  return Math.min(x, timeline.durationSec);
}

/** Index of the segment containing sec (half-open; last segment at the end). */
export function segmentIndexAt(timeline, sec) {
  const segs = timeline.segments;
  if (segs.length === 0) return -1;
  let lo = 0;
  let hi = segs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (segs[mid].startSec <= sec) lo = mid;
    else hi = mid - 1;
  }
  // Zero-length segments cannot occur, but stay safe: skip forward while sec is at/after the end.
  while (lo < segs.length - 1 && sec >= segs[lo].endSec) lo++;
  return lo;
}

// Count of values ≤ x in a non-decreasing array.
function upperBound(arr, x) {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function periodAt(timeline, sec) {
  const ps = timeline.periods;
  if (!ps?.length) return null;
  let found = ps[0];
  for (const p of ps) {
    if (p.startSec <= sec && (sec < p.endSec || p === ps[ps.length - 1])) found = p;
  }
  return found;
}

/**
 * Frame at a replay second.
 * @returns {{ replaySec: number, eventIndex: number, segmentIndex: number, segmentKind: "fast"|"hold"|null,
 *   hold: { highlightId: string, momentIndex: number, remainingSec: number } | null,
 *   period: number | null, periodLabel: string | null, ended: boolean }}
 */
export function frameAt(timeline, sec) {
  const replaySec = clampSec(timeline, sec);
  const ended = timeline.durationSec > 0 && replaySec >= timeline.durationSec;
  const segmentIndex = segmentIndexAt(timeline, replaySec);
  const seg = timeline.segments[segmentIndex];
  let eventIndex = -1;
  let hold = null;
  if (!seg || replaySec <= 0) eventIndex = -1;
  else if (ended) eventIndex = timeline.lastEventIndex;
  else if (seg.kind === "hold") {
    eventIndex = seg.eventIndex;
    hold = { highlightId: seg.highlightId, momentIndex: seg.momentIndex, remainingSec: ms(seg.endSec - replaySec) };
  } else eventIndex = seg.fromEventIndex - 1 + upperBound(seg.revealSec, replaySec);
  if (ended && seg?.kind === "hold") hold = null; // the end is the final state, not a running hold
  const p = periodAt(timeline, replaySec);
  return { replaySec, eventIndex, segmentIndex, segmentKind: seg?.kind ?? null, hold, period: p?.period ?? null, periodLabel: p?.label ?? null, ended };
}

/**
 * Previous/next moment targets (seek to `sec` = the moment's hold start).
 * @returns {{ prev: { momentIndex: number, highlightId: string, sec: number } | null, next: { momentIndex: number, highlightId: string, sec: number } | null }}
 */
export function momentNav(timeline, sec, { toleranceSec = TIMELINE_CONFIG.momentToleranceSec } = {}) {
  const x = clampSec(timeline, sec);
  const target = (m) => (m ? { momentIndex: m.index, highlightId: m.highlightId, sec: m.startSec } : null);
  let prev = null;
  let next = null;
  for (const m of timeline.moments) {
    const containing = m.startSec <= x && x < m.endSec;
    if (m.startSec < x - toleranceSec && !containing) prev = m;
    if (!next && m.startSec > x + toleranceSec) next = m;
  }
  return { prev: target(prev), next: target(next) };
}

/**
 * Spotlight: the most recently reached moment (hold start ≤ sec), with its own
 * eventIndex for a snapshot state, independent of the running frame.
 * @returns {{ momentIndex: number, highlightId: string, type: string, eventIndex: number, active: boolean, sinceEndSec: number } | null}
 */
export function spotlightAt(timeline, sec) {
  const x = clampSec(timeline, sec);
  if (x <= 0) return null;
  let m = null;
  for (const c of timeline.moments) {
    if (c.startSec <= x) m = c;
    else break;
  }
  if (!m) return null;
  const active = x < m.endSec && !(timeline.durationSec > 0 && x >= timeline.durationSec);
  return { momentIndex: m.index, highlightId: m.highlightId, type: m.type, eventIndex: m.eventIndex, active, sinceEndSec: active ? 0 : ms(x - m.endSec) };
}

/** Scrubber markers: period boundaries and moment positions in replay seconds. */
export function scrubberMarkers(timeline) {
  return {
    periods: timeline.periods.map((p) => ({ period: p.period, label: p.label, sec: p.startSec })),
    moments: timeline.moments.map((m) => ({ momentIndex: m.index, highlightId: m.highlightId, type: m.type, sec: m.startSec })),
  };
}
