// Team-table helpers for the replay UI (tasks R35–R36). Browser-safe and pure;
// the only import is display.js (itself import-free), so the client bundle
// never pulls in the server-side builder/validator.
//
// - Rows: the current on-court five in stable SLOT order (lineups.js keeps a
//   slot per player; an entering player takes the leaving player's slot), then
//   everyone else on the team in payload order (starters in box order, bench
//   by jersey). Never sorted by points, so names do not jump around.
// - Roster fallback: an invalid lineup (or a lineup capability marked
//   unavailable) yields `fallback: true` with every team player in payload
//   order and no on-court claim.
// - DNP: the payload's `dnp` flag comes from the final box score and is never
//   read here (it would reveal future decisions before tip-off).
// - Cells: unavailable families (per `familyAvailable`, the client mirror of
//   validate.js `capabilityFor`) are "—" with `unavailable: true`, distinct
//   from a supported 0 / "0/0".
// - Change emphasis / activity: derived from the event patches between two
//   rendered event indices, and only for a small FORWARD step (natural
//   playback). Seeks, moment jumps, restarts and the first render yield none.

import { familyAvailable } from "./display.js";

/** Max events advanced between two renders that still count as natural forward playback (same as the scoreboard). */
export const NATURAL_STEP = 12;

/**
 * Stat columns, in display order. `counters` are the state counters each
 * column reads (and whose patch changes emphasize the cell); `ratio` columns
 * render made/attempted.
 */
export const TABLE_COLUMNS = Object.freeze([
  { key: "pts", label: "נק׳", title: "נקודות", family: "pts", counters: ["pts"] },
  { key: "fg", label: "שדה", title: "קליעות/ניסיונות מהשדה", family: "fg", counters: ["fgm", "fga"], ratio: true },
  { key: "tpt", label: "3נק׳", title: "שלשות/ניסיונות", family: "tpt", counters: ["tpm", "tpa"], ratio: true },
  { key: "ft", label: "עונשין", title: "קליעות/ניסיונות עונשין", family: "ft", counters: ["ftm", "fta"], ratio: true },
  { key: "reb", label: "ריב׳", title: "ריבאונדים", family: "reb", counters: ["reb", "oreb", "dreb"] },
  { key: "ast", label: "אס׳", title: "אסיסטים", family: "ast", counters: ["ast"] },
  { key: "to", label: "איב׳", title: "איבודים", family: "to", counters: ["to"] },
  { key: "stl", label: "חט׳", title: "חטיפות", family: "stl", counters: ["stl"] },
  { key: "blk", label: "חס׳", title: "חסימות", family: "blk", counters: ["blk"] },
]);

const COLUMN_BY_COUNTER = new Map(TABLE_COLUMNS.flatMap((c) => c.counters.map((k) => [k, c.key])));

/**
 * Rows for one team at a state.
 * `{ fallback, onCourt: playerId[] (slot order; empty in fallback), bench: playerId[], pendingSubs: eventIndex[] }`.
 * In fallback `bench` holds the whole roster (shown without an on-court claim).
 */
export function teamRows(replay, state, teamId, capabilities) {
  const roster = (replay?.players ?? []).filter((p) => p.teamId === teamId).map((p) => p.id);
  const lineup = state?.lineups?.teams?.[teamId];
  const eventIndex = state?.eventIndex;
  const pendingSubs = (state?.lineups?.pendingSubs ?? []).filter((i) => replay?.events?.[i]?.teamId === teamId);
  const capable = familyAvailable(capabilities, "lineups", { teamId, eventIndex });
  const onCourt = lineup?.valid && capable && Array.isArray(lineup.onCourt) ? lineup.onCourt.filter((id) => roster.includes(id)) : [];
  if (onCourt.length === 0) return { fallback: true, onCourt: [], bench: roster, pendingSubs };
  const on = new Set(onCourt);
  return { fallback: false, onCourt, bench: roster.filter((id) => !on.has(id)), pendingSubs };
}

