"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import TeamLogo from "@/components/ui/TeamLogo";
import { nbaEnToHe, nbaShortHe } from "@/utils/consts";
import { normalizeApostrophes } from "@/utils/gameUtils";

const TEAMS = Object.keys(nbaEnToHe);

export default function TeamPickerSheet({ open, onOpenChange, mode, favorite, onPick, onRemoveFavorite }) {
  const [query, setQuery] = useState("");

  // Hebrew keyboards type ׳ (geresh) or ' interchangeably: "ג׳אז" should find "ג'אז".
  const q = normalizeApostrophes(query.trim()).toLowerCase();
  const matches = TEAMS.filter(
    (team) => !q || normalizeApostrophes(nbaEnToHe[team]).includes(q) || team.toLowerCase().includes(q)
  );

  const pick = (team) => {
    setQuery("");
    onPick(team);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) setQuery("");
        onOpenChange(next);
      }}
      title={mode === "favorite" ? "בחרו את הקבוצה שלכם" : "משחקים אחרונים של קבוצה"}
    >
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && matches[0] && pick(matches[0])}
        placeholder="הקלידו שם קבוצה…"
        aria-label="חיפוש קבוצה"
        autoComplete="off"
        enterKeyHint="search"
        className="w-full border-b bg-transparent px-[18px] py-3 text-base outline-none"
      />
      <div className="grid grid-cols-4 gap-1 overflow-y-auto p-2.5 lg:grid-cols-5">
        {matches.map((team, i) => (
          <button
            key={team}
            onClick={() => pick(team)}
            aria-label={team === favorite ? `${nbaEnToHe[team]} (הקבוצה שלי)` : nbaEnToHe[team]}
            className={`relative flex min-h-[76px] flex-col items-center gap-1.5 rounded-xl px-0.5 py-2.5 text-xs text-subtle active:bg-surface-2 lg:hover:bg-surface-2 ${
              q && i === 0 ? "bg-surface-2 text-ink" : ""
            }`}
          >
            {team === favorite && <Star className="absolute top-1.5 left-2 h-3.5 w-3.5 fill-brand text-brand-ink" />}
            <TeamLogo teamName={team} hebrewName={nbaEnToHe[team]} size="sm" className="!h-[34px] !w-[34px]" />
            {nbaShortHe[team]}
          </button>
        ))}
        {matches.length === 0 && (
          <p className="col-span-full py-8 text-center text-sm text-subtle">לא נמצאה קבוצה</p>
        )}
      </div>
      {mode === "favorite" && favorite && (
        <button onClick={onRemoveFavorite} className="mx-2.5 mb-3 h-11 shrink-0 rounded-xl border text-sm text-subtle">
          הסרת הקבוצה שלי
        </button>
      )}
    </Sheet>
  );
}
