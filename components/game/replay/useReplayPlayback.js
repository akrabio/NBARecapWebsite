"use client";

// React adapter for the replay playback clock (tasks R21–R22).
//
// const { snapshot, containerRef, play, pause, toggle, seek, setSpeed, restart } =
//   useReplayPlayback({ gameKey, durationSec, active });
// <div ref={containerRef}>…replay…</div>
//
// - One controller (`lib/replay/playback.js`) per (gameKey, durationSec). It is
//   created in an effect and destroyed on unmount or when either key changes,
//   so position/speed/RAF never leak to another game. Before the controller
//   exists (first render, server render) `snapshot` is IDLE_SNAPSHOT and the
//   actions are no-ops.
// - `active` (from GameView: replay tab selected, game view mounted): false →
//   pause; play() is ignored while inactive. Back to true → stays paused at the
//   same position and speed (no auto-resume).
// - `document.visibilitychange` to hidden → pause. Returning does not resume.
//   The controller's gap guard also prevents catch-up if frames stall without a
//   visibility event.
// - `containerRef` (returned callback ref, optional to attach): put it on the
//   element that renders the replay. If it is
//   (or becomes) zero-sized — e.g. `display:none` from responsive CSS on the
//   desktop homepage preview — playback pauses and play() is ignored until it
//   has a size again. Detected with ResizeObserver (display:none reports 0×0);
//   it does not check scroll visibility.

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPlaybackController } from "@/lib/replay/playback";

export const IDLE_SNAPSHOT = Object.freeze({ positionSec: 0, playing: false, speed: 1, ended: false, active: false });

// Stable per-component external store wrapping the current controller (or none).
function createControllerHolder() {
  let controller = null;
  let unsubscribe = null;
  const listeners = new Set();
  const emit = () => {
    for (const fn of [...listeners]) fn();
  };
  return {
    get: () => controller,
    set(next) {
      unsubscribe?.();
      unsubscribe = null;
      controller = next;
      if (next) unsubscribe = next.subscribe(emit);
      emit();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getSnapshot: () => (controller ? controller.getSnapshot() : IDLE_SNAPSHOT),
  };
}

const getServerSnapshot = () => IDLE_SNAPSHOT;

function browserClock() {
  return {
    now: () => performance.now(),
    requestFrame: (cb) => window.requestAnimationFrame(cb),
    cancelFrame: (id) => window.cancelAnimationFrame(id),
  };
}

const isZeroSize = (el) => !el || el.getClientRects().length === 0 || el.offsetWidth === 0 || el.offsetHeight === 0;

export function useReplayPlayback({ gameKey, durationSec, active = true } = {}) {
  const [holder] = useState(createControllerHolder);
  const [hiddenBySize, setHiddenBySize] = useState(false);
  const snapshot = useSyncExternalStore(holder.subscribe, holder.getSnapshot, getServerSnapshot);

  // One controller per game + duration; destroyed (RAF cancelled) on change/unmount.
  useEffect(() => {
    if (gameKey == null || !Number.isFinite(durationSec)) return undefined;
    const controller = createPlaybackController({ durationSec, ...browserClock() });
    holder.set(controller);
    return () => {
      controller.destroy();
      if (holder.get() === controller) holder.set(null);
    };
  }, [holder, gameKey, durationSec]);

  // Active = caller says active and the container is not hidden by CSS.
  // gameKey/durationSec are deps so a freshly created controller gets the flag.
  const effectiveActive = Boolean(active) && !hiddenBySize;
  useEffect(() => {
    holder.get()?.setActive(effectiveActive);
  }, [holder, effectiveActive, gameKey, durationSec]);

  // Hidden document → pause; no auto-resume on return.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") holder.get()?.pause();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [holder]);

  // Responsive hiding of the container (e.g. display:none) → inactive.
  // `containerRef` is a callback ref, so containers that mount late (behind a
  // loading state) or are swapped for another element are (re)observed.
  const [containerEl, containerRef] = useState(null);
  useEffect(() => {
    if (!containerEl || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => setHiddenBySize(isZeroSize(containerEl)));
    observer.observe(containerEl);
    return () => {
      observer.disconnect();
      setHiddenBySize(false);
    };
  }, [containerEl]);

  const actions = useMemo(
    () => ({
      play: () => {
        if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
        holder.get()?.play();
      },
      pause: () => holder.get()?.pause(),
      toggle: () => {
        const c = holder.get();
        if (!c) return;
        if (c.getSnapshot().playing) c.pause();
        else if (document.visibilityState !== "hidden") c.play();
      },
      seek: (sec) => holder.get()?.seek(sec),
      setSpeed: (x) => holder.get()?.setSpeed(x),
      restart: () => holder.get()?.restart(),
    }),
    [holder],
  );

  return { snapshot, containerRef, ...actions };
}
