"use client";

import { useState } from "react";
import { ChevronLeft, ListOrdered } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import TeamLogo from "@/components/ui/TeamLogo";
import { conferenceTable } from "@/lib/standings";
import { nbaEnToHe, nbaShortHe } from "@/utils/consts";

const CONFERENCES = [
  ["E", "מזרח"],
  ["W", "מערב"],
];
// Seeds 1-6 go to the playoffs, 7-10 to the play-in
const PLAYOFF_SEEDS = 6;
const PLAY_IN_SEEDS = 10;

function Move({ move }) {
  if (!move) return null;
  const up = move > 0;
  return (
    <span className={`text-[10.5px] font-extrabold ${up ? "text-good" : "text-bad"}`} aria-label={up ? `עלתה ${move}` : `ירדה ${-move}`}>
      {up ? "▲" : "▼"}
      {Math.abs(move)}
    </span>
  );
}

// Both conferences' full tables, with games behind and how each team moved
// since the night before. `standings` is standingsByTeam's result.
function StandingsTable({ standings, conf, favorite }) {
  const rows = conferenceTable(standings, conf);
  return (
    <table className="w-full text-[14px] tabular-nums">
      <thead>
        <tr className="text-[11.5px] text-faint">
          <th className="w-14 py-1.5 ps-[18px] text-start font-semibold">#</th>
          <th className="py-1.5 text-start font-semibold">קבוצה</th>
          <th className="w-16 py-1.5 text-center font-semibold">מאזן</th>
          <th className="w-14 py-1.5 pe-[18px] text-center font-semibold">פער</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.team}
            className={`${row.team === favorite ? "bg-brand/10 font-extrabold" : ""} ${
              row.rank === PLAYOFF_SEEDS ? "border-b-2 border-faint" : row.rank === PLAY_IN_SEEDS ? "border-b-2 border-dashed border-faint" : "border-b"
            }`}
          >
            <td className="py-2 ps-[18px]">
              <span className="inline-flex items-baseline gap-1">
                <b className="w-5">{row.rank}</b>
                <Move move={row.move} />
              </span>
            </td>
            <td className="py-2">
              <span className="flex items-center gap-2">
                <TeamLogo teamName={row.team} hebrewName={nbaEnToHe[row.team]} size="xs" className="shrink-0" />
                <span className="truncate font-semibold">{nbaShortHe[row.team] || row.team}</span>
              </span>
            </td>
            <td className="py-2 text-center" dir="ltr">
              {row.w}-{row.l}
            </td>
            <td className="py-2 pe-[18px] text-center text-subtle">{row.gb === 0 ? "–" : row.gb}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// A row that opens the league table
export default function StandingsSheet({ standings, favorite }) {
  const [open, setOpen] = useState(false);
  const [conf, setConf] = useState(standings[favorite]?.conf || "E");

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mb-2.5 flex min-h-12 w-full items-center gap-2.5 rounded-[18px] border bg-surface px-3.5 text-[15px] font-bold active:bg-surface-2 lg:hover:bg-surface-2"
      >
        <ListOrdered className="h-[18px] w-[18px] text-subtle" />
        טבלת הליגה
        <ChevronLeft className="ms-auto h-[18px] w-[18px] text-faint" />
      </button>
      <Sheet open={open} onOpenChange={setOpen} title="טבלת הליגה">
        <div className="mx-[18px] mt-1 mb-2 flex rounded-xl bg-surface-2 p-0.5" role="tablist" aria-label="קונפרנס">
          {CONFERENCES.map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={conf === key}
              onClick={() => setConf(key)}
              className={`h-9 flex-1 rounded-[10px] text-[14px] font-bold ${conf === key ? "bg-surface text-ink shadow-sm" : "text-subtle"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="overflow-y-auto pb-3">
          <StandingsTable standings={standings} conf={conf} favorite={favorite} />
          <p className="px-[18px] pt-2.5 text-[12px] text-faint">
            1–6 לפלייאוף · 7–10 לפליי־אין · החיצים: שינוי מאז הלילה הקודם
          </p>
        </div>
      </Sheet>
    </>
  );
}
