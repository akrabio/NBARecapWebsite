// Versioned replay builder (task R23).
//
// `buildReplay(summary, { config })` composes the pure replay modules into the
// API body (`BuildResult` in types.js):
//
//   size cap → normalizeGame → buildStateIndex → validateReplay
//     → (unavailable: replay null, no highlights)
//     → buildHighlights → captionFor (per highlight) → buildTimeline
//     → compact client payload
//
// Pure and deterministic: no Date.now / randomness / I/O; the same summary and
// config give byte-identical `JSON.stringify` output. The input is never
// mutated. Only the fields listed below are copied out of the ESPN summary —
// never news, articles, videos, standings, odds or HTML.
//
// Size cap: before any heavy work, inputs with more than `maxPlays` plays,
// `maxPlayers` box-score players or `maxProbabilitySamples` win-probability
// entries are rejected as `unavailable` with `input_too_large` (array lengths
// only — the summary is never stringified). A regulation NBA game has ~450–
// 600 plays; 1500 leaves room for several overtimes.
//
// Client payload (`replay`, null when unavailable):
// - `teams` {home, away}: id, side, abbreviation, name, shortName, nameHe
//   (`nbaShortHe`, null when unknown), color / alternateColor (hex without
//   "#", null when absent), logo (default ESPN logo URL or null).
// - `players[]`: id, teamId, name, shortName, jersey, position, starter, dnp,
//   dnpReason (only when dnp). Per team (home, away): starters in box order,
//   then bench by jersey number, then name (box bench order leaks minutes).
// - `events[]` (index = array position): index, period, clock ("M:SS" or
//   "S.s" under a minute, null when unknown), clockSec, kind, teamId,
//   score {home, away} (source scoreAfter), roles (verified role IDs only —
//   used to highlight changed cells and sub enter/leave), optional made /
//   points / value (attempt value 2|3), subGroup (substitution group id).
//   No text, no source IDs, no issues.
// - `state` {initial, patches}: see "State transport" below.
// - `probability[]`: linked samples {eventIndex, home} (+ tie when the source
//   gives one; + derived: true only for synthesized samples, never in the
//   corpus). Also the source of `state.probability` on the client.
// - `highlights[]`: id, type, eventIndex (hold boundary = group end),
//   keyEventIndex, groupStartIndex, groupEndIndex, playerIds, teamIds,
//   caption {text, parts} | null. NO evidence / captionParams / importance
//   (in particular never `evidence.verification`).
// - `timeline`: version, durationSec, targetSec, segments, moments, periods,
//   lastEventIndex — usable unchanged with timeline.js `frameAt`,
//   `momentNav`, `spotlightAt`, `scrubberMarkers`.
// - `format` {regulationPeriods, regulationSec, overtimeSec}, `durationSec`.
// Capabilities, warnings and reasons live on the envelope, not in `replay`.
//
// Captions are precomputed server-side (text + bidi-safe parts) so the client
// never ships the Hebrew templates or caption logic; parts are plain strings
// that the UI must render as text nodes (see captions.js).
//
// State transport (decision): the payload carries the full initial state
// (index -1) and one small patch per event; NO server checkpoints. A patch
// holds only what changed after that event, as NEW values (not increments):
//   { score?: {home, away}, creditedScore?: {home, away},
//     players?: {id: {counter: value}}, teams?: {teamId: {counter: value}},
//     unattributed?: {teamId: {counter: value}},
//     lineups?: {teamId: TeamLineup}  (whole team lineup replaced),
//     pendingSubs?: number[], probability?: StateProbability | null }
// `state.probability` is NOT repeated per event: the client carries the latest
// `replay.probability` sample at or before the event forward (the server
// rule); a patch carries `probability` only as an override if the two ever
// disagree.
// Patches are computed by diffing consecutive server states (the same
// `stepState` reducer `stateAt` uses), so applying them reproduces the server
// state exactly, whatever the lineup/stat rules are — the client needs no
// stats/lineups logic. Patch keys also tell the UI which cells changed. The
// browser-safe `client-state.js` (`replayStateAt`) builds in-memory
// checkpoints once per payload and applies the bounded patch suffix on seek.
// Measured on the largest fixture (OT, 568 events): initial state + patches
// ≈ 49 KB raw — about the size of server checkpoints every 50 events (51 KB),
// but those would also need the full normalized events and the stats/lineup
// reducers in the browser. Whole payload ≈ 185 KB raw / 23 KB gzip; per-
// fixture sizes in docs/replay-implementation/core-audit.md.

