import { ChevronLeft } from "lucide-react";
import GameLink from "./GameLink";
import SinceLastVisit from "./SinceLastVisit";
import TeamLogo from "@/components/ui/TeamLogo";
import WinProbStrip from "@/components/ui/WinProbStrip";
import { formatRecord, getWinner } from "@/utils/gameUtils";
import { getTeamColors } from "@/utils/teamColors";
import { nbaEnToHe, nbaShortHe } from "@/utils/consts";

const short = (team) => nbaShortHe[team] || nbaEnToHe[team] || team;

// A game from the favorite team's side: won?, the opponent, home or away, the score
export function fromTeamSide(game, team) {
  const side = game.home_team === team ? "home" : "away";
  const other = side === "home" ? "away" : "home";
  const winner = getWinner(game);
  return {
    won: winner === side,
    opponent: game[`${other}_team`],
    home: side === "home",
    score: `${Math.max(game.home_score, game.away_score)}:${Math.min(game.home_score, game.away_score)}`,
  };
}

const vs = ({ home, opponent }) => `${home ? "מול " : "ב"}${short(opponent)}`;

function ResultBadge({ won }) {
  return (
    <span className={`rounded-md px-1.5 py-0.5 text-xs font-extrabold ${won ? "bg-good/15 text-good" : "bg-bad/15 text-bad"}`}>
      {won ? "ניצחון" : "הפסד"}
    </span>
  );
}

function streakText(streak) {
  const n = Number(streak?.slice(1));
  if (!n) return null;
  if (streak[0] === "W") return n > 1 ? `${n} ניצחונות ברצף` : "ניצחו במשחק האחרון";
  return n > 1 ? `${n} הפסדים ברצף` : "הפסידו במשחק האחרון";
}

// { day: "יום חמישי 22.10", time: "05:00" }, in Israel time
function formatTipOff(iso) {
  const at = new Date(iso);
  const part = (options) => at.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", ...options });
  return {
    day: `${part({ weekday: "long" })} ${part({ day: "numeric", month: "numeric" })}`,
    time: part({ hour: "2-digit", minute: "2-digit", hour12: false }),
  };
}

// "My team": last night's result and takeaway, form, standing and the next game.
// `recent` is the team's last games up to this date, newest first; `nextGame`
// is undefined when it wasn't looked up (an old night).
export default function FavoriteCard({ team, game, recent, standing, nextGame, date, selectedId }) {
  const latest = game || recent[0];
  const record = standing ? `${standing.w}-${standing.l}` : latest && formatRecord(latest.title, team);
  const move = standing?.prevRank ? standing.prevRank - standing.rank : 0;
  // The latest game's own streak is never older than the standings snapshot
  const streak = streakText(latest?.streaks?.[latest.home_team === team ? "home" : "away"] || standing?.streak);
  const form = [...recent].reverse(); // oldest first, so the newest ends the row
  const result = game && fromTeamSide(game, team);

  return (
    <section
      className="relative mb-2.5 overflow-hidden rounded-[18px] border bg-surface"
      style={{ "--c": getTeamColors(team).primary }}
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--c)_22%,transparent),transparent)]" />
      <div className="relative flex items-center gap-2.5 px-3.5 pt-3 pb-1">
        <TeamLogo teamName={team} hebrewName={nbaEnToHe[team]} size="md" className="shrink-0" />
        <div>
          <b className="block text-[17px] font-extrabold">{nbaEnToHe[team]}</b>
          <small className="text-[12.5px] text-subtle">
            {standing && (
              <>
                מקום {standing.rank} {standing.conf === "E" ? "במזרח" : "במערב"}
                {move !== 0 && (
                  <span className={`font-extrabold ${move > 0 ? "text-good" : "text-bad"}`}>
                    {" "}
                    {move > 0 ? "▲" : "▼"} מ־{standing.prevRank}
                  </span>
                )}
                {record && " · "}
              </>
            )}
            {record}
          </small>
        </div>
      </div>

      {game ? (
        <GameLink
          gameId={game.id}
          selected={game.id === selectedId}
          className="relative block px-3.5 pt-1.5 pb-3 active:bg-surface-2 lg:hover:bg-surface-2"
        >
          <div className="flex items-center gap-2 text-[15px] font-bold">
            <ResultBadge won={result.won} />
            <span className="text-[17px] font-black tabular-nums">{result.score}</span>
            <span>{vs(result)}</span>
            <TeamLogo teamName={result.opponent} size="xs" className="!h-[22px] !w-[22px]" />
            <ChevronLeft className="ms-auto h-[18px] w-[18px] text-faint" />
          </div>
          {game.one_liner && <p className="mt-1.5 text-[14.5px] leading-relaxed text-body">{game.one_liner}</p>}
          <WinProbStrip game={game} className="mt-2" />
        </GameLink>
      ) : (
        <div className="px-3.5 pt-1 pb-3 text-sm text-subtle">
          לא שיחקו ביום הזה
          {recent[0] && (
            <GameLink
              gameId={recent[0].id}
              className="mt-1.5 flex min-h-11 items-center gap-2 font-semibold text-ink"
            >
              <span className="text-xs text-faint">המשחק האחרון:</span>
              <ResultBadge won={fromTeamSide(recent[0], team).won} />
              <span className="tabular-nums">{fromTeamSide(recent[0], team).score}</span>
              {vs(fromTeamSide(recent[0], team))}
              <ChevronLeft className="ms-auto h-[18px] w-[18px] text-faint" />
            </GameLink>
          )}
        </div>
      )}

      <div className={`grid border-t ${nextGame === undefined ? "" : "grid-cols-2"}`}>
        <div className="px-3.5 pt-2.5 pb-3">
          <h4 className="mb-1.5 text-[11.5px] font-bold text-faint">{form.length} אחרונים</h4>
          <div className="flex gap-1">
            {form.map((g) => {
              const r = fromTeamSide(g, team);
              return (
                <span
                  key={g.id}
                  title={`${vs(r)} ${r.score}`}
                  className={`grid h-6 w-6 place-items-center rounded-md text-[11.5px] font-extrabold ${
                    r.won ? "bg-good/15 text-good" : "bg-bad/15 text-bad"
                  }`}
                >
                  {r.won ? "נ" : "ה"}
                </span>
              );
            })}
          </div>
          {streak && <p className="mt-1.5 text-xs text-subtle">{streak}</p>}
        </div>
        {nextGame !== undefined && (
          <div className="border-s px-3.5 pt-2.5 pb-3">
            <h4 className="mb-1.5 text-[11.5px] font-bold text-faint">המשחק הבא</h4>
            {nextGame ? (
              <div className="flex items-center gap-2 text-sm font-bold">
                <TeamLogo teamName={nextGame.opponent} size="xs" className="!h-[26px] !w-[26px] shrink-0" />
                <div>
                  {vs(nextGame)}
                  <small className="block text-xs font-medium text-subtle">{formatTipOff(nextGame.startsAt).day}</small>
                  <small className="block text-xs font-medium text-subtle">{formatTipOff(nextGame.startsAt).time} שעון ישראל</small>
                </div>
              </div>
            ) : (
              <p className="text-xs text-subtle">עוד לא נקבע</p>
            )}
          </div>
        )}
      </div>

      <SinceLastVisit
        date={date}
        games={recent
          .filter((g) => g.id !== game?.id)
          .map((g) => ({ id: g.id, date: g.date, ...fromTeamSide(g, team), opponentShort: short(fromTeamSide(g, team).opponent) }))}
      />
    </section>
  );
}
