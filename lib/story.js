// A compact "story" of a finished game, built from ESPN's game summary: win
// probability, score margin and the score itself over time, the biggest leads, lead changes and
// each side's top scorers. Games are final, so it's built once and saved on
// the recap. No imports, so the recap pipeline can run it as-is.

export const STORY_VERSION = 2;
// Seconds of game time between samples (about 100 points for a game)
export const STORY_STEP = 30;
const TOP_PLAYERS = 3;

// Total game time in seconds: 12-minute quarters, 5-minute overtimes.
export const gameLength = (periods) => 4 * 720 + Math.max(0, periods - 4) * 300;

// Seconds of game time elapsed at a play. The clock is "M:SS" or "SS.s" left in the period.
export function gameSeconds(period, clock) {
  const text = String(clock ?? "0");
  const [minutes, seconds] = text.includes(":") ? text.split(":") : ["0", text];
  const left = Number(minutes) * 60 + Number(seconds) || 0;
  if (period <= 4) return (period - 1) * 720 + (720 - left);
  return gameLength(period - 1) + (300 - left);
}

// Values at every STORY_STEP seconds from 0 to `end`, each the latest value at
// or before that time. `points` is [[seconds, value], ...] in time order.
function sample(points, end, initial) {
  const out = [];
  let k = 0;
  let last = initial;
  for (let t = 0; t <= end; t += STORY_STEP) {
    while (k < points.length && points[k][0] <= t) last = points[k++][1];
    out.push(last);
  }
  return out;
}

const round3 = (x) => Math.round(x * 1000) / 1000;

function topPlayers(teamBox) {
  const stats = teamBox?.statistics?.[0];
  if (!stats) return [];
  const labels = stats.labels || [];
  const players = (stats.athletes || [])
    .filter((a) => !a.didNotPlay && a.stats?.length)
    .map((a) => {
      const s = Object.fromEntries(labels.map((label, i) => [label, a.stats[i]]));
      const n = (label) => Number(s[label]) || 0;
      return {
        name: a.athlete?.displayName || "",
        pts: n("PTS"),
        reb: n("REB"),
        ast: n("AST"),
        stl: n("STL"),
        blk: n("BLK"),
        min: n("MIN"),
        fg: s.FG || "",
        tp: s["3PT"] || "",
        ft: s.FT || "",
      };
    });
  return players.sort((a, b) => b.pts - a.pts).slice(0, TOP_PLAYERS);
}

// → story object, or null when the summary isn't a finished game.
export function buildStory(summary) {
  const competition = summary?.header?.competitions?.[0];
  const sides = Object.fromEntries((competition?.competitors || []).map((c) => [c.homeAway, c]));
  if (!competition?.status?.type?.completed || !sides.home || !sides.away) return null;

  const plays = (summary.plays || [])
    .map((p) => ({
      id: p.id,
      t: gameSeconds(p.period?.number, p.clock?.displayValue),
      away: Number(p.awayScore) || 0,
      home: Number(p.homeScore) || 0,
    }))
    .sort((a, b) => a.t - b.t);
  const lastPeriod = Math.max(0, ...(summary.plays || []).map((p) => p.period?.number || 0));
  const periods = Math.max(4, sides.home.linescores?.length || 0, lastPeriod);
  const end = gameLength(periods);

  const homeWon = Number(sides.home.score) > Number(sides.away.score);
  const story = {
    v: STORY_VERSION,
    periods,
    wp: null,
    margin: null,
    score: null, // [[away, home], ...]
    max_lead: null,
    lead_changes: null,
    winner_min_wp: null,
    winner_min_wp_at: null,
    top_players: {},
  };

  if (plays.length) {
    story.margin = sample(plays.map((p) => [p.t, p.home - p.away]), end, 0);
    story.score = sample(plays.map((p) => [p.t, [p.away, p.home]]), end, [0, 0]);
    let home = 0;
    let away = 0;
    let changes = 0;
    let leader = 0; // sign of the last non-tied margin
    for (const { home: h, away: a } of plays) {
      const margin = h - a;
      home = Math.max(home, margin);
      away = Math.max(away, -margin);
      const sign = Math.sign(margin);
      if (sign && leader && sign !== leader) changes++;
      if (sign) leader = sign;
    }
    story.max_lead = { home, away };
    story.lead_changes = changes;
  }

  const time = new Map(plays.map((p) => [p.id, p.t]));
  const wp = (summary.winprobability || [])
    .filter((w) => time.has(w.playId) && Number.isFinite(w.homeWinPercentage))
    .map((w) => [time.get(w.playId), w.homeWinPercentage])
    .sort((a, b) => a[0] - b[0]);
  if (wp.length) {
    story.wp = sample(wp, end, wp[0][1]).map(round3);
    // The final buzzer settles it, whatever the last data point said
    story.wp[story.wp.length - 1] = homeWon ? 1 : 0;
    let low = Infinity;
    for (const [t, p] of wp) {
      const winner = homeWon ? p : 1 - p;
      if (winner < low) [low, story.winner_min_wp_at] = [winner, Math.round(t)];
    }
    story.winner_min_wp = round3(low);
  }

  const sideOf = Object.fromEntries(Object.entries(sides).map(([side, c]) => [String(c.team?.id), side]));
  for (const teamBox of summary.boxscore?.players || []) {
    const side = sideOf[String(teamBox.team?.id)];
    if (side) story.top_players[side] = topPlayers(teamBox);
  }

  return story;
}
