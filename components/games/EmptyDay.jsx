"use client";

import { useNavigation } from "@/components/NavigationProvider";
import { formatLongDate } from "@/lib/dates";

export default function EmptyDay({ date, previousDate, message }) {
  const { navigate } = useNavigation();

  return (
    <div className="px-2 py-14 text-center leading-relaxed text-subtle">
      <b className="mb-1.5 block text-[19px] text-ink">{message || "אין משחקים ביום הזה"}</b>
      {date && <>{formatLongDate(date)}</>}
      {previousDate && (
        <div>
          <button
            onClick={() => navigate(`/?date=${previousDate}`)}
            className="mt-4 h-11 rounded-xl border bg-surface px-[18px] font-bold text-ink"
          >
            ליום המשחקים הקודם
          </button>
        </div>
      )}
    </div>
  );
}
