import { ChevronLeft } from "lucide-react";
import TeamLogo from "@/components/ui/TeamLogo";
import GameLink from "./GameLink";
import { nbaEnToHe, nbaShortHe } from "@/utils/consts";
import { extractRecord, extractSeriesRecord, formatScore, getWinner } from "@/utils/gameUtils";
import { getGameReason } from "@/utils/gameScoring";
import { getTeamColors } from "@/utils/teamColors";
import { getSnippet } from "@/lib/recap";
import { formatShortDate } from "@/lib/dates";

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

// Featured game: both teams, why it's worth reading, and a snippet.
export function GameCard({ game, showDate = false, selected = false }) {
  const reason = getGameReason(game);
  const series = extractSeriesRecord(game.content);
  const snippet = getSnippet(game.content);
  const status = [showDate && formatShortDate(game.date), series ? `סדרה ${series}` : "סיום"]
    .filter(Boolean)
    .join(" · ");

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
      <div className="flex min-h-6 items-center justify-between text-xs text-subtle">
        <span>{status}</span>
        {reason && <span className={`tag tag-${reason.key}`}>{reason.label}</span>}
      </div>
      <Teams game={game} />
      {snippet && (
        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-body">{snippet}</p>
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
