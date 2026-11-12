import { describe, expect, it } from "vitest";
import { createPlaybackController, DEFAULT_MAX_FRAME_GAP_MS } from "@/lib/replay/playback";

// Fake wall clock + frame scheduler. frame(ms) advances time and runs the
// frames that were pending at that moment (like one RAF tick).
function fakeEnv() {
  let t = 1000;
  let nextId = 1;
  const pending = new Map();
  let requested = 0;
  return {
    now: () => t,
    requestFrame: (cb) => {
      const id = nextId++;
      pending.set(id, cb);
      requested++;
      return id;
    },
    cancelFrame: (id) => pending.delete(id),
    pendingCount: () => pending.size,
    requestedCount: () => requested,
    advance(ms) {
      t += ms;
    },
    frame(ms = 16) {
      t += ms;
      const due = [...pending.values()];
      pending.clear();
      for (const cb of due) cb(t);
    },
    // Run frames of `step` ms until `total` ms have elapsed.
    run(total, step = 16) {
      let left = total;
      while (left > 0) {
        const d = Math.min(step, left);
        this.frame(d);
        left -= d;
      }
    },
  };
}

function setup(durationSec = 10, opts = {}) {
  const env = fakeEnv();
  const changes = [];
  const c = createPlaybackController({ durationSec, ...env, onChange: (s) => changes.push(s), ...opts });
  return { env, c, changes };
}

// Minimal W10-shaped timeline with one hold span; consumer-side mapping.
const timeline = {
  durationSec: 10,
  segments: [
    { kind: "fast", startSec: 0, endSec: 4, fromEvent: 0, toEvent: 40 },
    { kind: "hold", startSec: 4, endSec: 6, eventIndex: 40 },
    { kind: "fast", startSec: 6, endSec: 10, fromEvent: 40, toEvent: 80 },
  ],
};
function eventAt(sec) {
  const seg = timeline.segments.find((s) => sec >= s.startSec && sec < s.endSec) ?? timeline.segments.at(-1);
  if (seg.kind === "hold") return seg.eventIndex;
  const f = Math.min(1, (sec - seg.startSec) / (seg.endSec - seg.startSec));
  return Math.floor(seg.fromEvent + f * (seg.toEvent - seg.fromEvent));
}

