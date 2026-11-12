// Client loader for the game replay (task R28).
//
//   loadReplay(espnId, { signal })  → Promise<{ state, data, reasons }>
//   useReplayData(espnId, { enabled }) → { state, data, error, reasons, retry }
//
// `state` is 'idle' | 'loading' | 'ready' | 'limited' | 'unavailable' | 'error'.
//
// Cache policy (module-level, per browser tab):
// - Key = `${espnId}:v${REPLAY_SCHEMA_VERSION}`, so a schema bump never reuses
//   an old-shape payload.
// - Concurrent loads of one key share ONE fetch (deduplicated).
// - Bounded LRU of REPLAY_CACHE_MAX (6) games. ready/limited bodies live for
//   READY_TTL_MS; a 200 `unavailable` body only for UNAVAILABLE_TTL_MS (the
//   game may still be in progress). Failures (network, 4xx, 5xx, malformed
//   body) are NEVER cached, so the next open/retry refetches.
//
// Abort/ownership policy: the shared fetch is reference-counted. A consumer's
// `signal` only detaches that consumer (its promise rejects with AbortError);
// the shared request keeps running for everyone else. Only when the LAST
// consumer detaches before completion is the shared request aborted and
// forgotten, so a later consumer starts a fresh one instead of joining a dead
// request. One unmounting view therefore cannot poison another's load.
//
// The hook only fetches while `enabled` (GameView mounts the replay view after
// the replay tab is first selected) and once per key/attempt — never per
// playback frame. Results are tagged with their key, so a late response for a
// previous game can never be shown for the current one.

import { useCallback, useEffect, useState } from "react";
import { REPLAY_SCHEMA_VERSION } from "@/lib/replay/types";

export const REPLAY_CACHE_MAX = 6;
export const READY_TTL_MS = 10 * 60 * 1000;
export const UNAVAILABLE_TTL_MS = 60 * 1000;

/** Local (client-only) reason codes, in addition to the server's REASON_CODES. */
export const CLIENT_REASONS = Object.freeze({
  NO_ESPN_ID: "no_espn_id",
  INVALID_ID: "invalid_id", // 400
  UNKNOWN_EVENT: "unknown_event", // 404
});

const STATUSES = new Set(["ready", "limited", "unavailable"]);

const cache = new Map(); // key → { result, expiresAt } (Map order = LRU order)
const inflight = new Map(); // key → { promise, controller, consumers, done }

export class ReplayLoadError extends Error {
  constructor(message, { status = null, code = "network" } = {}) {
    super(message);
    this.name = "ReplayLoadError";
    this.status = status;
    this.code = code; // 'invalid_id' | 'unknown_event' | 'upstream' | 'http' | 'network' | 'bad_response'
  }
}

/** Numeric ESPN event id as a string, or null (same format as lib/espn.js). */
export function normalizeEspnId(espnId) {
  const id = typeof espnId === "number" ? String(espnId) : espnId;
  return typeof id === "string" && /^\d{1,12}$/.test(id) ? id : null;
}

export const replayCacheKey = (id) => `${id}:v${REPLAY_SCHEMA_VERSION}`;

/** Clears cache and forgets in-flight requests (tests / dev). */
export function resetReplayCache() {
  cache.clear();
  inflight.clear();
}

/** Cached result for an id without touching LRU order (safe during render). */
export function peekReplay(espnId) {
  const id = normalizeEspnId(espnId);
  if (!id) return null;
  const entry = cache.get(replayCacheKey(id));
  return entry && Date.now() < entry.expiresAt ? entry.result : null;
}

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  cache.delete(key); // refresh LRU position
  cache.set(key, entry);
  return entry.result;
}

function setCached(key, result) {
  const ttl = result.state === "unavailable" ? UNAVAILABLE_TTL_MS : READY_TTL_MS;
  cache.delete(key);
  cache.set(key, { result, expiresAt: Date.now() + ttl });
  while (cache.size > REPLAY_CACHE_MAX) cache.delete(cache.keys().next().value);
}

const abortError = () => {
  const error = new Error("Replay request aborted");
  error.name = "AbortError";
  return error;
};

export const isAbortError = (error) => error?.name === "AbortError";

// Minimal shape check; the full contract is enforced by the server builder.
function validateBody(body, id) {
  const bad = (why) => new ReplayLoadError(`Unexpected replay response: ${why}`, { status: 200, code: "bad_response" });
  if (!body || typeof body !== "object") throw bad("not an object");
  if (body.schemaVersion !== REPLAY_SCHEMA_VERSION) throw bad(`schemaVersion ${body.schemaVersion}`);
  if (!STATUSES.has(body.status)) throw bad(`status ${body.status}`);
  if (String(body.espnGameId) !== id) throw bad("espnGameId mismatch");
  if (body.status === "unavailable") return { ...body, replay: null };
  const r = body.replay;
  if (
    !r ||
    !r.teams?.home ||
    !r.teams?.away ||
    !Array.isArray(r.events) ||
    !r.state?.initial ||
    !Array.isArray(r.state.patches) ||
    !Array.isArray(r.timeline?.segments) ||
    !Number.isFinite(r.timeline?.durationSec)
  ) {
    throw bad("incomplete replay payload");
  }
  return body;
}

