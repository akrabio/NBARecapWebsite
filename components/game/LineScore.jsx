import { nbaEnToHe, nbaShortHe } from "@/utils/consts";

function periodLabel(i) {
  if (i < 4) return `ר${i + 1}`;
  return i === 4 ? "הארכה" : `הארכה ${i - 3}`;
}

// Points per quarter, away team first (matching the score header).
export default function LineScore({ game, linescores }) {
  const rows = [
    { team: game.away_team, score: game.away_score, line: linescores.find((l) => l.homeAway === "away") },
    { team: game.home_team, score: game.home_score, line: linescores.find((l) => l.homeAway === "home") },
  ];
  const periods = Math.max(...rows.map((r) => r.line?.periods.length || 0));

  return (
    <table className="mt-2.5 w-full overflow-hidden rounded-xl bg-surface text-[13px] tabular-nums">
      <thead>
        <tr className="text-[11.5px] text-faint">
          <th />
          {Array.from({ length: periods }, (_, i) => (
            <th key={i} className="px-1 py-1.5 font-semibold">{periodLabel(i)}</th>
          ))}
          <th className="px-1 py-1.5 font-semibold">סה״כ</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ team, score, line }) => (
          <tr key={team}>
            <td className="py-1.5 ps-3 text-start font-semibold">{nbaShortHe[team] || nbaEnToHe[team]}</td>
            {Array.from({ length: periods }, (_, i) => (
              <td key={i} className="px-1 py-1.5 text-center">{line?.periods[i] ?? "–"}</td>
            ))}
            <td className="px-1 py-1.5 text-center font-extrabold">{score}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
