// Server-side data access for game recaps (used by server components).
import { cache } from "react";
import { ObjectId } from "mongodb";
import clientPromise, { DB_NAME, COLLECTIONS } from "@/lib/mongodb";
import { fetchEspnGameId } from "@/utils/espnGameId";
import { shiftDateKey, toDateKey } from "@/lib/dates";

async function recaps() {
  const client = await clientPromise;
  return client.db(DB_NAME).collection(COLLECTIONS.GAME_RECAPS);
}

// Plain, serializable object safe to pass to client components.
export function serializeGame(doc) {
  return {
    id: doc._id.toString(),
    date: doc.date,
    home_team: doc.home_team,
    away_team: doc.away_team,
    home_score: Number(doc.home_score) || 0,
    away_score: Number(doc.away_score) || 0,
    title: doc.title || "",
    content: doc.content || "",
    game_status: doc.game_status || null,
    espn_game_id: doc.espn_game_id || null,
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

// Old shared links used ESPN event ids. Resolve one to a recap via ESPN's
// summary (teams + date), allowing a day either side for time zones.
async function findByEspnId(collection, espnId) {
  const res = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${encodeURIComponent(espnId)}`,
    { next: { revalidate: 86400 } }
  );
  if (!res.ok) return null;
  const competition = (await res.json()).header?.competitions?.[0];
  const home = competition?.competitors?.find((c) => c.homeAway === "home")?.team?.displayName;
  const away = competition?.competitors?.find((c) => c.homeAway === "away")?.team?.displayName;
  if (!home || !away || !competition.date) return null;
  const day = toDateKey(new Date(competition.date));
  const dates = [shiftDateKey(day, -1), day, shiftDateKey(day, 1)];
  const doc = await collection.findOne({ home_team: home, away_team: away, date: { $in: dates } });
  return doc ? { ...doc, espn_game_id: doc.espn_game_id || espnId } : null;
}

// Accepts a Mongo id or a legacy ESPN event id. Cached per request so
// generateMetadata and the page share one lookup.
export const getGameById = cache(async (id) => {
  const collection = await recaps();
  let doc = null;
  if (ObjectId.isValid(id) && /^[a-f0-9]{24}$/i.test(id)) {
    doc = await collection.findOne({ _id: new ObjectId(id) });
  } else if (/^\d+$/.test(id)) {
    doc = await findByEspnId(collection, id);
  }
  if (!doc) return null;

  const game = serializeGame(doc);
  if (!game.espn_game_id) {
    game.espn_game_id = await fetchEspnGameId(game.home_team, game.away_team, game.date);
  }
  return game;
});
