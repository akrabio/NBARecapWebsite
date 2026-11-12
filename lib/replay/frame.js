// One synchronized replay frame (task R31). Browser-safe, pure.
//
// Every replay subview (scoreboard, probability, spotlight, controls, team
// tables) renders from the SAME frame object, derived from one playback
// position, so they can never disagree about the event index:
//
//   {
//     sec,          // replay position (seconds of condensed playback)
//     durationSec,  // replay length
//     frame,        // timeline.js frameAt(): eventIndex, segment, hold, period, ended
//     state,        // replayStateAt(replay, frame.eventIndex): running score/stats/lineups/probability
//     changes,      // replayChangesAt(replay, frame.eventIndex) | null (cells changed by that event)
//     event,        // replay.events[frame.eventIndex] | null (null before tip-off)
//     spotlight,    // spotlightAt() + { highlight, state } | null — `state` is the SNAPSHOT
//                   //   at the moment's own eventIndex, not the running state
//     nav,          // momentNav(): { prev, next } seek targets
//     probability,  // { samples: reached samples (eventIndex ≤ frame.eventIndex), current }
//   }
//
// Cost split: `timeFields` is cheap (segment lookup + a scan over ≤ ~15
// moments) and runs every tick; `eventFields` / `spotlightFields` reconstruct
// state and are meant to be memoized by eventIndex (they only change when an
// event is revealed or a new moment is reached). `createFrameDeriver` does
// that memoization (last event index / last spotlight moment); `deriveFrame`
// composes all three without memoization (tests, one-off use).

import { replayChangesAt, replayStateAt } from "./client-state.js";
import { frameAt, momentNav, spotlightAt } from "./timeline.js";

/** Number of probability samples with eventIndex ≤ i (samples are in event order). */
function reachedCount(samples, i) {
  let lo = 0;
  let hi = samples.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].eventIndex <= i) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Cheap, per-tick fields: the timeline frame, moment navigation and spotlight pointer. */
export function timeFields(replay, sec) {
  const { timeline } = replay;
  const frame = frameAt(timeline, sec);
  return {
    sec: frame.replaySec,
    durationSec: timeline.durationSec,
    frame,
    nav: momentNav(timeline, frame.replaySec),
    spotlight: spotlightAt(timeline, frame.replaySec),
  };
}

/** State-derived fields for one event index (memoize by eventIndex). */
export function eventFields(replay, eventIndex) {
  const state = replayStateAt(replay, eventIndex);
  const samples = Array.isArray(replay.probability) ? replay.probability : [];
  return {
    state,
    changes: eventIndex >= 0 ? replayChangesAt(replay, eventIndex) : null,
    event: eventIndex >= 0 ? (replay.events?.[eventIndex] ?? null) : null,
    probability: {
      samples: samples.slice(0, reachedCount(samples, eventIndex)),
      current: state.probability ?? null,
    },
  };
}

/**
 * Spotlight snapshot for a `spotlightAt()` result (memoize by its eventIndex /
 * highlightId). The state is taken at the moment's own eventIndex so values
 * stay "as of the highlight" while the running state advances.
 */
export function spotlightFields(replay, spotlight) {
  if (!spotlight) return null;
  const highlight = (replay.highlights ?? []).find((h) => h.id === spotlight.highlightId) ?? null;
  return { highlight, state: replayStateAt(replay, spotlight.eventIndex) };
}

/** Combine the parts into the frame object handed to every subview. */
export function composeFrame(time, event, spot) {
  return {
    sec: time.sec,
    durationSec: time.durationSec,
    frame: time.frame,
    state: event.state,
    changes: event.changes,
    event: event.event,
    spotlight: time.spotlight && spot ? { ...time.spotlight, ...spot } : null,
    nav: time.nav,
    probability: event.probability,
  };
}

/** Full frame at a replay second (unmemoized). */
export function deriveFrame(replay, sec) {
  const time = timeFields(replay, sec);
  return composeFrame(time, eventFields(replay, time.frame.eventIndex), spotlightFields(replay, time.spotlight));
}

/**
 * Memoizing frame source for one payload: `derive(sec)` recomputes state only
 * when the frame's eventIndex (or the spotlight moment) changes, so the
 * returned `state` / `spotlight.state` objects are reused between ticks and
 * can serve as cheap change keys. Treat returned objects as read-only.
 */
export function createFrameDeriver(replay) {
  let eventKey = null;
  let event = null;
  let spotKey = null;
  let spot = null;
  return function derive(sec) {
    const time = timeFields(replay, sec);
    if (eventKey !== time.frame.eventIndex) {
      eventKey = time.frame.eventIndex;
      event = eventFields(replay, eventKey);
    }
    const nextSpotKey = time.spotlight ? `${time.spotlight.highlightId}@${time.spotlight.eventIndex}` : null;
    if (spotKey !== nextSpotKey) {
      spotKey = nextSpotKey;
      spot = spotlightFields(replay, time.spotlight);
    }
    return composeFrame(time, event, spot);
  };
}

/**
 * Initial stats team, chosen once per game: the reader's favorite when it
 * plays in this game, otherwise home (a home favorite and "no favorite /
 * not involved" both resolve to home). `favorite` and `awayTeam` are the
 * site's team names (`game.away_team`); the payload's English team `name` is
 * accepted too. Returns a payload team id.
 */
export function defaultTeamId(replay, { favorite, awayTeam } = {}) {
  const { home, away } = replay.teams;
  if (favorite && (favorite === awayTeam || favorite === away.name)) return away.id;
  return home.id;
}
