// Server-side data access for game recaps (used by server components).
import { cache } from "react";
import { ObjectId } from "mongodb";
import { after } from "next/server";
import { getMongoClient, DB_NAME, COLLECTIONS } from "@/lib/mongodb";
import { fetchEspnGameId } from "@/utils/espnGameId";
import { fetchEspnSummary, isEspnId } from "@/lib/espn";
import { shiftDateKey, toDateKey, todayKey } from "@/lib/dates";
import { extractGamePhotos } from "@/lib/photos";
import { findHighlightsVideo } from "@/lib/youtube";

async function recaps() {
  const client = await getMongoClient();
  return client.db(DB_NAME).collection(COLLECTIONS.GAME_RECAPS);
}

// A stored score as a number, or null when it's missing (never a fake 0).
function toScore(value) {
  if (value === null || value === undefined || value === "") return null;
  const score = Number(value);
  return Number.isFinite(score) ? score : null;
}

// Plain, serializable object safe to pass to client components.
export function serializeGame(doc) {
  return {
    id: doc._id.toString(),
    date: doc.date,
    home_team: doc.home_team,
    away_team: doc.away_team,
    home_score: toScore(doc.home_score),
    away_score: toScore(doc.away_score),
    title: doc.title || "",
    content: doc.content || "",
    game_status: doc.game_status || null,
    espn_game_id: doc.espn_game_id || null,
    // Saved media lookups (see getGameMedia): undefined = not looked up yet
    photos: doc.photos,
    video_id: doc.video_id,
    video_checked_at: doc.video_checked_at?.getTime(),
  };
}

export async function getGamesByDate(date) {
  const collection = await recaps();
  const docs = await collection.find({ date }).toArray();
  return docs.map(serializeGame);
}

export async function getRecentGamesByTeam(team, limit = 5, { onOrBefore } = {}) {
  const collection = await recaps();
  const filter = { $or: [{ home_team: team }, { away_team: team }] };
  if (onOrBefore) filter.date = { $lte: onOrBefore };
  const docs = await collection
    .find(filter)
    .sort({ date: -1 })
    .limit(limit)
    .toArray();
  return docs.map(serializeGame);
}

// { "2026-06-03": 1, ... } for dates in [from, to]
export async function getDateCounts(from, to) {
  const collection = await recaps();
  const rows = await collection
    .aggregate([
      { $match: { date: { $gte: from, $lte: to } } },
      { $group: { _id: "$date", count: { $sum: 1 } } },
    ])
    .toArray();
  return Object.fromEntries(rows.map((row) => [row._id, row.count]));
}

// Latest date that has games, strictly before `before` or on/before `onOrBefore`.
export async function getLatestGameDate({ before, onOrBefore }) {
  const collection = await recaps();
  const filter = before ? { date: { $lt: before } } : { date: { $lte: onOrBefore } };
  const doc = await collection.find(filter, { projection: { date: 1 } }).sort({ date: -1 }).limit(1).next();
  return doc?.date || null;
}

// Every recap's id and date, newest first (for the sitemap).
export async function getAllGameIds() {
  const collection = await recaps();
  const docs = await collection.find({}, { projection: { date: 1 } }).sort({ date: -1 }).toArray();
  return docs.map((doc) => ({ id: doc._id.toString(), date: doc.date }));
}

// Old shared links used ESPN event ids. Resolve one to a recap via ESPN's
// summary (teams + date), allowing a day either side for time zones.
async function findByEspnId(collection, espnId) {
  const summary = await fetchEspnSummary(espnId).catch(() => null);
  const competition = summary?.header?.competitions?.[0];
  const home = competition?.competitors?.find((c) => c.homeAway === "home")?.team?.displayName;
  const away = competition?.competitors?.find((c) => c.homeAway === "away")?.team?.displayName;
  if (!home || !away || !competition.date) return null;
  const day = toDateKey(new Date(competition.date));
  const dates = [shiftDateKey(day, -1), day, shiftDateKey(day, 1)];
  const doc = await collection.findOne({ home_team: home, away_team: away, date: { $in: dates } });
  return doc;
}

