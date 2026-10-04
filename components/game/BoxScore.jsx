"use client";

import { useState } from "react";
import TeamLogo from "@/components/ui/TeamLogo";
import { nbaEnToHe, nbaShortHe } from "@/utils/consts";
import { getWinner } from "@/utils/gameUtils";

const STAT_LABELS = {
  MIN: "דק׳",
  PTS: "נק׳",
  FG: "שדה",
  "3PT": "3נק׳",
  FT: "עונשין",
  REB: "ריב׳",
  OREB: "ריב׳ ה׳",
  DREB: "ריב׳ ה״ג",
  AST: "אס׳",
  TO: "איב׳",
  STL: "חט׳",
  BLK: "חס׳",
  PF: "עב׳",
  "+/-": "+/-",
};
const COMPACT = ["MIN", "PTS", "REB", "AST"];
const LEADER_STATS = ["PTS", "REB", "AST", "STL", "BLK"];

const normalize = (name) => (name || "").toLowerCase().replace(/\s+/g, "");

// Full view order: like ESPN's, but with OREB/DREB right after REB.
function fullOrder(names) {
  const rest = names.filter((n) => n !== "OREB" && n !== "DREB");
  const reb = rest.indexOf("REB");
  if (reb === -1) return names;
  const split = ["DREB", "OREB"].filter((n) => names.includes(n));
  return [...rest.slice(0, reb + 1), ...split, ...rest.slice(reb + 1)];
}

// ESPN's boxscore.players → { away, home }, matched by team name.
function splitTeams(boxscore, game) {
  const teams = (boxscore?.players || []).filter((t) => t.statistics?.[0]);
  const isHome = (t, i) => {
    const name = normalize(t.team?.displayName);
    if (name === normalize(game.home_team)) return true;
    if (name === normalize(game.away_team)) return false;
    return i === 1;
  };
  return {
    away: teams.find((t, i) => !isHome(t, i)),
    home: teams.find((t, i) => isHome(t, i)),
  };
}

function Message({ children }) {
  return <div className="rounded-xl border bg-surface p-6 text-center text-subtle">{children}</div>;
}

export default function BoxScore({ game, summary }) {
  // Open on the winner's players (home if the score is missing)
  const [side, setSide] = useState(getWinner(game) === "away" ? "away" : "home");
  const [showAll, setShowAll] = useState(false);

  if (summary.status === "loading") {
    return (
      <div className="space-y-2" aria-busy="true">
        <div className="h-11 rounded-xl animate-shimmer" />
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-12 rounded-lg animate-shimmer" />
        ))}
      </div>
    );
  }
  if (summary.status === "missing") return <Message>נתוני המשחק אינם זמינים</Message>;
  if (summary.status === "error") return <Message>לא ניתן לטעון את נתוני המשחק כרגע</Message>;

  const teams = splitTeams(summary.boxscore, game);
  const team = teams[side];
  if (!teams.away || !teams.home || !team) return <Message>נתוני המשחק אינם זמינים</Message>;

  const { names = [], athletes = [], totals = [] } = team.statistics[0];
  const columns = showAll ? fullOrder(names) : COMPACT.filter((n) => names.includes(n));
  const stat = (stats, name) => stats?.[names.indexOf(name)] ?? "";

  const played = athletes.filter((a) => !a.didNotPlay && a.stats?.length);
  const starters = played.filter((a) => a.starter);
  const bench = played.filter((a) => !a.starter);
  const dnp = athletes.filter((a) => a.didNotPlay || !a.stats?.length);
  const leaders = Object.fromEntries(
    LEADER_STATS.map((name) => [name, Math.max(0, ...played.map((a) => Number(stat(a.stats, name)) || 0))])
  );

  const playerRow = (a) => {
    const position = a.athlete?.position?.abbreviation;
    const fg = stat(a.stats, "FG");
    return (
      <tr key={a.athlete?.id || a.athlete?.displayName}>
        <td className="sticky right-0 bg-surface px-3 py-2.5 text-right" dir="ltr">
          <span className="block max-w-[150px] truncate font-semibold">{a.athlete?.displayName}</span>
          {!showAll && (position || fg) && (
            <small className="block text-[11px] text-faint">
              {[position, fg && `${fg} FG`].filter(Boolean).join(" · ")}
            </small>
          )}
        </td>
        {columns.map((name) => {
          const value = stat(a.stats, name);
          const leader = LEADER_STATS.includes(name) && leaders[name] > 0 && Number(value) === leaders[name];
          return (
            <td key={name} dir="ltr" className={`px-2 py-2.5 text-center ${leader ? "font-extrabold text-brand-ink" : "text-body"}`}>
              {value || "–"}
            </td>
          );
        })}
      </tr>
    );
  };

  const divider = (label) => (
    <tr>
      <td colSpan={columns.length + 1} className="sticky right-0 bg-surface-2 px-3 py-1 text-[11.5px] font-bold text-subtle">
        {label}
      </td>
    </tr>
  );

  return (
    <div>
      <div className="mb-3 flex gap-2">
        <div className="flex flex-1 rounded-xl border bg-surface p-[3px]" role="group" aria-label="קבוצה">
          {["away", "home"].map((s) => {
            const name = s === "home" ? game.home_team : game.away_team;
            return (
              <button
                key={s}
                aria-pressed={side === s}
                onClick={() => setSide(s)}
                className={`flex h-[38px] flex-1 items-center justify-center gap-1.5 rounded-[9px] text-sm font-bold ${
                  side === s ? "bg-surface-2 text-ink" : "text-subtle"
                }`}
              >
                <TeamLogo teamName={name} hebrewName={nbaEnToHe[name]} size="xs" className="!h-5 !w-5" />
                {nbaShortHe[name]}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => setShowAll(!showAll)}
          aria-pressed={showAll}
          className={`h-11 whitespace-nowrap rounded-xl border px-3 text-[13px] ${showAll ? "border-brand font-bold text-brand-ink" : "text-subtle"}`}
        >
          {showAll ? "מקוצר" : "כל הנתונים"}
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-surface">
        <table className="w-full whitespace-nowrap text-sm tabular-nums">
          <thead>
            <tr className="border-b text-xs text-subtle">
              <th className="sticky right-0 bg-surface px-3 py-2 text-right font-semibold">שחקן</th>
              {columns.map((name) => (
                <th key={name} className="px-2 py-2 font-semibold">{STAT_LABELS[name] || name}</th>
              ))}
            </tr>
          </thead>
          <tbody className="[&>tr+tr]:border-t">
            {starters.map(playerRow)}
            {bench.length > 0 && divider("ספסל")}
            {bench.map(playerRow)}
            <tr className="bg-surface-2 font-extrabold">
              <td className="sticky right-0 bg-surface-2 px-3 py-2.5 text-right">סה״כ</td>
              {columns.map((name) => (
                <td key={name} dir="ltr" className="px-2 py-2.5 text-center">{totals[names.indexOf(name)] || ""}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {dnp.length > 0 && (
        <p className="mt-3 text-xs leading-relaxed text-faint">
          לא שיחקו: <span dir="ltr">{dnp.map((a) => a.athlete?.displayName).filter(Boolean).join(", ")}</span>
        </p>
      )}
    </div>
  );
}