async function fetchReplay(id, signal) {
  let response;
  try {
    response = await fetch(`/api/replay/${id}`, { signal });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ReplayLoadError("Replay request failed", { code: "network" });
  }
  if (response.status === 400) throw new ReplayLoadError("Invalid replay id", { status: 400, code: CLIENT_REASONS.INVALID_ID });
  if (response.status === 404) throw new ReplayLoadError("Unknown game", { status: 404, code: CLIENT_REASONS.UNKNOWN_EVENT });
  if (response.status === 502 || response.status === 504) {
    throw new ReplayLoadError(`Replay source failed: ${response.status}`, { status: response.status, code: "upstream" });
  }
  if (!response.ok) throw new ReplayLoadError(`Replay request failed: ${response.status}`, { status: response.status, code: "http" });
  let body;
  try {
    body = await response.json();
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ReplayLoadError("Replay response is not JSON", { status: response.status, code: "bad_response" });
  }
  const data = validateBody(body, id);
  return { state: data.status, data, reasons: Array.isArray(data.reasons) ? data.reasons : [] };
}

function acquire(key, id) {
  let shared = inflight.get(key);
  if (!shared) {
    const controller = new AbortController();
    shared = { controller, consumers: 0, done: false, promise: null };
    const entry = shared;
    entry.promise = fetchReplay(id, controller.signal).then(
      (result) => {
        entry.done = true;
        if (inflight.get(key) === entry) inflight.delete(key);
        if (!controller.signal.aborted) setCached(key, result);
        return result;
      },
      (error) => {
        entry.done = true;
        if (inflight.get(key) === entry) inflight.delete(key);
        throw error; // never cached
      },
    );
    entry.promise.catch(() => {}); // consumers observe it; avoid unhandled rejections
    inflight.set(key, entry);
  }
  shared.consumers++;
  return shared;
}

/**
 * Load the replay for a numeric ESPN id. Resolves for 200 bodies
 * (`state` = body status); rejects with ReplayLoadError for 4xx/5xx/network/
 * malformed bodies, or AbortError when `signal` aborts this consumer.
 */
export function loadReplay(espnId, { signal } = {}) {
  const id = normalizeEspnId(espnId);
  if (!id) return Promise.resolve({ state: "unavailable", data: null, reasons: [CLIENT_REASONS.NO_ESPN_ID] });
  if (signal?.aborted) return Promise.reject(abortError());
  const key = replayCacheKey(id);
  const cached = getCached(key);
  if (cached) return Promise.resolve(cached);

  const shared = acquire(key, id);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      shared.consumers--;
      fn(value);
    };
    const onAbort = () => {
      finish(reject, abortError());
      if (shared.consumers === 0 && !shared.done) {
        if (inflight.get(key) === shared) inflight.delete(key);
        shared.controller.abort();
      }
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    shared.promise.then(
      (result) => finish(resolve, result),
      (error) => finish(reject, error),
    );
  });
}

const IDLE = Object.freeze({ state: "idle", data: null, error: null, reasons: [] });
const LOADING = Object.freeze({ state: "loading", data: null, error: null, reasons: [] });
const NO_ID = Object.freeze({ state: "unavailable", data: null, error: null, reasons: [CLIENT_REASONS.NO_ESPN_ID] });

const fromResult = (r) => ({ state: r.state, data: r.data, error: null, reasons: r.reasons });
function fromError(error) {
  // 400/404 are permanent for this id: show "unavailable", but still uncached.
  if (error?.status === 400 || error?.status === 404) return { state: "unavailable", data: null, error, reasons: [error.code] };
  return { state: "error", data: null, error, reasons: [] };
}

/**
 * React hook over loadReplay. Fetches only while `enabled`; cancels (detaches)
 * its consumer on unmount, id change or disable. `retry()` refetches after an
 * error (failures are never cached).
 *
 * Every load — including a cache hit, which loadReplay resolves without a
 * request — is stored in hook state tagged with its key. Once a successful
 * result is held for the current key it keeps being shown: cache TTL/eviction
 * only affects FUTURE loads and never unmounts a loaded replay. The render-time
 * `peekReplay` fallback only bridges the first render before the cached load
 * resolves.
 */
export function useReplayData(espnId, { enabled = true } = {}) {
  const id = normalizeEspnId(espnId);
  const key = id ? replayCacheKey(id) : null;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null); // { key, attempt, ...view }

  useEffect(() => {
    if (!enabled || !id) return undefined;
    const controller = new AbortController();
    loadReplay(id, { signal: controller.signal }).then(
      (r) => setResult({ key, attempt, ...fromResult(r) }),
      (error) => {
        if (!isAbortError(error)) setResult({ key, attempt, ...fromError(error) });
      },
    );
    return () => controller.abort();
  }, [enabled, id, key, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const held = result && result.key === key ? result : null;
  let view;
  if (!enabled) view = IDLE;
  else if (!id) view = NO_ID;
  else if (held && (held.attempt === attempt || held.data)) view = held; // a loaded replay stays loaded
  else {
    const cached = peekReplay(id);
    view = cached ? fromResult(cached) : LOADING;
  }
  return { state: view.state, data: view.data, error: view.error, reasons: view.reasons, retry };
}
