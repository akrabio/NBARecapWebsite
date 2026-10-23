// What made a game worth reading, from its scores, the recap and its story
// (lib/story.js): tags for the card and a score for ordering the night.
import { extractSeriesRecord, getWinner } from "./gameUtils";
import { getMatchup, isPortlandGame, scoreGame } from "./gameScoring";
import { nbaShortHe } from "./consts";

const MAX_TAGS = 2;

const STAT_KEYS = ["pts", "reb", "ast", "stl", "blk"];
const isTripleDouble = (p) => STAT_KEYS.filter((k) => p[k] >= 10).length >= 3;

// Facts the tags and the score are built from. Story fields are null when the
// game has no story yet, so every rule below works without one.
export function getGameFacts(game) {
  const winner = getWinner(game);
  const loser = winner === "home" ? "away" : winner === "away" ? "home" : null;
  const story = game.story || null;
  const players = story
    ? ["home", "away"].flatMap((side) => (story.top_players?.[side] || []).map((p) => ({ ...p, side })))
    : [];
  const topScorer = players.reduce((best, p) => (!best || p.pts > best.pts ? p : best), null);
  const streak = winner && game.streaks?.[winner];
  return {
    winner,
    margin: winner ? Math.abs(game.home_score - game.away_score) : null,
    overtimes: story ? Math.max(0, story.periods - 4) : 0,
    // The winner's biggest deficit = the loser's biggest lead
    deficit: loser && story?.max_lead ? story.max_lead[loser] : null,
    winnerMinWp: story?.winner_min_wp ?? null,
    leadChanges: story?.lead_changes ?? null,
    topScorer,
    tripleDouble: players.some(isTripleDouble),
    winStreak: streak?.startsWith("W") ? Number(streak.slice(1)) || 0 : 0,
    series: extractSeriesRecord(game.content),
    matchup: getMatchup(game),
  };
}

const isComeback = (f) => f.deficit >= 10 && f.winnerMinWp != null && f.winnerMinWp <= 0.15;

// Up to two { key, label } tags, most interesting first. `omit` skips tags
// the surrounding UI already shows (e.g. "playoffs" next to the series score).
export function getTags(game, { omit = [] } = {}) {
  const f = getGameFacts(game);
  const pts = f.topScorer?.pts || 0;
  const rules = [
    [pts >= 50, "perf", `${pts} נקודות`],
    [isPortlandGame(game), "deni", "דני אבדיה"],
    [isComeback(f), "comeback", `מהפך מ־${f.deficit}`],
    [f.overtimes > 0, "ot", f.overtimes > 1 ? `${f.overtimes} הארכות` : "הארכה"],
    [Boolean(f.series), "playoffs", "פלייאוף"],
    [pts >= 40 && pts < 50, "perf", `${pts} נקודות`],
    [f.tripleDouble, "perf", "טריפל־דאבל"],
    [f.margin != null && f.margin <= 5 && f.overtimes === 0, "close", "צמוד עד הסוף"],
    [Boolean(f.matchup?.isUpset), "upset", "הפתעה"],
    [f.leadChanges >= 15, "seesaw", `${f.leadChanges} חילופי הובלה`],
    [f.winStreak >= 5, "streak", `${f.winStreak} ניצחונות ברצף`],
    [Boolean(f.matchup && f.matchup.awayPct >= 0.5 && f.matchup.homePct >= 0.5), "top", "קרב צמרת"],
    [f.margin >= 25, "blowout", `הפרש ${f.margin}`],
  ];
  return rules
    .filter(([when, key]) => when && !omit.includes(key))
    .slice(0, MAX_TAGS)
    .map(([, key, label]) => ({ key, label }));
}

// How much of a story the game was: the base priority (Portland, popular
// teams, good matchups, close games) plus what happened in it.
export function storyScore(game) {
  const f = getGameFacts(game);
  const pts = f.topScorer?.pts || 0;
  let score = scoreGame(game);
  if (pts >= 50) score += 1000;
  else if (pts >= 40) score += 150;
  if (f.tripleDouble) score += 120;
  if (f.winnerMinWp != null && f.winnerMinWp < 0.2) score += (0.2 - f.winnerMinWp) * 1500;
  if (f.overtimes) score += 150;
  if (f.leadChanges) score += f.leadChanges * 6;
  if (f.winStreak >= 5) score += 60;
  return score;
}

export const orderByStory = (games) => [...games].sort((a, b) => storyScore(b) - storyScore(a));

const involves = (game, team) => Boolean(team) && (game.home_team === team || game.away_team === team);

// "The night in 30 seconds": the lead item, three more headlines and a count
// of the night. The favorite team's game is left out (it has its own card).
// `show` is false when there's too little to say.
export function getNightSummary(games, { favorite = null } = {}) {
  const pool = orderByStory(games.filter((game) => !involves(game, favorite)));

  // A 50-point night leads; otherwise the top game that has a headline
  let lead = null;
  for (const game of pool) {
    const player = getGameFacts(game).topScorer;
    if (player?.pts >= 50 && (!lead || player.pts > lead.player.pts)) lead = { type: "performance", game, player };
  }
  if (!lead) {
    const game = pool.find((g) => g.headline);
    if (game) lead = { type: "headline", game };
  }
  const stories = pool.filter((g) => g.headline && g !== lead?.game).slice(0, 3);

  const facts = games.map(getGameFacts);
  const count = (test) => facts.filter(test).length;
  const counts = {
    games: games.length,
    overtimes: count((f) => f.overtimes > 0),
    comebacks: count(isComeback),
    close: count((f) => f.margin != null && f.margin <= 5),
    blowouts: count((f) => f.margin >= 20),
  };

  return { show: games.length >= 2 && Boolean(lead || stories.length), lead, stories, counts };
}

const PERIOD_NAMES = ["", "ברבע הראשון", "ברבע השני", "ברבע השלישי", "ברבע הרביעי", "בהארכה", "בהארכה השנייה", "בהארכה השלישית"];

// Where in the game a moment fell: "ברבע הרביעי, 1:30 לסיום"
export function describeGameTime(seconds) {
  const regulation = seconds < 2880;
  const length = regulation ? 720 : 300;
  const start = regulation ? 0 : 2880;
  let period = Math.floor((seconds - start) / length) + (regulation ? 1 : 5);
  let left = length - ((seconds - start) % length);
  if (seconds > 0 && left === length) [period, left] = [period - 1, 0]; // the buzzer, not the next tip-off
  const clock = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, "0")}`;
  const name = PERIOD_NAMES[period] || `בהארכה ה־${period - 4}`;
  return left === 0 ? `בסיום ${name.replace(/^ב/, "ה")}` : `${name}, ${clock} לסיום`;
}

// The winner's worst moment, for the game page: { team, pct, when }, or null
// when the winner was never really in trouble.
export function getLowPoint(game) {
  const story = game.story;
  const winner = getWinner(game);
  if (!winner || !story?.wp || story.winner_min_wp == null || story.winner_min_wp >= 0.35) return null;
  const team = winner === "home" ? game.home_team : game.away_team;
  return {
    team: nbaShortHe[team] || team,
    pct: Math.max(1, Math.round(story.winner_min_wp * 100)),
    when: describeGameTime(story.winner_min_wp_at),
  };
}
