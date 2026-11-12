// Presentation helpers for the replay UI (tasks R32–R34). Browser-safe, pure,
// zero imports: the client bundle must not pull in the server-side builder
// (captions.js → highlights.js → validate.js …), so the few labels the UI
// needs are kept here.

const DEFAULT_REG = 4;

/** "רבע 1"…"רבע 4", then "הארכה", "הארכה 2", … (same wording as captions.js). Null when unknown. */
export function hePeriodLabel(period, regulationPeriods = DEFAULT_REG) {
  if (!Number.isInteger(period) || period < 1) return null;
  const reg = Number.isInteger(regulationPeriods) && regulationPeriods > 0 ? regulationPeriods : DEFAULT_REG;
  if (period <= reg) return `רבע ${period}`;
  const ot = period - reg;
  return ot === 1 ? "הארכה" : `הארכה ${ot}`;
}

/** Replay (playback) time: "M:SS", whole seconds, floor. */
export function formatReplayTime(sec) {
  const whole = Math.max(0, Math.floor(Number.isFinite(sec) ? sec : 0));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/**
 * Game-clock status for a frame: before tip-off (event −1) → "לפני פתיחה";
 * replay end → "סיום"; otherwise the event's period label and clock.
 * `{ label, clock, phase: 'pre'|'live'|'end' }` — clock null when not shown.
 */
export function gameClockStatus(frame, regulationPeriods = DEFAULT_REG) {
  if (frame.frame.ended) {
    const period = frame.event?.period;
    const overtime = Number.isInteger(period) && period > regulationPeriods;
    return { phase: "end", label: overtime ? "סיום · אחרי הארכה" : "סיום", clock: null };
  }
  if (!frame.event || frame.frame.eventIndex < 0) return { phase: "pre", label: "לפני פתיחה", clock: null };
  return { phase: "live", label: hePeriodLabel(frame.event.period, regulationPeriods), clock: frame.event.clock ?? null };
}

/** Scrubber value text: "0:42 מתוך 1:30 · רבע 3 5:12" (game part per gameClockStatus). */
export function scrubberValueText(frame, regulationPeriods = DEFAULT_REG) {
  const status = gameClockStatus(frame, regulationPeriods);
  const game = status.clock ? `${status.label} ${status.clock}` : status.label;
  return `${formatReplayTime(frame.sec)} מתוך ${formatReplayTime(frame.durationSec)} · ${game}`;
}

/** Up to two Latin/Hebrew initials from a player's name, ignoring suffixes ("Jr.", "II"…). */
export function initials(name) {
  if (typeof name !== "string") return "";
  const words = name
    .replace(/[.'’]/g, " ")
    .split(/[\s-]+/)
    .filter((w) => w && !/^(jr|sr|ii|iii|iv|v)$/i.test(w));
  if (words.length === 0) return "";
  const pick = words.length === 1 ? [words[0]] : [words[0], words[words.length - 1]];
  return pick.map((w) => w[0].toUpperCase()).join("");
}

/**
 * Whether a stat family may be shown for a player (game level, then player /
 * team overrides; an interval-scoped team entry applies only inside its
 * interval). Mirrors validate.js `capabilityFor` for the UI's read-only use.
 */
export function familyAvailable(capabilities, family, { playerId, teamId, eventIndex } = {}) {
  if (!Array.isArray(capabilities)) return true;
  for (const c of capabilities) {
    if (c.family !== family || c.level !== "unavailable") continue;
    const scope = c.scope ?? "game";
    if (scope === "game") return false;
    if (scope === "player" && playerId != null && c.players?.includes(playerId)) return false;
    if (scope === "team" && teamId != null && c.teams?.includes(teamId)) {
      const inside = !c.interval || eventIndex == null || (eventIndex >= c.interval.from && eventIndex <= c.interval.to);
      if (inside) return false;
    }
  }
  return true;
}

/** Whether the payload has a usable win-probability series. */
export function probabilityAvailable(replay, capabilities) {
  if (!Array.isArray(replay?.probability) || replay.probability.length === 0) return false;
  return familyAvailable(capabilities, "probability");
}

/** Home/away whole percentages; ties (rare) are split off the away side. Null when unknown. */
export function probabilityPercents(p) {
  if (!p || typeof p.home !== "number" || !Number.isFinite(p.home)) return null;
  const tie = typeof p.tie === "number" && Number.isFinite(p.tie) ? p.tie : 0;
  const home = Math.round(p.home * 100);
  const away = Math.max(0, Math.round((1 - p.home - tie) * 100));
  return { home, away };
}

/** Replay second at which each event is revealed (from the timeline's fast segments). */
export function eventRevealSecs(timeline) {
  const out = new Array(Math.max(0, (timeline?.lastEventIndex ?? -1) + 1)).fill(null);
  for (const seg of timeline?.segments ?? []) {
    if (seg.kind !== "fast" || !Array.isArray(seg.revealSec)) continue;
    for (let k = 0; k < seg.revealSec.length; k += 1) out[seg.fromEventIndex + k] = seg.revealSec[k];
  }
  return out;
}

/**
 * Step path (carry-forward, no interpolation) of reached probability samples
 * in a `width`×`height` box. x = replay time, right-to-left (RTL, matching the
 * scrubber): x(0) = width, x(duration) = 0. y: home probability, up = home.
 * The last value is carried to `uptoSec` (current replay position) when it is
 * finite; pass `null` to stop at the last sample (callers then append `H<x>`).
 * Returns `{ d, end:{x,y} } | null` (null before the first sample).
 */
export function probabilityPath(samples, revealSecs, durationSec, uptoSec, { width = 1000, height = 48, pad = 3 } = {}) {
  if (!samples?.length || !(durationSec > 0)) return null;
  const xOf = (sec) => width - (Math.min(Math.max(sec, 0), durationSec) / durationSec) * width;
  const yOf = (home) => pad + (1 - home) * (height - 2 * pad);
  const r = (v) => Math.round(v * 10) / 10;
  let d = "";
  let lastY = null;
  for (const s of samples) {
    const sec = revealSecs[s.eventIndex] ?? 0;
    const x = r(xOf(sec));
    const y = r(yOf(s.home));
    if (lastY == null) d = `M${x} ${y}`;
    else if (y !== lastY) d += `H${x}V${y}`;
    lastY = y;
  }
  if (!Number.isFinite(uptoSec)) return { d, end: { x: null, y: lastY } };
  const endX = r(xOf(uptoSec));
  d += `H${endX}`;
  return { d, end: { x: endX, y: lastY } };
}

/** x position (0–1 from the start edge) of a replay second on progress tracks. */
export function trackFraction(sec, durationSec) {
  if (!(durationSec > 0)) return 0;
  return Math.min(1, Math.max(0, sec / durationSec));
}

/** Hebrew name of a highlight type (spotlight meta line). */
export const MOMENT_TYPE_LABELS = Object.freeze({
  tie: "שוויון",
  go_ahead: "עלייה ליתרון",
  lead_change: "חילוף יתרון",
  first_lead_since: "חזרה ליתרון",
  first_lead: "יתרון ראשון",
  big_shot: "קליעה גדולה",
  steal: "חטיפה",
  turnover: "איבוד",
  block: "חסימה",
  missed_final_attempt: "ניסיון אחרון",
  foul_out: "הרחקה בעבירות",
  lead_milestone: "פער שיא",
  scoring_run: "ריצה",
  player_milestone: "הישג אישי",
  closing_basket: "סל בסיום רבע",
  missed_late_attempt: "החטאה בסיום",
  period_end: "סיום רבע",
  overtime: "הארכה",
  game_end: "סיום",
});

/**
 * A player's stat line at a state (the spotlight's snapshot), skipping
 * families that are unavailable for that player. `[{key, label, value, ltr}]`.
 */
export function spotlightStatLine(state, player, capabilities, eventIndex) {
  const row = state?.players?.[player?.id];
  if (!row) return [];
  const ok = (family) => familyAvailable(capabilities, family, { playerId: player.id, teamId: player.teamId, eventIndex });
  const items = [];
  if (ok("pts")) items.push({ key: "pts", label: "נק׳", value: String(row.pts ?? 0) });
  if (ok("fg")) items.push({ key: "fg", label: "FG", value: `${row.fgm ?? 0}/${row.fga ?? 0}`, ltr: true });
  if (ok("tpt") && (row.tpa ?? 0) > 0) items.push({ key: "tpt", label: "3PT", value: `${row.tpm ?? 0}/${row.tpa ?? 0}`, ltr: true });
  if (ok("ft") && (row.fta ?? 0) > 0) items.push({ key: "ft", label: "FT", value: `${row.ftm ?? 0}/${row.fta ?? 0}`, ltr: true });
  if (ok("reb")) items.push({ key: "reb", label: "ריב׳", value: String(row.reb ?? 0) });
  if (ok("ast")) items.push({ key: "ast", label: "אס׳", value: String(row.ast ?? 0) });
  if (ok("stl") && (row.stl ?? 0) > 0) items.push({ key: "stl", label: "חט׳", value: String(row.stl) });
  if (ok("blk") && (row.blk ?? 0) > 0) items.push({ key: "blk", label: "חס׳", value: String(row.blk) });
  return items;
}

/**
 * The team a moment belongs to, only when unambiguous: the primary player's
 * team, else a single listed team, else — for `game_end` — the winner by the
 * snapshot score at the moment (`score`: the state at the moment's event). Neutral moments (overtime, tied end, both
 * teams listed) → null: no team badge or color.
 */
export function momentTeamId(highlight, { players, teams, score } = {}) {
  if (!highlight) return null;
  const playerId = highlight.playerIds?.[0];
  const player = playerId ? (players ?? []).find((p) => p.id === playerId) : null;
  if (player?.teamId) return player.teamId;
  const teamIds = Array.isArray(highlight.teamIds) ? highlight.teamIds : [];
  if (teamIds.length === 1) return teamIds[0];
  if (highlight.type === "game_end" && score && teams?.home?.id && teams?.away?.id) {
    const { home, away } = score;
    if (typeof home === "number" && typeof away === "number" && home !== away) return home > away ? teams.home.id : teams.away.id;
  }
  return null;
}

/**
 * Team color readable on the dark broadcast panel: OKLCH colors whose
 * lightness is below `minL` are lifted to `minL` (hue/chroma kept), e.g.
 * Pacers navy. Non-OKLCH strings are returned unchanged.
 */
export function panelColor(color, minL = 0.62) {
  const m = typeof color === "string" ? color.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/) : null;
  if (!m) return color;
  const l = Number(m[1]);
  return l >= minL ? color : `oklch(${minL} ${m[2]} ${m[3]})`;
}