/**
 * One table cell. `{ text, unavailable, zero }` — unavailable → "—" (never 0);
 * ratio columns "m/a"; `zero` marks a supported 0 / "0/0" (dimmed, still shown).
 */
export function cellValue(row, column, available = true) {
  if (!available) return { text: "—", unavailable: true, zero: false };
  const r = row ?? {};
  if (column.ratio) {
    const [made, att] = column.counters.map((k) => r[k] ?? 0);
    return { text: `${made}/${att}`, unavailable: false, zero: att === 0 };
  }
  const v = r[column.counters[0]] ?? 0;
  return { text: String(v), unavailable: false, zero: v === 0 };
}

/** Whether a column's family is available for a player at an event (player/team/game scope). */
export function columnAvailable(capabilities, column, player, eventIndex) {
  return familyAvailable(capabilities, column.family, { playerId: player?.id, teamId: player?.teamId, eventIndex });
}

/** True when moving from `fromIndex` to `toIndex` is a small forward step (natural playback). */
export function isNaturalStep(fromIndex, toIndex, playing = true) {
  if (!playing || !Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) return false;
  const step = toIndex - fromIndex;
  return step > 0 && step <= NATURAL_STEP;
}

/**
 * Cells changed by the events in (fromIndex, toIndex], as `Set<"playerId:columnKey">`.
 * Empty unless it is a natural forward step (see `isNaturalStep`).
 */
export function changedCells(replay, fromIndex, toIndex, { playing = true } = {}) {
  const out = new Set();
  if (!isNaturalStep(fromIndex, toIndex, playing)) return out;
  const patches = replay?.state?.patches ?? [];
  for (let i = fromIndex + 1; i <= toIndex; i++) {
    for (const [id, counters] of Object.entries(patches[i]?.players ?? {})) {
      for (const k of Object.keys(counters)) {
        const col = COLUMN_BY_COUNTER.get(k);
        if (col) out.add(`${id}:${col}`);
      }
    }
  }
  return out;
}

/**
 * Teams whose PLAYERS recorded a stat in (fromIndex, toIndex] during natural
 * forward playback — the tab activity cue. Team-only events (team rebounds,
 * technicals …) and substitutions do not count. `Set<teamId>`.
 */
export function activityTeams(replay, fromIndex, toIndex, { playing = true } = {}) {
  const out = new Set();
  if (!isNaturalStep(fromIndex, toIndex, playing)) return out;
  const teamOf = new Map((replay?.players ?? []).map((p) => [p.id, p.teamId]));
  const patches = replay?.state?.patches ?? [];
  for (let i = fromIndex + 1; i <= toIndex; i++) {
    for (const [id, counters] of Object.entries(patches[i]?.players ?? {})) {
      const teamId = teamOf.get(id);
      if (teamId && Object.keys(counters).some((k) => COLUMN_BY_COUNTER.has(k))) out.add(teamId);
    }
  }
  return out;
}

/** Players present in `onCourt` but not in `previous` (the entering players of an applied substitution group). */
export function enteredPlayers(previous, onCourt) {
  if (!Array.isArray(previous) || previous.length === 0 || !Array.isArray(onCourt)) return [];
  const before = new Set(previous);
  return onCourt.filter((id) => !before.has(id));
}

/**
 * Next tab index for a key in a horizontal RTL tablist (tabs laid out
 * right-to-left, first tab on the right): ArrowLeft → next, ArrowRight →
 * previous (both clamp, no wrap — same convention as GameView's game tabs);
 * Home → first, End → last. Null for other keys.
 */
export function rtlTabIndex(key, current, count) {
  if (count <= 0) return null;
  const clamp = (i) => Math.max(0, Math.min(count - 1, i));
  if (key === "ArrowLeft") return clamp(current + 1);
  if (key === "ArrowRight") return clamp(current - 1);
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}
