import { ChevronLeft } from "lucide-react";
import GameLink from "./GameLink";
import TeamLogo from "@/components/ui/TeamLogo";
import { getWinner } from "@/utils/gameUtils";
import { getTeamColors } from "@/utils/teamColors";
import { nbaEnToHe, nbaShortHe } from "@/utils/consts";

const short = (team) => nbaShortHe[team] || nbaEnToHe[team] || team;

// "היט 150:129 ויזארדס": winner first, the way the recaps write scores
function scoreLine(game) {
  const homeWon = getWinner(game) === "home";
  const [w, l] = homeWon ? ["home", "away"] : ["away", "home"];
  return `${short(game[`${w}_team`])} ${game[`${w}_score`]}:${game[`${l}_score`]} ${short(game[`${l}_team`])}`;
}

const winnerOf = (game) => (getWinner(game) === "home" ? game.home_team : game.away_team);

// The lead: a 50-point night as a big number, otherwise the top headline
function Lead({ lead }) {
  const { game } = lead;
  if (lead.type === "performance") {
    const { player } = lead;
    const team = game[`${player.side}_team`];
    return (
      <GameLink
        gameId={game.id}
        className="grid grid-cols-[auto_1fr] items-center gap-x-3.5 px-4 pt-4 pb-3.5 active:brightness-95"
        style={{ background: `linear-gradient(120deg, color-mix(in srgb, ${getTeamColors(team).primary} 30%, var(--surface)), var(--surface) 70%)` }}
      >
        <div className="row-span-2 text-center">
          <div className="text-[64px] leading-[0.9] font-black tracking-tight tabular-nums">{player.pts}</div>
          <small className="mt-1 block text-xs font-bold text-subtle">נקודות</small>
        </div>
        <b className="text-lg leading-snug font-extrabold">
          <bdi>{player.name}</bdi>
        </b>
        <div className="text-[13px] leading-normal text-subtle">
          {scoreLine(game)}
          <br />
          {[player.fg && `${player.fg} מהשדה`, player.tp && `${player.tp} לשלוש`, player.ft && `${player.ft} מהעונשין`]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </GameLink>
    );
  }
  return (
    <GameLink
      gameId={game.id}
      className="block px-4 pt-3.5 pb-3.5 active:brightness-95"
      style={{ background: `linear-gradient(120deg, color-mix(in srgb, ${getTeamColors(winnerOf(game)).primary} 30%, var(--surface)), var(--surface) 70%)` }}
    >
      <span className="text-xs font-extrabold text-brand-ink">הסיפור של הלילה</span>
      <b className="mt-0.5 block text-lg leading-snug font-extrabold">{game.headline}</b>
    </GameLink>
  );
}

// "11 משחקים · הארכה אחת · 4 מהפכים · …"
function countsLine({ games, overtimes, comebacks, close, blowouts }) {
  const n = (count, one, many) => (count === 1 ? one : `${count} ${many}`);
  return [
    `${games} משחקים`,
    overtimes && n(overtimes, "הארכה אחת", "הארכות"),
    comebacks && n(comebacks, "מהפך אחד", "מהפכים"),
    close && n(close, "משחק אחד הוכרע ב־5 נק׳ או פחות", "הוכרעו ב־5 נק׳ או פחות"),
    blowouts && n(blowouts, "דריסה אחת", "דריסות"),
  ]
    .filter(Boolean)
    .join(" · ");
}

// "The night in 30 seconds" (see getNightSummary)
export default function NightBrief({ summary }) {
  const { lead, stories, counts } = summary;
  return (
    <section aria-labelledby="night-brief">
      <h2 id="night-brief" className="mt-0.5 mb-2 text-sm font-extrabold text-subtle">
        הלילה ב־30 שניות
      </h2>
      <div className="mb-2.5 overflow-hidden rounded-[18px] border bg-surface">
        {lead && <Lead lead={lead} />}
        {stories.length > 0 && (
          <div className="divide-y border-t">
            {stories.map((game) => (
              <GameLink
                key={game.id}
                gameId={game.id}
                className="flex min-h-14 items-center gap-2.5 px-3.5 py-2 text-[15px] leading-snug font-semibold active:bg-surface-2 lg:hover:bg-surface-2"
              >
                <span className="flex shrink-0 -space-x-1.5">
                  <TeamLogo teamName={game.away_team} size="xs" className="!h-[22px] !w-[22px]" />
                  <TeamLogo teamName={game.home_team} size="xs" className="!h-[22px] !w-[22px]" />
                </span>
                <span>{game.headline}</span>
                <ChevronLeft className="ms-auto h-[18px] w-[18px] shrink-0 text-faint" />
              </GameLink>
            ))}
          </div>
        )}
        <p className="border-t px-3.5 py-2.5 text-[12.5px] text-subtle">{countsLine(counts)}</p>
      </div>
    </section>
  );
}
