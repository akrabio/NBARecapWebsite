import { ChevronLeft } from "lucide-react";
import TeamLogo from "@/components/ui/TeamLogo";
import GameLink from "./GameLink";
import { nbaEnToHe, nbaShortHe } from "@/utils/consts";
import { extractRecord, extractSeriesRecord, formatScore, getWinner } from "@/utils/gameUtils";
import { getTags } from "@/utils/gameStory";
import { getTeamColors } from "@/utils/teamColors";
import { formatShortDate } from "@/lib/dates";
import WinProbStrip from "@/components/ui/WinProbStrip";

function TeamLine({ game, side, compact }) {
  const team = game[`${side}_team`];
  const score = game[`${side}_score`];
  const won = getWinner(game) === side;
  const record = extractRecord(game.title, team);
  return (
    <div className="flex items-center gap-2.5 py-[3px]">
      <TeamLogo
        teamName={team}
        hebrewName={nbaEnToHe[team]}
        size={compact ? "xs" : "sm"}
        className={compact ? "!h-[22px] !w-[22px]" : "!h-7 !w-7"}
      />
      <span className={`${compact ? "text-[15px]" : "text-base"} ${won ? "font-extrabold" : "font-semibold"}`}>
        {nbaShortHe[team] || nbaEnToHe[team] || team}
      </span>
      {record && <span className="text-xs text-faint">{record}</span>}
      <span
        className={`ms-auto font-black tabular-nums ${compact ? "text-lg" : "text-[23px]"} ${
          won ? "text-win" : "text-faint"
        }`}
      >
        {formatScore(score)}
      </span>
    </div>
  );
}

function Teams({ game, compact }) {
  return (
    <div>
      <TeamLine game={game} side="away" compact={compact} />
      <TeamLine game={game} side="home" compact={compact} />
    </div>
  );
}

// "Buzelis 41 נק׳ · 6 ריב׳": rebounds and assists only when they stand out.
function TopPlayer({ team, player }) {
  const name = player.name.split(" ").slice(1).join(" ") || player.name;
  const extra = [player.reb >= 8 && `${player.reb} ריב׳`, player.ast >= 7 && `${player.ast} אס׳`].filter(Boolean);
  return (
    <span className="inline-flex items-center gap-1.5">
      <TeamLogo teamName={team} size="xs" className="!h-4 !w-4" />
      <b dir="ltr" className="font-bold text-ink">
        {name}
      </b>
      {[`${player.pts} נק׳`, ...extra].join(" · ")}
    </span>
  );
}

// A game as a story: tags, the score, how it went (win probability) and,
// when the pipeline wrote one, a one-line takeaway.
export function GameCard({ game, showDate = false, selected = false }) {
  const tags = getTags(game);
  const series = extractSeriesRecord(game.content);
  const overtime = game.story?.periods > 4;
  const status = [
    showDate && formatShortDate(game.date),
    series ? `סדרה ${series}` : overtime ? "סיום בהארכה" : "סיום",
  ]
    .filter(Boolean)
    .join(" · ");
  const top = game.story?.top_players || {};
  const players = [
    top.away?.[0] && { team: game.away_team, player: top.away[0] },
    top.home?.[0] && { team: game.home_team, player: top.home[0] },
  ].filter(Boolean);

  return (
    <GameLink
      gameId={game.id}
      selected={selected}
      className={`relative mb-2.5 block overflow-hidden rounded-2xl border bg-surface px-3.5 pt-2.5 pb-3 active:bg-surface-2 lg:hover:bg-surface-2 ${
        selected ? "lg:border-brand" : ""
      }`}
      style={{
        "--ca": getTeamColors(game.away_team).primary,
        "--ch": getTeamColors(game.home_team).primary,
      }}
    >
      <span className="absolute inset-x-0 top-0 h-[3px] bg-[linear-gradient(90deg,var(--ca),var(--ch))]" />
      <div className="flex min-h-6 items-center gap-1.5 text-xs text-subtle">
        {tags.map((tag) => (
          <span key={tag.key + tag.label} className={`tag tag-${tag.key}`}>
            {tag.label}
          </span>
        ))}
        <span className="ms-auto">{status}</span>
      </div>
      <Teams game={game} />
      <WinProbStrip game={game} className="mt-1.5 mb-0.5" />
      {game.one_liner && <p className="mt-1.5 text-sm leading-relaxed text-body">{game.one_liner}</p>}
      {players.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-subtle">
          {players.map((p) => (
            <TopPlayer key={p.team} {...p} />
          ))}
        </div>
      )}
    </GameLink>
  );
}

// Compact row for the rest of the night's games.
export function GameRow({ game, showDate = false, selected = false }) {
  return (
    <GameLink
      gameId={game.id}
      selected={selected}
      className={`grid min-h-[74px] grid-cols-[1fr_auto] items-center gap-x-3 rounded-[14px] border bg-surface px-3 py-2 active:bg-surface-2 lg:hover:bg-surface-2 ${
        selected ? "lg:border-brand" : ""
      }`}
    >
      <Teams game={game} compact />
      <div className="flex min-w-14 flex-col items-center justify-center gap-1 self-stretch border-s ps-3 text-xs text-subtle">
        {showDate && <span>{formatShortDate(game.date)}</span>}
        <ChevronLeft className="h-[18px] w-[18px] text-faint" />
      </div>
    </GameLink>
  );
}
