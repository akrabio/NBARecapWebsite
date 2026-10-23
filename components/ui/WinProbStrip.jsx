import { gameLength, STORY_STEP } from "@/lib/story";
import { matchupColors } from "@/utils/teamColors";

const W = 300;
const HEIGHT = { sm: 32, lg: 120 };

const periodStart = (k) => (k <= 4 ? k * 720 : gameLength(k));
const periodLabel = (k) => (k <= 4 ? `ר${k}` : k === 5 ? "הארכה" : `הארכה ${k - 4}`);
const fill = (color) => `color-mix(in oklch, ${color} 75%, var(--ink))`;

// How the game went, as a line over time: win probability, or the score
// margin when ESPN has none. Time runs right to left. Above the dashed
// midline the away team is ahead, below it the home team, matching the
// away-over-home rows on the cards. Renders nothing without a story.
export default function WinProbStrip({ game, size = "sm", className = "" }) {
  const story = game.story;
  const series = story?.wp || story?.margin;
  if (!series?.length) return null;

  const h = HEIGHT[size];
  const mid = h / 2;
  const total = gameLength(story.periods);
  const scale = story.wp ? 0 : Math.max(12, ...series.map(Math.abs));
  const y = (v) => (story.wp ? v * h : mid + (v / scale) * mid);
  const x = (seconds) => W - (Math.min(seconds, total) / total) * W;
  const points = series.map((v, i) => [x(i * STORY_STEP), y(v)]);
  const line = (clamp) => "M" + points.map(([px, py]) => `${px.toFixed(1)},${clamp(py).toFixed(1)}`).join("L");
  const area = (clamp) => `${line(clamp)}L${points.at(-1)[0].toFixed(1)},${mid}L${points[0][0].toFixed(1)},${mid}Z`;
  const colors = matchupColors(game.away_team, game.home_team);
  const periods = Array.from({ length: story.periods }, (_, i) => i + 1);

  // The winner's lowest point, marked on the big chart
  const low = size === "lg" && story.wp && story.winner_min_wp < 0.35 && story.winner_min_wp_at != null;
  const homeWon = game.home_score > game.away_score;

  return (
    <div className={className}>
      <div className="relative" style={{ height: h }}>
        <svg
          viewBox={`0 0 ${W} ${h}`}
          preserveAspectRatio="none"
          className="block h-full w-full overflow-visible"
          role="img"
          aria-label={story.wp ? "סיכויי הניצחון לאורך המשחק" : "הפרש הנקודות לאורך המשחק"}
        >
          {periods.slice(0, -1).map((k) => (
            <line key={k} x1={x(periodStart(k))} x2={x(periodStart(k))} y1="0" y2={h} stroke="var(--line)" vectorEffect="non-scaling-stroke" />
          ))}
          <path d={area((py) => Math.min(py, mid))} style={{ fill: fill(colors.away) }} opacity="0.5" />
          <path d={area((py) => Math.max(py, mid))} style={{ fill: fill(colors.home) }} opacity="0.5" />
          <line x1="0" x2={W} y1={mid} y2={mid} stroke="var(--faint)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
          <path
            d={line((py) => py)}
            fill="none"
            stroke="var(--ink)"
            strokeWidth={size === "lg" ? 2 : 1.4}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {low && (
          <span
            className="absolute -mt-[5px] -ml-[5px] h-2.5 w-2.5 rounded-full bg-brand ring-[3px] ring-brand/30"
            style={{
              left: `${(x(story.winner_min_wp_at) / W) * 100}%`,
              top: `${(homeWon ? story.winner_min_wp : 1 - story.winner_min_wp) * 100}%`,
            }}
          />
        )}
      </div>
      {size === "lg" && (
        <div className="mt-1 flex text-[11px] text-faint">
          {periods.map((k) => (
            <span key={k} className="text-center" style={{ flex: k <= 4 ? 12 : 5 }}>
              {periodLabel(k)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
