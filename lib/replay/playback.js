// Replay playback clock and lifecycle (tasks R21–R22).
//
// Pure and framework-free: no DOM, no React, no game data. The clock and the
// frame scheduler are injected so tests drive time deterministically; the React
// adapter (`components/game/replay/useReplayPlayback.js`) passes
// `performance.now` / `requestAnimationFrame` / `cancelAnimationFrame`.
//
// Timeline interface (W10 must conform). The controller only needs the total
// replay duration; mapping replay time → frame/event is the consumer's job:
//
//   timeline = {
//     durationSec: number,              // total replay time, holds included
//     segments: Array<{ kind: 'fast' | 'hold', startSec, endSec, ... }>,
//   }
//
// Holds are ordinary replay-time spans. The game state is frozen during a hold
// (the consumer maps every position inside it to the same event boundary), but
// this clock keeps advancing, so a hold "resumes automatically" while playing
// and a manual pause freezes the remaining hold time with no special casing.
// Speed scales replay time uniformly, holds included.
//
// Single time source: while playing,
//   positionSec = anchorPosSec + (now() − anchorWallMs) / 1000 × speed
// and every command that changes the rate or the position (play, pause, seek,
// setSpeed, gap recovery) re-anchors first, so there are no jumps. At most one
// frame is ever scheduled, so repeated play() never creates parallel loops.
//
// Snapshot `{ positionSec, playing, speed, ended, active }` is an immutable
// object replaced only on change (safe for `useSyncExternalStore`). Between
// frames it reflects the last sample; it is not recomputed from `now()` on read.
//
// End: when the position reaches `durationSec` → position = duration exactly,
// playing = false, ended = true, frame cancelled. play() from the end (or from
// position = duration) restarts from 0. restart() → 0, paused, not ended.
// seek() clamps to [0, duration]; seeking to duration ends playback, seeking
// elsewhere clears `ended` and keeps playing if it was playing.
//
// Background-gap policy: if the wall-clock time since the last sample exceeds
// `maxFrameGapMs` (default 250 ms — e.g. the tab was backgrounded and frames
// were throttled, or the machine slept), that gap is NOT credited: the clock
// re-anchors at the last sampled position and continues from there ("treat as
// resume"). There is never a catch-up burst. Negative deltas (clock went
// backwards) are likewise ignored.
//
// Lifecycle: setActive(false) pauses and makes play() a no-op until
// setActive(true); reactivation does NOT resume — position and speed are kept,
// paused. destroy() cancels the pending frame, drops subscribers and turns every
// later command into a no-op.

export const DEFAULT_MAX_FRAME_GAP_MS = 250;
export const DEFAULT_SPEED = 1;

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export function createPlaybackController({
  durationSec,
  now,
  requestFrame,
  cancelFrame,
  onChange,
  speed: initialSpeed = DEFAULT_SPEED,
  maxFrameGapMs = DEFAULT_MAX_FRAME_GAP_MS,
} = {}) {
  if (typeof now !== "function" || typeof requestFrame !== "function" || typeof cancelFrame !== "function") {
    throw new TypeError("createPlaybackController requires now, requestFrame and cancelFrame functions");
  }
  const duration = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0;
  const validSpeed = (x) => Number.isFinite(x) && x > 0;

  let snapshot = Object.freeze({
    positionSec: 0,
    playing: false,
    speed: validSpeed(initialSpeed) ? initialSpeed : DEFAULT_SPEED,
    ended: false,
    active: true,
  });
  let anchorPosSec = 0;
  let anchorWallMs = 0;
  let lastSampleMs = 0;
  let frameId = null;
  let destroyed = false;
  const listeners = new Set();

  function commit(patch) {
    const next = { ...snapshot, ...patch };
    if (
      next.positionSec === snapshot.positionSec &&
      next.playing === snapshot.playing &&
      next.speed === snapshot.speed &&
      next.ended === snapshot.ended &&
      next.active === snapshot.active
    ) {
      return;
    }
    snapshot = Object.freeze(next);
    onChange?.(snapshot);
    for (const fn of [...listeners]) fn(snapshot);
  }

  function anchor(positionSec, wallMs) {
    anchorPosSec = positionSec;
    anchorWallMs = wallMs;
    lastSampleMs = wallMs;
  }

  function cancel() {
    if (frameId != null) {
      cancelFrame(frameId);
      frameId = null;
    }
  }

  function schedule() {
    if (frameId == null && !destroyed) frameId = requestFrame(tick);
  }

  // Current position while playing, applying the gap policy. Does not commit.
  function sample(t) {
    const delta = t - lastSampleMs;
    if (delta < 0 || delta > maxFrameGapMs) anchor(snapshot.positionSec, t);
    else lastSampleMs = t;
    return anchorPosSec + ((t - anchorWallMs) / 1000) * snapshot.speed;
  }

  // Bring the snapshot up to date with the wall clock; handles reaching the end.
  function advance(t = now()) {
    if (!snapshot.playing) return;
    const pos = sample(t);
    if (pos >= duration) {
      cancel();
      commit({ positionSec: duration, playing: false, ended: true });
    } else {
      commit({ positionSec: pos });
    }
  }

  function tick() {
    frameId = null;
    if (destroyed || !snapshot.playing) return;
    advance();
    if (snapshot.playing) schedule();
  }

  function play() {
    if (destroyed || !snapshot.active || snapshot.playing) return;
    const from = snapshot.ended || snapshot.positionSec >= duration ? 0 : snapshot.positionSec;
    if (duration <= 0) {
      commit({ positionSec: 0, playing: false, ended: true });
      return;
    }
    anchor(from, now());
    commit({ positionSec: from, playing: true, ended: false });
    schedule();
  }

  function pause() {
    if (destroyed || !snapshot.playing) return;
    advance();
    cancel();
    if (snapshot.playing) commit({ playing: false });
  }

  function toggle() {
    if (snapshot.playing) pause();
    else play();
  }

  function seek(sec) {
    if (destroyed || !Number.isFinite(sec)) return;
    const pos = clamp(sec, 0, duration);
    if (pos >= duration) {
      cancel();
      commit({ positionSec: duration, playing: false, ended: true });
      return;
    }
    if (snapshot.playing) anchor(pos, now());
    commit({ positionSec: pos, ended: false });
  }

  function setSpeed(x) {
    if (destroyed || !validSpeed(x) || x === snapshot.speed) return;
    if (snapshot.playing) {
      const t = now();
      advance(t);
      if (snapshot.playing) anchor(snapshot.positionSec, t);
    }
    commit({ speed: x });
  }

  function restart() {
    if (destroyed) return;
    cancel();
    commit({ positionSec: 0, playing: false, ended: false });
  }

  function setActive(on) {
    if (destroyed) return;
    const active = Boolean(on);
    if (!active) pause();
    commit({ active });
  }

  function subscribe(fn) {
    if (destroyed) return () => {};
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function destroy() {
    if (destroyed) return;
    cancel();
    if (snapshot.playing) snapshot = Object.freeze({ ...snapshot, playing: false });
    destroyed = true;
    listeners.clear();
  }

  return {
    durationSec: duration,
    play,
    pause,
    toggle,
    seek,
    setSpeed,
    restart,
    setActive,
    getSnapshot: () => snapshot,
    subscribe,
    destroy,
    isDestroyed: () => destroyed,
  };
}
