// Simple in-memory cache with TTL
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

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

export async function getRecordsByDate(dateString) {
  const cacheKey = `records:date:${dateString}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const response = await fetch(`/api/records/${dateString}`);
  const data = await response.json();
  const records = data.records || [];

  setCache(cacheKey, records);
  return records;
}

export async function getRecordsByTeam(teamName, limit = 5) {
  const cacheKey = `records:team:${teamName}:${limit}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const response = await fetch(`/api/records/team/${encodeURIComponent(teamName)}?limit=${limit}`);
  const data = await response.json();
  const records = data.records || [];

  setCache(cacheKey, records);
  return records;
}

export async function getBoxScore(gameId) {
  const cacheKey = `boxscore:${gameId}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const response = await fetch(`/api/boxscore/${gameId}`);
  const data = await response.json();
  const boxscore = data.boxscore;

  // Only cache if we have valid data
  if (boxscore) {
    setCache(cacheKey, boxscore);
  }

  return boxscore;
}

// Helper to clear cache (useful for debugging or forced refresh)
export function clearApiCache() {
  cache.clear();
}
