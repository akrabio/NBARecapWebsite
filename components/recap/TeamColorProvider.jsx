"use client";

import React, { createContext, useContext } from "react";
import { getTeamColors, getGameGradient } from "@/utils/teamColors";

const TeamColorContext = createContext(null);

export function TeamColorProvider({ homeTeam, awayTeam, children }) {
  const homeColors = getTeamColors(homeTeam);
  const awayColors = getTeamColors(awayTeam);
  const gameGradient = getGameGradient(homeTeam, awayTeam);

  const value = {
    homeTeam,
    awayTeam,
    homeColors,
    awayColors,
    gameGradient,
  };

  return (
    <TeamColorContext.Provider value={value}>
      {children}
    </TeamColorContext.Provider>
  );
}

export function useTeamColors() {
  const context = useContext(TeamColorContext);
  if (!context) {
    throw new Error("useTeamColors must be used within TeamColorProvider");
  }
  return context;
}
