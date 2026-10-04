// Client-side API helpers with a small in-memory cache (5 minutes).
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
    return entry.data;
  }
  cache.delete(key);
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

// Returns { boxscore, linescores }; boxscore is null when ESPN has no data.
export async function getBoxScore(gameId) {
  const cacheKey = `boxscore:${gameId}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const response = await fetch(`/api/boxscore/${gameId}`);
  if (response.status === 404) return { boxscore: null, linescores: [] };
  if (!response.ok) throw new Error(`Box score request failed: ${response.status}`);
  const data = await response.json();
  const result = { boxscore: data.boxscore || null, linescores: data.linescores || [] };

  // Only cache if we have valid data
  if (result.boxscore) {
    setCache(cacheKey, result);
  }

  return result;
}

export async function getDateCounts(from, to) {
  const cacheKey = `counts:${from}:${to}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const response = await fetch(`/api/records/counts?from=${from}&to=${to}`);
  if (!response.ok) throw new Error(`Counts request failed: ${response.status}`);
  const data = await response.json();
  const counts = data.counts || {};

  setCache(cacheKey, counts);
  return counts;
}