import { nbaShortHe } from "../../utils/consts.js";
import { captionFor } from "./captions.js";
import { buildHighlights } from "./highlights.js";
import { normalizeGame } from "./normalize.js";
import { buildStateIndex, initialState, stateContext, stepState } from "./state.js";
import { buildTimeline } from "./timeline.js";
import { CAPABILITY_FAMILIES as F, CAPABILITY_LEVELS as L, REASON_CODES as R, REPLAY_SCHEMA_VERSION } from "./types.js";
import { validateReplay } from "./validate.js";

/** Bump when builder output changes for the same schema (cache key input). */
export const BUILDER_VERSION = 1;

export const BUILD_LIMITS = Object.freeze({
  maxPlays: 1500,
  maxPlayers: 60,
  maxProbabilitySamples: 3000,
});

const str = (v) => (v == null || v === "" ? null : String(v));
const len = (v) => (Array.isArray(v) ? v.length : 0);

function unavailableCapabilities(reasons) {
  return Object.values(F).map((family) => ({ family, level: L.UNAVAILABLE, reasons: [...reasons], scope: "game" }));
}

function envelope({ status, espnGameId, capabilities, warnings, reasons, replay }) {
  return { schemaVersion: REPLAY_SCHEMA_VERSION, builderVersion: BUILDER_VERSION, status, espnGameId, capabilities, warnings, reasons, replay };
}

/** Cheap size check on array lengths only. Returns a detail string when over a limit. */
function oversize(summary, limits) {
  const checks = [
    ["plays", len(summary?.plays), limits.maxPlays],
    ["boxscore players", (Array.isArray(summary?.boxscore?.players) ? summary.boxscore.players : []).reduce((a, g) => a + (Array.isArray(g?.statistics) ? g.statistics.reduce((b, s) => b + len(s?.athletes), 0) : 0), 0), limits.maxPlayers],
    ["winprobability", len(summary?.winprobability), limits.maxProbabilitySamples],
  ];
  const over = checks.find(([, n, max]) => n > max);
  return over ? `${over[0]}: ${over[1]} > ${over[2]}` : null;
}

/** "M:SS" (whole seconds, floor) or "S.s" under a minute; null when unknown. */
export function clockDisplay(sec) {
  if (typeof sec !== "number" || !Number.isFinite(sec) || sec < 0) return null;
  if (sec >= 60) {
    const whole = Math.floor(sec);
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
  }
  return (Math.floor(sec * 10 + 1e-6) / 10).toFixed(1);
}

