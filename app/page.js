"use client";

import React, { useState, useEffect, useCallback } from "react";
import { format, startOfWeek, isSameDay } from "date-fns";
import DatePicker from "../components/recap/DatePicker";
import GamesList from "../components/recap/GamesList";
import GameRecapView from "../components/recap/GameRecapView";
import { Dribbble, TrendingUp } from "lucide-react";
import { getRecordsByDate } from "@/utils/api";

export default function GameRecaps() {
const [selectedDate, setSelectedDate] = useState(() => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d;
  });  const [weekStart, setWeekStart] = useState(
    startOfWeek(new Date(), { weekStartsOn: 0 })
  );
  const [games, setGames] = useState([]);
  const [selectedGame, setSelectedGame] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  function getGamesByDate(games, date) {
    if (!Array.isArray(games)) {
      console.error("Games parameter must be an array");
      return [];
    }

    if (!date || typeof date !== "string") {
      console.error("Date parameter must be a string in yyyy-MM-dd format");
      return [];
    }

    // Validate date format (basic check)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      console.error("Date must be in yyyy-MM-dd format");
      return [];
    }

    return games.filter((game) => game.date === date);
  }

  const loadGamesForDate = useCallback(async () => {
    setIsLoading(true);
    try {
      const dateString = format(selectedDate, "yyyy-MM-dd");
      const gamesForDate = await getRecordsByDate(dateString); //getGamesByDate(GameRecap, dateString);
      setGames(gamesForDate);
    } catch (error) {
      console.error("Error loading games:", error);
      setGames([]);
    }
    setIsLoading(false);
  }, [selectedDate]);

  useEffect(() => {
    loadGamesForDate();
  }, [loadGamesForDate]);

  const handleDateChange = (date) => {
    setSelectedDate(date);
    setSelectedGame(null); // Reset selected game when changing date
  };

  const handleGameSelect = (game) => {
    setSelectedGame(game);
  };

  const handleBackToGames = () => {
    setSelectedGame(null);
  };

  if (selectedGame) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-4 md:p-8">
        <GameRecapView game={selectedGame} onBack={handleBackToGames} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-red-600 via-red-700 to-blue-600 text-white">
        <div className="max-w-7xl mx-auto px-4 py-8 md:py-12">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                  <Dribbble className="w-7 h-7" />
                </div>
                <div>
                  <h1 className="text-3xl md:text-4xl font-bold">
                    NBA Game Recaps
                  </h1>
                  <p className="text-white/80 text-lg">
                    In-depth analysis and highlights
                  </p>
                </div>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-2 bg-white/10 px-4 py-2 rounded-lg">
              <TrendingUp className="w-5 h-5" />
              <span className="font-semibold">Latest Recaps</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <DatePicker
          selectedDate={selectedDate}
          onDateChange={handleDateChange}
          weekStart={weekStart}
          onWeekChange={setWeekStart}
        />

        <GamesList
          games={games}
          selectedDate={selectedDate}
          onGameSelect={handleGameSelect}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
