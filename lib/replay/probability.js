// Win-probability join (task R12).
//
// Pure: never mutates its inputs. Joins ESPN `winprobability[]` samples to
// normalized events by `playId` (source-findings §6: the array is in
// sequenceNumber order, so an index join misaligns). Rules:
//
// - A sample is kept only when its `playId` links to exactly one normalized
//   event and `homeWinPercentage` is a finite fraction in [0, 1]. A present
//   `tiePercentage` must also be a finite fraction with home + tie ≤ 1.
// - Unlinked (`probability_unlinked`), invalid (`probability_out_of_range`)
//   and conflicting (`probability_conflict`: two different samples for one
//   play, or a play ID shared by several events) samples are discarded with a
//   game-level issue. Identical repeated samples are kept once.
// - Samples describe the state AFTER their event. There is no pre-tip sample
//   in the corpus; before the first linked sample the probability is unknown
//   (null), never 0.5. Carry-forward is the state module's job and only runs
//   forward from a sample.
// - No sample at all → `probability_missing` (replay stays usable; R33 hides
//   or labels the chart).
// - `synthesizeFinal` (opt-in, off by default) appends a 1/0 sample at the
//   final game-end event when the game is final with a winner and the last
//   linked sample is not already that certainty. It is marked `derived: true`
//   so it is never presented as an ESPN value. The corpus never needs it.

import { EVENT_KINDS as K, REASON_CODES as R } from "./types.js";

const isFraction = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;

/**
 * @param {unknown} winprobability  ESPN `summary.winprobability`
 * @param {import("./types.js").NormalizedEvent[]} events
 * @param {{ synthesizeFinal?: boolean, final?: boolean, finalScore?: { home: number, away: number } | null }} [opts]
 * @returns {{ samples: import("./types.js").ProbabilitySample[], issues: object[] }}
 */
export function joinWinProbability(winprobability, events, { synthesizeFinal = false, final = false, finalScore = null } = {}) {
  const issues = [];
  const indexById = new Map(); // playId -> event index, or -1 when ambiguous
  for (const e of events ?? []) {
    if (!e.sourcePlayId) continue;
    indexById.set(e.sourcePlayId, indexById.has(e.sourcePlayId) ? -1 : e.index);
  }

  const byEvent = new Map(); // eventIndex -> sample | null (null = conflict, discarded)
  const list = Array.isArray(winprobability) ? winprobability : [];
  list.forEach((raw, sampleIndex) => {
    const sourcePlayId = raw?.playId == null ? null : String(raw.playId);
    const where = { sampleIndex, sourcePlayId };
    if (!sourcePlayId || !indexById.has(sourcePlayId)) {
      issues.push({ code: R.PROBABILITY_UNLINKED, ...where, detail: "sample playId not in normalized plays" });
      return;
    }
    const eventIndex = indexById.get(sourcePlayId);
    if (eventIndex === -1) {
      issues.push({ code: R.PROBABILITY_CONFLICT, ...where, detail: "playId shared by several events; association ambiguous" });
      return;
    }
    const home = raw.homeWinPercentage;
    const tieRaw = raw.tiePercentage;
    if (!isFraction(home) || (tieRaw != null && (!isFraction(tieRaw) || home + tieRaw > 1 + 1e-9))) {
      issues.push({ code: R.PROBABILITY_OUT_OF_RANGE, ...where, detail: `home ${JSON.stringify(home ?? null)}, tie ${JSON.stringify(tieRaw ?? null)}` });
      return;
    }
    const sample = { eventIndex, sourcePlayId, home, tie: tieRaw ?? null, derived: false };
    if (!byEvent.has(eventIndex)) {
      byEvent.set(eventIndex, sample);
      return;
    }
    const prev = byEvent.get(eventIndex);
    if (prev && prev.home === sample.home && prev.tie === sample.tie) return; // identical repeat
    if (prev) issues.push({ code: R.PROBABILITY_CONFLICT, ...where, detail: `different samples for one play (${prev.home} vs ${home}); both discarded` });
    else issues.push({ code: R.PROBABILITY_CONFLICT, ...where, detail: "another different sample for an already conflicting play" });
    byEvent.set(eventIndex, null);
  });

  const samples = [...byEvent.values()].filter(Boolean).sort((a, b) => a.eventIndex - b.eventIndex);

  if (synthesizeFinal && final && finalScore && finalScore.home !== finalScore.away) {
    const end = [...(events ?? [])].reverse().find((e) => e.kind === K.GAME_END);
    const home = finalScore.home > finalScore.away ? 1 : 0;
    const last = samples.at(-1);
    if (end && !(last && last.eventIndex >= end.index) && !(last && last.home === home)) {
      samples.push({ eventIndex: end.index, sourcePlayId: end.sourcePlayId, home, tie: 0, derived: true });
    }
  }

  if (!samples.length) issues.push({ code: R.PROBABILITY_MISSING, detail: list.length ? "no valid linked samples" : "winprobability missing or empty" });
  return { samples, issues };
}
