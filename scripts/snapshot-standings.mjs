// Saves tonight's conference standings (lib/standings.js) for the given game
// date, after that night's last game. The recap pipeline should run this (or
// the same code) every night; the site compares each night with the one before.
//
//   node --env-file=.env.local scripts/snapshot-standings.mjs 2026-10-21 [--dry-run]
import { COLLECTIONS, DB_NAME, getMongoClient } from "../lib/mongodb.js";
import { buildStandingsSnapshot } from "../lib/standings.js";

const STANDINGS_URL = "https://site.api.espn.com/apis/v2/sports/basketball/nba/standings";
const date = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) {
  console.error("Usage: snapshot-standings.mjs <yyyy-MM-dd> [--dry-run]");
  process.exit(1);
}

const response = await fetch(STANDINGS_URL);
if (!response.ok) throw new Error(`ESPN standings request failed: ${response.status}`);
const snapshot = buildStandingsSnapshot(await response.json(), date);
if (!snapshot) throw new Error("ESPN standings had no conferences");

console.log(`East: ${snapshot.east.map((r) => `${r.team} ${r.w}-${r.l}`).join(", ")}`);
console.log(`West: ${snapshot.west.map((r) => `${r.team} ${r.w}-${r.l}`).join(", ")}`);
if (!dryRun) {
  const client = await getMongoClient();
  await client.db(DB_NAME).collection(COLLECTIONS.STANDINGS).replaceOne({ date }, snapshot, { upsert: true });
  await client.close();
  console.log(`Saved standings for ${date}`);
}
