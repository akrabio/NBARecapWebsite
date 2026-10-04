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

Recaps live in the `app.game_recaps` collection. The site only reads them, with one exception: when a recap has no `espn_game_id`, the id is looked up on ESPN's scoreboard and saved back to the document.

| Field | Example |
|---|---|
| `date` | `"2026-06-13"` (US game date, `yyyy-MM-dd`) |
| `home_team`, `away_team` | `"San Antonio Spurs"`: English names as in `nbaEnToHe` (`utils/consts.js`) |
| `home_score`, `away_score` | numbers |
| `title` | contains each team's record, e.g. `סן אנטוניו ספרס (62-20)` |
| `content` | markdown (format below) |
| `espn_game_id` | optional; filled in automatically |

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
- `utils/`: team names, colors, record extraction, game ranking
- `public/sw.js`: service worker that shows `/offline` when there's no connection

## Deploy

Deployed on Vercel. Set the MongoDB variables in the project settings; `VERCEL_PROJECT_PRODUCTION_URL` (set by Vercel) is used for canonical, Open Graph and sitemap URLs.
