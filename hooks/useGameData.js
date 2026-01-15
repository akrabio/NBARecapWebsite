"use client";

import { useState, useEffect, useCallback } from "react";
import { format, subDays, addDays } from "date-fns";
import { getRecordsByDate, getRecordsByTeam } from "@/utils/api";
import { getFeaturedGames } from "@/utils/gameScoring";

export default function useGameData() {
  // Date state - defaults to yesterday (most recent games)
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d;
  });

  // Game data state
  const [games, setGames] = useState([]);
  const [selectedGame, setSelectedGame] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Filter state
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [teamFilterActive, setTeamFilterActive] = useState(false);

  // Load games by date
  const loadGamesForDate = useCallback(async () => {
    setIsLoading(true);
    try {
      const dateString = format(selectedDate, "yyyy-MM-dd");
      const gamesForDate = await getRecordsByDate(dateString);
      setGames(gamesForDate);
    } catch (error) {
      console.error("Error loading games:", error);
      setGames([]);
    }
    setIsLoading(false);
  }, [selectedDate]);

  // Load games by team
  const loadGamesForTeam = useCallback(async (teamName) => {
    setIsLoading(true);
    try {
      const teamGames = await getRecordsByTeam(teamName, 5);
      setGames(teamGames);
    } catch (error) {
      console.error("Error loading team games:", error);
      setGames([]);
    }
    setIsLoading(false);
  }, []);

  // Effect to load games when date or team filter changes
  useEffect(() => {
    if (teamFilterActive && selectedTeam) {
      loadGamesForTeam(selectedTeam);
    } else {
      loadGamesForDate();
    }
  }, [loadGamesForDate, loadGamesForTeam, teamFilterActive, selectedTeam]);

  // Date navigation handlers
  const handleDateChange = useCallback((date) => {
    setSelectedDate(date);
    setSelectedGame(null);
    setTeamFilterActive(false);
    setSelectedTeam(null);
  }, []);

  const handlePreviousDay = useCallback(() => {
    setSelectedDate((prev) => subDays(prev, 1));
    setSelectedGame(null);
    setTeamFilterActive(false);
    setSelectedTeam(null);
  }, []);

  const handleNextDay = useCallback(() => {
    setSelectedDate((prev) => addDays(prev, 1));
    setSelectedGame(null);
    setTeamFilterActive(false);
    setSelectedTeam(null);
  }, []);

  const handleToday = useCallback(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1); // Yesterday is "today" for game recaps
    setSelectedDate(d);
    setSelectedGame(null);
    setTeamFilterActive(false);
    setSelectedTeam(null);
  }, []);

  // Team filter handler
  const handleTeamFilter = useCallback((team) => {
    if (team) {
      setSelectedTeam(team);
      setTeamFilterActive(true);
      setSelectedGame(null);
    } else {
      setTeamFilterActive(false);
      setSelectedTeam(null);
    }
  }, []);

  // Game selection handlers
  const handleGameSelect = useCallback((game) => {
    setSelectedGame(game);
  }, []);

  const handleBackToGames = useCallback(() => {
    setSelectedGame(null);
  }, []);

  // Computed values
  const featuredGames = getFeaturedGames(games, 3);
  const otherGames = games.filter(
    (g) => !featuredGames.find((fg) => fg._id === g._id)
  );

  return {
    // State
    selectedDate,
    games,
    selectedGame,
    isLoading,
    selectedTeam,
    teamFilterActive,

    // Computed
    featuredGames,
    otherGames,

    // Handlers
    handleDateChange,
    handlePreviousDay,
    handleNextDay,
    handleToday,
    handleTeamFilter,
    handleGameSelect,
    handleBackToGames,
  };
}
