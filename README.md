# סיכומי NBA בעברית

Hebrew recaps of NBA games, mobile-first. A Next.js (App Router) site that reads recaps from MongoDB and adds box scores, quarter scores, photos and a highlights video from ESPN and YouTube.

## Setup

```bash
npm install
npm run dev     # http://localhost:3000
npm run build && npm start   # production build
```

Create `.env.local` with the database credentials, either as a full connection string:

```
MONGODB_URI=mongodb+srv://user:password@host/?retryWrites=true&w=majority
```

or as separate values (the host defaults to the production cluster):

```
MONGODB_USER=...
MONGODB_PASSWORD=...
MONGODB_HOST=...   # optional
```

The connection opens on first use, so `npm run build` works without credentials.

## Data

Recaps live in the `app.game_recaps` collection. The recap pipeline writes them; the site fills in what it can look up itself (the ESPN id, photos, the highlights video and the `story`) and saves it back to the document.

| Field | Example |
|---|---|
| `date` | `"2026-06-13"` (US game date, `yyyy-MM-dd`) |
| `home_team`, `away_team` | `"San Antonio Spurs"`: English names as in `nbaEnToHe` (`utils/consts.js`) |
| `home_score`, `away_score` | numbers |
| `title` | contains each team's record, e.g. `סן אנטוניו ספרס (62-20)` |
| `content` | markdown (format below) |
| `espn_game_id` | optional; filled in automatically |
| `headline` | optional, from the pipeline: one-sentence Hebrew headline for "the night in 30 seconds" and the game page |
| `one_liner` | optional, from the pipeline: 1–2 Hebrew sentences on why the game matters, shown on the game cards |
| `streaks` | optional, from the pipeline: `{ "home": "W6", "away": "L9" }`, each team's streak after the game |
| `story` | built from ESPN's game summary by `buildStory` (`lib/story.js`): win probability and margin over time, biggest leads, lead changes, top scorers. The pipeline should save it; otherwise the site builds it on first view. `scripts/backfill-story.mjs` fills it in for older recaps |

Nightly standings live in `app.standings_snapshots`, one document per game date: `{ date, east: [{ team, w, l, streak }, …], west: […] }` in seed order. They're built by `buildStandingsSnapshot` (`lib/standings.js`) after the night's last game, from the pipeline or with `scripts/snapshot-standings.mjs <date>`. The site compares each night with the one before for the standings moves and the "my team" card.

`content` is parsed by `lib/recap.js`:

```
**<home> (62-20) 95 – 105 <away> (53-29) | סדרה: 0-0**   ← header line; "סדרה" only in the playoffs

<paragraphs…>

| | MIN | PTS | REB | AST | … |       ← two stat tables, one per team,
| Starters | … |                       matched to teams by the "Team" row's PTS
```

## Structure

- `app/`: pages (`/`, `/game/[id]`), API routes, sitemap/robots, error pages
- `app/api/`: `boxscore` and `game-images` (ESPN summary, cached), `youtube-search` (highlights video), `records/counts` (calendar dots)
- `components/games/`: the games list, header, date strip, calendar and team picker
- `components/game/`: the game page (recap, stats, box score, video)
- `lib/`: server data access (`games.js`, `browse.js`), recap parsing, dates, ESPN client
- `lib/story.js`, `lib/standings.js`: pure builders for `story` and standings snapshots, shared with the pipeline
- `utils/`: team names, colors, record extraction, game ranking and tags (`gameStory.js`)
- `scripts/`: one-off and nightly jobs (`backfill-story.mjs`, `snapshot-standings.mjs`), run with `node --env-file=.env.local`
- `public/sw.js`: service worker that shows `/offline` when there's no connection

## Deploy

Deployed on Vercel. Set the MongoDB variables in the project settings; `VERCEL_PROJECT_PRODUCTION_URL` (set by Vercel) is used for canonical, Open Graph and sitemap URLs.
