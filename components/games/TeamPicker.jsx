"use client";

import { createContext, useCallback, useContext, useState } from "react";
import TeamPickerSheet from "./TeamPickerSheet";
import { useNavigation } from "@/components/NavigationProvider";
import { toast } from "@/components/ui/Toast";
import { saveFavoriteTeam } from "@/lib/favorite";
import { nbaShortHe } from "@/utils/consts";

// One team picker for the page, opened either to browse a team's recent games
// ("browse") or to choose "my team" ("favorite").
const TeamPickerContext = createContext({ openPicker: () => {}, setFavorite: () => {}, favorite: null });

export function TeamPickerProvider({ favorite, children }) {
  const { navigate, refresh } = useNavigation();
  const [mode, setMode] = useState(null);

  const setFavorite = useCallback(
    (team) => {
      saveFavoriteTeam(team);
      toast(team ? `ה${nbaShortHe[team]} יופיעו ראשונים` : "הקבוצה שלי הוסרה");
      refresh();
    },
    [refresh]
  );

  const pick = (team) => {
    const current = mode;
    setMode(null);
    if (current === "favorite") setFavorite(team);
    else navigate(`/?team=${encodeURIComponent(team)}`);
  };

  return (
    <TeamPickerContext.Provider value={{ openPicker: setMode, setFavorite, favorite }}>
      {children}
      <TeamPickerSheet
        open={mode !== null}
        onOpenChange={(open) => !open && setMode(null)}
        mode={mode}
        favorite={favorite}
        onPick={pick}
        onRemoveFavorite={() => {
          setMode(null);
          setFavorite(null);
        }}
      />
    </TeamPickerContext.Provider>
  );
}

export function useTeamPicker() {
  return useContext(TeamPickerContext);
}
