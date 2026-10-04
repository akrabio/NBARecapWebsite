import TeamLogo from "@/components/ui/TeamLogo";
import { tableCell, tablePlayers, tableValue } from "@/lib/recap";
import { getTeamColors } from "@/utils/teamColors";
import { nbaEnToHe, nbaShortHe } from "@/utils/consts";

// [label, table row, column, higher is better]
const LINES = [
  ["נקודות", "Team", "PTS", true],
  ["נקודות ספסל", "Bench", "PTS", true],
  ["ריבאונדים", "Team", "REB", true],
  ["אסיסטים", "Team", "AST", true],
  ["שלשות", "Team", "3PM", true],
  ["איבודים", "Team", "TO", false],
];

// Replaces the recap's two unlabeled markdown tables with a labeled team
// comparison and the key players.
export default function StatsSummary({ game, tables }) {
  const away = { team: game.away_team, table: tables.away, color: getTeamColors(game.away_team).primary };
  const home = { team: game.home_team, table: tables.home, color: getTeamColors(game.home_team).primary };

  return (
    <section className="mt-7 border-t pt-5">
      <h3 className="mb-2.5 text-[15px] font-extrabold">תמונת מצב</h3>
      <div className="mb-6 rounded-[14px] border bg-surface px-3.5 py-3">
        <div className="mb-1.5 flex justify-between text-sm font-extrabold">
          {[away, home].map(({ team }, i) => (
            <span key={team} className={`flex items-center gap-1.5 ${i ? "flex-row-reverse" : ""}`}>
              <TeamLogo teamName={team} hebrewName={nbaEnToHe[team]} size="xs" />
              {nbaShortHe[team]}
            </span>
          ))}
        </div>
        {LINES.map(([label, row, column, higherIsBetter]) => {
          const a = tableValue(away.table, row, column);
          const h = tableValue(home.table, row, column);
          if (Number.isNaN(a) || Number.isNaN(h)) return null;
          const total = a + h || 1;
          const awayBetter = higherIsBetter ? a > h : a < h;
          const homeBetter = higherIsBetter ? h > a : h < a;
          return (
            <div key={label} className="grid grid-cols-[34px_1fr_34px] items-center gap-x-2 gap-y-0.5 py-1.5 tabular-nums">
              <span className="col-span-3 text-center text-xs text-subtle">{label}</span>
              <b className={`text-[15px] ${awayBetter ? "font-extrabold text-ink" : "font-semibold text-subtle"}`}>{a}</b>
              <div className="flex h-2 gap-[3px]" aria-hidden="true">
                <i className="block rounded" style={{ width: `${(a / total) * 100}%`, background: away.color }} />
                <i className="block rounded" style={{ width: `${(h / total) * 100}%`, background: home.color }} />
              </div>
              <b className={`text-left text-[15px] ${homeBetter ? "font-extrabold text-ink" : "font-semibold text-subtle"}`}>{h}</b>
            </div>
          );
        })}
      </div>

      <h3 className="mb-2.5 text-[15px] font-extrabold">הבולטים</h3>
      <div className="grid gap-2">
        {[away, home].flatMap(({ team, table }) =>
          tablePlayers(table).map((row) => (
            <div key={team + row[0]} className="flex items-center gap-2.5 rounded-xl border bg-surface px-3 py-2.5">
              <TeamLogo teamName={team} hebrewName={nbaEnToHe[team]} alt={nbaEnToHe[team]} size="xs" className="shrink-0" />
              <span dir="ltr" className="truncate text-[14.5px] font-bold">{row[0]}</span>
              <span className="ms-auto whitespace-nowrap text-[12.5px] text-subtle">
                <b className="text-[17px] text-ink">{tableCell(table, row, "PTS")}</b> נק׳ · {tableCell(table, row, "REB")} ריב׳ ·{" "}
                {tableCell(table, row, "AST")} אס׳
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
