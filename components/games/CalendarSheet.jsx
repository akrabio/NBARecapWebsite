"use client";

import { useEffect, useState } from "react";
import { addDays, addMonths, startOfMonth } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import { useNavigation } from "@/components/NavigationProvider";
import { getDateCounts } from "@/utils/api";
import { HE_DAYS_SHORT, formatMonth, parseDateKey, toDateKey } from "@/lib/dates";

// Month grid with a dot on every day that has recaps.
export default function CalendarSheet({ open, onOpenChange, date, today }) {
  const { navigate } = useNavigation();
  const [month, setMonth] = useState(() => startOfMonth(parseDateKey(date)));
  const [counts, setCounts] = useState({});

  useEffect(() => {
    if (open) setMonth(startOfMonth(parseDateKey(date)));
  }, [open, date]);

  const gridStart = addDays(month, -month.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const from = toDateKey(cells[0]);
  const to = toDateKey(cells[41]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getDateCounts(from, to)
      .then((c) => !cancelled && setCounts(c))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, from, to]);

  const pick = (key) => {
    onOpenChange(false);
    navigate(`/?date=${key}`);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="בחירת תאריך">
      <div className="px-3.5 pb-5">
        <div className="flex items-center justify-between font-bold">
          <button onClick={() => setMonth(addMonths(month, -1))} aria-label="חודש קודם" className="grid h-11 w-11 place-items-center rounded-xl text-subtle">
            <ChevronRight className="h-5 w-5" />
          </button>
          {formatMonth(month)}
          <button onClick={() => setMonth(addMonths(month, 1))} aria-label="חודש הבא" className="grid h-11 w-11 place-items-center rounded-xl text-subtle">
            <ChevronLeft className="h-5 w-5" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-0.5 text-center">
          {HE_DAYS_SHORT.map((d) => (
            <span key={d} className="py-1.5 text-xs text-faint">{d}</span>
          ))}
          {cells.map((day) => {
            const key = toDateKey(day);
            const selected = key === date;
            const future = key > today;
            const hasGames = counts[key] > 0;
            return (
              <button
                key={key}
                disabled={future}
                onClick={() => pick(key)}
                className={`relative h-[46px] rounded-[10px] text-[15px] disabled:opacity-30 lg:h-10 ${
                  selected ? "bg-brand text-on-brand" : day.getMonth() !== month.getMonth() ? "text-faint" : ""
                }`}
              >
                {day.getDate()}
                {hasGames && (
                  <i className={`absolute bottom-1.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${selected ? "bg-on-brand" : "bg-brand"}`} />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </Sheet>
  );
}
