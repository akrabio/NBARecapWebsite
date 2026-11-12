// Browser-safe replay state lookup (task R23).
//
// Reconstructs the frame state from a `buildReplay(...).replay` payload. It
// has NO imports, so it is safe in client bundles (no ESPN fetching, no
// stats/lineup rules, no Node APIs). The payload's `state` is
// `{ initial, patches }`: the state at index -1 plus, per event, the values
// that changed after it (see build.js "State transport"). Applying patches in
// order — carrying the latest `replay.probability` sample at or before each
// event forward as `state.probability` — reproduces the server `stateAt(i)`
// exactly.
//
// Seeking: on first use per payload object, one pass builds in-memory
// checkpoints every `CLIENT_CHECKPOINT_EVERY` events (kept in a WeakMap, so
// they are released with the payload). `replayStateAt` clones the nearest
// checkpoint ≤ i and applies the bounded suffix. Returned states are fresh
// copies; callers may mutate them.

export const CLIENT_CHECKPOINT_EVERY = 32;

const cache = new WeakMap();
const clone = (v) => (typeof structuredClone === "function" ? structuredClone(v) : JSON.parse(JSON.stringify(v)));

function mergeCounters(target, patch) {
  for (const [id, counters] of Object.entries(patch)) {
    const row = target[id] ?? (target[id] = {});
    for (const [k, v] of Object.entries(counters)) row[k] = v;
  }
}

/**
 * Apply one event patch to `state` IN PLACE (state after event `eventIndex`).
 * Patch values are shared, so they are cloned when they are objects.
 */
export function applyStatePatch(state, patch, eventIndex) {
  if (patch.score) state.score = { ...patch.score };
  if (patch.creditedScore) state.creditedScore = { ...patch.creditedScore };
  if (patch.players) mergeCounters(state.players, patch.players);
  if (patch.teams) mergeCounters(state.teams, patch.teams);
  if (patch.unattributed) mergeCounters(state.unattributed, patch.unattributed);
  if (patch.lineups) for (const [id, lineup] of Object.entries(patch.lineups)) state.lineups.teams[id] = clone(lineup);
  if (patch.pendingSubs) state.lineups.pendingSubs = [...patch.pendingSubs];
  if ("probability" in patch) state.probability = patch.probability == null ? null : { ...patch.probability };
  state.eventIndex = eventIndex;
  return state;
}

// Carried probability from a wire sample (must mirror build.js `sampleState`).
const sampleState = (s) => ({ home: s.home, tie: s.tie ?? null, sourceEventIndex: s.eventIndex, derived: s.derived === true });

function indexFor(replay) {
  let idx = cache.get(replay);
  if (idx) return idx;
  const { initial, patches } = replay.state;
  const samples = [];
  for (const s of Array.isArray(replay.probability) ? replay.probability : []) samples[s.eventIndex] = s;
  idx = { checkpoints: [], last: patches.length - 1, samples };
  const working = clone(initial);
  idx.checkpoints.push(clone(working));
  for (let i = 0; i < patches.length; i++) {
    step(working, idx, patches, i);
    if ((i + 1) % CLIENT_CHECKPOINT_EVERY === 0) idx.checkpoints.push(clone(working));
  }
  cache.set(replay, idx);
  return idx;
}

function step(state, idx, patches, i) {
  const sample = idx.samples[i];
  if (sample) state.probability = sampleState(sample);
  applyStatePatch(state, patches[i], i); // an explicit `probability` override wins
}

/**
 * State after event `eventIndex` (clamped to [-1, last]; -1 = 0–0 start).
 * Equal to the server `buildStateIndex(normalized).stateAt(eventIndex)`.
 *
 * @param {{ state: { initial: object, patches: object[] } }} replay  `BuildResult.replay`
 * @param {number} eventIndex
 */
export function replayStateAt(replay, eventIndex) {
  if (!replay?.state?.initial || !Array.isArray(replay.state.patches)) throw new TypeError("replayStateAt: replay payload without state");
  if (!Number.isFinite(eventIndex)) throw new RangeError("eventIndex must be a finite number");
  const idx = indexFor(replay);
  const { checkpoints, last } = idx;
  const target = Math.max(-1, Math.min(last, Math.floor(eventIndex)));
  const cp = checkpoints[Math.floor((target + 1) / CLIENT_CHECKPOINT_EVERY)];
  const state = clone(cp);
  for (let i = state.eventIndex + 1; i <= target; i++) step(state, idx, replay.state.patches, i);
  return state;
}

/**
 * Patch of event `eventIndex` (what changed after it), or null. Useful to
 * highlight changed cells. Returns a copy: mutating it never affects later
 * `replayStateAt` lookups.
 */
export function replayChangesAt(replay, eventIndex) {
  const patch = replay?.state?.patches?.[eventIndex];
  return patch ? clone(patch) : null;
}