// Accepts a Mongo id or a legacy ESPN event id. Cached per request so
// generateMetadata and the page share one lookup.
export const getGameById = cache(async (id) => {
  const collection = await recaps();
  let doc = null;
  let espnId = null;
  if (ObjectId.isValid(id) && /^[a-f0-9]{24}$/i.test(id)) {
    doc = await collection.findOne({ _id: new ObjectId(id) });
  } else if (isEspnId(id)) {
    doc = await findByEspnId(collection, id);
    espnId = id;
  }
  if (!doc) return null;

  const game = serializeGame(doc);
  if (!game.espn_game_id) {
    game.espn_game_id = espnId
      ? (await saveGameFields(game.id, { espn_game_id: espnId }), espnId)
      : await withTimeout(lookUpEspnId(game), null);
  }
  return game;
});

// ---------------------------------------------------------------------------
// External lookups: the ESPN event id, photos and the highlights video.
//
// Readers usually open a game once, so nothing per-reader helps; what matters
// is that nobody, including the first reader, waits on ESPN or YouTube:
// - Every result is saved on the recap and shared by everyone after.
// - warmGames() runs the lookups in the background whenever a games list is
//   shown, so a game is usually ready before anyone taps it.
// - A page that still hits a cold lookup waits at most LOOKUP_TIMEOUT, then
//   renders without it; the lookup finishes after the response and saves.
// ---------------------------------------------------------------------------
const LOOKUP_TIMEOUT = 1000;
// Highlights show up within a day or two; past this, the video has also left
// the channel's recent uploads, so "no video" is saved as final.
const VIDEO_SEARCH_DAYS = 7;
// Until then, a miss is re-checked at most this often (across all readers).
const VIDEO_RECHECK_MS = 30 * 60 * 1000;

// Resolves to `fallback` if `promise` is slow or fails. The work itself keeps
// running after the response is sent (after()), so its result still gets saved.
function withTimeout(promise, fallback) {
  const settled = promise.catch(() => fallback);
  after(() => settled);
  const timeout = new Promise((resolve) => setTimeout(() => resolve(fallback), LOOKUP_TIMEOUT));
  return Promise.race([settled, timeout]);
}

async function saveGameFields(id, fields) {
  try {
    const collection = await recaps();
    await collection.updateOne({ _id: new ObjectId(id) }, { $set: fields });
  } catch (error) {
    console.error("Failed to save game fields:", error);
  }
}

async function lookUpEspnId(game) {
  const espnId = await fetchEspnGameId(game.home_team, game.away_team, game.date);
  if (espnId) await saveGameFields(game.id, { espn_game_id: espnId });
  return espnId;
}

async function lookUpPhotos(game) {
  const summary = await fetchEspnSummary(game.espn_game_id);
  const photos = summary ? extractGamePhotos(summary) : [];
  if (photos.length) await saveGameFields(game.id, { photos });
  return photos;
}

async function lookUpVideo(game) {
  const videoId = await findHighlightsVideo(game.away_team, game.home_team, game.date);
  const final = videoId || shiftDateKey(game.date, VIDEO_SEARCH_DAYS) < todayKey();
  await saveGameFields(game.id, final ? { video_id: videoId } : { video_checked_at: new Date() });
  return videoId;
}

const needsPhotos = (game) => game.photos === undefined && Boolean(game.espn_game_id);
const needsVideo = (game) =>
  game.video_id === undefined && !(game.video_checked_at && Date.now() - game.video_checked_at < VIDEO_RECHECK_MS);

// → { photos: [{ url, caption, credit }], videoId: string | null }
export async function getGameMedia(game) {
  const [photos, videoId] = await Promise.all([
    needsPhotos(game) ? withTimeout(lookUpPhotos(game), []) : game.photos || [],
    needsVideo(game) ? withTimeout(lookUpVideo(game), null) : game.video_id || null,
  ]);
  return { photos, videoId };
}

// Fills in whatever the given games are missing, after the response is sent.
// Cheap when there's nothing to do: the checks use fields already loaded.
export function warmGames(games) {
  const pending = games.filter((game) => !game.espn_game_id || needsPhotos(game) || needsVideo(game));
  if (pending.length === 0) return;
  after(() =>
    Promise.allSettled(
      pending.map(async (game) => {
        const espnId = game.espn_game_id || (await lookUpEspnId(game));
        const full = { ...game, espn_game_id: espnId };
        await Promise.allSettled([needsPhotos(full) && lookUpPhotos(full), needsVideo(full) && lookUpVideo(full)]);
      })
    )
  );
}
