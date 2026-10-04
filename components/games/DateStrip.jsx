"use client";

import { useLayoutEffect, useRef } from "react";
import { CalendarDays } from "lucide-react";
import { useNavigation } from "@/components/NavigationProvider";
import { HE_DAYS_SHORT, parseDateKey, shiftDateKey } from "@/lib/dates";

// Horizontally scrollable days around the selected date, with a dot per game.
export default function DateStrip({ date, today, counts, onOpenCalendar }) {
  const { navigate } = useNavigation();
  const scrollRef = useRef(null);

  const days = [];
  for (let i = -21; i <= 3; i++) {
    const key = shiftDateKey(date, i);
    if (key > today) break;
    days.push(key);
  }

  // Center the selected day (works with RTL's negative scrollLeft too).
  useLayoutEffect(() => {
    const strip = scrollRef.current;
    const selected = strip?.querySelector("[aria-current='date']");
    if (!strip || !selected) return;
    const a = selected.getBoundingClientRect();
    const b = strip.getBoundingClientRect();
    strip.scrollLeft += a.left + a.width / 2 - (b.left + b.width / 2);
  }, [date]);

  return (
    <div className="flex items-stretch pb-2.5">
      <div ref={scrollRef} className="no-scrollbar flex flex-1 gap-1 overflow-x-auto ps-2.5">
        {days.map((key) => {
          const d = parseDateKey(key);
          const count = counts[key] || 0;
          const selected = key === date;
          return (
            <button
              key={key}
              onClick={() => navigate(`/?date=${key}`)}
              aria-current={selected ? "date" : undefined}
              aria-label={`${d.getDate()}.${d.getMonth() + 1}, ${count === 1 ? "משחק אחד" : `${count} משחקים`}`}
              className={`min-h-[58px] w-[50px] shrink-0 rounded-xl py-1.5 text-center ${
                selected ? "bg-brand text-on-brand" : "text-subtle active:bg-surface-2 lg:hover:bg-surface-2"
              }`}
            >
              <div className="text-[11.5px] font-medium">{HE_DAYS_SHORT[d.getDay()]}</div>
              <div className={`text-lg font-extrabold leading-tight ${selected ? "" : count ? "text-ink" : "text-faint"}`}>
                {d.getDate()}
              </div>
              <div className="mt-[3px] flex h-1 justify-center gap-0.5">
                {Array.from({ length: Math.min(count, 5) }, (_, i) => (
                  <i key={i} className={`h-1 w-1 rounded-full ${selected ? "bg-on-brand" : "bg-faint"}`} />
                ))}
              </div>
            </button>
          );
        })}
      </div>
      <button
        onClick={onOpenCalendar}
        aria-label="לוח שנה"
        className="grid w-12 shrink-0 place-items-center border-s text-subtle active:bg-surface-2"
      >
        <CalendarDays className="h-5 w-5" />
      </button>
    </div>
  );
}
