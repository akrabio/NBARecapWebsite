// Builds the story (lib/story.js) for recaps that don't have the current
// version yet. Recaps without an ESPN id are skipped; the site looks those up
// on its own (warmGames in lib/games.js).
//
//   node --env-file=.env.local scripts/backfill-story.mjs [--dry-run]
import { COLLECTIONS, DB_NAME, getMongoClient } from "../lib/mongodb.js";
import { fetchEspnSummary } from "../lib/espn.js";
import { buildStory, STORY_VERSION } from "../lib/story.js";

// Pause between ESPN requests
const DELAY_MS = 300;
const dryRun = process.argv.includes("--dry-run");

const client = await getMongoClient();
const recaps = client.db(DB_NAME).collection(COLLECTIONS.GAME_RECAPS);
const docs = await recaps
  .find(
    { espn_game_id: { $exists: true, $nin: [null, ""] }, "story.v": { $ne: STORY_VERSION } },
    { projection: { espn_game_id: 1, date: 1, home_team: 1, away_team: 1 } }
  )
  .sort({ date: -1 })
  .toArray();
console.log(`${docs.length} recaps need a story${dryRun ? " (dry run)" : ""}`);

let saved = 0;
let skipped = 0;
for (const doc of docs) {
  const label = `${doc.date} ${doc.away_team} @ ${doc.home_team}`;
  const summary = await fetchEspnSummary(doc.espn_game_id).catch((error) => {
    console.error(`${label}: ${error.message}`);
    return null;
  });
  const story = summary && buildStory(summary);
  if (story) {
    if (!dryRun) await recaps.updateOne({ _id: doc._id }, { $set: { story } });
    saved++;
  } else {
    console.log(`${label}: no finished game on ESPN, skipped`);
    skipped++;
  }
  await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
}

console.log(`${dryRun ? "Would save" : "Saved"} ${saved}, skipped ${skipped}`);
await client.close();
