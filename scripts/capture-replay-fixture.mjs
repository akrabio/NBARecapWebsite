// Captures full ESPN game summaries as offline replay fixtures.
//
//   node scripts/capture-replay-fixture.mjs                 # default corpus
//   node scripts/capture-replay-fixture.mjs 401810791 ...   # specific events
//
// Each fixture is a documented projection of the raw summary: the top-level
// keys in KEPT_KEYS are copied byte-for-byte (no play/boxscore edits); the
// keys in DROPPED_KEYS are unrelated to replay and removed. Any other key is
// dropped too and reported, so ESPN schema changes are visible. Writes
// tests/fixtures/replay/{id}.json and merges an entry into manifest.json.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SUMMARY_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=";
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "tests", "fixtures", "replay");

export const KEPT_KEYS = [
  "header", // teams, status, period linescores, game date
  "boxscore", // rosters, starters, stat labels, final team/player stats
  "plays", // every play with sequence, clock, scores, participants
  "winprobability", // per-play home win probability
  "format", // regulation/overtime period counts and clocks
  "gameInfo", // venue, attendance, officials
  "meta", // first/last play wallclock, game state
  "wallclockAvailable",
];
export const DROPPED_KEYS = [
  "leaders", "seasonseries", "injuries", "broadcasts", "pickcenter", "odds",
  "againstTheSpread", "news", "article", "videos", "standings",
];

// Requested shape for each candidate; verified against the data below.
const DEFAULT_CORPUS = {
  401810791: "comeback",
  401810798: "overtime",
  401810792: "blowout",
  401810799: "close finish",
  401810062: "ordinary",
};

function project(summary) {
  const fixture = {};
  for (const key of KEPT_KEYS) if (key in summary) fixture[key] = summary[key];
  const unknown = Object.keys(summary).filter((k) => !KEPT_KEYS.includes(k) && !DROPPED_KEYS.includes(k));
  return { fixture, unknown };
}

// Final score, periods, and lead swings computed from the play-by-play.
function analyze(summary) {
  const comp = summary.header.competitions[0];
  const home = comp.competitors.find((c) => c.homeAway === "home");
  const away = comp.competitors.find((c) => c.homeAway === "away");
  const plays = summary.plays || [];
  let maxHomeLead = 0;
  let maxAwayLead = 0;
  let leadChanges = 0;
  let leader = 0;
  for (const p of plays) {
    const diff = p.homeScore - p.awayScore;
    maxHomeLead = Math.max(maxHomeLead, diff);
    maxAwayLead = Math.max(maxAwayLead, -diff);
    const now = Math.sign(diff);
    if (now !== 0 && leader !== 0 && now !== leader) leadChanges++;
    if (now !== 0) leader = now;
  }
  const homeScore = Number(home.score);
  const awayScore = Number(away.score);
  const homeWon = homeScore > awayScore;
  const last = plays.at(-1);
  return {
    homeScore,
    awayScore,
    winner: homeWon ? home.team.abbreviation : away.team.abbreviation,
    margin: Math.abs(homeScore - awayScore),
    periods: Math.max(...plays.map((p) => p.period.number)),
    largestDeficitOvercome: homeWon ? maxAwayLead : maxHomeLead,
    largestLead: Math.max(maxHomeLead, maxAwayLead),
    leadChanges,
    playsFinalMatches: last ? last.homeScore === homeScore && last.awayScore === awayScore : false,
    home,
    away,
    comp,
  };
}

function describe(a) {
  const shapes = [];
  if (a.periods > 4) shapes.push(`overtime (${a.periods - 4} OT)`);
  if (a.largestDeficitOvercome >= 10) shapes.push(`comeback (winner trailed by ${a.largestDeficitOvercome})`);
  if (a.margin >= 20) shapes.push(`blowout (${a.margin}-point margin)`);
  if (a.margin <= 3) shapes.push(`close finish (${a.margin}-point margin)`);
  if (!shapes.length) shapes.push("ordinary");
  return shapes;
}

async function capture(id, requested, retrievedAt) {
  const sourceUrl = SUMMARY_URL + id;
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`${id}: ESPN responded ${response.status}`);
  const summary = await response.json();
  const { fixture, unknown } = project(summary);
  const json = JSON.stringify(fixture);
  await writeFile(join(OUT_DIR, `${id}.json`), json + "\n");

  const a = analyze(summary);
  const verifiedShapes = describe(a);
  const team = (c) => ({ id: c.team.id, abbreviation: c.team.abbreviation, name: c.team.displayName });
  const entry = {
    eventId: String(id),
    file: `${id}.json`,
    teams: { home: team(a.home), away: team(a.away) },
    gameDate: a.comp.date,
    retrievedAt,
    sourceUrl,
    kind: "documented projection",
    keptKeys: KEPT_KEYS.filter((k) => k in summary),
    droppedKeys: Object.keys(summary).filter((k) => !KEPT_KEYS.includes(k)),
    unknownDroppedKeys: unknown,
    bytes: Buffer.byteLength(json) + 1,
    playCount: (summary.plays || []).length,
    winProbabilityCount: (summary.winprobability || []).length,
    periods: a.periods,
    status: a.comp.status?.type?.name,
    finalScore: `${a.away.team.abbreviation} ${a.awayScore} @ ${a.home.team.abbreviation} ${a.homeScore}`,
    winner: a.winner,
    margin: a.margin,
    largestDeficitOvercome: a.largestDeficitOvercome,
    largestLead: a.largestLead,
    leadChanges: a.leadChanges,
    playsFinalScoreMatchesHeader: a.playsFinalMatches,
    requestedShape: requested ?? null,
    verifiedShapes,
  };
  entry.requestedShapeConfirmed = requested ? verifiedShapes.some((s) => s.startsWith(requested)) : null;
  return entry;
}

async function main() {
  const args = process.argv.slice(2);
  const ids = args.length ? args : Object.keys(DEFAULT_CORPUS);
  await mkdir(OUT_DIR, { recursive: true });
  const manifestPath = join(OUT_DIR, "manifest.json");
  let manifest = { description: "", fixtures: {} };
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    // first capture
  }
  manifest.description =
    "Full ESPN NBA summaries for replay work. Each fixture keeps the listed top-level keys verbatim " +
    "and drops unrelated news/media/betting/standings keys. Produced by scripts/capture-replay-fixture.mjs.";
  const retrievedAt = new Date().toISOString();
  for (const id of ids) {
    if (!/^\d{1,12}$/.test(id)) throw new Error(`Not an ESPN event id: ${id}`);
    const entry = await capture(id, DEFAULT_CORPUS[id], retrievedAt);
    manifest.fixtures[id] = entry;
    console.log(
      `${id} ${entry.finalScore} P${entry.periods} plays=${entry.playCount} wp=${entry.winProbabilityCount} ` +
        `${(entry.bytes / 1024).toFixed(0)}KB shapes=[${entry.verifiedShapes.join("; ")}]` +
        (entry.requestedShapeConfirmed === false ? ` MISMATCH requested=${entry.requestedShape}` : "") +
        (entry.unknownDroppedKeys.length ? ` unknown keys dropped: ${entry.unknownDroppedKeys.join(",")}` : ""),
    );
  }
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