function teamPayload(team, summary) {
  const comp = (summary?.header?.competitions?.[0]?.competitors ?? []).find((c) => c?.homeAway === team.side);
  const t = comp?.team ?? {};
  const logos = Array.isArray(t.logos) ? t.logos : [];
  const logo = logos.find((l) => Array.isArray(l?.rel) && l.rel.includes("default") && !l.rel.includes("dark")) ?? logos[0];
  const hex = (c) => (typeof c === "string" && /^[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : null);
  const href = typeof logo?.href === "string" && /^https:\/\//.test(logo.href) ? logo.href : null;
  return {
    id: team.id,
    side: team.side,
    abbreviation: team.abbreviation,
    name: team.name,
    shortName: team.shortName,
    nameHe: nbaShortHe[team.name] ?? null,
    color: hex(t.color),
    alternateColor: hex(t.alternateColor),
    logo: href,
  };
}

// `dnp` / `dnpReason` come from the FINAL box score. The UI must not surface
// DNP before tip-off (index -1 / early frames) unless the player is known to
// be inactive (e.g. a pre-game inactive reason); otherwise it reveals future
// coaching decisions.
function playerPayload(p) {
  const out = { id: p.id, teamId: p.teamId, name: p.name, shortName: p.shortName, jersey: p.jersey ?? null, position: p.position ?? null, starter: p.starter === true, dnp: p.didNotPlay === true };
  if (out.dnp && p.dnpReason) out.dnpReason = p.dnpReason;
  return out;
}

// Per team (home, then away): starters in box order, then the bench by jersey
// number (non-numeric/missing last), then name — box order of the bench
// reflects minutes played, which would leak the future.
function orderPlayers(players, teamIds) {
  const jersey = (p) => (p.jersey != null && /^\d+$/.test(p.jersey) ? Number(p.jersey) : Infinity);
  const byBench = (a, b) => jersey(a) - jersey(b) || String(a.jersey ?? "").localeCompare(String(b.jersey ?? "")) || String(a.name ?? "").localeCompare(String(b.name ?? "")) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return teamIds.flatMap((teamId) => {
    const team = players.filter((p) => p.teamId === teamId);
    return [...team.filter((p) => p.starter), ...team.filter((p) => !p.starter).sort(byBench)];
  });
}

function eventPayload(e) {
  const out = {
    index: e.index,
    period: e.period,
    clock: clockDisplay(e.clockRemainingSec),
    clockSec: e.clockRemainingSec,
    kind: e.kind,
    teamId: e.teamId,
    score: { home: e.scoreAfter?.home ?? null, away: e.scoreAfter?.away ?? null },
  };
  if (e.roles && Object.keys(e.roles).length) out.roles = e.roles;
  const d = e.detail ?? {};
  if (typeof d.made === "boolean") out.made = d.made;
  if (typeof d.points === "number" && d.points) out.points = d.points;
  if (d.attemptValue === 2 || d.attemptValue === 3) out.value = d.attemptValue;
  if (e.substitutionGroup != null) out.subGroup = e.substitutionGroup;
  return out;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Changed counters per id, as new values. */
function counterPatch(prev, next) {
  let out = null;
  for (const id of Object.keys(next)) {
    const p = prev[id] ?? {};
    let changed = null;
    for (const [k, v] of Object.entries(next[id])) {
      if (p[k] !== v) (changed ??= {})[k] = v;
    }
    if (changed) (out ??= {})[id] = changed;
  }
  return out;
}

/** Patch turning state `prev` into `next` (see header). Throws on shapes it cannot express. */
export function statePatch(prev, next) {
  const patch = {};
  if (!same(prev.score, next.score)) patch.score = next.score;
  if (!same(prev.creditedScore, next.creditedScore)) patch.creditedScore = next.creditedScore;
  for (const key of ["players", "teams", "unattributed"]) {
    for (const id of Object.keys(prev[key])) {
      if (!(id in next[key]) || Object.keys(prev[key][id]).some((k) => !(k in next[key][id]))) throw new Error(`statePatch: ${key}.${id} lost a key`);
    }
    const p = counterPatch(prev[key], next[key]);
    if (p) patch[key] = p;
  }
  const lineups = {};
  for (const id of Object.keys(next.lineups.teams)) if (!same(prev.lineups.teams[id], next.lineups.teams[id])) lineups[id] = next.lineups.teams[id];
  if (Object.keys(lineups).length) patch.lineups = lineups;
  if (!same(prev.lineups.pendingSubs, next.lineups.pendingSubs)) patch.pendingSubs = next.lineups.pendingSubs;
  if (!same(prev.probability, next.probability)) patch.probability = next.probability;
  return patch;
}

/** Wire probability samples: {eventIndex, home} (+ tie when the source gives one, derived only when true). */
function probabilityPayload(samples) {
  return (samples ?? []).map((s) => {
    const out = { eventIndex: s.eventIndex, home: s.home };
    if (s.tie != null) out.tie = s.tie;
    if (s.derived === true) out.derived = true;
    return out;
  });
}

/** What client-state.js derives from a wire sample (must mirror `applySample` there). */
const sampleState = (s) => ({ home: s.home, tie: s.tie ?? null, sourceEventIndex: s.eventIndex, derived: s.derived === true });

/** Initial state + one patch per event, from the server reducer. */
// Probability is not repeated in patches: the client carries the latest wire
// sample at or before each event forward. A patch keeps `probability` only if
// the server state ever differs from that rule (never in the corpus).
function stateTransport(normalized, samples) {
  const ctx = stateContext(normalized);
  const initial = initialState(normalized, ctx).state;
  const byEvent = new Map(samples.map((s) => [s.eventIndex, s]));
  const patches = [];
  let prev = initial;
  let clientProbability = initial.probability;
  for (const event of normalized.events) {
    const { state } = stepState(prev, event, ctx);
    const patch = statePatch(prev, state);
    const sample = byEvent.get(event.index);
    if (sample) clientProbability = sampleState(sample);
    if (same(clientProbability, state.probability)) delete patch.probability;
    else {
      patch.probability = state.probability;
      clientProbability = state.probability;
    }
    patches.push(patch);
    prev = state;
  }
  return { initial: structuredClone(initial), patches };
}

function highlightPayload(h, normalized) {
  const caption = captionFor(h, normalized);
  return {
    id: h.id,
    type: h.type,
    eventIndex: h.eventIndex,
    keyEventIndex: h.keyEventIndex ?? h.eventIndex,
    groupStartIndex: h.groupStartIndex ?? h.keyEventIndex ?? h.eventIndex,
    groupEndIndex: h.groupEndIndex ?? h.eventIndex,
    playerIds: [...(h.playerIds ?? [])],
    teamIds: [...(h.teamIds ?? [])],
    caption: caption ? { text: caption.text, parts: caption.parts } : null,
  };
}

function timelinePayload(tl) {
  const { version, durationSec, targetSec, segments, moments, periods, lastEventIndex } = tl;
  return { version, durationSec, targetSec, segments, moments, periods, lastEventIndex };
}

/**
 * Build the replay API body.
 *
 * @param {object} summary  ESPN summary (never mutated)
 * @param {{ config?: { limits?: Partial<typeof BUILD_LIMITS>, validate?: object, highlights?: object, timeline?: object } }} [options]
 * @returns {import("./types.js").BuildResult}
 */
export function buildReplay(summary, { config = {} } = {}) {
  const limits = { ...BUILD_LIMITS, ...config.limits };
  const espnGameIdRaw = str(summary?.header?.id ?? summary?.header?.competitions?.[0]?.id);

  const tooLarge = oversize(summary, limits);
  if (tooLarge) {
    const reasons = [R.INPUT_TOO_LARGE];
    return envelope({ status: "unavailable", espnGameId: espnGameIdRaw, capabilities: unavailableCapabilities(reasons), warnings: [{ code: R.INPUT_TOO_LARGE, count: 1, detail: tooLarge }], reasons, replay: null });
  }

  const normalized = normalizeGame(summary);
  const stateIndex = normalized.teams && normalized.events.length ? buildStateIndex(normalized) : undefined;
  const v = validateReplay(normalized, stateIndex, config.validate);
  const base = { status: v.status, espnGameId: normalized.espnGameId ?? espnGameIdRaw, capabilities: v.capabilities, warnings: v.warnings, reasons: v.reasons };
  if (v.status === "unavailable") return envelope({ ...base, replay: null });

  const { highlights } = buildHighlights(normalized, { stateIndex, capabilities: v.capabilities, config: config.highlights });
  const timeline = buildTimeline(normalized, highlights, { config: config.timeline });
  const { home, away } = normalized.teams;
  const probability = probabilityPayload(normalized.probability);

  const replay = {
    format: { ...normalized.format },
    teams: { home: teamPayload(home, summary), away: teamPayload(away, summary) },
    players: orderPlayers(normalized.players, [home.id, away.id]).map(playerPayload),
    events: normalized.events.map(eventPayload),
    state: stateTransport(normalized, probability),
    probability,
    highlights: highlights.map((h) => highlightPayload(h, normalized)),
    timeline: timelinePayload(timeline),
    durationSec: timeline.durationSec,
  };
  return envelope({ ...base, replay });
}