describe("playback controller", () => {
  it("starts paused at 0 and validates injected functions", () => {
    const { c } = setup();
    expect(c.getSnapshot()).toEqual({ positionSec: 0, playing: false, speed: 1, ended: false, active: true });
    expect(() => createPlaybackController({ durationSec: 1 })).toThrow(TypeError);
  });

  it("play / pause / resume advances only while playing", () => {
    const { env, c } = setup();
    c.play();
    expect(c.getSnapshot().playing).toBe(true);
    env.run(1000);
    expect(c.getSnapshot().positionSec).toBeCloseTo(1, 9);
    c.pause();
    expect(c.getSnapshot()).toMatchObject({ playing: false, positionSec: expect.closeTo(1, 9) });
    expect(env.pendingCount()).toBe(0);
    env.advance(5000);
    env.frame();
    expect(c.getSnapshot().positionSec).toBeCloseTo(1, 9);
    c.play();
    env.run(500);
    expect(c.getSnapshot().positionSec).toBeCloseTo(1.5, 9);
    c.toggle();
    expect(c.getSnapshot().playing).toBe(false);
    c.toggle();
    expect(c.getSnapshot().playing).toBe(true);
  });

  it("pause mid-hold freezes the remaining hold time and resumes it", () => {
    const { env, c } = setup(timeline.durationSec);
    c.play();
    env.run(4500); // 0.5 s into the 2 s hold
    expect(eventAt(c.getSnapshot().positionSec)).toBe(40);
    c.pause();
    const pausedAt = c.getSnapshot().positionSec;
    expect(pausedAt).toBeCloseTo(4.5, 9);
    env.advance(60_000);
    env.frame();
    expect(c.getSnapshot().positionSec).toBe(pausedAt);
    c.play();
    env.run(1400); // 1.9 s into the hold: still holding
    expect(c.getSnapshot().positionSec).toBeCloseTo(5.9, 9);
    expect(eventAt(c.getSnapshot().positionSec)).toBe(40);
    env.run(200); // hold ends after exactly 1.5 s of remaining playing time
    expect(c.getSnapshot().positionSec).toBeCloseTo(6.1, 9);
    expect(eventAt(c.getSnapshot().positionSec)).toBeGreaterThan(40);
    expect(c.getSnapshot().playing).toBe(true);
  });

  it("speed change mid-play re-anchors without a jump", () => {
    const { env, c, changes } = setup();
    c.play();
    env.run(1000);
    env.advance(10); // wall time passes since the last frame
    c.setSpeed(2);
    const s = c.getSnapshot();
    expect(s.speed).toBe(2);
    expect(s.positionSec).toBeCloseTo(1.01, 9); // credited at old speed
    env.frame(100);
    expect(c.getSnapshot().positionSec).toBeCloseTo(1.21, 9);
    // positions are monotonic and step sizes match speed × wall delta
    const positions = changes.map((x) => x.positionSec);
    for (let i = 1; i < positions.length; i++) expect(positions[i]).toBeGreaterThanOrEqual(positions[i - 1]);
    // speed while paused just applies to the next play
    c.pause();
    c.setSpeed(0.5);
    c.setSpeed(-1);
    c.setSpeed(Number.NaN);
    expect(c.getSnapshot()).toMatchObject({ speed: 0.5, playing: false });
    c.play();
    env.run(1000);
    expect(c.getSnapshot().positionSec).toBeCloseTo(1.71, 9);
  });

  it("repeated play() keeps a single scheduled loop", () => {
    const { env, c } = setup();
    c.play();
    c.play();
    c.play();
    expect(env.pendingCount()).toBe(1);
    expect(env.requestedCount()).toBe(1);
    env.frame(100);
    c.play();
    expect(env.pendingCount()).toBe(1);
    env.frame(100);
    expect(c.getSnapshot().positionSec).toBeCloseTo(0.2, 9);
    // play/pause churn never stacks frames
    for (let i = 0; i < 5; i++) {
      c.pause();
      c.play();
      c.setSpeed(i + 1);
    }
    expect(env.pendingCount()).toBe(1);
  });

  it("seek is bounded and works while playing", () => {
    const { env, c } = setup();
    c.seek(-5);
    expect(c.getSnapshot().positionSec).toBe(0);
    c.seek(Number.NaN);
    expect(c.getSnapshot().positionSec).toBe(0);
    c.seek(3);
    expect(c.getSnapshot()).toMatchObject({ positionSec: 3, playing: false, ended: false });
    c.play();
    env.run(1000);
    c.seek(7);
    expect(c.getSnapshot()).toMatchObject({ positionSec: 7, playing: true });
    env.run(500);
    expect(c.getSnapshot().positionSec).toBeCloseTo(7.5, 9);
    c.seek(2); // backward while playing
    env.run(500);
    expect(c.getSnapshot().positionSec).toBeCloseTo(2.5, 9);
    expect(env.pendingCount()).toBe(1);
    c.seek(999);
    expect(c.getSnapshot()).toEqual({ positionSec: 10, playing: false, speed: 1, ended: true, active: true });
    expect(env.pendingCount()).toBe(0);
    c.seek(4); // leaving the end clears ended
    expect(c.getSnapshot()).toMatchObject({ positionSec: 4, ended: false, playing: false });
  });

  it("ends exactly at duration and stops the loop", () => {
    const { env, c } = setup(2);
    c.play();
    env.run(1990);
    expect(c.getSnapshot()).toMatchObject({ playing: true, ended: false });
    env.frame(16); // overshoots the end
    expect(c.getSnapshot()).toEqual({ positionSec: 2, playing: false, speed: 1, ended: true, active: true });
    expect(env.pendingCount()).toBe(0);
    env.run(1000);
    expect(c.getSnapshot().positionSec).toBe(2);
    c.pause(); // no-op at end
    expect(c.getSnapshot().ended).toBe(true);
  });

  it("play() from the end restarts from zero", () => {
    const { env, c } = setup(1);
    c.play();
    env.run(1100);
    expect(c.getSnapshot().ended).toBe(true);
    c.play();
    expect(c.getSnapshot()).toMatchObject({ positionSec: 0, playing: true, ended: false });
    env.frame(250);
    expect(c.getSnapshot().positionSec).toBeCloseTo(0.25, 9);
  });

  it("restart() returns to 0 paused, keeping speed", () => {
    const { env, c } = setup();
    c.setSpeed(2);
    c.play();
    env.run(1000);
    c.restart();
    expect(c.getSnapshot()).toEqual({ positionSec: 0, playing: false, speed: 2, ended: false, active: true });
    expect(env.pendingCount()).toBe(0);
    c.seek(10);
    c.restart();
    expect(c.getSnapshot()).toMatchObject({ positionSec: 0, ended: false });
  });

  it("setActive(false) pauses; setActive(true) stays paused with position and speed retained", () => {
    const { env, c } = setup();
    c.setSpeed(1.5);
    c.play();
    env.run(1000);
    c.setActive(false);
    expect(c.getSnapshot()).toMatchObject({ playing: false, active: false, speed: 1.5, positionSec: expect.closeTo(1.5, 9) });
    expect(env.pendingCount()).toBe(0);
    c.play(); // ignored while inactive
    expect(c.getSnapshot().playing).toBe(false);
    expect(env.pendingCount()).toBe(0);
    env.run(2000);
    c.setActive(true);
    expect(c.getSnapshot()).toMatchObject({ playing: false, active: true, speed: 1.5, positionSec: expect.closeTo(1.5, 9) });
    c.play();
    env.frame(100);
    expect(c.getSnapshot().positionSec).toBeCloseTo(1.65, 9);
  });

  it("does not catch up after a large wall-clock gap", () => {
    const { env, c } = setup(100);
    c.play();
    env.run(1000);
    const before = c.getSnapshot().positionSec;
    env.frame(30_000); // tab backgrounded: one frame after 30 s
    expect(c.getSnapshot().positionSec).toBeCloseTo(before, 9);
    expect(c.getSnapshot().playing).toBe(true);
    env.frame(16); // continues normally from there
    expect(c.getSnapshot().positionSec).toBeCloseTo(before + 0.016, 9);
    // a gap just under the threshold is credited
    const p = c.getSnapshot().positionSec;
    env.frame(DEFAULT_MAX_FRAME_GAP_MS);
    expect(c.getSnapshot().positionSec).toBeCloseTo(p + DEFAULT_MAX_FRAME_GAP_MS / 1000, 9);
    // a gap before a command (e.g. pause on return) is not credited either
    const q = c.getSnapshot().positionSec;
    env.advance(10_000);
    c.pause();
    expect(c.getSnapshot().positionSec).toBeCloseTo(q, 9);
  });

  it("honors a custom maxFrameGapMs", () => {
    const { env, c } = setup(100, { maxFrameGapMs: 50 });
    c.play();
    env.frame(40);
    env.frame(60);
    expect(c.getSnapshot().positionSec).toBeCloseTo(0.04, 9);
  });

  it("destroy() cancels the frame and silences the controller", () => {
    const { env, c, changes } = setup();
    let notified = 0;
    c.subscribe(() => notified++);
    c.play();
    expect(env.pendingCount()).toBe(1);
    c.destroy();
    expect(env.pendingCount()).toBe(0);
    expect(c.isDestroyed()).toBe(true);
    expect(c.getSnapshot().playing).toBe(false);
    const n = changes.length;
    const m = notified;
    c.play();
    c.seek(5);
    c.setSpeed(3);
    env.run(1000);
    expect(env.pendingCount()).toBe(0);
    expect(changes.length).toBe(n);
    expect(notified).toBe(m);
    expect(c.getSnapshot().positionSec).toBe(0);
  });

  it("subscribe/unsubscribe and stable snapshots", () => {
    const { env, c } = setup();
    const seen = [];
    const off = c.subscribe((s) => seen.push(s));
    const s0 = c.getSnapshot();
    expect(c.getSnapshot()).toBe(s0);
    c.pause(); // no change → no notification, same object
    c.seek(0);
    expect(c.getSnapshot()).toBe(s0);
    expect(seen).toHaveLength(0);
    c.play();
    env.frame(16);
    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(Object.isFrozen(c.getSnapshot())).toBe(true);
    off();
    const k = seen.length;
    env.frame(16);
    expect(seen).toHaveLength(k);
  });

  it("zero or invalid duration ends immediately on play", () => {
    const { env, c } = setup(0);
    c.play();
    expect(c.getSnapshot()).toMatchObject({ positionSec: 0, playing: false, ended: true });
    expect(env.pendingCount()).toBe(0);
  });
});
