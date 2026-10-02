"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, Star, X } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import TeamLogo from "@/components/ui/TeamLogo";
import { useNavigation } from "@/components/NavigationProvider";
import DateStrip from "./DateStrip";
import CalendarSheet from "./CalendarSheet";
import { useTeamPicker } from "./TeamPicker";
import { nbaEnToHe } from "@/utils/consts";

function BrandMark() {
  return (
    <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--on-brand)" strokeWidth="2.2" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3v18M5.6 5.6c3 3 3 9.8 0 12.8M18.4 5.6c-3 3-3 9.8 0 12.8" />
      </svg>
    </span>
  );
}

// Sticky header: brand, theme, team search, and either the date strip or the
// selected-team bar. Slides away while scrolling down on phones.
export default function AppHeader({ date, today, counts, team }) {
  const { navigate } = useNavigation();
  const { openPicker, favorite, setFavorite } = useTeamPicker();
  const [hidden, setHidden] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setHidden(y > lastY.current && y > 140 && window.innerWidth < 1024);
      lastY.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "/" && !["INPUT", "TEXTAREA"].includes(e.target.tagName)) {
        e.preventDefault();
        openPicker("browse");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openPicker]);

  return (
    <header
      className={`sticky top-0 z-30 border-b bg-[color-mix(in_srgb,var(--app-bg)_90%,transparent)] backdrop-blur-xl transition-transform duration-200 ${
        hidden ? "-translate-y-full" : ""
      }`}
    >
      <div className="mx-auto max-w-3xl">
        <div className="flex h-[52px] items-center pe-1 ps-1.5">
          <Link href="/" className="me-auto flex items-center gap-2 ps-3 text-[17px] font-black">
            <BrandMark />
            סיכומי NBA
          </Link>
          <ThemeToggle />
          <button
            onClick={() => openPicker("browse")}
            aria-label="חיפוש קבוצה"
            className="grid h-11 w-11 place-items-center rounded-xl text-subtle active:bg-surface-2 lg:hover:bg-surface-2"
          >
            <Search className="h-5 w-5" />
          </button>
        </div>

        {team ? (
          <div className="flex items-center gap-2.5 px-4 pb-3">
            <TeamLogo teamName={team} hebrewName={nbaEnToHe[team]} size="md" className="!h-9 !w-9" />
            <div>
              <b className="block text-[17px]">{nbaEnToHe[team]}</b>
              <small className="text-[13px] text-subtle">5 המשחקים האחרונים</small>
            </div>
            <button
              onClick={() => setFavorite(favorite === team ? null : team)}
              aria-pressed={favorite === team}
              className={`ms-auto flex h-9 items-center gap-1 rounded-full border px-3 text-[13px] ${
                favorite === team ? "border-brand font-bold text-brand" : "text-subtle"
              }`}
            >
              <Star className={`h-3.5 w-3.5 ${favorite === team ? "fill-brand" : ""}`} />
              הקבוצה שלי
            </button>
            <button
              onClick={() => navigate("/")}
              aria-label="חזרה לתצוגה לפי תאריך"
              className="grid h-9 w-9 place-items-center rounded-full border text-subtle"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <DateStrip date={date} today={today} counts={counts} onOpenCalendar={() => setCalendarOpen(true)} />
        )}
      </div>

      {!team && <CalendarSheet open={calendarOpen} onOpenChange={setCalendarOpen} date={date} today={today} />}
    </header>
  );
}
