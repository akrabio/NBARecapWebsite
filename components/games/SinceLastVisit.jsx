"use client";

import { useEffect, useSyncExternalStore } from "react";
import GameLink from "./GameLink";
import TeamLogo from "@/components/ui/TeamLogo";
import { formatShortDate } from "@/lib/dates";

// The newest night this reader has seen, and the one they'd seen before it:
// { date, prev }. Per device, and only a convenience: nothing breaks without it.
const STORAGE_KEY = "last_visit";

const subscribe = (onChange) => {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
};
const readRaw = () => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};
const parse = (raw) => {
  try {
    return JSON.parse(raw || "null");
  } catch {
    return null;
  }
};

// The last night seen before `date`. The same night again (a refresh) keeps
// showing what was missed; browsing back to an older night shows nothing.
function lastSeenBefore(saved, date) {
  if (!saved?.date) return null;
  if (saved.date === date) return saved.prev || null;
  return saved.date < date ? saved.date : null;
}

// Since the reader's last visit: the favorite team's games they missed
// between the night they last saw and this one. `games` is newest first.
export default function SinceLastVisit({ date, games }) {
  const since = lastSeenBefore(parse(useSyncExternalStore(subscribe, readRaw, () => null)), date);

  // Move the marker forward (never back)
  useEffect(() => {
    const saved = parse(readRaw());
    if (saved?.date && saved.date >= date) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ date, prev: lastSeenBefore(saved, date) }));
    } catch {}
  }, [date]);

  const missed = since ? games.filter((g) => g.date > since && g.date < date) : [];
  if (missed.length === 0) return null;

  return (
    <div className="border-t px-3.5 pt-2.5 pb-2">
      <h4 className="mb-1 text-[12.5px] font-extrabold text-brand-ink">מאז הביקור האחרון שלך ({formatShortDate(since)})</h4>
      {missed.map((g) => (
        <GameLink key={g.id} gameId={g.id} className="flex min-h-11 items-center gap-2 text-sm">
          <span className="w-9 text-xs text-faint">{formatShortDate(g.date)}</span>
          <span className={`rounded px-1.5 text-[11px] font-extrabold ${g.won ? "bg-good/15 text-good" : "bg-bad/15 text-bad"}`}>
            {g.won ? "נ׳" : "ה׳"}
          </span>
          <TeamLogo teamName={g.opponent} size="xs" className="!h-5 !w-5" />
          {g.home ? "מול " : "ב"}
          {g.opponentShort}
          <span className="ms-auto font-extrabold tabular-nums">{g.score}</span>
        </GameLink>
      ))}
    </div>
  );
}
