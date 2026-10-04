"use client";

import { Star, X } from "lucide-react";
import { useTeamPicker } from "./TeamPicker";
import { useNavigation } from "@/components/NavigationProvider";
import { dismissFavoritePrompt } from "@/lib/favorite";

// Shown until the reader picks a team or dismisses it.
export function FavoritePrompt() {
  const { openPicker } = useTeamPicker();
  const { refresh } = useNavigation();

  return (
    <div className="mb-2.5 flex items-center gap-3 rounded-[14px] border border-dashed bg-surface px-3.5 py-3">
      <button onClick={() => openPicker("favorite")} className="flex flex-1 items-center gap-3 text-start text-sm leading-normal text-subtle">
        <Star className="h-5 w-5 shrink-0 text-brand-ink" />
        <span>
          <b className="text-ink">יש לכם קבוצה אהובה?</b> בחרו אותה והמשחק שלה יופיע תמיד ראשון.
        </span>
      </button>
      <button
        onClick={() => {
          dismissFavoritePrompt();
          refresh();
        }}
        aria-label="סגירה"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-faint"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function FavoriteTitle() {
  const { openPicker } = useTeamPicker();

  return (
    <div className="mt-0.5 mb-2 flex items-center justify-between">
      <h2 className="flex items-center gap-1 text-sm font-extrabold text-subtle">
        <Star className="h-3.5 w-3.5 fill-brand text-brand-ink" />
        הקבוצה שלי
      </h2>
      <button onClick={() => openPicker("favorite")} className="h-8 px-1 text-[12.5px] font-semibold text-brand-ink">
        שינוי
      </button>
    </div>
  );
}
